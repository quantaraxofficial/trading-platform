"""The strategy optimizer's store (the testing itself runs in the owner's browser: Pine Editor →
Optimize, src/app/lib/optimizer). A run is the strategy's code, the settings it varies and how,
and every combination's result, so it can be paused, the window closed, and continued later from
the next combination.

- One window runs it at a time: it claims the run (`runner`) and each batch of results it sends
  keeps the claim alive. A run whose window was closed shows as interrupted after a minute, and
  any window can continue it; a run that's live in another window can be taken over on purpose.
- Its settings change only while it isn't running; changing what's tested (not just how the
  results are sorted and filtered) starts it over.
- Results come back ranked by any metric, with filters (fewest trades, deepest drawdown, only
  profitable), best first.
"""
import math
from datetime import timedelta

from django.db.models import F, FloatField
from django.db.models.fields.json import KT
from django.db.models.functions import Cast
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .models import OptimizerResult, OptimizerRun

MAX_COMBINATIONS = 100_000
MAX_BATCH = 500
MAX_CODE = 300_000
LIVE_FOR = timedelta(seconds=60)
# What a result can be ranked by (the browser computes them: src/app/lib/optimizer/metrics.ts)
METRICS = ('netProfit', 'netProfitPct', 'profitFactor', 'winRate', 'totalTrades', 'maxDrawdown', 'maxDrawdownPct', 'returnToDrawdown',
           'avgTrade', 'avgTradePct', 'sharpe', 'sortino', 'profitableMonthsPct', 'worstMonthPct', 'profitableYears', 'years',
           'grossProfit', 'grossLoss', 'longPnl', 'shortPnl', 'avgBarsInTrade', 'largestLoss', 'expectancy')
LOWER_IS_BETTER = ('maxDrawdown', 'maxDrawdownPct', 'avgBarsInTrade')


def _live(run):
    return run.status == 'running' and run.heartbeat_at and timezone.now() - run.heartbeat_at < LIVE_FOR


def _state(run):
    """running / interrupted (its window closed or stopped answering) / ready / paused / done"""
    if run.status == 'running' and not _live(run):
        return 'interrupted'
    return run.status


def _clean_metrics(m):
    if not isinstance(m, dict):
        return None
    out = {}
    for k in METRICS:
        v = m.get(k)
        if isinstance(v, bool) or v is None:
            continue
        if isinstance(v, (int, float)) and math.isfinite(v):
            out[k] = round(float(v), 6)
    return out


def _ranked(run, q=None):
    """The run's results that pass the filters, best first by the chosen metric"""
    r = {**(run.ranking or {}), **({k: v for k, v in (q or {}).items() if v not in (None, '')})}
    sort = r.get('sort') if r.get('sort') in METRICS else 'netProfit'
    desc = str(r.get('dir') or ('asc' if sort in LOWER_IS_BETTER else 'desc')) != 'asc'
    qs = run.results.filter(metrics__isnull=False, error='')
    try:
        if r.get('min_trades') not in (None, ''):
            qs = qs.filter(metrics__totalTrades__gte=float(r['min_trades']))
        if r.get('max_dd') not in (None, ''):
            qs = qs.filter(metrics__maxDrawdownPct__lte=float(r['max_dd']))
        if r.get('min_pf') not in (None, ''):
            qs = qs.filter(metrics__profitFactor__gte=float(r['min_pf']))
    except (TypeError, ValueError):
        pass
    if str(r.get('profitable')).lower() in ('1', 'true'):
        qs = qs.filter(metrics__netProfit__gt=0)
    if str(r.get('every_year')).lower() in ('1', 'true'):   # profitable in every calendar year it traded
        qs = qs.annotate(_years=Cast(KT('metrics__years'), FloatField()), _good=Cast(KT('metrics__profitableYears'), FloatField())) \
            .filter(_years__gt=0, _good__gte=F('_years'))
    key = Cast(KT(f'metrics__{sort}'), FloatField())
    order = key.desc(nulls_last=True) if desc else key.asc(nulls_last=True)
    return qs.order_by(order, 'index'), {"sort": sort, "dir": "desc" if desc else "asc"}


def _result_json(x):
    return {"index": x.index, "params": x.params, "metrics": x.metrics, "error": x.error}


