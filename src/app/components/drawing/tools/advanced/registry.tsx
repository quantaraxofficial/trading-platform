import React from 'react';
import { RenderCtx, Pt } from './MultiPointTool';
import {
  renderFibTrendExt, renderFibChannel, renderFibTimeZone, renderFibSpeedFan, renderFibTrendTime,
  renderFibCircles, renderFibSpiral, renderFibSpeedArcs, renderFibWedge, renderPitchfan,
} from './fib';
import { renderGannBox, renderGannSquare, renderGannFixed, renderGannFan } from './gann';
import {
  renderXABCD, renderCypher, renderHeadShoulders, renderABCD, renderTrianglePattern, renderThreeDrives,
  renderElliott, renderCyclicLines, renderTimeCycles, renderSineLine,
} from './patterns';
import {
  renderForecast, renderBarsPattern, captureBarsPattern, renderGhostFeed, renderSector, constrainSector,
  renderPriceRange, renderDateRange, renderDateAndPriceRange,
} from './forecast';
import { renderAnchoredVWAP, anchorOnVWAP, renderFixedRangeVP, renderAnchoredVP } from './volume';
import {
  renderParallelChannel, renderRegressionTrend, renderFlatBottom, renderDisjointChannel,
  renderPitchfork, renderSchiffPitchfork, renderModifiedSchiffPitchfork, renderInsidePitchfork,
} from './channels';
import {
  renderTextNote, textNoteAt, renderPriceNote, renderPin, pinAt, renderTable, tableAt, renderCallout, calloutAt,
  renderComment, commentAt, renderPriceLabel, renderSignpost, signpostAt, renderFlag, renderImage, renderPost, renderIdea,
} from './annotations';

// TradingView's left-toolbar tools drawn by MultiPointTool: how many points each takes (as
// placing them in TradingView does), its default colour, how it's drawn, its TradingView icon,
// and anything it captures when it's created.
export interface AdvancedTool {
  label: string;
  tvIcon: string;
  points: number;               // Infinity: keeps taking points until finished (double-click / Esc)
  stroke: string;
  render: (ctx: RenderCtx) => React.ReactNode;
  onCreate?: (points: Pt[]) => Record<string, any>;
  constrain?: (points: Pt[], moved: number, ctx: RenderCtx) => Pt[];
  extra?: Record<string, any>;  // other default style
  // Text tools: where the editor opens on its text (key: a table cell 'r,c'), and whether typing
  // starts as soon as it's placed (as TradingView's notes do)
  text?: { at: (g: { p: { x: number; y: number }[]; d: any; key?: string }) => { x: number; y: number; color: string; fontSize: number }; editOnCreate?: boolean };
  // Content tools ask for their content once placed: a picture, or a link
  content?: 'image' | 'post' | 'idea';
}

