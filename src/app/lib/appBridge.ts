// The TradePilot phone apps (mobile/android: Kotlin + Jetpack Compose; mobile/ios: Swift + SwiftUI)
// are built like TradingView's: native screens (watchlist, symbol search, symbol page, menu) and the
// chart in a WebView of this site. This is the site's side of that bridge.
//
// The apps load the site with "TradePilotApp/<version> (android|ios)" at the end of the user agent.
// The page then:
//  - shows just the chart (the app draws its own header and chart bar), see ChartApp's app mode
//  - tells the app what it shows and who's signed in: post("state" | "user" | "lists" | "quotes")
//  - takes the app's commands: window.__tpApp.cmd({ type, ... })
//
// Messages go to Android's addJavascriptInterface object `TradePilotAndroid.postMessage(json)` or to
// iOS's `webkit.messageHandlers.tradepilot.postMessage(json)`.

export type AppPlatform = "android" | "ios";

export function appPlatform(): AppPlatform | null {
  if (typeof navigator === "undefined") return null;
  const m = /TradePilotApp\/[\d.]+ \((android|ios)\)/.exec(navigator.userAgent);
  return m ? (m[1] as AppPlatform) : null;
}

export const inApp = () => appPlatform() !== null;

export function postToApp(type: string, data: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const json = JSON.stringify({ type, ...data });
  const w = window as any;
  try {
    if (w.TradePilotAndroid?.postMessage) w.TradePilotAndroid.postMessage(json);
    else if (w.webkit?.messageHandlers?.tradepilot) w.webkit.messageHandlers.tradepilot.postMessage(json);
  } catch { /* the app went away */ }
}

export type AppCommand = { type: string; [k: string]: any };
type Handler = (c: AppCommand) => void;
const handlers = new Set<Handler>();

// Commands from the app; each handler takes the ones it knows
export function onAppCommand(h: Handler): () => void {
  handlers.add(h);
  return () => { handlers.delete(h); };
}

if (typeof window !== "undefined") {
  (window as any).__tpApp = {
    cmd: (c: AppCommand | string) => {
      const cmd = typeof c === "string" ? JSON.parse(c) : c;
      handlers.forEach(h => { try { h(cmd); } catch (e) { console.warn("[app] command failed", cmd?.type, e); } });
    },
  };
}
