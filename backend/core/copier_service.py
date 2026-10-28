"""The trade-copier service (manage.py run_copier): an always-logged-in MetaTrader 5 terminal per
subscriber who copies automatically, each in its own process, so a signal reaches every account at
the same moment; and, for channels that mirror their owner's MT5 account, a terminal watching it.

Each terminal lives in its own folder (COPIER_TERMINALS_DIR/<name>/) in MT5's portable mode: the
installed terminal64.exe (hard-linked when possible, so it takes no extra space) and the broker list
(Config/servers.dat) — never the installation's saved logins — with Algo Trading switched on.

The supervisor loop:
- every couple of seconds, starts / stops / restarts terminals to match the subscriptions (and the
  mirrored providers), and records each one's state for the site;
- every ~0.15 s, picks up new signals (from the site, or created here from the provider's MT5) and
  hands each to every subscriber's terminal at once; their results come back as CopyExecutions;
- for a mirrored provider: a new position is an open signal (its own risk %), changed stops a
  modify, a smaller position a partial close, a position gone a close. Positions already open when
  mirroring was switched on aren't copied.
"""
import multiprocessing as mp
import os
import queue
import shutil
import socket
import time

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

POLL_S = 0.15        # new signals
SYNC_S = 2.0         # terminals vs subscriptions
SNAPSHOT_S = 0.25    # a mirrored provider's positions
HEARTBEAT_S = 5.0

EXPERTS_INI = "[Experts]\r\nAllowLiveTrading=1\r\nAllowDllImport=0\r\nEnabled=1\r\nAccount=0\r\nProfile=0\r\n"


# ---------------------------------------------------------------- terminal folders

def prepare_terminal(folder, template_dir):
    """A portable terminal folder: the installed terminal64.exe (hard link, or a copy), the broker
    list, Algo Trading on. Nothing else from the installation — not its saved accounts."""
    os.makedirs(os.path.join(folder, "Config"), exist_ok=True)
    exe = os.path.join(folder, "terminal64.exe")
    if not os.path.exists(exe):
        src = os.path.join(template_dir, "terminal64.exe")
        try:
            os.link(src, exe)
        except OSError:
            shutil.copy2(src, exe)
    servers = os.path.join(template_dir, "Config", "servers.dat")
    if os.path.exists(servers):
        shutil.copy2(servers, os.path.join(folder, "Config", "servers.dat"))
    ini = os.path.join(folder, "Config", "common.ini")
    if not os.path.exists(ini):
        with open(ini, "wb") as f:
            f.write(b"\xff\xfe" + EXPERTS_INI.encode("utf-16-le"))
    return exe


# ---------------------------------------------------------------- one terminal (its own process)

def _connect(cfg):
    """The MT5 package (or the stand-in), started on this terminal's folder and logged in"""
    if cfg.get("fake"):
        from .broker_mt5 import FakeMt5
        mt5 = FakeMt5()
        ok = mt5.initialize(login=cfg["login"], password=cfg["password"], server=cfg["server"])
    else:
        import MetaTrader5 as mt5
        ok = mt5.initialize(cfg["path"], login=cfg["login"], password=cfg["password"], server=cfg["server"], timeout=60000, portable=True)
    if not ok:
        code, msg = mt5.last_error()
        raise RuntimeError("The broker didn't accept the login" if code == -6 or "Authorization" in str(msg) else f"Couldn't start the terminal ({msg})")
    return mt5


