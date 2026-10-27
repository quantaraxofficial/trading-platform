// Drawings as the chart keeps them: objects with an id and a type. A broken save on one branch
// stored the backend's own records ({id, symbol, data: [drawings]}) as if they were drawings;
// those are unwrapped back into the drawings inside, and anything else that isn't a drawing is
// left out, so it can't break the chart or the Object tree.
export function cleanDrawings<T = any>(list: unknown): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  const seen = new Set<unknown>();
  for (const d of list) {
    if (!d || typeof d !== "object") continue;
    const item = d as any;
    if (typeof item.type === "string" && item.id != null) {
      if (!seen.has(item.id)) { seen.add(item.id); out.push(item); }
    } else if (Array.isArray(item.data)) {
      for (const inner of cleanDrawings<T>(item.data)) {
        const id = (inner as any).id;
        if (!seen.has(id)) { seen.add(id); out.push(inner); }
      }
    }
  }
  return out;
}
