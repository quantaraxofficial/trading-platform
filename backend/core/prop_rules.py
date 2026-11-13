"""Prop-firm rules on a connected account (core/stats_accounts.py): the profit target, the daily loss
limit, the maximum loss (static, or trailing the highest balance) and the minimum trading days,
and how the account stands against them — progress to the target, room left before each limit,
passed / breached.

The presets are the firms' published evaluation rules as summarised publicly in November 2026;
firms change them, so each is a starting point the trader can edit (and "custom" is all their own).

How it's measured (as most firms do):
- the limits are percentages of the account size (the starting balance);
- the daily loss is counted from the balance at the start of the firm's day (midnight in the
  firm's time zone: FTMO and most others reset at midnight Prague time), against the equity now
  (live) or the lowest balance reached that day (history);
- the maximum loss is static (account size − max %), or trailing: the highest balance − max %,
  never above the account size;
- a trading day is a day with at least one trade opened.
History is closed trades only: a breach that happened intraday on floating losses and recovered
can't be seen in it (the live view checks the equity now)."""

from datetime import datetime, timezone as dt_tz
from zoneinfo import ZoneInfo

PRAGUE = "Europe/Prague"

# firm → phases → rules. target / daily / max in %, trailing max loss, minimum trading days
PRESETS = {
    "ftmo_2step": {"firm": "FTMO", "name": "FTMO 2-Step Challenge", "tz": PRAGUE, "phases": {
        "phase1": {"label": "Challenge", "target": 10, "daily": 5, "max": 10, "trailing": False, "min_days": 4},
        "phase2": {"label": "Verification", "target": 5, "daily": 5, "max": 10, "trailing": False, "min_days": 4},
        "funded": {"label": "FTMO Account", "target": None, "daily": 5, "max": 10, "trailing": False, "min_days": 0},
    }},
    "ftmo_1step": {"firm": "FTMO", "name": "FTMO 1-Step Challenge", "tz": PRAGUE, "phases": {
        "phase1": {"label": "Challenge", "target": 10, "daily": 3, "max": 10, "trailing": True, "min_days": 0},
        "funded": {"label": "FTMO Account", "target": None, "daily": 3, "max": 10, "trailing": True, "min_days": 0},
    }},
    "fundednext_stellar2": {"firm": "FundedNext", "name": "FundedNext Stellar 2-Step", "tz": PRAGUE, "phases": {
        "phase1": {"label": "Phase 1", "target": 8, "daily": 5, "max": 10, "trailing": False, "min_days": 5},
        "phase2": {"label": "Phase 2", "target": 5, "daily": 5, "max": 10, "trailing": False, "min_days": 5},
        "funded": {"label": "Funded", "target": None, "daily": 5, "max": 10, "trailing": False, "min_days": 0},
    }},
    "fundingpips_2step": {"firm": "FundingPips", "name": "FundingPips 2-Step", "tz": PRAGUE, "phases": {
        "phase1": {"label": "Student", "target": 8, "daily": 5, "max": 10, "trailing": False, "min_days": 3},
        "phase2": {"label": "Practitioner", "target": 5, "daily": 5, "max": 10, "trailing": False, "min_days": 3},
        "funded": {"label": "Master", "target": None, "daily": 5, "max": 10, "trailing": False, "min_days": 0},
    }},
    "the5ers_highstakes": {"firm": "The5ers", "name": "The5ers High Stakes", "tz": PRAGUE, "phases": {
        "phase1": {"label": "Step 1", "target": 8, "daily": 5, "max": 10, "trailing": False, "min_days": 3},
        "phase2": {"label": "Step 2", "target": 5, "daily": 5, "max": 10, "trailing": False, "min_days": 3},
        "funded": {"label": "Funded", "target": None, "daily": 5, "max": 10, "trailing": False, "min_days": 0},
    }},
}


def presets_json():
    return [{"id": k, "firm": v["firm"], "name": v["name"],
             "phases": [{"id": pid, **p} for pid, p in v["phases"].items()]} for k, v in PRESETS.items()]


def rules_of(acc):
    """The account's rules (its own numbers: a preset fills them in when chosen), or None"""
    if not acc.firm:
        return None
    tz = PRESETS.get(acc.firm, {}).get("tz", PRAGUE)
    return {"firm": acc.firm, "phase": acc.phase, "size": acc.account_size, "target": acc.profit_target_pct,
            "daily": acc.daily_loss_pct, "max": acc.max_loss_pct, "trailing": acc.max_loss_trailing,
            "min_days": acc.min_trading_days or 0, "tz": tz}