def terminal_main(key, cfg, inbox, outbox):
    """A terminal process: logs in and stays logged in; applies the signals it's given ('sub'), or
    reports its account's positions as they change ('watch')"""
    if not cfg.get("inline"):
        import django
        django.setup()
    from . import copier
    mt5 = None
    last_ok = 0.0
    last_snap, last_snap_at = None, 0.0
    while True:
        if mt5 is None:
            outbox.put(("status", key, "starting", ""))
            try:
                mt5 = _connect(cfg)
                outbox.put(("status", key, "connected", ""))
                last_ok = time.time()
            except Exception as e:
                outbox.put(("status", key, "error", str(e)[:300]))
                mt5 = None
                if _wait_or_stop(inbox, 30):
                    return
                continue
        try:
            task = inbox.get(timeout=SNAPSHOT_S if cfg["mode"] == "watch" else 1.0)
        except queue.Empty:
            task = "tick"
        if task is None:
            try:
                mt5.shutdown()
            except Exception:
                pass
            return
        if task == "tick":
            now = time.time()
            if cfg["mode"] == "watch":
                try:
                    snap = copier.snapshot(mt5)
                    if snap["positions"] != last_snap or now - last_snap_at > 5:
                        outbox.put(("snapshot", key, snap))
                        last_snap, last_snap_at = snap["positions"], now
                    last_ok = now
                except Exception as e:
                    outbox.put(("status", key, "error", str(e)[:300]))
                    mt5 = None
            elif now - last_ok > 10:
                if mt5.account_info() is None:
                    outbox.put(("status", key, "error", "Lost the connection to the broker; reconnecting"))
                    mt5 = None
                else:
                    last_ok = now
                    outbox.put(("status", key, "connected", ""))
            continue
        sig, sub, opened = task
        outbox.put(("result", key, sig["id"], copier.apply(mt5, sig, sub, opened), time.time()))


def _wait_or_stop(inbox, seconds):
    end = time.time() + seconds
    while time.time() < end:
        try:
            if inbox.get(timeout=0.5) is None:
                return True
        except queue.Empty:
            pass
    return False


class ProcessTerminal:
    def __init__(self, key, cfg, outbox):
        self.cfg = cfg
        self.inbox = mp.Queue()
        self.proc = mp.Process(target=terminal_main, args=(key, cfg, self.inbox, outbox), daemon=True, name=f"copier-{key}")
        self.proc.start()

    def send(self, task):
        self.inbox.put(task)

    def stop(self):
        self.inbox.put(None)
        self.proc.join(10)
        if self.proc.is_alive():
            self.proc.terminate()

    def alive(self):
        return self.proc.is_alive()


class InlineTerminal:
    """The same, run step by step in this process (tests)"""
    def __init__(self, key, cfg, outbox):
        self.key, self.cfg, self.outbox = key, {**cfg, "inline": True}, outbox
        self.mt5 = None
        try:
            self.mt5 = _connect(self.cfg)
            outbox.put(("status", key, "connected", ""))
        except Exception as e:
            outbox.put(("status", key, "error", str(e)[:300]))

    def send(self, task):
        from . import copier
        sig, sub, opened = task
        self.outbox.put(("result", self.key, sig["id"], copier.apply(self.mt5, sig, sub, opened), time.time()))

    def poll(self):
        from . import copier
        if self.mt5 is not None and self.cfg["mode"] == "watch":
            self.outbox.put(("snapshot", self.key, copier.snapshot(self.mt5)))

    def stop(self):
        pass

    def alive(self):
        return True


# ---------------------------------------------------------------- the supervisor