export const ADVANCED_TOOLS: Record<string, AdvancedTool> = {
  // Channels
  parallel_channel: { label: 'Parallel channel', tvIcon: 'LineToolParallelChannel', points: 3, stroke: '#2962FF', render: renderParallelChannel },
  regression_trend: { label: 'Regression trend', tvIcon: 'LineToolRegressionTrend', points: 2, stroke: '#2962FF', render: renderRegressionTrend },
  flat_bottom: { label: 'Flat top/bottom', tvIcon: 'LineToolFlatBottom', points: 3, stroke: '#FF9800', render: renderFlatBottom },
  disjoint_angle: { label: 'Disjoint channel', tvIcon: 'LineToolDisjointAngle', points: 3, stroke: '#089981', render: renderDisjointChannel },
  // Pitchforks
  pitchfork: { label: 'Pitchfork', tvIcon: 'LineToolPitchfork', points: 3, stroke: '#F23645', render: renderPitchfork },
  schiff_pitchfork: { label: 'Schiff pitchfork', tvIcon: 'LineToolSchiffPitchfork2', points: 3, stroke: '#F23645', render: renderSchiffPitchfork },
  schiff_pitchfork_modified: { label: 'Modified Schiff pitchfork', tvIcon: 'LineToolSchiffPitchfork', points: 3, stroke: '#F23645', render: renderModifiedSchiffPitchfork },
  inside_pitchfork: { label: 'Inside pitchfork', tvIcon: 'LineToolInsidePitchfork', points: 3, stroke: '#F23645', render: renderInsidePitchfork },
  // Text & notes
  text_note: { label: 'Note', tvIcon: 'LineToolTextNote', points: 2, stroke: '#0F0F0F', render: renderTextNote, text: { at: textNoteAt, editOnCreate: true } },
  price_note: { label: 'Price note', tvIcon: 'LineToolPriceNote', points: 2, stroke: '#2962FF', render: renderPriceNote },
  note: { label: 'Pin', tvIcon: 'LineToolNote', points: 1, stroke: '#2962FF', render: renderPin, text: { at: pinAt, editOnCreate: true } },
  table: { label: 'Table', tvIcon: 'LineToolTable', points: 1, stroke: '#DBDBDB', render: renderTable, text: { at: tableAt } },
  callout: { label: 'Callout', tvIcon: 'LineToolCallout', points: 2, stroke: '#0097A7', render: renderCallout, text: { at: calloutAt, editOnCreate: true } },
  comment: { label: 'Comment', tvIcon: 'LineToolComment', points: 1, stroke: '#2962FF', render: renderComment, text: { at: commentAt, editOnCreate: true } },
  price_label: { label: 'Price label', tvIcon: 'LineToolPriceLabel', points: 1, stroke: '#2962FF', render: renderPriceLabel },
  signpost: { label: 'Signpost', tvIcon: 'LineToolSignpost', points: 1, stroke: '#2962FF', render: renderSignpost, text: { at: signpostAt, editOnCreate: true } },
  flag: { label: 'Flag mark', tvIcon: 'LineToolFlagMark', points: 1, stroke: '#2962FF', render: renderFlag },
  // Content
  image: { label: 'Image', tvIcon: 'LineToolImage', points: 1, stroke: '#2962FF', render: renderImage, content: 'image' },
  tweet: { label: 'Post', tvIcon: 'LineToolTweet', points: 1, stroke: '#2962FF', render: renderPost, content: 'post' },
  idea: { label: 'Idea', tvIcon: 'LineToolIdea', points: 1, stroke: '#2962FF', render: renderIdea, content: 'idea' },
  // Fibonacci
  fib_trend_ext: { label: 'Trend-based fib extension', tvIcon: 'LineToolTrendBasedFibExtension', points: 3, stroke: '#808080', render: renderFibTrendExt },
  fib_channel: { label: 'Fib channel', tvIcon: 'LineToolFibChannel', points: 3, stroke: '#808080', render: renderFibChannel },
  fib_timezone: { label: 'Fib time zone', tvIcon: 'LineToolFibTimeZone', points: 2, stroke: '#2962FF', render: renderFibTimeZone },
  fib_speed_resist_fan: { label: 'Fib speed resistance fan', tvIcon: 'LineToolFibSpeedResistanceFan', points: 2, stroke: '#808080', render: renderFibSpeedFan },
  fib_trend_time: { label: 'Trend-based fib time', tvIcon: 'LineToolTrendBasedFibTime', points: 3, stroke: '#808080', render: renderFibTrendTime },
  fib_circles: { label: 'Fib circles', tvIcon: 'LineToolFibCircles', points: 2, stroke: '#808080', render: renderFibCircles },
  fib_spiral: { label: 'Fib spiral', tvIcon: 'LineToolFibSpiral', points: 2, stroke: '#00bcd4', render: renderFibSpiral },
  fib_speed_resist_arcs: { label: 'Fib speed resistance arcs', tvIcon: 'LineToolFibSpeedResistanceArcs', points: 2, stroke: '#808080', render: renderFibSpeedArcs },
  fib_wedge: { label: 'Fib wedge', tvIcon: 'LineToolFibWedge', points: 3, stroke: '#808080', render: renderFibWedge },
  pitchfan: { label: 'Pitchfan', tvIcon: 'LineToolPitchfan', points: 3, stroke: '#F23645', render: renderPitchfan },
  // Gann
  gannbox: { label: 'Gann box', tvIcon: 'LineToolGannSquare', points: 2, stroke: '#808080', render: renderGannBox },
  gannbox_fixed: { label: 'Gann square fixed', tvIcon: 'LineToolGannFixed', points: 2, stroke: '#808080', render: renderGannFixed },
  gannbox_square: { label: 'Gann square', tvIcon: 'LineToolGannComplex', points: 2, stroke: '#808080', render: renderGannSquare },
  gannbox_fan: { label: 'Gann fan', tvIcon: 'LineToolGannFan', points: 2, stroke: '#808080', render: renderGannFan },
  // Chart patterns
  xabcd_pattern: { label: 'XABCD pattern', tvIcon: 'LineTool5PointsPattern', points: 5, stroke: '#2962FF', render: renderXABCD },
  cypher_pattern: { label: 'Cypher pattern', tvIcon: 'LineToolCypherPattern', points: 5, stroke: '#2962FF', render: renderCypher },
  head_and_shoulders: { label: 'Head and shoulders', tvIcon: 'LineToolHeadAndShoulders', points: 7, stroke: '#089981', render: renderHeadShoulders },
  abcd_pattern: { label: 'ABCD pattern', tvIcon: 'LineToolABCD', points: 4, stroke: '#089981', render: renderABCD },
  triangle_pattern: { label: 'Triangle pattern', tvIcon: 'LineToolTrianglePattern', points: 4, stroke: '#673ab7', render: renderTrianglePattern },
  three_drives_pattern: { label: 'Three drives pattern', tvIcon: 'LineToolThreeDrivers', points: 7, stroke: '#673ab7', render: renderThreeDrives },
  // Elliott waves
  elliott_impulse_wave: { label: 'Elliott impulse wave (1·2·3·4·5)', tvIcon: 'LineToolElliottImpulse', points: 6, stroke: '#3d85c6', render: renderElliott },
  elliott_correction: { label: 'Elliott correction wave (A·B·C)', tvIcon: 'LineToolElliottCorrection', points: 4, stroke: '#3d85c6', render: renderElliott },
  elliott_triangle_wave: { label: 'Elliott triangle wave (A·B·C·D·E)', tvIcon: 'LineToolElliottTriangle', points: 6, stroke: '#FF9800', render: renderElliott },
  elliott_double_combo: { label: 'Elliott double combo wave (W·X·Y)', tvIcon: 'LineToolElliottDoubleCombo', points: 4, stroke: '#6aa84f', render: renderElliott },
  elliott_triple_combo: { label: 'Elliott triple combo wave (W·X·Y·X·Z)', tvIcon: 'LineToolElliottTripleCombo', points: 6, stroke: '#6aa84f', render: renderElliott },
  // Cycles
  cyclic_lines: { label: 'Cyclic lines', tvIcon: 'LineToolCircleLines', points: 2, stroke: '#80ccdb', render: renderCyclicLines },
  time_cycles: {
    label: 'Time cycles', tvIcon: 'LineToolTimeCycles', points: 2, stroke: '#159980', render: renderTimeCycles,
    // the second point stays on the first one's price (the cycles' base line)
    constrain: (pts) => (pts.length >= 2 ? [pts[0], { ...pts[1], price: pts[0].price }] : pts),
    onCreate: (pts) => (pts.length >= 2 ? { points: [pts[0], { ...pts[1], price: pts[0].price }] } : {}),
  },
  sine_line: { label: 'Sine line', tvIcon: 'LineToolSineLine', points: 2, stroke: '#159980', render: renderSineLine },
  // Forecasting
  forecast: { label: 'Position forecast', tvIcon: 'LineToolPrediction', points: 2, stroke: '#2962FF', render: renderForecast },
  bars_pattern: { label: 'Bars pattern', tvIcon: 'LineToolBarsPattern', points: 2, stroke: '#2962FF', render: renderBarsPattern, onCreate: captureBarsPattern },
  ghost_feed: { label: 'Ghost feed', tvIcon: 'LineToolGhostFeed', points: Infinity, stroke: '#808080', render: renderGhostFeed },
  projection: { label: 'Sector', tvIcon: 'LineToolProjection', points: 3, stroke: '#9C9C9C', render: renderSector, constrain: constrainSector },
  // Volume-based
  anchored_vwap: { label: 'Anchored VWAP', tvIcon: 'LineToolAnchoredVWAP', points: 1, stroke: '#2962FF', render: renderAnchoredVWAP, onCreate: anchorOnVWAP },
  fixed_range_volume_profile: { label: 'Fixed range volume profile', tvIcon: 'LineToolFixedRangeVolumeProfile', points: 2, stroke: '#2962FF', render: renderFixedRangeVP },
  anchored_volume_profile: { label: 'Anchored volume profile', tvIcon: 'LineToolAnchoredVolumeProfile', points: 1, stroke: '#2962FF', render: renderAnchoredVP },
  // Measurers
  price_range: { label: 'Price range', tvIcon: 'LineToolPriceRange', points: 2, stroke: '#2962FF', render: renderPriceRange },
  date_range: { label: 'Date range', tvIcon: 'LineToolDateRange', points: 2, stroke: '#2962FF', render: renderDateRange },
  date_and_price_range: { label: 'Date and price range', tvIcon: 'LineToolDateAndPriceRange', points: 2, stroke: '#2962FF', render: renderDateAndPriceRange },
};