def _day(ms, tz):
    return datetime.fromtimestamp(ms / 1000, dt_tz.utc).astimezone(ZoneInfo(tz)).date()


def progress(rules, trades, start_balance, live=None, now_ms=None):
    """Where the account stands against its rules. trades: closed trades (exit_time, entry_time ms,
    pnl net), oldest first. live: {balance, equity} now, if read."""
    if not rules:
        return None
    tz = rules["tz"]
    size = rules["size"] or start_balance or 0
    if not size:
        return {"error": "Enter the account size"}
    closed = sorted((t for t in trades if t.get("exit_time")), key=lambda t: t["exit_time"])
    # the balance after each closed trade
    bal, peak, curve = size, size, []
    for t in closed:
        bal += t["pnl"]
        peak = max(peak, bal)
        curve.append((t["exit_time"], bal, peak))
    balance = live["balance"] if live and live.get("balance") is not None else bal
    equity = live["equity"] if live and live.get("equity") is not None else balance
    peak = max(peak, balance)

    def max_floor(pk):
        if not rules["max"]:
            return None
        floor = (pk if rules["trailing"] else size) - size * rules["max"] / 100
        return min(floor, size)

    # today's starting balance (the balance before the first trade closed today, in the firm's day)
    now_ms = now_ms or int(datetime.now(dt_tz.utc).timestamp() * 1000)
    today = _day(now_ms, tz)
    day_start = size
    for at, b, _ in curve:
        if _day(at, tz) < today:
            day_start = b
    daily_floor = day_start - size * rules["daily"] / 100 if rules["daily"] else None
    floor = max_floor(peak)

    # breaches in the history (closed balance under a limit), the first one found
    breach = None
    b0, pk, by_day = size, size, {}
    for at, b, p in curve:
        d = _day(at, tz)
        if d not in by_day:
            by_day[d] = b0           # the day's starting balance
        # (both at once: the maximum loss, the account's end, is the one reported)
        f = max_floor(pk)
        if f is not None and b < f and not breach:
            breach = {"rule": "max", "at": at, "balance": round(b, 2)}
        if rules["daily"] and b < by_day[d] - size * rules["daily"] / 100 and not breach:
            breach = {"rule": "daily", "at": at, "balance": round(b, 2)}
        b0, pk = b, p
    if live and not breach:
        if floor is not None and equity < floor:
            breach = {"rule": "max", "at": now_ms, "balance": round(equity, 2), "live": True}
        elif daily_floor is not None and equity < daily_floor:
            breach = {"rule": "daily", "at": now_ms, "balance": round(equity, 2), "live": True}

    days = sorted({_day(t["entry_time"], tz) for t in trades if t.get("entry_time")})
    profit = balance - size
    target_amt = size * rules["target"] / 100 if rules["target"] else None
    out = {
        "size": round(size, 2), "balance": round(balance, 2), "equity": round(equity, 2), "profit": round(profit, 2),
        "profit_pct": round(profit / size * 100, 2),
        "target": None if target_amt is None else {
            "pct": rules["target"], "amount": round(target_amt, 2), "progress": round(max(0.0, profit) / target_amt * 100, 1),
            "reached": profit >= target_amt},
        "daily": None if daily_floor is None else {
            "pct": rules["daily"], "day_start": round(day_start, 2), "floor": round(daily_floor, 2),
            "used": round(max(0.0, day_start - equity), 2), "left": round(equity - daily_floor, 2),
            "used_pct": round(max(0.0, day_start - equity) / (size * rules["daily"] / 100) * 100, 1)},
        "max": None if floor is None else {
            "pct": rules["max"], "trailing": rules["trailing"], "floor": round(floor, 2), "left": round(equity - floor, 2),
            "used_pct": round(max(0.0, (floor + size * rules["max"] / 100) - equity) / (size * rules["max"] / 100) * 100, 1)},
        "days": {"traded": len(days), "min": rules["min_days"], "met": len(days) >= rules["min_days"]},
        "breach": breach,
    }
    out["status"] = ("breached" if breach else "passed" if (target_amt is not None and profit >= target_amt and out["days"]["met"])
                     else "active")
    return out
