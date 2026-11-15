"""The Q&A page's "Was this helpful?" (src/app/faq): POST /api/users/faq/vote/ {id, helpful}. Each vote
is kept (with the profile when signed in) so Django Admin (FAQ votes) shows which answers help and which
don't. One vote per question per browser (the page remembers it); a few dozen an hour per address."""
import re

from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from .throttles import FaqThrottle

QUESTION_ID = re.compile(r"^[a-z0-9-]{1,80}$")


@api_view(["POST"])
@throttle_classes([FaqThrottle])
def vote(request):
    from .auth import session_owner
    from .models import FaqVote
    data = request.data if isinstance(request.data, dict) else {}
    qid = str(data.get("id") or "")
    helpful = data.get("helpful")
    if not QUESTION_ID.match(qid) or not isinstance(helpful, bool):
        return Response({"ok": False}, status=400)
    FaqVote.objects.create(question=qid, helpful=helpful, profile=session_owner(request))
    return Response({"ok": True})


def summary(limit=50):
    """[(question, helpful, not helpful)] the least helpful first"""
    from django.db.models import Count, Q
    from .models import FaqVote
    rows = (FaqVote.objects.values("question")
            .annotate(yes=Count("id", filter=Q(helpful=True)), no=Count("id", filter=Q(helpful=False)))
            .order_by("-no", "yes")[:limit])
    return [(r["question"], r["yes"], r["no"]) for r in rows]