def _run_json(run, best=True):
    d = {"id": run.id, "name": run.name, "script_key": run.script_key, "script_name": run.script_name, "language": run.language,
         "status": _state(run), "total": run.total, "cursor": run.cursor, "elapsed_ms": run.elapsed_ms, "runner": run.runner if _live(run) else "",
         "config": run.config, "ranking": run.ranking, "created_at": int(run.created_at.timestamp() * 1000),
         "updated_at": int(run.updated_at.timestamp() * 1000)}
    if best:
        top = _ranked(run)[0].first()
        d["best"] = _result_json(top) if top else None
    return d


def _mine(request, uid, rid):
    me, denied = require_session(request, uid)
    if denied:
        return None, None, denied
    run = OptimizerRun.objects.filter(owner=me, id=rid).first()
    if not run:
        return me, None, Response({"error": "That optimization isn't there any more"}, status=status.HTTP_404_NOT_FOUND)
    return me, run, None


def _check_space(d):
    try:
        total = int(d.get('total'))
    except (TypeError, ValueError):
        return None, "How many combinations?"
    if total < 1:
        return None, "Nothing to test: choose at least one value for everything"
    if total > MAX_COMBINATIONS:
        return None, f"{total:,} combinations is too many: at most {MAX_COMBINATIONS:,} (narrow the ranges, or test a random sample)"
    if not isinstance(d.get('config'), dict) or len(str(d['config'])) > 60_000:
        return None, "The settings are missing"
    return total, None