export type AdvancedToolType = keyof typeof ADVANCED_TOOLS;

// The left-toolbar flyout sections these tools appear in, in TradingView's order
// (null entries are tools that already exist elsewhere, listed by their own type)
export const TOOLBAR_SECTIONS: Record<'trendlines' | 'fibonacci' | 'patterns' | 'prediction' | 'text', { title: string; types: string[] }[]> = {
  // after the Lines section (listed in the toolbar itself)
  trendlines: [
    { title: 'CHANNELS', types: ['parallel_channel', 'regression_trend', 'flat_bottom', 'disjoint_angle'] },
    { title: 'PITCHFORKS', types: ['pitchfork', 'schiff_pitchfork', 'schiff_pitchfork_modified', 'inside_pitchfork'] },
  ],
  text: [
    { title: 'TEXT AND NOTES', types: ['text', 'text_note', 'price_note', 'note', 'table', 'callout', 'comment', 'price_label', 'signpost', 'flag'] },
    { title: 'CONTENT', types: ['image', 'tweet', 'idea'] },
  ],
  fibonacci: [
    { title: 'FIBONACCI', types: ['fibonacci', 'fib_trend_ext', 'fib_channel', 'fib_timezone', 'fib_speed_resist_fan', 'fib_trend_time', 'fib_circles', 'fib_spiral', 'fib_speed_resist_arcs', 'fib_wedge', 'pitchfan'] },
    { title: 'GANN', types: ['gannbox', 'gannbox_fixed', 'gannbox_square', 'gannbox_fan'] },
  ],
  patterns: [
    { title: 'CHART PATTERNS', types: ['xabcd_pattern', 'cypher_pattern', 'head_and_shoulders', 'abcd_pattern', 'triangle_pattern', 'three_drives_pattern'] },
    { title: 'ELLIOTT WAVES', types: ['elliott_impulse_wave', 'elliott_correction', 'elliott_triangle_wave', 'elliott_double_combo', 'elliott_triple_combo'] },
    { title: 'CYCLES', types: ['cyclic_lines', 'time_cycles', 'sine_line'] },
  ],
  prediction: [
    { title: 'FORECASTING', types: ['long_position', 'short_position', 'forecast', 'bars_pattern', 'ghost_feed', 'projection'] },
    { title: 'VOLUME-BASED', types: ['anchored_vwap', 'fixed_range_volume_profile', 'anchored_volume_profile'] },
    { title: 'MEASURERS', types: ['price_range', 'date_range', 'date_and_price_range'] },
  ],
};
