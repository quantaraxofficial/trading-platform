// What a collab invite says: the text "Copy invite" puts on the clipboard (with the link), and the
// link's own preview where it's pasted (WhatsApp, Telegram…: app/chart/page.tsx). Same wording in
// both: who invites, what's shared, how many are in it.

export interface InviteRoom { name: string; kind: "chart" | "pine"; symbol: string; interval: string }

// "15min" → "15m", "1h" → "1h", "1day" → "1D"
function shortInterval(iv: string): string {
  const m = /^(\d+)(s|min|h|day|week|month)$/.exec(iv || "");
  if (!m) return iv || "";
  return m[1] + ({ s: "s", min: "m", h: "h", day: "D", week: "W", month: "M" } as Record<string, string>)[m[2]];
}

export function whatIsShared(room: InviteRoom): string {
  return room.kind === "pine" ? "a Pine script, edited together live" : `the ${room.symbol.replace("/", "")} ${shortInterval(room.interval)} chart, shared live`;
}

export const peopleIn = (n: number) => `${n} ${n === 1 ? "person is" : "people are"} in it`;

// The text sent with the link: from the one inviting, with how many are in it and a few of their names
export function inviteText(o: { inviter: string; room: InviteRoom; link: string; names: string[] }): string {
  const n = o.names.length;
  const shown = o.names.slice(0, 3);
  const names = n ? ` (${shown.join(", ")}${n > shown.length ? ` and ${n - shown.length} more` : ""})` : "";
  return `${o.inviter} is inviting you to collab on TradePilot: "${o.room.name}"\n`
    + `It's ${whatIsShared(o.room)}. ${peopleIn(n)}${names}.\n`
    + `Join here: ${o.link}`;
}
