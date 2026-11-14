// A random id this browser keeps, so a signed-out visitor counts once (Django Admin → Site analytics:
// visitors and how many of them sign up). Nothing personal: not an IP, not a fingerprint; cleared
// with the site's data.
export function visitorId(): string {
  try {
    let v = localStorage.getItem("tp_vid");
    if (!v) {
      const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random()}`;
      v = rnd.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
      localStorage.setItem("tp_vid", v);
    }
    return v;
  } catch {
    return "";
  }
}
