"use client";

// The order panel docked in the right column: the order ticket, or the DOM (Order | DOM switch).

import React from "react";
import { useTradingUi } from "./store";
import OrderTicket from "./OrderTicket";
import DomPanel from "./DomPanel";

export default function DockedTradingPanel() {
  const ui = useTradingUi();
  return ui.dock.tab === "dom" ? <DomPanel /> : <OrderTicket placement="docked" />;
}