@api_view(['GET', 'POST'])
def runs(request, uid):
    """GET ?script_key=: your optimizations (of that script). POST {script_key, script_name,
    language, code, config, ranking, total, name?}: a new one, ready to start."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        qs = OptimizerRun.objects.filter(owner=me)
        if request.query_params.get('script_key'):
            qs = qs.filter(script_key=request.query_params['script_key'])
        return Response({"runs": [_run_json(r) for r in qs[:50]]})
    d = request.data
    code = str(d.get('code') or '')
    if not code.strip() or len(code) > MAX_CODE:
        return Response({"error": "The strategy's code is missing (or too long)"}, status=status.HTTP_400_BAD_REQUEST)
    total, err = _check_space(d)
    if err:
        return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
    if OptimizerRun.objects.filter(owner=me).count() >= 200:
        return Response({"error": "You have 200 optimizations: delete some old ones first"}, status=status.HTTP_400_BAD_REQUEST)
    run = OptimizerRun.objects.create(
        owner=me, script_key=str(d.get('script_key') or 'untitled')[:120], script_name=str(d.get('script_name') or 'Strategy')[:200],
        language=d.get('language') if d.get('language') in ('pine', 'python', 'mql5') else 'pine', code=code,
        name=str(d.get('name') or '')[:120], config=d['config'], ranking=d.get('ranking') if isinstance(d.get('ranking'), dict) else {}, total=total)
    return Response({"run": _run_json(run)}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
def run(request, uid, rid):
    """GET ?sort=&dir=&min_trades=&max_dd=&min_pf=&profitable=&every_year=&limit=: the run and its
    best results. PATCH: {name} / {ranking} anytime; {status: "paused"}; while it isn't running,
    {output} (trades CSV on / off, results kept) and {config, total, code?}, which changes what's
    tested and starts it over. DELETE: it and its results."""
    me, r, denied = _mine(request, uid, rid)
    if denied:
        return denied
    if request.method == 'DELETE':
        r.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == 'PATCH':
        d = request.data
        if 'name' in d:
            r.name = str(d.get('name') or '')[:120]
        if isinstance(d.get('ranking'), dict):
            r.ranking = d['ranking']
        if isinstance(d.get('output'), dict) and 'config' not in d:
            # What each combination leaves behind (its trades as a CSV): doesn't change what's
            # tested, so the results stay; like every setting, only while it isn't running
            if _live(r):
                return Response({"error": "Pause it first, then change its settings"}, status=status.HTTP_409_CONFLICT)
            r.config = {**(r.config or {}), "output": {"tradesCsv": d['output'].get('tradesCsv') is True}}
        if 'config' in d:
            if _live(r):
                return Response({"error": "Pause it first, then change its settings"}, status=status.HTTP_409_CONFLICT)
            total, err = _check_space(d)
            if err:
                return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
            if d.get('code'):
                if len(str(d['code'])) > MAX_CODE:
                    return Response({"error": "The code is too long"}, status=status.HTTP_400_BAD_REQUEST)
                r.code = str(d['code'])
                if d.get('language') in ('pine', 'python', 'mql5'):
                    r.language = d['language']
            r.config, r.total, r.cursor, r.elapsed_ms, r.status, r.runner = d['config'], total, 0, 0, 'ready', ''
            r.results.all().delete()
        if d.get('status') == 'paused' and r.status == 'running':
            r.status, r.runner = 'paused', ''
        r.save()
    q = request.query_params
    qs, used = _ranked(r, {k: q.get(k) for k in ('sort', 'dir', 'min_trades', 'max_dd', 'min_pf', 'profitable', 'every_year')})
    try:
        limit = max(1, min(500, int(q.get('limit') or 100)))
    except ValueError:
        limit = 100
    out = _run_json(r, best=False)
    rows = list(qs[:limit])
    out.update(results=[_result_json(x) for x in rows], best=_result_json(rows[0]) if rows else None, ranked_by=used,
               passing=qs.count(), tested=r.results.count(), failed=r.results.exclude(error='').count(), code=r.code)
    return Response({"run": out})


@api_view(['POST'])
def claim(request, uid, rid):
    """{runner, force?}: this window runs it from now (refused while another window is running it,
    unless forced: that window then stops at its next batch)"""
    me, r, denied = _mine(request, uid, rid)
    if denied:
        return denied
    runner = str(request.data.get('runner') or '')[:40]
    if not runner:
        return Response({"error": "Which window?"}, status=status.HTTP_400_BAD_REQUEST)
    if r.status == 'done' or r.cursor >= r.total:
        return Response({"error": "It has tested everything already"}, status=status.HTTP_409_CONFLICT)
    if _live(r) and r.runner != runner and request.data.get('force') is not True:
        return Response({"error": "It's running in another window", "elsewhere": True}, status=status.HTTP_409_CONFLICT)
    r.status, r.runner, r.heartbeat_at = 'running', runner, timezone.now()
    r.save(update_fields=['status', 'runner', 'heartbeat_at', 'updated_at'])
    return Response({"run": _run_json(r, best=False)})


@api_view(['POST'])
def results(request, uid, rid):
    """{runner, cursor, elapsed_ms, results: [{index, params, metrics | error}]}: a batch from the
    window running it (also keeps its claim alive); the run is done once the cursor reaches the end"""
    me, r, denied = _mine(request, uid, rid)
    if denied:
        return denied
    d = request.data
    if r.status != 'running' or r.runner != str(d.get('runner') or ''):
        return Response({"error": "Another window took this optimization over" if r.status == 'running' else "It's paused",
                         "stopped": True, "status": _state(r)}, status=status.HTTP_409_CONFLICT)
    batch = d.get('results') or []
    if not isinstance(batch, list) or len(batch) > MAX_BATCH:
        return Response({"error": f"At most {MAX_BATCH} results at a time"}, status=status.HTTP_400_BAD_REQUEST)
    rows = []
    for x in batch:
        try:
            idx = int(x.get('index'))
        except (TypeError, ValueError, AttributeError):
            continue
        params = x.get('params') if isinstance(x.get('params'), dict) else {}
        rows.append(OptimizerResult(run=r, index=idx, params=params, metrics=_clean_metrics(x.get('metrics')) if not x.get('error') else None,
                                    error=str(x.get('error') or '')[:300]))
    OptimizerResult.objects.bulk_create(rows, ignore_conflicts=True)
    try:
        cursor = max(r.cursor, min(r.total, int(d.get('cursor'))))
    except (TypeError, ValueError):
        cursor = r.cursor
    try:
        r.elapsed_ms += max(0, min(3_600_000, int(d.get('elapsed_ms') or 0)))
    except (TypeError, ValueError):
        pass
    r.cursor, r.heartbeat_at = cursor, timezone.now()
    if cursor >= r.total:
        r.status, r.runner = 'done', ''
    r.save(update_fields=['cursor', 'heartbeat_at', 'elapsed_ms', 'status', 'runner', 'updated_at'])
    return Response({"status": _state(r), "cursor": r.cursor})
