// Calls to the Django backend's per-user endpoints carry this browser's session key, which the
// backend requires (a custom header would need a CORS preflight it doesn't allow, so it rides in
// the query)
export function sessionKey(): string {
  try { return localStorage.getItem("tv_session_key") || ""; } catch { return ""; }
}

export function backendFetch(url: string, init?: RequestInit): Promise<Response> {
  const key = sessionKey();
  if (key && !/[?&]session_key=/.test(url)) url += `${url.includes("?") ? "&" : "?"}session_key=${encodeURIComponent(key)}`;
  return fetch(url, init);
}
