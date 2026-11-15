"""The admin's notifications: new failed requests (errors), Contact page messages and feedback. A bell
in the admin's header shows how many each admin hasn't seen yet and lists them; on opening the admin
(and when more arrive) they pop up as toasts (core/admin_theme/admin/base_site.html). Clicking one
opens it (and counts it seen); "open all" opens the list of a kind's new ones (and counts them all
seen). What each admin has seen is theirs (models.AdminSeen): a time up to which everything is seen,
and the ones seen one by one after it."""
from datetime import timedelta

from django.http import HttpResponseRedirect, JsonResponse
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

FIRST_LOOK_BACK = timedelta(days=7)    # an admin's first time: the last week's are new
ITEMS_PER_KIND = 8
MAX_SEEN_IDS = 500


def _kinds():
    from .models import ContactMessage, FailedRequest, FeedbackMessage

    def error_title(o):
        return f"{o.method} {o.path} → {o.status_code or 'no connection'}"

    def error_sub(o):
        who = o.user.name if o.user_id and o.user else "signed out"
        return f"{who} · {o.reason_code}" + (f": {o.reason_message[:80]}" if o.reason_message else "")

    return {
        "errors": {"model": FailedRequest, "label": "errors", "one": "error", "title": error_title, "sub": error_sub,
                   "related": ("user",), "toast": "new {n} — check them out"},
        "contact": {"model": ContactMessage, "label": "contact messages", "one": "contact message",
                    "title": lambda o: f"{o.name} <{o.email}>", "sub": lambda o: o.message[:100], "related": ("profile",),
                    "toast": "new {n} from the Contact page"},
        "feedback": {"model": FeedbackMessage, "label": "feedback messages", "one": "feedback message",
                     "title": lambda o: (o.user.name if o.user_id and o.user else "Signed-out visitor") + (f" · {o.symbol}" if o.symbol else ""),
                     "sub": lambda o: o.message[:100], "related": ("user",), "toast": "new {n} from the site"},
    }


def _seen(user, kind):
    from .models import AdminSeen
    row, _ = AdminSeen.objects.get_or_create(user=user, kind=kind, defaults={"seen_until": timezone.now() - FIRST_LOOK_BACK})
    return row


def _unseen(user, kind, k):
    row = _seen(user, kind)
    qs = k["model"].objects.filter(created_at__gt=row.seen_until).exclude(pk__in=row.seen_ids or [])
    return row, qs


def _change_url(kind, obj_id):
    model = _kinds()[kind]["model"]
    return reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_change", args=[obj_id])


def state(user):
    out, total = [], 0
    for kind, k in _kinds().items():
        _, qs = _unseen(user, kind, k)
        n = qs.count()
        total += n
        items = [{"id": o.pk, "title": k["title"](o), "sub": k["sub"](o), "at": int(o.created_at.timestamp() * 1000),
                  "url": reverse("admin_notice_open_item", args=[kind, o.pk])}
                 for o in qs.select_related(*k["related"]).order_by("-created_at")[:ITEMS_PER_KIND]]
        label = k["one"] if n == 1 else k["label"]
        out.append({"kind": kind, "label": k["label"], "count": n, "newest": items[0]["id"] if items else 0, "items": items,
                    "toast": k["toast"].format(n=f"{n} {label}") if n else "",
                    "url": reverse("admin_notice_open_kind", args=[kind])})
    return {"total": total, "kinds": out}


def notices_json(request):
    return JsonResponse(state(request.user))


def open_kind(request, kind):
    """The list of a kind's new ones (from the oldest not seen), all of them counted seen"""
    k = _kinds().get(kind)
    if not k:
        return HttpResponseRedirect(reverse("admin:index"))
    row, qs = _unseen(request.user, kind, k)
    oldest = qs.order_by("created_at").values_list("created_at", flat=True).first()
    row.seen_until, row.seen_ids = timezone.now(), []
    row.save(update_fields=["seen_until", "seen_ids"])
    model = k["model"]
    url = reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist")
    if oldest:
        from urllib.parse import urlencode
        url += "?" + urlencode({"created_at__gte": timezone.localtime(oldest).isoformat(sep=" ", timespec="seconds")})
    return HttpResponseRedirect(url)


def open_item(request, kind, obj_id):
    """One of them: counted seen (contact and feedback also marked read) and opened"""
    k = _kinds().get(kind)
    if not k:
        return HttpResponseRedirect(reverse("admin:index"))
    row = _seen(request.user, kind)
    ids = [i for i in (row.seen_ids or []) if isinstance(i, int)]
    if obj_id not in ids:
        ids = (ids + [obj_id])[-MAX_SEEN_IDS:]
        row.seen_ids = ids
        row.save(update_fields=["seen_ids"])
    if kind in ("contact", "feedback"):
        k["model"].objects.filter(pk=obj_id).update(is_read=True)
    return HttpResponseRedirect(_change_url(kind, obj_id))


@require_POST
def mark_all_seen(request):
    kinds = [request.POST.get("kind")] if request.POST.get("kind") in _kinds() else list(_kinds())
    for kind in kinds:
        row = _seen(request.user, kind)
        row.seen_until, row.seen_ids = timezone.now(), []
        row.save(update_fields=["seen_until", "seen_ids"])
    return JsonResponse(state(request.user))
