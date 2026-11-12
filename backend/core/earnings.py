"""What the site has earned (Django Admin → Earnings), from the payments entered in admin
(core.models.Payment: an amount, a currency, when it was paid), in Indian time."""
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from .models import Payment

IST = ZoneInfo("Asia/Kolkata")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _sum(rows):
    out = defaultdict(Decimal)
    for r in rows:
        out[r["currency"]] += r["value"]
    return dict(out)


def report(year=None, now=None):
    now = (now or datetime.now(IST)).astimezone(IST)
    year = year or now.year
    rows, unreadable = [], []
    for s in Payment.objects.select_related("profile").order_by("-paid_at"):
        rows.append({"sub": s, "when": s.paid_at.astimezone(IST), "value": s.amount, "currency": s.currency})

    month0 = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month0 = (month0 - timedelta(days=1)).replace(day=1)
    day0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    in_ = lambda a, b=None: [r for r in rows if r["when"] >= a and (b is None or r["when"] < b)]
    this_month = in_(month0)
    cards = [
        ("Today", _sum(in_(day0)), len(in_(day0))),
        (f"This month ({MONTHS[now.month - 1]})", _sum(this_month), len(this_month)),
        (f"Last month ({MONTHS[last_month0.month - 1]})", _sum(in_(last_month0, month0)), len(in_(last_month0, month0))),
        (f"This year ({now.year})", _sum([r for r in rows if r["when"].year == now.year]), len([r for r in rows if r["when"].year == now.year])),
        ("All time", _sum(rows), len(rows)),
    ]
    # the chosen year month by month
    months = []
    for i in range(12):
        rs = [r for r in rows if r["when"].year == year and r["when"].month == i + 1]
        months.append({"name": MONTHS[i], "num": i + 1, "count": len(rs), "totals": _sum(rs),
                       "inr": sum((r["value"] for r in rs if r["currency"] == "INR"), Decimal(0)), "future": year == now.year and i + 1 > now.month})
    top = max([m["inr"] for m in months] + [Decimal(1)])
    for m in months:
        m["bar"] = int(m["inr"] / top * 100)
    year_rows = [r for r in rows if r["when"].year == year]
    years = sorted({r["when"].year for r in rows} | {now.year}, reverse=True)
    return {"cards": cards, "months": months, "year": year, "years": years, "year_total": _sum(year_rows), "year_count": len(year_rows),
            "this_month": this_month, "unreadable": unreadable, "now": now}
