// A backtest session's option "Long / Short Position drawings place orders" (sessions.ts
// positions_as_orders): while such a session runs, drawing a Long or Short Position places that
// trade in the session's account (its entry, take profit and stop loss, and the quantity the drawing
// shows: market when the entry is at the price now, limit or stop otherwise). Moving the drawing's
// lines moves the order (or, once filled, the position's TP / SL); deleting a drawing whose order
// hasn't filled cancels it. The drawing keeps its order's id (orderId), so this survives a reload.
import { engine } from "../trading/store";
import { activeBook } from "../trading/engine";
import { qtyStepOf } from "../trading/instruments";
import { positionsAsOrdersOn, sessionBalance } from "../analytics/sessions";

type Pt = { logical: number; price: number };
interface PositionDrawing {
  id: string; type: string; points: Pt[];
  accountSize?: number; risk?: number; riskType?: string; lotSize?: number; qtyPrecision?: string;
  orderId?: string; orderSymbol?: string;
}

const isPosition = (d: { type?: string }) => d.type === "long_position" || d.type === "short_position";
const chartSymbol = () => String((window as any).__chartDataKey || "").split("|")[0];
const notify = (text: string) => window.dispatchEvent(new CustomEvent("tv:toast", { detail: { text } }));

// the drawing's entry / target / stop and the quantity it shows (as PositionTool works it out)
function plan(d: PositionDrawing, symbol: string) {
  const [entryPt, , targetPt, stopPt] = d.points || [];
  if (!entryPt || !targetPt || !stopPt) return null;
  const entry = entryPt.price, tp = targetPt.price, sl = stopPt.price;
  const stopDist = Math.abs(entry - sl);
  const accountSize = d.accountSize ?? 1000, risk = d.risk ?? 25, lot = d.lotSize ?? 1;
  const riskAmount = (d.riskType ?? "%") === "%" ? accountSize * risk / 100 : risk;
  const step = !d.qtyPrecision || d.qtyPrecision === "Default" ? qtyStepOf(symbol) : Math.pow(10, -Number(d.qtyPrecision));
  const raw = stopDist > 0 && lot > 0 ? riskAmount / (stopDist * lot) : 0;
  const qty = Math.floor(raw / step + 1e-9) * step;
  return { side: d.type === "long_position" ? "buy" as const : "sell" as const, entry, tp, sl, qty };
}

function orderType(side: "buy" | "sell", entry: number, price: number): "market" | "limit" | "stop" {
  if (!(price > 0) || Math.abs(entry - price) <= price * 0.0002) return "market";
  if (side === "buy") return entry < price ? "limit" : "stop";
  return entry > price ? "limit" : "stop";
}

// a new drawing: its starting size from the session's balance at 1% risk, and its order. Returns
// what to add to the drawing (the order's id), or null when nothing's done.
export function positionDrawingAdded(d: PositionDrawing): Partial<PositionDrawing> | null {
  if (!isPosition(d) || !positionsAsOrdersOn()) return null;
  const symbol = chartSymbol();
  if (!symbol) return null;
  const sized: PositionDrawing = { ...d };
  // (still the tool's own defaults: sized from the session instead)
  if ((d.accountSize ?? 1000) === 1000 && (d.risk ?? 25) === 25) { sized.accountSize = Math.round(sessionBalance() || 10000); sized.risk = 1; sized.riskType = "%"; }
  const p = plan(sized, symbol);
  if (!p || !(p.qty > 0)) { notify("The position is too small to place: widen the stop or raise the risk"); return { accountSize: sized.accountSize, risk: sized.risk, riskType: sized.riskType }; }
  const price = engine.getState().quotes[symbol]?.price ?? 0;
  const type = orderType(p.side, p.entry, price);
  const r = engine.placeOrder({ symbol, side: p.side, type, qty: p.qty, price: type === "market" ? undefined : p.entry, levels: [{ qty: p.qty, tp: p.tp, sl: p.sl }] });
  if (!r.ok) { notify(`Order not placed: ${r.error || "the account refused it"}`); return { accountSize: sized.accountSize, risk: sized.risk, riskType: sized.riskType }; }
  notify(`${p.side === "buy" ? "Buy" : "Sell"} ${type} ${p.qty} placed from the drawing`);
  return { accountSize: sized.accountSize, risk: sized.risk, riskType: sized.riskType, orderId: r.orderId, orderSymbol: symbol };
}

// a drawing moved or resized: its order follows (debounced: drags send many updates)
const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function positionDrawingChanged(d: PositionDrawing) {
  if (!isPosition(d) || !d.orderId || !positionsAsOrdersOn()) return;
  clearTimeout(timers.get(d.id));
  timers.set(d.id, setTimeout(() => {
    timers.delete(d.id);
    const symbol = d.orderSymbol || chartSymbol();
    const p = plan(d, symbol);
    if (!p || !(p.qty > 0)) return;
    const book = activeBook(engine.getState());
    const pending = book.orders.find(o => o.id === d.orderId);
    if (pending) {
      if (pending.type === "market") return;
      const price = engine.getState().quotes[symbol]?.price ?? 0;
      const t = orderType(p.side, p.entry, price);
      engine.modifyOrder(d.orderId!, { price: p.entry, qty: p.qty, type: t === "market" ? (pending.type as "limit" | "stop") : t, levels: [{ qty: p.qty, tp: p.tp, sl: p.sl }] });
      return;
    }
    // filled: the position's exits follow the drawing's lines
    const pos = book.positions.find(x => x.symbol === symbol);
    if (pos && pos.side === p.side) engine.setPositionExits(symbol, [{ qty: pos.qty, tp: p.tp, sl: p.sl }]);
  }, 350));
}

// a drawing deleted: its order goes too while it hasn't filled (a filled position stays open)
export function positionDrawingDeleted(d: PositionDrawing | undefined) {
  if (!d || !isPosition(d) || !d.orderId) return;
  clearTimeout(timers.get(d.id));
  const book = activeBook(engine.getState());
  if (book.orders.some(o => o.id === d.orderId)) { engine.cancelOrder(d.orderId); notify("The drawing's order was cancelled"); }
}
