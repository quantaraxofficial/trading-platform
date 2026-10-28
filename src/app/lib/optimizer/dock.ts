// The optimizer's report in the bottom panel (its own tab, like the Strategy Tester's): which run
// it shows, and the section's size, kept across reloads so a run left going is there on return.

import { makeStore } from "../../trading/settings";

export interface OptimizerDock {
  open: boolean;                 // the tab is in the bottom panel
  runId: number | null;
  scriptName: string;
  expanded: boolean;
  height: number;
  maximized: boolean;
  view: "summary" | "results";
}

export const optimizerDock = makeStore<OptimizerDock>("tv:optimizerDock", {
  open: false, runId: null, scriptName: "", expanded: true, height: 380, maximized: false, view: "summary",
});

export function showOptimizerReport(runId: number, scriptName: string) {
  optimizerDock.set({ open: true, runId, scriptName, expanded: true });
}
