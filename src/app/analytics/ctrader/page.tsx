"use client";

// Where cTrader sends the trader back after they allowed TradePilot to view their accounts
// (CTRADER_REDIRECT_URI): the one-minute code goes to the backend, which connects the accounts
// (accounts.ts → core/stats_accounts.ctrader), then Analytics opens on the first one.

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ctraderConnect } from "../accounts";

export default function CtraderReturn() {
  const { user, loading } = useAuth();
  const [msg, setMsg] = useState("Connecting your cTrader accounts…");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (loading) return;
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code"), state = q.get("state");
    let expected: string | null = null;
    try { expected = sessionStorage.getItem("tv:ctraderState"); sessionStorage.removeItem("tv:ctraderState"); } catch { /* storage off */ }
    const fail = (m: string) => { setMsg(m); setFailed(true); };
    if (!user) return fail("Sign in to TradePilot first, then connect cTrader again from Analytics.");
    if (q.get("error")) return fail("cTrader didn't give the permission. You can try again from Analytics.");
    if (!code) return fail("cTrader didn't send a code back. Try connecting again from Analytics.");
    // (this browser started the connection: a sign-in link from elsewhere isn't followed)
    if (state && expected !== state) return fail("This cTrader sign-in wasn't started here. Connect again from Analytics.");
    ctraderConnect(user.uid, code).then(
      accs => { window.location.replace(`/analytics?view=performance${accs[0] ? `&account=acc:${accs[0].id}` : ""}`); },
      e => fail(e.message),
    );
  }, [loading, user]);
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-black/60 backdrop-blur-xl border border-purple-800/50 rounded-2xl p-8 text-center shadow-2xl">
        <h1 className="text-xl font-bold mb-3">cTrader</h1>
        <p className={failed ? "text-red-300" : "text-purple-200"} role={failed ? "alert" : "status"}>{msg}</p>
        {failed && <a href="/analytics" className="inline-block mt-6 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 font-semibold">Back to Analytics</a>}
      </div>
    </div>
  );
}
