"use client";

// "Close the site" (the voice assistant): every open tab of the site closes. Browsers only let a
// page close a tab that a script opened, so each tab tries, and one the browser keeps open goes
// blank instead (the site is no longer running in it). What's waiting to sync to the account is
// uploaded first. The tabs hear it over a BroadcastChannel (every tab listens: listenForSiteClose).

import { flushCloudSync } from "./cloudSync";

const CHANNEL = "tradepilot-site";

function closeThisTab() {
  try { window.close(); } catch { /* not allowed */ }
  // (still here: the browser kept the tab, so the site leaves it)
  setTimeout(() => { if (!window.closed) window.location.replace("about:blank"); }, 300);
}

// Closes every tab of the site, this one last (after `delayMs`, so a spoken answer can finish)
export async function closeAllSiteTabs(delayMs = 1500) {
  try { await Promise.race([flushCloudSync(), new Promise(r => setTimeout(r, 3000))]); } catch { /* offline */ }
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: "close" });
    ch.close();
  } catch { /* no BroadcastChannel: only this tab */ }
  setTimeout(closeThisTab, delayMs);
}

// Every tab: close when another tab says the site is closing
export function listenForSiteClose(): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = e => {
    if (e.data?.type !== "close") return;
    flushCloudSync().catch(() => {}).finally(closeThisTab);
  };
  return () => ch.close();
}
