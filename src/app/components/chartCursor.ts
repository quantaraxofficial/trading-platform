// The chart's cursor for the selected cursor mode / tool (left toolbar), shared by the chart
// panes and the drawing layer above them so both show the same one. Crosshair visibility
// goes with it: TradingView hides its crosshair lines in the Arrow, Eraser and Demonstration modes.
export function chartModeCursor(activeTool: string | null, theme: string): { cursor: string; crosshairMode: number } {
  const ink = theme === 'dark' ? '#d1d4dc' : '#131722';
  const svg = (body: string, attrs = `fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`) =>
    `url('data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${attrs}>${body}</svg>`)}')`;
  switch (activeTool) {
    case 'arrow_cursor':
      return { cursor: 'default', crosshairMode: 2 };
    case 'eraser':
      return { cursor: `${svg('<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>')} 0 24, auto`, crosshairMode: 2 };
    case 'magic':
      return { cursor: `${svg('<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>')} 0 0, auto`, crosshairMode: 0 };
    case 'demonstration':
      return { cursor: `${svg('<circle cx="12" cy="12" r="4"/>', 'fill="red"')} 12 12, auto`, crosshairMode: 2 };
    case 'dot':
      return { cursor: `${svg('<circle cx="12" cy="12" r="2"/>', `fill="${ink}"`)} 12 12, crosshair`, crosshairMode: 0 };
    case 'zoom_in':
      return { cursor: 'zoom-in', crosshairMode: 0 };
    case 'cross':
    default:
      return { cursor: 'crosshair', crosshairMode: 0 };
  }
}
