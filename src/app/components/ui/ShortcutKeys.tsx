import React from "react";

// The "[Alt] + [G]" key badges TradingView appends to a tooltip's label
export function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <span className="tv-tooltip-shortcut">
      {keys.map((k, i) => (
        <React.Fragment key={k}>
          {i > 0 && "+"}
          <span className="tv-kbd">{k}</span>
        </React.Fragment>
      ))}
    </span>
  );
}
