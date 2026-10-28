"""The strategy optimizer's store (optimizer_api.py): runs, one window at a time, results in batches,
continuing after the window closed, ranking and filters, and settings that only change while
it's not running."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import OptimizerResult, OptimizerRun, TraderProfile, UserSession

CODE = '//@version=6\nstrategy("X")\nlen = input.int(14, "Length")\n'


def m(net, trades=20, dd=10.0, years=2, good_years=2, pf=1.5):
    return {"netProfit": net, "netProfitPct": net / 1000, "totalTrades": trades, "maxDrawdownPct": dd, "profitFactor": pf,
            "years": years, "profitableYears": good_years, "sharpe": net / 10000, "junk": "no"}


class OptimizerApiTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        for u in ("own", "eve"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")

    def api(self, uid, rest, method="post", body=None):
        return getattr(self.c, method)(f"/api/users/optimizer/{uid}/{rest}?session_key=sk-{uid}" if "?" not in rest
                                       else f"/api/users/optimizer/{uid}/{rest}&session_key=sk-{uid}", body or {}, format="json")

    def new(self, total=10):
        r = self.api("own", "runs/", body={"script_key": "s1", "script_name": "My strat", "language": "pine", "code": CODE, "total": total,
                                            "config": {"dims": ["len"]}, "ranking": {"sort": "netProfit"}})
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["run"]["id"]

    def send(self, rid, runner, cursor, rows, uid="own"):
        return self.api(uid, f"runs/{rid}/results/", body={"runner": runner, "cursor": cursor, "elapsed_ms": 500, "results": rows})

    def test_one_window_at_a_time_and_continuing(self):
        rid = self.new(total=4)
        self.assertEqual(self.api("own", f"runs/{rid}/claim/", body={"runner": "w1"}).status_code, 200)
        r = self.send(rid, "w1", 2, [{"index": 0, "params": {"inputs": {"len": 10}}, "metrics": m(100)},
                                     {"index": 1, "params": {"inputs": {"len": 11}}, "error": "No data for EURUSD on 1week"}])
        self.assertEqual(r.json(), {"status": "running", "cursor": 2})
        # A second window can't run it at the same time…
        r = self.api("own", f"runs/{rid}/claim/", body={"runner": "w2"})
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.json()["elsewhere"])
        # …unless it takes it over; the first window is then told to stop
        self.assertEqual(self.api("own", f"runs/{rid}/claim/", body={"runner": "w2", "force": True}).status_code, 200)
        r = self.send(rid, "w1", 3, [{"index": 2, "params": {}, "metrics": m(5)}])
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.json()["stopped"])
        self.assertFalse(OptimizerResult.objects.filter(index=2).exists())
        # The window closes: a minute later it shows as interrupted, and continues from where it was
        OptimizerRun.objects.filter(id=rid).update(heartbeat_at=timezone.now() - timedelta(minutes=2))
        run = self.api("own", f"runs/{rid}/", "get").json()["run"]
        self.assertEqual((run["status"], run["cursor"], run["tested"], run["failed"]), ("interrupted", 2, 2, 1))
        self.assertEqual(self.api("own", f"runs/{rid}/claim/", body={"runner": "w3"}).status_code, 200)
        # A result sent twice is kept once
        self.send(rid, "w3", 4, [{"index": 1, "params": {}, "metrics": m(1)}, {"index": 2, "params": {}, "metrics": m(300)}, {"index": 3, "params": {}, "metrics": m(-50)}])
        run = self.api("own", f"runs/{rid}/", "get").json()["run"]
        self.assertEqual((run["status"], run["cursor"], run["tested"], run["elapsed_ms"]), ("done", 4, 4, 1000))
        self.assertEqual(OptimizerResult.objects.get(run_id=rid, index=1).error, "No data for EURUSD on 1week")
        self.assertEqual(self.api("own", f"runs/{rid}/claim/", body={"runner": "w3"}).status_code, 409)   # nothing left

    def test_pause_and_settings(self):
        rid = self.new()
        self.api("own", f"runs/{rid}/claim/", body={"runner": "w1"})
        self.send(rid, "w1", 1, [{"index": 0, "params": {}, "metrics": m(10)}])
        # Settings don't change while it runs
        r = self.api("own", f"runs/{rid}/", "patch", {"config": {"dims": ["len", "x"]}, "total": 20})
        self.assertEqual(r.status_code, 409)
        self.assertIn("Pause it first", r.json()["error"])
        # Sorting / filters do
        self.assertEqual(self.api("own", f"runs/{rid}/", "patch", {"ranking": {"sort": "sharpe"}}).json()["run"]["ranking"], {"sort": "sharpe"})
        r = self.api("own", f"runs/{rid}/", "patch", {"status": "paused"})
        self.assertEqual(r.json()["run"]["status"], "paused")
        self.assertEqual(self.send(rid, "w1", 2, []).status_code, 409)   # the window that was running stops
        # Paused: new settings start it over
        r = self.api("own", f"runs/{rid}/", "patch", {"config": {"dims": ["len", "x"]}, "total": 20, "code": CODE + "// v2\n"})
        run = r.json()["run"]
        self.assertEqual((run["status"], run["cursor"], run["total"], run["tested"]), ("ready", 0, 20, 0))
        self.assertTrue(run["code"].endswith("// v2\n"))

    def test_ranking_and_filters(self):
        rid = self.new(total=6)
        self.api("own", f"runs/{rid}/claim/", body={"runner": "w"})
        self.send(rid, "w", 6, [
            {"index": 0, "params": {"i": 0}, "metrics": m(500, trades=3)},              # few trades
            {"index": 1, "params": {"i": 1}, "metrics": m(400, dd=40)},                 # deep drawdown
            {"index": 2, "params": {"i": 2}, "metrics": m(300)},
            {"index": 3, "params": {"i": 3}, "metrics": m(200, good_years=1)},          # one losing year
            {"index": 4, "params": {"i": 4}, "metrics": m(-100, good_years=0)},
            {"index": 5, "params": {"i": 5}, "error": "Script error: x"},
        ])
        get = lambda q="": [x["index"] for x in self.api("own", f"runs/{rid}/?{q}" if q else f"runs/{rid}/", "get").json()["run"]["results"]]
        self.assertEqual(get(), [0, 1, 2, 3, 4])
        self.assertEqual(get("min_trades=10"), [1, 2, 3, 4])
        self.assertEqual(get("min_trades=10&max_dd=20"), [2, 3, 4])
        self.assertEqual(get("min_trades=10&max_dd=20&every_year=1"), [2])
        self.assertEqual(get("profitable=1&sort=maxDrawdownPct"), [0, 2, 3, 1])
        self.assertEqual(get("sort=netProfit&dir=asc"), [4, 3, 2, 1, 0])
        run = self.api("own", f"runs/{rid}/?min_trades=10", "get").json()["run"]
        self.assertEqual((run["passing"], run["tested"], run["failed"], run["best"]["index"]), (4, 6, 1, 1))
        self.assertNotIn("junk", run["results"][0]["metrics"])
        listed = self.api("own", "runs/?script_key=s1", "get").json()["runs"]
        self.assertEqual([(x["id"], x["best"]["index"]) for x in listed], [(rid, 0)])

    def test_limits_and_privacy(self):
        r = self.api("own", "runs/", body={"script_key": "s", "code": CODE, "total": 100_001, "config": {}})
        self.assertIn("too many", r.json()["error"])
        r = self.api("own", "runs/", body={"script_key": "s", "code": "", "total": 5, "config": {}})
        self.assertEqual(r.status_code, 400)
        rid = self.new()
        self.assertEqual(self.api("eve", f"runs/{rid}/", "get").status_code, 404)
        self.assertEqual(self.api("eve", f"runs/{rid}/claim/", body={"runner": "x"}).status_code, 404)
        self.assertEqual(self.api("own", f"runs/{rid}/", "delete").status_code, 204)
        self.assertFalse(OptimizerRun.objects.filter(id=rid).exists())
