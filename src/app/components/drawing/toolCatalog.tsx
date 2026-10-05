import React from "react";
import { Circle, Type, MousePointer2, PlayCircle, Wand2, Eraser } from "lucide-react";
import type { DrawingType } from "./core/DrawingContext";
import { TvToolIcon } from "../icons/tvToolIcons";
import {
  TVCrosshairIcon,
  TVMeasureIcon,
  TVTrendlineIcon,
  TVHorizontalRayIcon,
  TVFibonacciIcon,
  TVLongPositionIcon,
  TVShortPositionIcon,
  TVBrushIcon,
  TVHighlighterIcon,
  TVArrowMarkerIcon,
  TVArrowIcon,
  TVArrowMarkUpIcon,
  TVArrowMarkDownIcon,
  TVRectangleIcon,
  TVRotatedRectangleIcon,
  TVPathIcon,
  TVCircleIcon,
  TVEllipseIcon,
  TVPolylineIcon,
  TVTriangleIcon,
  TVArcIcon,
  TVCurveIcon,
  TVDoubleCurveIcon,
} from "../icons/TVIcons";

export interface DrawingToolInfo {
  type: DrawingType;
  label: string;
  // Extra words the quick search should match on (e.g. "fib" for Fibonacci Retracement)
  keywords?: string[];
  shortcut?: string;
  // TradingView glyphs are drawn for a 28px box; lucide placeholders read best at ~18px
  icon: () => React.ReactNode;
}

const tv = (Icon: React.ComponentType<any>) => () => <Icon size={28} />;
const lucide = (node: React.ReactNode) => () => node;

// Every drawing tool a user can pick, in left-toolbar order. Shared by the Quick search
// dialog and the floating favorites toolbar so names and icons stay in one place.
export const DRAWING_TOOLS: DrawingToolInfo[] = [
  { type: "cross", label: "Cross", keywords: ["crosshair", "cursor"], icon: tv(TVCrosshairIcon) },
  { type: "dot", label: "Dot", keywords: ["cursor"], icon: lucide(<Circle size={18} fill="currentColor" />) },
  { type: "arrow_cursor", label: "Arrow cursor", keywords: ["cursor", "pointer"], icon: lucide(<MousePointer2 size={18} style={{ transform: "rotate(-45deg)" }} />) },
  { type: "demonstration", label: "Demonstration", keywords: ["cursor"], icon: lucide(<PlayCircle size={18} />) },
  { type: "magic", label: "Magic", keywords: ["cursor"], icon: lucide(<Wand2 size={18} />) },
  { type: "eraser", label: "Eraser", keywords: ["delete", "remove"], icon: lucide(<Eraser size={18} />) },
  { type: "trendline", label: "Trend Line", keywords: ["line"], icon: tv(TVTrendlineIcon) },
  { type: "ray", label: "Ray", keywords: ["line"], icon: () => <TvToolIcon id="LineToolRay" size={28} /> },
  { type: "info_line", label: "Info line", keywords: ["line", "stats", "measure"], icon: () => <TvToolIcon id="LineToolInfoLine" size={28} /> },
  { type: "extended_line", label: "Extended line", keywords: ["line"], icon: () => <TvToolIcon id="LineToolExtended" size={28} /> },
  { type: "trend_angle", label: "Trend angle", keywords: ["line", "angle"], icon: () => <TvToolIcon id="LineToolTrendAngle" size={28} /> },
  { type: "horizontal_line", label: "Horizontal line", keywords: ["line"], shortcut: "Alt+H", icon: () => <TvToolIcon id="LineToolHorzLine" size={28} /> },
  { type: "horizontal_ray", label: "Horizontal ray", keywords: ["line"], shortcut: "Alt+J", icon: tv(TVHorizontalRayIcon) },
  { type: "vertical_line", label: "Vertical line", keywords: ["line"], shortcut: "Alt+V", icon: () => <TvToolIcon id="LineToolVertLine" size={28} /> },
  { type: "cross_line", label: "Cross line", keywords: ["line", "crosshair"], shortcut: "Alt+C", icon: () => <TvToolIcon id="LineToolCrossLine" size={28} /> },
  { type: "fibonacci", label: "Fibonacci Retracement", keywords: ["fib"], icon: tv(TVFibonacciIcon) },
  { type: "long_position", label: "Long Position", keywords: ["risk", "reward", "trade"], icon: tv(TVLongPositionIcon) },
  { type: "short_position", label: "Short Position", keywords: ["risk", "reward", "trade"], icon: tv(TVShortPositionIcon) },
  { type: "brush", label: "Brush", keywords: ["draw", "pen"], icon: tv(TVBrushIcon) },
  { type: "highlighter", label: "Highlighter", keywords: ["marker", "pen"], icon: tv(TVHighlighterIcon) },
  { type: "arrow_marker", label: "Arrow marker", icon: tv(TVArrowMarkerIcon) },
  { type: "arrow", label: "Arrow", icon: tv(TVArrowIcon) },
  { type: "arrow_mark_up", label: "Arrow mark up", icon: tv(TVArrowMarkUpIcon) },
  { type: "arrow_mark_down", label: "Arrow mark down", icon: tv(TVArrowMarkDownIcon) },
  { type: "rectangle", label: "Rectangle", keywords: ["box", "shape"], shortcut: "Alt+Shift+R", icon: tv(TVRectangleIcon) },
  { type: "rotated_rectangle", label: "Rotated rectangle", keywords: ["box", "shape"], icon: tv(TVRotatedRectangleIcon) },
  { type: "path", label: "Path", icon: tv(TVPathIcon) },
  { type: "circle", label: "Circle", keywords: ["shape"], icon: tv(TVCircleIcon) },
  { type: "ellipse", label: "Ellipse", keywords: ["shape", "oval"], icon: tv(TVEllipseIcon) },
  { type: "polyline", label: "Polyline", keywords: ["shape"], icon: tv(TVPolylineIcon) },
  { type: "triangle", label: "Triangle", keywords: ["shape"], icon: tv(TVTriangleIcon) },
  { type: "arc", label: "Arc", keywords: ["shape"], icon: tv(TVArcIcon) },
  { type: "curve", label: "Curve", icon: tv(TVCurveIcon) },
  { type: "double_curve", label: "Double curve", icon: tv(TVDoubleCurveIcon) },
  { type: "text", label: "Text", keywords: ["note", "label", "annotation"], icon: lucide(<Type size={18} strokeWidth={2} />) },
  { type: "measure", label: "Measure", keywords: ["ruler", "distance"], icon: tv(TVMeasureIcon) },
];

export const DRAWING_TOOL_BY_TYPE: Record<string, DrawingToolInfo> = Object.fromEntries(
  DRAWING_TOOLS.map(t => [t.type, t])
);
