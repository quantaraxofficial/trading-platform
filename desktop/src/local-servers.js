// The local edition (config.json "local"): TradePilot running the merge branch on this PC. Opening
// the app starts the branch's backend (its database brought up to date first) and its site (a
// production build, made the first time and again whenever the branch has newer commits: much
// lighter than the dev server); closing the app stops what it started. A backend already on the
// port (another branch's) is never stopped: the user is asked.
"use strict";

const { spawn, execFile } = require("child_process");
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");

const started = [];

function portInUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (e) => resolve(e.code === "EADDRINUSE"));
    srv.once("listening", () => srv.close(() => resolve(false)));
    srv.listen(port, "127.0.0.1");
  });
}

function responds(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 4000 }, (res) => { res.resume(); resolve(res.statusCode < 500); });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

async function waitFor(url, ms, child) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await responds(url)) return true;
    if (child && child.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function logStream(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  return fs.createWriteStream(path.join(dir, `${name}.log`), { flags: "a" });
}

function run(cmd, args, opts, log) {
  const child = spawn(cmd, args, { ...opts, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  return child;
}

function runToEnd(cmd, args, opts, log) {
  return new Promise((resolve) => {
    const child = run(cmd, args, opts, log);
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

// node for the site: the PC's own if there is one, else Electron's (ELECTRON_RUN_AS_NODE)
function nodeCommand() {
  return new Promise((resolve) => {
    execFile("where", ["node"], { windowsHide: true }, (err, out) => {
      const first = !err && String(out).split(/\r?\n/).find(Boolean);
      resolve(first ? { cmd: first.trim(), env: {} } : { cmd: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } });
    });
  });
}

function lastCommitTime(repo) {
  return new Promise((resolve) => {
    execFile("git", ["-C", repo, "log", "-1", "--format=%ct"], { windowsHide: true }, (err, out) => resolve(err ? 0 : Number(String(out).trim()) * 1000));
  });
}

// status(text, detail?) shows progress; ask(question) resolves "retry" | "continue" | "quit"
async function startLocal(cfg, logDir, status, ask) {
  const repo = cfg.repo;
  const feUrl = `http://127.0.0.1:${cfg.frontendPort}/`;
  const beUrl = `http://127.0.0.1:${cfg.backendPort}/admin/login/`;
  const env = { ...process.env, PYTHONUNBUFFERED: "1", FRONTEND_ORIGINS: `http://localhost:${cfg.frontendPort},http://127.0.0.1:${cfg.frontendPort},http://localhost:3000,http://127.0.0.1:3000` };
  delete env.ELECTRON_RUN_AS_NODE;

  // ---- the backend
  for (;;) {
    if (!(await portInUse(cfg.backendPort))) break;
    const answer = await ask(`Port ${cfg.backendPort} is already used by another backend (perhaps your other TradePilot branch). Close it and press Retry, or continue with the backend that's running.`);
    if (answer === "quit") return false;
    if (answer === "continue") { cfg.reuseBackend = true; break; }
  }
  if (!cfg.reuseBackend) {
    status("Updating the merge database…");
    const blog = logStream(logDir, "backend");
    const be = path.join(repo, "backend");
    await runToEnd(cfg.python, ["manage.py", "migrate", "--noinput"], { cwd: be, env }, blog);
    status("Starting the merge backend…");
    const child = run(cfg.python, ["manage.py", "runserver", String(cfg.backendPort), "--noreload"], { cwd: be, env }, blog);
    started.push(child);
    if (!(await waitFor(beUrl, 90000, child))) { status("The merge backend didn't start.", `See ${path.join(logDir, "backend.log")}`); return false; }
  }

  // ---- the site: built when there's no build or the branch moved on since
  if (await responds(feUrl)) return true;   // (still running from before)
  const node = await nodeCommand();
  const nextBin = path.join(repo, "node_modules", "next", "dist", "bin", "next");
  const flog = logStream(logDir, "site");
  const buildId = path.join(repo, ".next", "BUILD_ID");
  const builtAt = fs.existsSync(buildId) ? fs.statSync(buildId).mtimeMs : 0;
  if (!builtAt || builtAt < (await lastCommitTime(repo))) {
    status("Preparing the merge site…", "The first time, and after an update, this takes a few minutes.");
    const ok = await runToEnd(node.cmd, [nextBin, "build", "--webpack"], { cwd: repo, env: { ...env, ...node.env, NEXT_TELEMETRY_DISABLED: "1" } }, flog);
    if (!ok) { status("The merge site couldn't be built.", `See ${path.join(logDir, "site.log")}`); return false; }
  }
  status("Starting the merge site…");
  const site = run(node.cmd, [nextBin, "start", "-p", String(cfg.frontendPort), "-H", "127.0.0.1"], { cwd: repo, env: { ...env, ...node.env, NEXT_TELEMETRY_DISABLED: "1" } }, flog);
  started.push(site);
  if (!(await waitFor(feUrl, 90000, site))) { status("The merge site didn't start.", `See ${path.join(logDir, "site.log")}`); return false; }
  return true;
}

// everything this app started (and their children), when it closes
function stopLocal() {
  for (const child of started.splice(0)) {
    if (child.exitCode !== null) continue;
    try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch { /* gone */ }
  }
}

module.exports = { startLocal, stopLocal };