class Supervisor:
    def __init__(self, fake=None, inline=False, terminals_dir=None, template_dir=None):
        self.fake = getattr(settings, "MT5_FAKE", False) if fake is None else fake
        self.inline = inline
        self.terminals_dir = terminals_dir or getattr(settings, "COPIER_TERMINALS_DIR", "") or os.path.join(settings.BASE_DIR, "copier_terminals")
        self.template_dir = template_dir or os.path.dirname(getattr(settings, "MT5_TERMINAL_PATH", "") or "")
        self.outbox = queue.Queue() if inline else mp.Queue()
        self.terminals = {}      # key → terminal
        self.fingerprints = {}   # key → the login it was started with (a change restarts it)
        self.last_signal = None
        self.mirror = {}         # channel id → {ref: last known position}
        self.host = socket.gethostname()

    # ---- terminals to match the subscriptions and mirrored providers
    def wanted(self):
        from .broker_mt5 import decrypt_password
        from .models import BrokerAccount, CopyChannel, CopySubscription
        want = {}
        subs = CopySubscription.objects.filter(auto_copy=True, channel__active=True).select_related("subscriber")
        accounts = {a.owner_id: a for a in BrokerAccount.objects.filter(platform="mt5")}
        for s in subs:
            acc = accounts.get(s.subscriber_id)
            if acc:
                want[f"sub{s.id}"] = (acc, "sub", s.id)
        for ch in CopyChannel.objects.filter(active=True, mirror_mt5=True):
            acc = accounts.get(ch.owner_id)
            if acc:
                want[f"watch{ch.id}"] = (acc, "watch", ch.id)
        out = {}
        for key, (acc, mode, oid) in want.items():
            pw = decrypt_password(acc.password)
            if pw:
                out[key] = ({"login": acc.login, "password": pw, "server": acc.server, "mode": mode, "fake": self.fake}, oid)
        return out

    def sync(self):
        from .models import CopySubscription
        want = self.wanted()
        for key in list(self.terminals):
            cfg = want.get(key, (None,))[0]
            if cfg is None or self.fingerprints.get(key) != (cfg["login"], cfg["server"], cfg["password"]) or not self.terminals[key].alive():
                self.terminals.pop(key).stop()
                self.fingerprints.pop(key, None)
                if key.startswith("sub") and cfg is None:
                    CopySubscription.objects.filter(id=int(key[3:])).update(terminal_status="off", terminal_error="")
        for key, (cfg, _) in want.items():
            if key in self.terminals:
                continue
            cfg = dict(cfg)
            if not self.fake:
                cfg["path"] = prepare_terminal(os.path.join(self.terminals_dir, key), self.template_dir)
            self.terminals[key] = (InlineTerminal if self.inline else ProcessTerminal)(key, cfg, self.outbox)
            self.fingerprints[key] = (cfg["login"], cfg["server"], cfg["password"])

    # ---- signals out to the subscribers' terminals
    def dispatch(self, sig):
        from .models import CopyExecution, CopySubscription
        payload = {"id": sig.id, "channel": sig.channel_id, "kind": sig.kind, "symbol": sig.symbol, "side": sig.side, "entry": sig.entry,
                   "sl": sig.sl, "tp": sig.tp, "risk_percent": sig.risk_percent, "fraction": sig.fraction}
        opened_by_sub = {}
        if sig.kind != "open":
            for e in CopyExecution.objects.filter(signal__channel_id=sig.channel_id, signal__ref=sig.ref, signal__kind="open", status="filled").select_related("signal"):
                opened_by_sub[e.subscription_id] = {"ticket": e.ticket, "price": e.price, "entry": e.signal.entry}
        for s in CopySubscription.objects.filter(channel_id=sig.channel_id, auto_copy=True).select_related("channel"):
            key = f"sub{s.id}"
            if sig.kind != "open" and s.id not in opened_by_sub:
                continue   # this account didn't copy that trade
            sub = {"symbols": s.symbols, "real_confirmed": s.real_confirmed, "max_open": s.max_open, "daily_loss_limit": s.daily_loss_limit,
                   "risk_mode": s.risk_mode, "risk_percent": s.risk_percent, "max_risk": s.max_risk, "no_sl_lots": s.no_sl_lots,
                   "max_slippage": s.channel.max_slippage}
            term = self.terminals.get(key)
            if term is None:
                CopyExecution.objects.get_or_create(signal=sig, subscription=s, defaults={"status": "failed", "message": "This account's terminal isn't running on the copier"})
                continue
            term.send((payload, sub, opened_by_sub.get(s.id)))

    def poll_signals(self):
        from .models import CopySignal
        if self.last_signal is None:
            last = CopySignal.objects.order_by("-id").first()
            self.last_signal = last.id if last else 0   # (signals from before the service started aren't replayed)
            return
        for sig in CopySignal.objects.filter(id__gt=self.last_signal, channel__active=True).order_by("id"):
            self.last_signal = sig.id
            self.dispatch(sig)

    # ---- what comes back
    def drain(self):
        from .models import CopyExecution, CopySignal, CopySubscription
        while True:
            try:
                msg = self.outbox.get_nowait()
            except queue.Empty:
                return
            kind, key = msg[0], msg[1]
            if kind == "status" and key.startswith("sub"):
                CopySubscription.objects.filter(id=int(key[3:])).update(terminal_status=msg[2], terminal_error=msg[3], terminal_seen=timezone.now())
            elif kind == "result":
                _, _, sig_id, out, at = msg
                sig = CopySignal.objects.filter(id=sig_id).first()
                if not sig:
                    continue
                latency = int((at - sig.created_at.timestamp()) * 1000)
                CopyExecution.objects.update_or_create(signal=sig, subscription_id=int(key[3:]), defaults={
                    "status": out["status"], "ticket": out.get("ticket"), "symbol": out.get("symbol", ""), "volume": out.get("volume"),
                    "price": out.get("price"), "sl": out.get("sl"), "tp": out.get("tp"), "message": out.get("message", "")[:300],
                    "latency_ms": latency})
            elif kind == "snapshot":
                self.mirror_positions(int(key[5:]), msg[2])

    # ---- a mirrored provider's positions → signals
    def mirror_positions(self, channel_id, snap):
        from .models import CopyChannel, CopySignal
        ch = CopyChannel.objects.filter(id=channel_id, mirror_mt5=True, active=True).first()
        if not ch:
            return
        known = self.mirror.setdefault(channel_id, None)
        open_refs = self._open_refs(channel_id)
        since = int(ch.mirror_since.timestamp() * 1000) if ch.mirror_since else 0
        now = {str(p["ticket"]): p for p in snap["positions"]}
        made = []
        for ref, p in now.items():
            if ref not in open_refs:
                if p["time"] >= since and (known is None or ref not in known):
                    made.append(CopySignal.objects.create(channel=ch, kind="open", ref=ref, source="mt5", symbol=p["symbol"], side=p["side"],
                                                          entry=p["entry"], sl=p["sl"], tp=p["tp"], risk_percent=p["risk"] or ch.default_risk, volume=p["volume"]))
                continue
            last = open_refs[ref]
            if (p["sl"] or None) != (last["sl"] or None) or (p["tp"] or None) != (last["tp"] or None):
                made.append(CopySignal.objects.create(channel=ch, kind="modify", ref=ref, source="mt5", symbol=p["symbol"], sl=p["sl"], tp=p["tp"], volume=last["volume"]))
            if last["volume"] and p["volume"] < last["volume"] - 1e-9:
                made.append(CopySignal.objects.create(channel=ch, kind="close", ref=ref, source="mt5", symbol=p["symbol"],
                                                      fraction=round((last["volume"] - p["volume"]) / last["volume"], 6), volume=p["volume"]))
        for ref, last in open_refs.items():
            if ref not in now:
                made.append(CopySignal.objects.create(channel=ch, kind="close", ref=ref, source="mt5", symbol=last["symbol"], fraction=1.0, volume=0))
        self.mirror[channel_id] = set(now)
        for sig in made:   # straight out (and past the poller)
            self.last_signal = max(self.last_signal or 0, sig.id)
            self.dispatch(sig)
        from .copy_share import broadcast
        for sig in made:   # and posted where the channel is connected (after the copies are on their way)
            broadcast(sig)

    def _open_refs(self, channel_id):
        """The provider's mirrored positions still open, as the signals last left them"""
        from .models import CopySignal
        state = {}
        for s in CopySignal.objects.filter(channel_id=channel_id, source="mt5").order_by("id"):
            if s.kind == "open":
                state[s.ref] = {"symbol": s.symbol, "sl": s.sl, "tp": s.tp, "volume": s.volume}
            elif s.ref in state:
                if s.kind == "modify":
                    state[s.ref].update(sl=s.sl, tp=s.tp)
                elif s.fraction >= 0.999 or not s.volume:
                    state.pop(s.ref)
                else:
                    state[s.ref]["volume"] = s.volume
        return state

    def heartbeat(self):
        from .models import CopierHeartbeat, CopySubscription
        connected = CopySubscription.objects.filter(auto_copy=True, terminal_status="connected").count()
        CopierHeartbeat.objects.update_or_create(host=self.host, defaults={"seen": timezone.now(), "terminals": len(self.terminals), "connected": connected})

    def step(self):
        """One round (tests drive it directly)"""
        for t in self.terminals.values():
            if isinstance(t, InlineTerminal):
                t.poll()
        self.poll_signals()
        self.drain()

    def run(self, stop_after=None):
        started = time.time()
        next_sync = next_beat = 0.0
        try:
            while stop_after is None or time.time() - started < stop_after:
                close_old_connections()
                now = time.time()
                if now >= next_sync:
                    self.sync()
                    next_sync = now + SYNC_S
                self.poll_signals()
                self.drain()
                if now >= next_beat:
                    self.heartbeat()
                    next_beat = now + HEARTBEAT_S
                time.sleep(POLL_S)
        finally:
            for t in self.terminals.values():
                t.stop()
