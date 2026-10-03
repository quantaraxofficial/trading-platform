"use client";

import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import { createPortal } from "react-dom";
import { createChart, ColorType, ISeriesApi, IChartApi, CandlestickSeries, HistogramSeries, LineSeries, PriceScaleMode, TickMarkType } from "lightweight-charts";
import { CandleBodyAwareLine } from "./chartPrimitives/CandleBodyAwareLine";
import dynamic from "next/dynamic";
const DrawingLayer = dynamic(() => import("./drawing/DrawingLayer"), { ssr: false });
import { SubBar } from "./drawing/ui/SubBar";
import { useDrawing } from "./drawing/core/DrawingContext";
import { useReplay } from "./ReplayContext";
import ReplayBar from "./ReplayBar";
import { Eye, Code, Trash2, MoreHorizontal, EyeOff, Clock, Star, Copy, RotateCcw, ChevronDown, ChevronUp, PlusSquare, ChevronRight, Settings as SettingsIcon, Zap, Check } from "lucide-react";
import VolumeSettingsModal from "./VolumeSettingsModal";
import EmaSettingsModal from "./EmaSettingsModal";
import SessionSettingsModal, { defaultSessionConfig } from "./SessionSettingsModal";
import ChartSettingsModal from "./ChartSettingsModal";
import SaveTemplateModal from "./SaveTemplateModal";
import CreateAlertModal from "./CreateAlertModal";
import StrategyReportPanel from "./StrategyReportPanel";
import { strategyDock } from "./strategy/strategyStore";
import { fetchPineTimeframeData } from "../lib/pineDataFetch";
import { runPineScriptAsync, appIntervalToPineTf, getPineInputsMeta, type PineInputMeta } from "../lib/pineScriptEngine";
import PineSettingsModal from "./PineSettingsModal";
import { useAuth } from "@/context/AuthContext";
import { MultiSelectSubBar } from "./drawing/ui/MultiSelectSubBar";
import { TVSettingsIcon } from "./icons/TVIcons";
import { SubSettingsIcon } from "./drawing/ui/subbarIcons";
import { isTypingTarget } from "../lib/isTypingTarget";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAlerts } from "@/context/AlertsContext";
import { engine, useEngineState, openTicket, projectChartOrder, orderTypeAt, lastQtyFor, tradingUi } from "@/app/trading/store";
import { quoteOf, activeBook } from "@/app/trading/engine";
import { useTradingSettings } from "@/app/trading/settings";
import { formatQty } from "@/app/trading/instruments";
import TradingOverlay from "@/app/trading/TradingOverlay";
import { Tip, TipKey as Kbd, SymbolAvatar, Popover, MenuItem, MenuDivider } from "@/app/trading/ui";
import { statusLine, type StatusLineSettings } from "../lib/statusLine";
import { loadFavoriteIndicators, saveFavoriteIndicators } from "@/app/utils/favoriteIndicators";
import { rememberExchangeTimezone, toChartTime } from "@/app/utils/exchangeTime";
import { createSeriesMarkers } from "lightweight-charts";
import { precomputeAllTimeframes, getAggCachedData, setAggCachedData, AGGREGATABLE_INTERVALS } from "@/app/utils/aggregateCandles";

// The full "UTC" timezone selector list — city groups exactly as shown in the reference dropdown.
export const TIMEZONES: { label: string; tz: string }[] = [
  { label: 'UTC', tz: 'UTC' },
  { label: 'Exchange', tz: 'exchange' },
  { label: '(UTC-10) Honolulu', tz: 'Pacific/Honolulu' },
  { label: '(UTC-8) Anchorage', tz: 'America/Anchorage' },
  { label: '(UTC-8) Juneau', tz: 'America/Juneau' },
  { label: '(UTC-7) Los Angeles', tz: 'America/Los_Angeles' },
  { label: '(UTC-7) Phoenix', tz: 'America/Phoenix' },
  { label: '(UTC-7) Vancouver', tz: 'America/Vancouver' },
  { label: '(UTC-6) Denver', tz: 'America/Denver' },
  { label: '(UTC-6) Mexico City', tz: 'America/Mexico_City' },
  { label: '(UTC-6) San Salvador', tz: 'America/El_Salvador' },
  { label: '(UTC-5) Bogota', tz: 'America/Bogota' },
  { label: '(UTC-5) Chicago', tz: 'America/Chicago' },
  { label: '(UTC-5) Lima', tz: 'America/Lima' },
  { label: '(UTC-4) Caracas', tz: 'America/Caracas' },
  { label: '(UTC-4) New York', tz: 'America/New_York' },
  { label: '(UTC-4) Santiago', tz: 'America/Santiago' },
  { label: '(UTC-4) Toronto', tz: 'America/Toronto' },
  { label: '(UTC-3) Buenos Aires', tz: 'America/Argentina/Buenos_Aires' },
  { label: '(UTC-3) Halifax', tz: 'America/Halifax' },
  { label: '(UTC-3) Sao Paulo', tz: 'America/Sao_Paulo' },
  { label: '(UTC) Azores', tz: 'Atlantic/Azores' },
  { label: '(UTC) Reykjavik', tz: 'Atlantic/Reykjavik' },
  { label: '(UTC+1) Casablanca', tz: 'Africa/Casablanca' },
  { label: '(UTC+1) Dublin', tz: 'Europe/Dublin' },
  { label: '(UTC+1) Lagos', tz: 'Africa/Lagos' },
  { label: '(UTC+1) Lisbon', tz: 'Europe/Lisbon' },
  { label: '(UTC+1) London', tz: 'Europe/London' },
  { label: '(UTC+1) Tunis', tz: 'Africa/Tunis' },
  { label: '(UTC+2) Amsterdam', tz: 'Europe/Amsterdam' },
  { label: '(UTC+2) Belgrade', tz: 'Europe/Belgrade' },
  { label: '(UTC+2) Berlin', tz: 'Europe/Berlin' },
  { label: '(UTC+2) Bratislava', tz: 'Europe/Bratislava' },
  { label: '(UTC+2) Brussels', tz: 'Europe/Brussels' },
  { label: '(UTC+2) Budapest', tz: 'Europe/Budapest' },
  { label: '(UTC+2) Copenhagen', tz: 'Europe/Copenhagen' },
  { label: '(UTC+2) Johannesburg', tz: 'Africa/Johannesburg' },
  { label: '(UTC+2) Ljubljana', tz: 'Europe/Ljubljana' },
  { label: '(UTC+2) Luxembourg', tz: 'Europe/Luxembourg' },
  { label: '(UTC+2) Madrid', tz: 'Europe/Madrid' },
  { label: '(UTC+2) Malta', tz: 'Europe/Malta' },
  { label: '(UTC+2) Oslo', tz: 'Europe/Oslo' },
  { label: '(UTC+2) Paris', tz: 'Europe/Paris' },
  { label: '(UTC+2) Prague', tz: 'Europe/Prague' },
  { label: '(UTC+2) Rome', tz: 'Europe/Rome' },
  { label: '(UTC+2) Stockholm', tz: 'Europe/Stockholm' },
  { label: '(UTC+2) Vienna', tz: 'Europe/Vienna' },
  { label: '(UTC+2) Warsaw', tz: 'Europe/Warsaw' },
  { label: '(UTC+2) Zagreb', tz: 'Europe/Zagreb' },
  { label: '(UTC+2) Zurich', tz: 'Europe/Zurich' },
  { label: '(UTC+3) Athens', tz: 'Europe/Athens' },
  { label: '(UTC+3) Bahrain', tz: 'Asia/Bahrain' },
  { label: '(UTC+3) Bucharest', tz: 'Europe/Bucharest' },
  { label: '(UTC+3) Cairo', tz: 'Africa/Cairo' },
  { label: '(UTC+3) Helsinki', tz: 'Europe/Helsinki' },
  { label: '(UTC+3) Istanbul', tz: 'Europe/Istanbul' },
  { label: '(UTC+3) Jerusalem', tz: 'Asia/Jerusalem' },
  { label: '(UTC+3) Kuwait', tz: 'Asia/Kuwait' },
  { label: '(UTC+3) Moscow', tz: 'Europe/Moscow' },
  { label: '(UTC+3) Nairobi', tz: 'Africa/Nairobi' },
  { label: '(UTC+3) Nicosia', tz: 'Asia/Nicosia' },
  { label: '(UTC+3) Qatar', tz: 'Asia/Qatar' },
  { label: '(UTC+3) Riga', tz: 'Europe/Riga' },
  { label: '(UTC+3) Riyadh', tz: 'Asia/Riyadh' },
  { label: '(UTC+3) Sofia', tz: 'Europe/Sofia' },
  { label: '(UTC+3) Tallinn', tz: 'Europe/Tallinn' },
  { label: '(UTC+3) Vilnius', tz: 'Europe/Vilnius' },
  { label: "(UTC+3:30) Tehran", tz: 'Asia/Tehran' },
  { label: '(UTC+4) Dubai', tz: 'Asia/Dubai' },
  { label: '(UTC+4) Muscat', tz: 'Asia/Muscat' },
  { label: "(UTC+4:30) Kabul", tz: 'Asia/Kabul' },
  { label: '(UTC+5) Ashgabat', tz: 'Asia/Ashgabat' },
  { label: '(UTC+5) Astana', tz: 'Asia/Almaty' },
  { label: '(UTC+5) Karachi', tz: 'Asia/Karachi' },
  { label: "(UTC+5:30) Colombo", tz: 'Asia/Colombo' },
  { label: "(UTC+5:30) Kolkata", tz: 'Asia/Kolkata' },
  { label: "(UTC+5:45) Kathmandu", tz: 'Asia/Kathmandu' },
  { label: '(UTC+6) Dhaka', tz: 'Asia/Dhaka' },
  { label: "(UTC+6:30) Yangon", tz: 'Asia/Yangon' },
  { label: '(UTC+7) Bangkok', tz: 'Asia/Bangkok' },
  { label: '(UTC+7) Ho Chi Minh', tz: 'Asia/Ho_Chi_Minh' },
  { label: '(UTC+7) Jakarta', tz: 'Asia/Jakarta' },
  { label: '(UTC+8) Chongqing', tz: 'Asia/Shanghai' },
  { label: '(UTC+8) Hong Kong', tz: 'Asia/Hong_Kong' },
  { label: '(UTC+8) Kuala Lumpur', tz: 'Asia/Kuala_Lumpur' },
  { label: '(UTC+8) Manila', tz: 'Asia/Manila' },
  { label: '(UTC+8) Perth', tz: 'Australia/Perth' },
  { label: '(UTC+8) Shanghai', tz: 'Asia/Shanghai' },
  { label: '(UTC+8) Singapore', tz: 'Asia/Singapore' },
  { label: '(UTC+8) Taipei', tz: 'Asia/Taipei' },
  { label: '(UTC+9) Seoul', tz: 'Asia/Seoul' },
  { label: '(UTC+9) Tokyo', tz: 'Asia/Tokyo' },
  { label: "(UTC+9:30) Adelaide", tz: 'Australia/Adelaide' },
  { label: '(UTC+10) Brisbane', tz: 'Australia/Brisbane' },
  { label: '(UTC+10) Sydney', tz: 'Australia/Sydney' },
  { label: '(UTC+11) Norfolk Island', tz: 'Pacific/Norfolk' },
  { label: '(UTC+12) New Zealand', tz: 'Pacific/Auckland' },
  { label: "(UTC+12:45) Chatham Islands", tz: 'Pacific/Chatham' },
  { label: '(UTC+13) Tokelau', tz: 'Pacific/Fakaofo' },
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The price scale (mode/invert/autoscale/manual zoom) has no subscribe-to-change API like
// the time scale does, so DrawingLayer can't natively react to it — this event lets it
// know to re-project its shapes onto the new price coordinates right away instead of
// waiting for some unrelated re-render to happen to catch it up.
function notifyPriceScaleChanged() {
  window.dispatchEvent(new CustomEvent('tv-price-scale-changed'));
}

// Reads a unix timestamp's wall-clock components in a given IANA timezone (or the
// "exchange" sentinel, which — absent real per-symbol exchange metadata — is treated as UTC).
function getZonedDateParts(unixSeconds: number, tz: string) {
  const d = new Date(unixSeconds * 1000);
  const zone = tz === 'exchange' ? 'UTC' : tz;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '0';
    let hour = get('hour');
    if (hour === '24') hour = '00';
    return {
      weekday: get('weekday'),
      year: get('year'),
      month: parseInt(get('month'), 10) - 1,
      day: parseInt(get('day'), 10),
      hour,
      minute: get('minute'),
      second: get('second'),
    };
  } catch {
    return {
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
      year: String(d.getFullYear()),
      month: d.getMonth(),
      day: d.getDate(),
      hour: String(d.getHours()).padStart(2, '0'),
      minute: String(d.getMinutes()).padStart(2, '0'),
      second: String(d.getSeconds()).padStart(2, '0'),
    };
  }
}

// Utility: "Wed 02 Sep '26  00:09" style formatting, shared by the crosshair label and the replay split-line label.
// Without a `tz`, keeps the original local-browser-time behavior for callers that don't care about the timezone selector.
function formatCrosshairTime(unixSeconds: number, tz?: string): string {
  const p = tz ? getZonedDateParts(unixSeconds, tz) : (() => {
    const d = new Date(unixSeconds * 1000);
    return {
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
      year: String(d.getFullYear()),
      month: d.getMonth(),
      day: d.getDate(),
      hour: String(d.getHours()).padStart(2, '0'),
      minute: String(d.getMinutes()).padStart(2, '0'),
    };
  })();
  const day = String(p.day).padStart(2, '0');
  const month = MONTH_ABBR[p.month];
  const year = p.year.slice(-2);
  return `${p.weekday} ${day} ${month} '${year}  ${p.hour}:${p.minute}`;
}

// Formats a time-axis tick mark, timezone-aware, matching lightweight-charts' own tick-granularity switching.
function formatTickMark(unixSeconds: number, tickMarkType: TickMarkType, tz: string): string {
  const p = getZonedDateParts(unixSeconds, tz);
  switch (tickMarkType) {
    case TickMarkType.Year: return p.year;
    case TickMarkType.Month: return `${MONTH_ABBR[p.month]} '${p.year.slice(-2)}`;
    case TickMarkType.DayOfMonth: return `${MONTH_ABBR[p.month]} ${p.day}`;
    case TickMarkType.TimeWithSeconds: return `${p.hour}:${p.minute}:${p.second}`;
    case TickMarkType.Time:
    default: return `${p.hour}:${p.minute}`;
  }
}

// Utility: get the duration of one candle in milliseconds for any interval string
function getIntervalMs(interval: string): number {
  const map: Record<string, number> = {
    '1min': 60_000, '5min': 5 * 60_000, '15min': 15 * 60_000,
    '30min': 30 * 60_000, '45min': 45 * 60_000,
    '1h': 3600_000, '2h': 2 * 3600_000, '4h': 4 * 3600_000,
    '1day': 86400_000, '1week': 7 * 86400_000, '1month': 30 * 86400_000,
  };
  if (map[interval]) return map[interval];
  // Custom minute intervals like "4min", "7min"
  const m = interval.match(/^(\d+)min$/);
  if (m) return parseInt(m[1], 10) * 60_000;
  // Custom hour intervals like "3h"
  const mh = interval.match(/^(\d+)h$/);
  if (mh) return parseInt(mh[1], 10) * 3600_000;
  // Custom multi-month intervals like "3month", "6month", "12month" (approximate)
  const mm = interval.match(/^(\d+)month$/);
  if (mm) return parseInt(mm[1], 10) * 30 * 86400_000;
  return 60_000; // fallback to 1min
}

interface ChartContainerProps {
  theme: string;
  interval: string;
  intervalLabel?: string;
  symbol?: string;
  activeIndicators?: {id: string, name: string}[];
  onRemoveIndicator?: (id: string) => void;
  onOpenOrderPanel?: (side: "buy" | "sell") => void;
  initialTargetTimestamp?: number | null;
  initialBarSpacing?: number | null;
  onChartStateChange?: (timestamp: number, barSpacing: number) => void;
  triggerSettings?: number;
}

// ── Stock data cache (localStorage) ───────────────────────────────────────────
// Moved to lib/stockDataCache.ts so it can be shared with the Pine engine's
// multi-timeframe fetcher without a circular import between this file and
// PineEditorPanel.tsx. Re-exported here since other files still import these
// from "./ChartContainer".
import { getCacheKey, getCachedData, setCachedData } from "../lib/stockDataCache";
import { barVolume, volumeHistogram, formatVolume } from "../utils/volume";
import { rememberFromSeriesMeta, useSymbolInfo, marketOpenNow } from "../utils/symbolInfo";
import { getEarliestBarTime } from "../utils/earliestBar";
import { useEscapeClose } from "../lib/useEscapeClose";
import TvMenu, { type TvMenuItem } from "./ui/TvMenu";
import { MenuAlertIcon, MenuBuyIcon, MenuSellIcon, MenuAddOrderIcon, MenuSettingsIcon, MenuResetIcon } from "./ui/tvMenuIcons";
import ChartTableView from "./ChartTableView";
import { useChartTick } from "./drawing/core/useChartTick";
import type { DateRangeSpan } from "./BottomPanel";
import { detectPrecision, simulatedQuote } from "@/app/utils/pricePrecision";
export { getCacheKey, getCachedData, setCachedData } from "../lib/stockDataCache";

// Requests currently on the wire, keyed like the localStorage cache. The cache only
// fills once a response has arrived, so several effects asking for the same
// symbol/interval at the same moment (initial load runs the loader more than once,
// plus React StrictMode's double-invoke in dev) each missed it and each hit the
// paid API. Sharing the pending promise makes them all wait on a single request.
const inflightStockFetches = new Map<string, Promise<any[]>>();

function fetchStockData(symbol: string = 'AAPL', interval: string = '1min', endDate?: string, lastPrice?: number, startDate?: string): Promise<any[]> {
  const key = getCacheKey(symbol, interval, endDate, startDate);
  let pending = inflightStockFetches.get(key);
  if (!pending) {
    pending = fetchStockDataUncached(symbol, interval, endDate, lastPrice, startDate)
      .finally(() => { inflightStockFetches.delete(key); });
    inflightStockFetches.set(key, pending);
  }
  // Callers sort/filter/mutate what they get back, so each waiter gets its own copy.
  return pending.then(rows => rows.map(r => ({ ...r })));
}

async function fetchStockDataUncached(symbol: string = 'AAPL', interval: string = '1min', endDate?: string, lastPrice?: number, startDate?: string) {
  const cacheKey = getCacheKey(symbol, interval, endDate, startDate);
  
  // Check cache first
  const cached = getCachedData(cacheKey, endDate);
  if (cached && cached.length > 0) {
    console.log(`[Cache] HIT for ${symbol}/${interval} (${cached.length} bars)`);
    return cached;
  }

  try {
    let url = `/api/stock-data?symbol=${encodeURIComponent(symbol)}&interval=${interval}`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
    
    const response = await fetch(url);
    const data = await response.json();
    rememberExchangeTimezone(symbol, data?.meta?.exchange_timezone);
    rememberFromSeriesMeta(symbol, data?.meta);
    
    if (data.error && data.error.toLowerCase().includes('limit')) {
      const e: any = new Error('API_LIMIT');
      e.scope = /\bday\b|daily/i.test(data.error) ? 'day' : 'minute';
      throw e;
    }
    
    if (data.error) return [];
    if (!data.values || !Array.isArray(data.values)) return [];
    const result = data.values.map((item: any) => ({
      time: new Date(item.datetime).getTime() / 1000,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: barVolume(item)
    })).reverse();
    
    // Cache the result
    if (result.length > 0) {
      setCachedData(cacheKey, result);
      console.log(`[Cache] STORED ${symbol}/${interval} (${result.length} bars)`);
    }
    
    return result;
  } catch (err: any) {
    if (err.message === 'API_LIMIT') throw err;
    return [];
  }
}

// Helper: remap drawing points from one dataset to another, extrapolating for out-of-range times
function remapDrawingPoints(drawings: any[], stockData: any[], label: string, oldStockData?: any[]) {
  if (!drawings || drawings.length === 0 || stockData.length === 0) return drawings;
  
  // Calculate average bar spacing in seconds for extrapolation
  const avgBarSpacing = stockData.length > 1
    ? (stockData[stockData.length - 1].time - stockData[0].time) / (stockData.length - 1)
    : 300; // fallback to 5min
  
  // Old bar spacing for detecting same-candle drawings
  const oldBarSpacing = oldStockData && oldStockData.length > 1
    ? (oldStockData[oldStockData.length - 1].time - oldStockData[0].time) / (oldStockData.length - 1)
    : null;
  
  // Helper: compute time from logical index in old data
  const getTimeFromOldLogical = (logical: number): number | null => {
    if (!oldStockData || oldStockData.length === 0) return null;
    const intIdx = Math.floor(logical);
    const fraction = logical - intIdx;
    
    if (intIdx >= 0 && intIdx < oldStockData.length) {
      if (fraction > 0 && intIdx + 1 < oldStockData.length) {
        return oldStockData[intIdx].time + fraction * (oldStockData[intIdx + 1].time - oldStockData[intIdx].time);
      }
      return oldStockData[Math.min(Math.round(logical), oldStockData.length - 1)].time;
    }
    
    // Extrapolate for out-of-range
    if (oldStockData.length >= 2) {
      const spacing = (oldStockData[oldStockData.length - 1].time - oldStockData[0].time) / (oldStockData.length - 1);
      return oldStockData[0].time + logical * spacing;
    }
    return null;
  };

  // Helper: remap a single point to the new data
  const remapPoint = (p: any, pointTime: number, skipMagnetSnap: boolean) => {
    const firstTime = stockData[0].time;
    const lastTime = stockData[stockData.length - 1].time;
    
    if (pointTime >= firstTime && pointTime <= lastTime) {
      // Time is within range — find the closest candle using binary search
      let lo = 0, hi = stockData.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (stockData[mid].time < pointTime) lo = mid + 1;
        else hi = mid;
      }
      let closestIdx = lo;
      if (lo > 0 && Math.abs(stockData[lo - 1].time - pointTime) < Math.abs(stockData[lo].time - pointTime)) {
        closestIdx = lo - 1;
      }
      
      // Compute fractional logical for precise placement between candles
      let fractionalLogical = closestIdx;
      if (closestIdx < stockData.length - 1) {
        const candleTime = stockData[closestIdx].time;
        const nextCandleTime = stockData[closestIdx + 1].time;
        if (nextCandleTime > candleTime && pointTime > candleTime) {
          const frac = (pointTime - candleTime) / (nextCandleTime - candleTime);
          fractionalLogical = closestIdx + Math.min(frac, 0.999);
        }
      }
      
      // Magnet-snap: only for non-fibonacci or when not skipped
      // Use a tight search range to avoid false matches on distant candles
      if (!skipMagnetSnap) {
        const searchStart = Math.max(0, closestIdx - 3);
        const searchEnd = Math.min(stockData.length - 1, closestIdx + 3);
        
        for (let i = searchStart; i <= searchEnd; i++) {
          const c = stockData[i];
          const minD = Math.min(
            Math.abs(c.open - p.price),
            Math.abs(c.high - p.price),
            Math.abs(c.low - p.price),
            Math.abs(c.close - p.price)
          );
          
          if (minD < 0.0001) {
            return { ...p, time: pointTime, logical: i };
          }
        }
      }
      
      return { ...p, time: pointTime, logical: fractionalLogical };
    } else {
      // Time is OUTSIDE the data range — extrapolate
      const extrapolatedLogical = (pointTime - firstTime) / avgBarSpacing;
      return { ...p, time: pointTime, logical: extrapolatedLogical };
    }
  };

  return drawings.map(d => {
    if (!d.points) return d;
    
    // Special handling for fibonacci: when both points share the same time (drawn on one candle),
    // spread them across the old candle duration so the fib spans the correct range on lower TFs
    if (d.type === 'fibonacci' && d.points.length === 2 && oldBarSpacing) {
      const pts = d.points;
      let time0 = pts[0].time;
      let time1 = pts[1].time;
      
      // Resolve times from logical if missing
      if (!time0 && pts[0].logical !== undefined) time0 = getTimeFromOldLogical(pts[0].logical);
      if (!time1 && pts[1].logical !== undefined) time1 = getTimeFromOldLogical(pts[1].logical);
      
      if (time0 && time1) {
        const timeDiff = Math.abs(time1 - time0);
        
        // If both points are on the same candle (time difference < old bar spacing),
        // spread them: point1 gets the candle start time, point2 gets start + old bar spacing
        if (timeDiff < oldBarSpacing * 0.5) {
          const baseTime = Math.min(time0, time1);
          const newTime0 = baseTime;
          const newTime1 = baseTime + oldBarSpacing;
          
          const p0 = remapPoint(pts[0], newTime0, true);
          const p1 = remapPoint(pts[1], newTime1, true);
          return { ...d, points: [p0, p1] };
        }
      }
    }
    
    return {
      ...d,
      points: d.points.map((p: any) => {
        let pointTime = p.time;
        
        // If time is missing, compute it from old data using the logical index
        if (!pointTime && p.logical !== undefined) {
          pointTime = getTimeFromOldLogical(p.logical);
          if (!pointTime) return p;
        }
        if (!pointTime) return p;
        
        return remapPoint(p, pointTime, false);
      })
    };
  });
}


export default function ChartContainer({ 
  theme = "light", interval = "15min", intervalLabel = "15m", symbol = "AAPL",
  activeIndicators = [], onRemoveIndicator, onOpenOrderPanel,
  initialTargetTimestamp = null, initialBarSpacing = null, onChartStateChange,
  triggerSettings
}: ChartContainerProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { activeTool, shiftDrawings, setSymbol: setDrawingSymbol, setDrawings } = useDrawing();
  const { mode, replayIndex, startReplayAt, getReplayTime, stopReplay, togglePlay, stepBack, stepForward, setHoverX, hoverX, updateReplayData } = useReplay();
  const { checkAlerts } = useAlerts();
  const tradingState = useEngineState();
  const tradingSettings = useTradingSettings();

  // Keep track of active price lines so we can remove them when they update or close
  const priceLinesRef = useRef<any[]>([]);

  // Sync symbol with DrawingContext
  useEffect(() => {
    setDrawingSymbol(symbol);
  }, [symbol, setDrawingSymbol]);

  // Expose the currently loaded symbol/interval globally, mirroring the
  // window.__chartFullData pattern, so panels like the Pine Editor (which
  // aren't wired with these as props) can fetch other-timeframe data for
  // request.security()/request.security_lower_tf() against the right symbol.
  useEffect(() => {
    (window as any).__chartSymbol = symbol;
    (window as any).__chartInterval = interval;
    // Zoom In history belongs to the old bars; start over (Zoom Out hides again)
    (window as any).__zoomStack = [];
    window.dispatchEvent(new CustomEvent('tv:zoom-depth', { detail: 0 }));
  }, [symbol, interval]);

  const [chart, setChart] = useState<IChartApi | null>(null);
  const [series, setSeries] = useState<any>(null);
  const tradeMarkersRef = useRef<any[]>([]);
  const seriesMarkersRef = useRef<{ series: any; api: any } | null>(null);
  const snapshotHideTradesRef = useRef(false);
  const pineMarkersRef = useRef<any[]>([]);
  const pineSeriesRef = useRef<Record<number, ISeriesApi<"Line">>>({});
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isLoading, setIsLoading] = useState(true);
  // The data plan's limit: per minute (retried automatically once the minute resets) or per day
  const [apiLimitReached, setApiLimitReachedState] = useState<false | 'minute' | 'day'>(false);
  const limitRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setApiLimitReached = (v: boolean | 'minute' | 'day') => {
    if (!v && limitRetryTimerRef.current) { clearTimeout(limitRetryTimerRef.current); limitRetryTimerRef.current = null; }
    setApiLimitReachedState(v === true ? 'minute' : v);
  };
  // A request hit the limit: show it, and for the per-minute limit run `retry` (the load that
  // failed) just after the minute resets
  const onApiLimit = (err: any, retry?: () => void) => {
    const scope: 'minute' | 'day' = err?.scope === 'day' ? 'day' : 'minute';
    setApiLimitReachedState(scope);
    if (limitRetryTimerRef.current) clearTimeout(limitRetryTimerRef.current);
    limitRetryTimerRef.current = null;
    if (scope === 'minute') {
      const ms = 60000 - (Date.now() % 60000) + 2500;
      limitRetryTimerRef.current = setTimeout(() => { limitRetryTimerRef.current = null; setApiLimitReachedState(false); retry?.(); }, ms);
    }
  };
  useEffect(() => () => { if (limitRetryTimerRef.current) clearTimeout(limitRetryTimerRef.current); }, []);
  const [lastPriceData, setLastPriceData] = useState<{ price: number; prevPrice: number } | null>(null);
  const [hoveredBarData, setHoveredBarData] = useState<any>(null);
  // vertical line state in select mode
  const [vLineX, setVLineX] = useState<number | null>(null);
  const [vLineTime, setVLineTime] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, clientX: number, clientY: number, price: number | null, time: number | null, visible: boolean } | null>(null);
  // "Lock vertical cursor line by time": the bar time the vertical line stays on
  const [lockedCursorTime, setLockedCursorTime] = useState<number | null>(null);
  const [showTableView, setShowTableView] = useState(false);
  const [psAnchor, setPsAnchor] = useState<{ right: number; top: number } | null>(null);
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [chartSettingsTab, setChartSettingsTab] = useState<string | undefined>(undefined);
  const crosshairPriceRef = useRef<number | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  useEffect(() => {
    if (triggerSettings && triggerSettings > 0) {
      setChartSettingsTab(undefined);
      setShowChartSettings(true);
    }
  }, [triggerSettings]);

  // ── Timezone selector (bottom-left "UTC" button; also opened from the bottom-bar clock) ──
  const [chartTimezone, setChartTimezone] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('tv:chartTimezone');
      if (stored) return stored;
    } catch { /* ignore */ }
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  });
  const chartTimezoneRef = useRef(chartTimezone);
  const [showTimezoneMenu, setShowTimezoneMenu] = useState(false);
  useEffect(() => {
    chartTimezoneRef.current = chartTimezone;
    if (chartRef.current) {
      try { chartRef.current.timeScale().applyOptions({ timeVisible: true, secondsVisible: false }); } catch { /* ignore */ }
    }
    try { localStorage.setItem('tv:chartTimezone', chartTimezone); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('tv:timezone-changed', { detail: chartTimezone }));
  }, [chartTimezone]);

  // Lets other components (e.g. the bottom-bar clock) open this same timezone menu
  useEffect(() => {
    const handleOpen = () => setShowTimezoneMenu(true);
    window.addEventListener('tv:open-timezone-menu', handleOpen);
    return () => window.removeEventListener('tv:open-timezone-menu', handleOpen);
  }, []);

  // ── Price scale quick-settings menu (bottom-right gear button) ──────────────
  const [showPriceScaleMenu, setShowPriceScaleMenu] = useState(false);
  const [priceScaleSubmenu, setPriceScaleSubmenu] = useState<'labels' | 'lines' | null>(null);
  const [psAutoScale, setPsAutoScale] = useState(true);
  const [psLockRatio, setPsLockRatio] = useState(false);
  const [psScaleOnly, setPsScaleOnly] = useState(false);
  const [psInvert, setPsInvert] = useState(false);
  const [psMode, setPsMode] = useState<number>(PriceScaleMode.Normal);
  const [psScaleLeft, setPsScaleLeft] = useState(false);
  const [psPlusButton, setPsPlusButton] = useState(true);
  const [labelSettings, setLabelSettings] = useState({
    symbolName: false, lastPrice: true, prevClose: false, prePostMarket: false,
    highLow: false, bidAsk: false, indicatorName: false, indicatorValue: true,
    countdown: true, noOverlap: true,
  });
  const [lineSettings, setLineSettings] = useState({
    priceLine: true, prevClose: false, prePostMarket: false, highLow: false, bidAsk: false,
  });
  const prevCloseLineRef = useRef<any>(null);
  const [countdown, setCountdown] = useState<{ text: string; top: number; width: number; color: string } | null>(null);

  useEffect(() => {
    try { chartRef.current?.priceScale('right').applyOptions({ autoScale: psAutoScale }); } catch { /* ignore */ }
    notifyPriceScaleChanged();
  }, [psAutoScale]);
  useEffect(() => {
    try { chartRef.current?.priceScale('right').applyOptions({ invertScale: psInvert }); } catch { /* ignore */ }
    notifyPriceScaleChanged();
  }, [psInvert]);
  useEffect(() => {
    try { chartRef.current?.priceScale('right').applyOptions({ mode: psMode }); } catch { /* ignore */ }
    notifyPriceScaleChanged();
  }, [psMode]);
  useEffect(() => {
    try { candleSeriesRef.current?.applyOptions({ priceLineVisible: lineSettings.priceLine }); } catch { /* ignore */ }
  }, [lineSettings.priceLine]);
  useEffect(() => {
    try { candleSeriesRef.current?.applyOptions({ lastValueVisible: labelSettings.lastPrice }); } catch { /* ignore */ }
  }, [labelSettings.lastPrice]);
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    if (prevCloseLineRef.current) {
      try { series.removePriceLine(prevCloseLineRef.current); } catch { /* ignore */ }
      prevCloseLineRef.current = null;
    }
    if (lineSettings.prevClose) {
      const data = fullDataRef.current;
      if (data && data.length > 1) {
        const lastBar = data[data.length - 1];
        const lastDay = new Date(lastBar.time * 1000).toDateString();
        let prevClose: number | null = null;
        for (let i = data.length - 2; i >= 0; i--) {
          if (new Date(data[i].time * 1000).toDateString() !== lastDay) { prevClose = data[i].close; break; }
        }
        if (prevClose !== null) {
          try {
            prevCloseLineRef.current = series.createPriceLine({
              price: prevClose, color: '#9598a1', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Prev Close',
            });
          } catch { /* ignore */ }
        }
      }
    }
  }, [lineSettings.prevClose]);

  // "Countdown to bar close": as on TradingView, a line under the last-price label on the
  // price scale, in the label's colour. Recomputed each second and whenever the view moves.
  useEffect(() => {
    if (!labelSettings.countdown || !labelSettings.lastPrice) { setCountdown(null); return; }
    let frame = 0;
    const update = () => {
      const data = fullDataRef.current;
      const series = candleSeriesRef.current;
      const chart = chartRef.current;
      if (!data || data.length === 0 || !series || !chart || modeRef.current !== 'idle') { setCountdown(null); return; }
      const last = data[data.length - 1];
      const barEnd = last.time + Math.floor(getIntervalMs(intervalRef.current) / 1000);
      const remain = barEnd - toChartTime(symbolRef.current, Date.now());
      const y = series.priceToCoordinate(last.close);
      const width = chart.priceScale('right').width();
      // Nothing to count down once the bar has closed (e.g. the market is shut)
      if (remain <= 0 || y == null || !width) { setCountdown(null); return; }
      const d = Math.floor(remain / 86400), h = Math.floor((remain % 86400) / 3600);
      const m = Math.floor((remain % 3600) / 60), sec = remain % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      const text = d > 0 ? `${d}d ${h}h` : h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
      const color = last.close >= last.open ? candleColorsRef.current.upColor : candleColorsRef.current.downColor;
      setCountdown(prev => (prev && prev.text === text && prev.top === y && prev.width === width && prev.color === color) ? prev : { text, top: y, width, color });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    const id = setInterval(update, 1000);
    const chart = chartRef.current;
    chart?.timeScale().subscribeVisibleLogicalRangeChange(schedule);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(frame);
      try { chart?.timeScale().unsubscribeVisibleLogicalRangeChange(schedule); } catch { /* chart gone */ }
    };
  }, [labelSettings.countdown, labelSettings.lastPrice, chart]);

  // Alt+I / Alt+P / Alt+L price-scale shortcuts (Invert / Percent / Logarithmic)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 'i') { e.preventDefault(); setPsInvert(v => !v); }
      else if (key === 'p') { e.preventDefault(); setPsMode(m => m === PriceScaleMode.Percentage ? PriceScaleMode.Normal : PriceScaleMode.Percentage); }
      else if (key === 'l') { e.preventDefault(); setPsMode(m => m === PriceScaleMode.Logarithmic ? PriceScaleMode.Normal : PriceScaleMode.Logarithmic); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Indicator states
  const [volumeVisible, setVolumeVisible] = useState(true);
  const [showVolumeSettings, setShowVolumeSettings] = useState(false);
  const [showEmaSettingsFor, setShowEmaSettingsFor] = useState<string | null>(null);
  
  const [candleColors, setCandleColors] = useState({
    upColor: "#089981", downColor: "#f23645",
    borderUpColor: "#089981", borderDownColor: "#f23645",
    wickUpColor: "#089981", wickDownColor: "#f23645",
    borderVisible: true, wickVisible: true, bodyVisible: true
  });
  const candleColorsRef = useRef(candleColors);
  useEffect(() => { candleColorsRef.current = candleColors; }, [candleColors]);

  const [canvasColors, setCanvasColors] = useState({
    background: theme === "dark" ? "#131722" : "#ffffff",
    gridVert: theme === "dark" ? "#1e222d" : "#f0f3fa",
    gridHorz: theme === "dark" ? "#1e222d" : "#f0f3fa",
    crosshair: theme === "dark" ? "#758696" : "#9598a1",
    text: theme === "dark" ? "#d1d4dc" : "#131722",
    lines: theme === "dark" ? "#2a2e39" : "#e0e3eb"
  });
  const canvasColorsRef = useRef(canvasColors);
  useEffect(() => { canvasColorsRef.current = canvasColors; }, [canvasColors]);

  // canvasColors is only seeded from the theme at mount, so flipping light/dark
  // afterwards would leave the chart pane on the old background. Re-seed the
  // theme-dependent colors when the theme actually changes (skipping first mount so
  // colors loaded from saved settings aren't overwritten).
  const prevThemeRef = useRef(theme);
  useEffect(() => {
    if (prevThemeRef.current === theme) return;
    prevThemeRef.current = theme;
    const dark = theme === "dark";
    setCanvasColors(prev => ({
      ...prev,
      background: dark ? "#131722" : "#ffffff",
      gridVert: dark ? "#1e222d" : "#f0f3fa",
      gridHorz: dark ? "#1e222d" : "#f0f3fa",
      text: dark ? "#d1d4dc" : "#131722",
      lines: dark ? "#2a2e39" : "#e0e3eb",
      crosshair: dark ? "#758696" : "#9598a1",
    }));
  }, [theme]);

  const { user } = useAuth();

  // Saved chart templates — listed under "Chart template" in the right-click menu
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  const fetchSavedTemplates = useCallback(() => {
    if (!user?.uid) return;
    fetch(`http://localhost:8000/api/users/templates/${user.uid}/?tool_type=chart_settings`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setSavedTemplates(data); })
      .catch(e => console.error("Failed to load chart templates:", e));
  }, [user?.uid]);
  useEffect(() => { fetchSavedTemplates(); }, [fetchSavedTemplates]);

  // Load user settings from Firestore
  useEffect(() => {
    if (!user?.uid) return;
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'userSettings', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data().chartSettings;
          if (data) {
            if (data.candleColors) {
              // The effect below re-applies candleColors to the series whenever they change
              setCandleColors(data.candleColors);
            }
            if (data.canvasColors) {
              setCanvasColors(data.canvasColors);
            }
          }
        }
      } catch (e: any) {
        // Firebase may be offline — this is non-critical, settings will use defaults
        if (e?.code === 'unavailable' || e?.message?.includes('offline')) {
          console.warn("[Settings] Firebase offline, using default settings");
        } else {
          console.error("Failed to load user settings", e);
        }
      }
    };
    fetchSettings();
  }, [user]);

  // Sync loaded settings to chart if chart is already ready (the live series only — state can
  // briefly still hold the previous chart's series while the chart is being rebuilt)
  useEffect(() => {
    if (chartRef.current && series && series === candleSeriesRef.current) {
      series.applyOptions({
        upColor: candleColors.bodyVisible ? candleColors.upColor : 'transparent',
        downColor: candleColors.bodyVisible ? candleColors.downColor : 'transparent',
        borderVisible: candleColors.borderVisible,
        borderUpColor: candleColors.borderVisible ? candleColors.borderUpColor : 'transparent',
        borderDownColor: candleColors.borderVisible ? candleColors.borderDownColor : 'transparent',
        wickVisible: candleColors.wickVisible,
        wickUpColor: candleColors.wickVisible ? candleColors.wickUpColor : 'transparent',
        wickDownColor: candleColors.wickVisible ? candleColors.wickDownColor : 'transparent',
      });
      chartRef.current.applyOptions({
        layout: { background: { type: ColorType.Solid, color: canvasColors.background }, textColor: canvasColors.text },
        grid: { vertLines: { color: canvasColors.gridVert }, horzLines: { color: canvasColors.gridHorz } },
        timeScale: { borderColor: canvasColors.lines },
        rightPriceScale: { borderColor: canvasColors.lines },
        leftPriceScale: { borderColor: canvasColors.lines },
        crosshair: { 
          vertLine: { color: canvasColors.crosshair },
          horzLine: { color: canvasColors.crosshair }
        }
      });
    }
  }, [candleColors, canvasColors, series]); // Dependency on series ensures this runs once the series is created

  // Sync Price Lines for Positions and Orders
  useEffect(() => {
    if (!chart || !chartContainerRef.current) return;

    let crosshairMode = 0; // CrosshairMode.Normal
    let cursorStyle = 'crosshair';

    const eraserSvg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${theme === 'dark' ? '#d1d4dc' : '#131722'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`);
    const magicSvg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${theme === 'dark' ? '#d1d4dc' : '#131722'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>`);
    const dotSvg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${theme === 'dark' ? '#d1d4dc' : '#131722'}"><circle cx="12" cy="12" r="2"/></svg>`);
    const redDotSvg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="red"><circle cx="12" cy="12" r="4"/></svg>`);
    const zoomInSvg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${theme === 'dark' ? '#d1d4dc' : '#131722'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`);

    switch (activeTool) {
      case 'arrow_cursor':
        crosshairMode = 2; // Hidden
        cursorStyle = 'default';
        break;
      case 'eraser':
        crosshairMode = 2; // Hidden
        cursorStyle = `url('data:image/svg+xml;utf8,${eraserSvg}') 0 24, auto`;
        break;
      case 'magic':
        crosshairMode = 0; // Normal
        cursorStyle = `url('data:image/svg+xml;utf8,${magicSvg}') 0 0, auto`;
        break;
      case 'demonstration':
        crosshairMode = 2; // Hidden
        cursorStyle = `url('data:image/svg+xml;utf8,${redDotSvg}') 12 12, auto`;
        break;
      case 'dot':
        crosshairMode = 0;
        cursorStyle = `url('data:image/svg+xml;utf8,${dotSvg}') 12 12, crosshair`;
        break;
      case 'zoom_in':
        crosshairMode = 0;
        cursorStyle = `url('data:image/svg+xml;utf8,${zoomInSvg}') 11 11, crosshair`;
        break;
      case 'cross':
      default:
        crosshairMode = 0; 
        cursorStyle = 'crosshair';
        break;
    }

    try {
      chart.applyOptions({ crosshair: { mode: crosshairMode } });
    } catch(e) {}

    const panes = chartContainerRef.current.querySelectorAll('.tv-lightweight-charts table tr td');
    panes.forEach(pane => {
      (pane as HTMLElement).style.cursor = cursorStyle;
    });
  }, [activeTool, chart]);

  // Sync Price Lines for Positions and Orders
  // Execution marks: an arrow on the bar each paper-trading fill happened in (blue up below
  // the bar for buys, red down above it for sells), per Settings → Trading → Execution marks
  const executions = activeBook(tradingState).executions;
  useEffect(() => {
    if (!series) return;
    const bars = fullDataRef.current;
    const marks: any[] = [];
    if (tradingSettings.executionMarks && tradingState.connected && bars.length) {
      const firstTime = bars[0].time as number;
      for (const ex of executions) {
        if (ex.symbol !== symbol) continue;
        const t = toChartTime(symbol, ex.time);
        if (t < firstTime) continue;
        let lo = 0, hi = bars.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if ((bars[mid].time as number) <= t) lo = mid; else hi = mid - 1; }
        const isBuy = ex.side === 'buy';
        marks.push({
          time: bars[lo].time,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? '#2962ff' : '#f23645',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: tradingSettings.executionLabels ? `${isBuy ? 'Buy' : 'Sell'} ${formatQty(ex.qty)}` : '',
          size: 1,
        });
      }
    }
    tradeMarkersRef.current = marks;
    applyAllMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, symbol, executions, tradingSettings.executionMarks, tradingSettings.executionLabels, tradingState.connected, lastPriceData, interval]);

  // Chart snapshots (Settings → Trading → "Orders, executions, and positions in chart
  // snapshots"): lets the snapshot hide execution marks, or draw the position/order lines,
  // which are HTML on top of the chart rather than part of its canvas
  useEffect(() => {
    if (!series) return;
    (window as any).__tradingSnapshot = {
      setMarksHidden: (hidden: boolean) => { snapshotHideTradesRef.current = hidden; applyAllMarkers(); },
      lines: () => {
        const st = engine.getState();
        if (!st.connected) return [];
        const sym = symbolRef.current;
        const book = activeBook(st);
        const out: { y: number; color: string; dashed: boolean; text: string }[] = [];
        const add = (price: number | undefined, color: string, dashed: boolean, text: string) => {
          if (price === undefined) return;
          const y = series.priceToCoordinate(price);
          if (y !== null && y !== undefined && isFinite(y)) out.push({ y, color, dashed, text });
        };
        const pos = book.positions.find(p => p.symbol === sym);
        if (pos) add(pos.avgPrice, pos.side === 'buy' ? '#2962ff' : '#f23645', false, `${pos.side === 'sell' ? '−' : ''}${formatQty(pos.qty)}`);
        for (const o of book.orders) {
          if (o.symbol !== sym || (o.status !== 'working' && o.status !== 'inactive')) continue;
          const price = o.type === 'limit' ? o.limitPrice : o.stopPrice;
          if (o.role === 'tp') add(price, '#089981', o.status === 'inactive', `TP ${formatQty(o.qty)}`);
          else if (o.role === 'sl') add(price, '#ff9800', o.status === 'inactive', `SL ${formatQty(o.qty)}`);
          else add(price, o.side === 'buy' ? '#2962ff' : '#f23645', true, `${formatQty(o.qty)} ${o.type === 'limit' ? 'Limit' : 'Stop'}`);
        }
        return out;
      },
    };
    return () => { delete (window as any).__tradingSnapshot; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const [pineVisible, setPineVisible] = useState(true);
  // Collapses the buy/sell price boxes + indicator/strategy legend rows,
  // leaving just the symbol/OHLC line — on by default, matching TradingView.
  const [legendExpanded, setLegendExpanded] = useState(true);
  const statusLineSettings = statusLine.useValue();
  const symbolInfo = useSymbolInfo(symbol);

  // Merges trade-execution markers with any markers produced by a running Pine
  // script, since both share the single candle series' marker list.
  function applyAllMarkers() {
    if (!series) return;
    const trades = snapshotHideTradesRef.current ? [] : tradeMarkersRef.current;
    const merged = [...trades, ...(pineVisibleRef.current ? pineMarkersRef.current : [])].sort((a, b) => a.time - b.time);
    try {
      if (!seriesMarkersRef.current || seriesMarkersRef.current.series !== series) {
        seriesMarkersRef.current = { series, api: createSeriesMarkers(series, []) };
      }
      seriesMarkersRef.current.api.setMarkers(merged);
    } catch (e) {
      // a marker time that isn't one of the series' bars is rejected; skip this round
    }
  }

  const pineVisibleRef = useRef(true);
  useEffect(() => { pineVisibleRef.current = pineVisible; }, [pineVisible]);

  function togglePineVisible() {
    const next = !pineVisible;
    setPineVisible(next);
    Object.values(pineSeriesRef.current).forEach((s) => { try { (s as any).applyOptions({ visible: next }); } catch { /* ignore */ } });
    pineVisibleRef.current = next;
    applyAllMarkers();
  }

  function removePineScript() {
    window.dispatchEvent(new CustomEvent("tv:clear-pine-script"));
  }

  // "Reset chart view" shows once the view differs from its default (scrolled, zoomed, or the
  // price scale no longer auto), and puts it back: default bar spacing at the latest bars, as
  // TradingView's Alt + R does (not a fit-everything)
  function isChartViewChanged() {
    const ch = chartRef.current, se = candleSeriesRef.current;
    if (!ch) return false;
    const ts = ch.timeScale();
    const o: any = ts.options();
    const spacing = Math.abs((ts.logicalToCoordinate(1 as any) ?? 0) - (ts.logicalToCoordinate(0 as any) ?? 0));
    const scrolled = Math.abs(ts.scrollPosition() - (o.rightOffset ?? 0)) > 0.5;
    const zoomed = Math.abs(spacing - (o.barSpacing ?? 6)) > 0.01;
    const auto = se ? se.priceScale().options().autoScale : true;
    return scrolled || zoomed || !auto;
  }
  function resetChartView() {
    const ch = chartRef.current;
    if (!ch) return;
    ch.timeScale().resetTimeScale();
    candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
    setPsAutoScale(true);
    (window as any).__zoomStack = [];
    window.dispatchEvent(new CustomEvent('tv:zoom-depth', { detail: 0 }));
    notifyPriceScaleChanged();
  }
  const resetChartViewRef = useRef(resetChartView);
  resetChartViewRef.current = resetChartView;
  useEffect(() => {
    const on = () => resetChartViewRef.current();
    window.addEventListener('tv:reset-chart-view', on);
    return () => window.removeEventListener('tv:reset-chart-view', on);
  }, []);
  // The price scale menu's "Lock price to bar ratio" value: price units per bar step
  function priceToBarRatioText() {
    const ch = chartRef.current, se = candleSeriesRef.current;
    if (!ch || !se) return "";
    const ts = ch.timeScale();
    const spacing = Math.abs((ts.logicalToCoordinate(1 as any) ?? 0) - (ts.logicalToCoordinate(0 as any) ?? 0));
    const a = se.coordinateToPrice(0 as any), b = se.coordinateToPrice(100 as any);
    if (a === null || b === null || !spacing) return "";
    const r = (Math.abs(a - b) / 100) * spacing;
    return r >= 1 ? r.toFixed(4) : r.toPrecision(4);
  }
  // While a vertical cursor line is locked, the chart's own vertical crosshair line steps aside
  useEffect(() => {
    try { chartRef.current?.applyOptions({ crosshair: { vertLine: { visible: lockedCursorTime === null, labelVisible: lockedCursorTime === null } } }); } catch { /* ignore */ }
  }, [lockedCursorTime]);

  // Runs whenever the Pine Editor's "Add to chart" is clicked, or the script is
  // removed — renders plot() output as line series, strategy/plotshape
  // output as markers on the main candle series, and table.new()/table.cell()
  // output as a positioned HTML overlay (see pineTables below).
  const [pineTables, setPineTables] = useState<any[]>([]);
  const [strategyReport, setStrategyReport] = useState<any>(null);
  const [strategyScriptName, setStrategyScriptName] = useState<string>("");
  // The on-chart legend line for whatever script is currently added — name,
  // its real input values (for the "D 240 6 2 Directional 0.34 ..." style
  // summary), and each plot's live (most recent bar) value in its own color.
  const [pineLegend, setPineLegend] = useState<{ name: string; inputs: string[]; plots: { title: string; color: string; lastValue: number | null }[] } | null>(null);
  // The script's own source + the symbol/timeframe it was run against —
  // kept here (not just inside PineEditorPanel, which unmounts when closed)
  // so the strategy report's "Testing period" picker can re-run the exact
  // same script over a different bar range at any time, editor open or not.
  const lastPineRunRef = useRef<{ code: string; symbol: string; pineTf: string; scriptName: string } | null>(null);
  const [backtestRange, setBacktestRange] = useState<{ kind: "all" | "days" | "custom" | "history"; days?: number; from?: number; to?: number }>({ kind: "all" });
  const [backtestBusy, setBacktestBusy] = useState(false);
  const [capitalOverride, setCapitalOverride] = useState<number | null>(null);
  const [inputOverrides, setInputOverrides] = useState<Record<string, any>>({});
  // Keyed by plot title, survives a re-run (which otherwise rebuilds every
  // series fresh from the script's own colors) so a Style-tab recolor
  // doesn't get silently undone the next time the range/capital/inputs change.
  const [plotColorOverrides, setPlotColorOverrides] = useState<Record<string, string>>({});
  const [pineInputsMeta, setPineInputsMeta] = useState<PineInputMeta[]>([]);
  const [pineDeclMeta, setPineDeclMeta] = useState<{ initialCapital: number; pyramiding?: number; defaultQtyValue?: number; defaultQtyType?: string }>({ initialCapital: 100000 });
  const [showPineSettings, setShowPineSettings] = useState(false);
  // Ephemeral "Updating report" / "updated successfully" toast — shown for
  // every re-run triggered from the settings modal, the date-range picker or
  // the capital picker, since those are silent state changes that otherwise
  // give no feedback that the report actually recomputed.
  const [reportToast, setReportToast] = useState<"updating" | "success" | null>(null);
  const reportToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Renders a completed PineRunResult onto the chart (series/markers/tables/
  // legend/report) — shared by the initial run (tv:run-pine-script) and by
  // re-running the same script over a different backtest date range.
  function applyPineResult(result: any, scriptName: string) {
    if (!chartRef.current) return;
    Object.values(pineSeriesRef.current).forEach((s) => { try { chartRef.current!.removeSeries(s); } catch { /* ignore */ } });
    pineSeriesRef.current = {};
    const plots = result?.plots || [];
    plots.forEach((p: any, idx: number) => {
      try {
        const color = plotColorOverrides[p.title] || p.color;
        const s = chartRef.current!.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          title: p.title,
          crosshairMarkerVisible: true,
          // The actual line is painted by CandleBodyAwareLine below (ducking under
          // candle bodies); this series stays invisible but still drives the
          // price-axis label, crosshair value and tooltip/legend readouts.
          lineVisible: false,
        });
        s.setData(p.values);
        s.attachPrimitive(new CandleBodyAwareLine());
        pineSeriesRef.current[idx] = s;
      } catch { /* ignore */ }
    });
    pineMarkersRef.current = result?.markers || [];
    setPineVisible(true);
    applyAllMarkers();
    setPineTables(result?.tables || []);
    const report = result?.strategyReport;
    setStrategyReport(report || null);
    setStrategyScriptName(report ? (scriptName || "Strategy") : "");
    setPineLegend({
      name: scriptName || (report ? "Strategy" : "Script"),
      inputs: result?.inputs || [],
      plots: plots.map((p: any) => ({ title: p.title, color: plotColorOverrides[p.title] || p.color, lastValue: p.values?.length ? p.values[p.values.length - 1].value : null })),
    });
  }

  // The chart only ever holds as much history as has actually been fetched
  // (an initial ~5000-bar load, plus whatever infinite-scroll has backfilled)
  // — for an intraday interval that can easily be far short of "Last 90 days"
  // or "Last 365 days". Picking one of those presets when the real requested
  // window reaches further back than what's loaded would otherwise silently
  // run the backtest over the SAME (too-short) bar set every time, since
  // there'd be nothing new to filter down to — which is exactly what looks
  // like "the report isn't updating" even though the re-run genuinely ran.
  // This backfills older bars the same way scrolling the chart left does
  // (same /api/stock-data endpoint, same merge/dedupe/weekend-filter), just
  // triggered by the picker instead of a scroll event.
  async function ensureHistoryForRange(range: { kind: "all" | "days" | "custom" | "history"; days?: number; from?: number; to?: number }): Promise<any[]> {
    let all = fullDataRef.current || [];
    if (all.length === 0) return all;
    let neededFrom: number | null = null;
    if (range.kind === "days" && range.days) {
      neededFrom = all[all.length - 1].time - range.days * 86400;
    } else if (range.kind === "custom" && range.from) {
      neededFrom = range.from;
    } else if (range.kind === "history") {
      // "Entire history": everything the data source has, back to its first bar
      neededFrom = 1;
    }
    if (neededFrom === null || neededFrom >= all[0].time) return all;

    const symbol = symbolRef.current;
    const interval = intervalRef.current;
    let guard = 0;
    while (all.length > 0 && all[0].time > neededFrom && guard < 8) {
      guard++;
      const oldestBar = all[0];
      const endDateStr = new Date(oldestBar.time * 1000).toISOString().split('T')[0];
      const startDateStr = new Date(neededFrom * 1000).toISOString().split('T')[0];
      let moreData: any[] = [];
      try {
        moreData = await fetchStockData(symbol, interval, endDateStr, oldestBar.close, startDateStr);
      } catch {
        break;
      }
      if (!moreData || moreData.length === 0) break;

      const dataMap = new Map<number, any>();
      moreData.forEach((d: any) => dataMap.set(d.time, d));
      all.forEach((d: any) => dataMap.set(d.time, d));
      let unique = Array.from(dataMap.values());
      unique.sort((a: any, b: any) => (a.time as number) - (b.time as number));
      unique = unique.filter((d: any) => {
        const day = new Date(d.time * 1000).getUTCDay();
        return day !== 0 && day !== 6;
      });

      if (unique.length <= all.length || unique[0].time >= oldestBar.time) break; // no real progress
      all = unique;
      fullDataRef.current = unique;
      (window as any).__chartFullData = unique;
    }
    return all;
  }

  // Re-runs the last-run script over a filtered slice of the full loaded bar
  // history with a given initial capital — this is what backs both the
  // strategy report's "Testing period" and "Initial capital" pickers, since
  // changing either one needs the exact same re-run mechanics.
  async function runBacktest(
    range: { kind: "all" | "days" | "custom" | "history"; days?: number; from?: number; to?: number },
    capital: number | null,
    overrides?: Record<string, any>,
    silent?: boolean,
  ) {
    const last = lastPineRunRef.current;
    if (!last) return;
    if (fullDataRef.current.length === 0) return;
    if (!silent) {
      if (reportToastTimerRef.current) { clearTimeout(reportToastTimerRef.current); reportToastTimerRef.current = null; }
      setReportToast("updating");
      setBacktestBusy(true);
    }
    setBacktestRange(range);
    setCapitalOverride(capital);
    if (overrides) setInputOverrides(overrides);
    try {
      const all = await ensureHistoryForRange(range);
      if (all.length === 0) { setReportToast(null); return; }
      // TradingView's real "Testing period" keeps calculating the strategy
      // across the FULL loaded chart history and only restricts which bars
      // may submit new orders — truncating the bar array to just the
      // selected window (the old approach) starves any var-persisted state
      // the script needs to warm up before its first in-window signal.
      // So the full backfilled history is always passed through here; only
      // backtestFrom/backtestTo change per range, gating trades inside the
      // engine instead of pre-filtering the data.
      let backtestFrom: number | undefined;
      let backtestTo: number | undefined;
      if (range.kind === "days" && range.days) {
        backtestFrom = all[all.length - 1].time - range.days * 86400;
      } else if (range.kind === "custom" && range.from && range.to) {
        backtestFrom = range.from;
        backtestTo = range.to;
      }
      const result = await runPineScriptAsync(last.code, all, {
        symbol: last.symbol,
        pineTf: last.pineTf,
        fetchTimeframe: fetchPineTimeframeData,
        initialCapital: capital ?? undefined,
        inputOverrides: overrides ?? inputOverrides,
        backtestFrom,
        backtestTo,
      });
      if (result.errors.length === 0) {
        applyPineResult(result, last.scriptName);
        if (!silent) {
          setReportToast("success");
          reportToastTimerRef.current = setTimeout(() => setReportToast(null), 2200);
        }
      } else if (!silent) {
        setReportToast(null);
      }
    } finally {
      if (!silent) setBacktestBusy(false);
    }
  }
  // The latest re-run and its inputs, for the live-price handler (registered once per mode)
  const realtimeRerunRef = useRef<{ run: () => void; busy: boolean; last: number }>({ run: () => {}, busy: false, last: 0 });
  realtimeRerunRef.current.run = () => {
    const rt = realtimeRerunRef.current;
    if (rt.busy || !lastPineRunRef.current || !strategyReport) return;
    rt.busy = true; rt.last = Date.now();
    runBacktest(backtestRange, capitalOverride, undefined, true).finally(() => { rt.busy = false; });
  };
  // Like TradingView, a script on the chart recalculates for the new symbol/timeframe;
  // called once that switch's bars are on the chart.
  const pineRerunOnLoadRef = useRef<() => void>(() => {});
  pineRerunOnLoadRef.current = () => {
    const last = lastPineRunRef.current;
    if (!last) return;
    last.pineTf = appIntervalToPineTf(intervalRef.current);
    last.symbol = symbolRef.current;
    runBacktest(backtestRange, capitalOverride);
  };

  // "Show on chart" (the report's trades): scroll the chart to a bar, or to a trade's entry..exit
  function showTimeOnChart(from: number, to?: number) {
    const chart = chartRef.current;
    const bars = fullDataRef.current;
    if (!chart || !bars.length) return;
    const ts = chart.timeScale();
    // the bar at (or last before) a time, as the chart's own logical index
    const idxOf = (t: number) => {
      let lo = 0, hi = bars.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if ((bars[mid].time as number) <= t) lo = mid; else hi = mid - 1; }
      const idx = ts.timeToIndex(bars[lo].time as any, true);
      return idx === null ? lo : (idx as number);
    };
    const i0 = idxOf(from), i1 = to !== undefined ? idxOf(to) : i0;
    const cur = ts.getVisibleLogicalRange();
    const span = cur ? Math.max(20, cur.to - cur.from) : 120;
    const half = Math.max(span / 2, (i1 - i0) / 2 + 10);
    const mid = (i0 + i1) / 2;
    ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
  }

  useEffect(() => {
    return () => { if (reportToastTimerRef.current) clearTimeout(reportToastTimerRef.current); };
  }, []);

  function rerunPineForRange(range: { kind: "all" | "days" | "custom" | "history"; days?: number; from?: number; to?: number }) {
    return runBacktest(range, capitalOverride);
  }

  function changeInitialCapital(capital: number) {
    return runBacktest(backtestRange, capital);
  }

  // Applied when the settings modal's Ok button is clicked. Recoloring is
  // applied directly to the live series immediately (no re-run needed for a
  // cosmetic change), and is also remembered in plotColorOverrides so the
  // NEXT re-run (triggered here for any changed inputs/capital, via the same
  // mechanics as the date-range/capital pickers) doesn't reset it back to
  // the script's own colors.
  function applyPineSettings(overrides: Record<string, any>, capital: number, plotColors: Record<string, string>) {
    setPlotColorOverrides((prev) => ({ ...prev, ...plotColors }));
    if (pineLegend) {
      const updatedPlots = pineLegend.plots.map((p, idx) => {
        const newColor = plotColors[p.title];
        if (newColor && newColor !== p.color) {
          try { (pineSeriesRef.current[idx] as any)?.applyOptions({ color: newColor }); } catch { /* ignore */ }
          return { ...p, color: newColor };
        }
        return p;
      });
      setPineLegend({ ...pineLegend, plots: updatedPlots });
    }
    return runBacktest(backtestRange, capital, overrides);
  }

  useEffect(() => {
    function handleRunPine(e: any) {
      if (!chartRef.current) return;
      const scriptName = e?.detail?.scriptName || "Script";
      const result = e?.detail?.result;
      applyPineResult(result, scriptName);
      setBacktestRange({ kind: "all" });
      setCapitalOverride(null);
      setInputOverrides({});
      setPlotColorOverrides({});
      if (result?.meta) {
        setPineDeclMeta({
          initialCapital: result.meta.initialCapital,
          pyramiding: result.meta.pyramiding,
          defaultQtyValue: result.meta.defaultQtyValue,
          defaultQtyType: result.meta.defaultQtyType,
        });
      }
      if (e?.detail?.code) {
        lastPineRunRef.current = {
          code: e.detail.code,
          symbol,
          pineTf: appIntervalToPineTf(interval),
          scriptName,
        };
        setPineInputsMeta(getPineInputsMeta(e.detail.code));
      }
    }
    function handleClearPine() {
      if (!chartRef.current) return;
      Object.values(pineSeriesRef.current).forEach((s) => { try { chartRef.current!.removeSeries(s); } catch { /* ignore */ } });
      pineSeriesRef.current = {};
      pineMarkersRef.current = [];
      applyAllMarkers();
      setPineTables([]);
      setStrategyReport(null);
      setPineLegend(null);
      setPineInputsMeta([]);
      setShowPineSettings(false);
      lastPineRunRef.current = null;
    }
    window.addEventListener('tv:run-pine-script', handleRunPine);
    window.addEventListener('tv:clear-pine-script', handleClearPine);
    return () => {
      window.removeEventListener('tv:run-pine-script', handleRunPine);
      window.removeEventListener('tv:clear-pine-script', handleClearPine);
    };
  }, [series, symbol, interval]);

  // Maps Pine's position.* constant (see resolveIdent's dot-namespace
  // fallback in pineScriptEngine.ts) to CSS anchoring for the table overlay.
  function pineTablePositionStyle(position: string): React.CSSProperties {
    const style: React.CSSProperties = { position: "absolute" };
    const p = position || "top_right";
    if (p.includes("top")) style.top = "8px"; else if (p.includes("bottom")) style.bottom = "8px";
    else { style.top = "50%"; style.transform = "translateY(-50%)"; }
    if (p.includes("left")) style.left = "8px"; else if (p.includes("right")) style.right = "8px";
    else {
      style.left = "50%";
      style.transform = style.transform ? "translate(-50%, -50%)" : "translateX(-50%)";
    }
    return style;
  }

  const [volumeConfig, setVolumeConfig] = useState({ upColor: 'rgba(38, 166, 154, 0.5)', downColor: 'rgba(239, 83, 80, 0.5)', maColor: '#2962ff' });
  const volumeConfigRef = useRef(volumeConfig);
  useEffect(() => { volumeConfigRef.current = volumeConfig; }, [volumeConfig]);

  const [emaConfigs, setEmaConfigs] = useState<Record<string, any>>({});
  const [emaVisibilities, setEmaVisibilities] = useState<Record<string, boolean>>({});
  const emaConfigsRef = useRef(emaConfigs);
  useEffect(() => { emaConfigsRef.current = emaConfigs; }, [emaConfigs]);
  const emaVisibilitiesRef = useRef(emaVisibilities);
  useEffect(() => { emaVisibilitiesRef.current = emaVisibilities; }, [emaVisibilities]);

  // Indicator templates (TopBar) snapshot and restore the per-indicator settings kept here
  useEffect(() => {
    const w = window as any;
    w.__indicatorSettings = {
      get: () => ({ ema: emaConfigsRef.current, volume: volumeConfigRef.current }),
      set: ({ ema, volume }: { ema?: Record<string, any>; volume?: any }) => {
        if (ema) {
          // Written to the ref right away so the effect that creates the new EMA series
          // (on the same render) builds them with these settings instead of the defaults
          emaConfigsRef.current = { ...emaConfigsRef.current, ...ema };
          setEmaConfigs(prev => ({ ...prev, ...ema }));
        }
        if (volume) setVolumeConfig(volume);
      },
    };
    return () => { delete w.__indicatorSettings; };
  }, []);

  const [hoveredEmasData, setHoveredEmasData] = useState<Record<string, any>>({});

  const [sessionConfig, setSessionConfig] = useState(defaultSessionConfig);
  const [sessionSettingsOpen, setSessionSettingsOpen] = useState(false);
  const [sessionVisible, setSessionVisible] = useState(true);

  const activeIndicatorsRef = useRef(activeIndicators);
  useEffect(() => { activeIndicatorsRef.current = activeIndicators; }, [activeIndicators]);

  useEffect(() => {
    volumeConfigRef.current = volumeConfig;
    if (volumeSeriesRef.current && fullDataRef.current.length > 0) {
      const volData = volumeHistogram(fullDataRef.current, volumeConfig.upColor, volumeConfig.downColor);
      volumeSeriesRef.current.setData(volData);
    }
  }, [volumeConfig]);

  const fullDataRef = useRef<any[]>([]);
  const isNavigatingRef = useRef(false); // Guard to prevent infinite scroll during GoToDate
  const isSwitchingIntervalRef = useRef(false); // Guard to prevent infinite scroll while an interval switch is (re)cropping replay data
  const refreshRunIdRef = useRef(0); // Lets a stale refresh's trailing guard-clear no-op if a newer switch has since started
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emasRef = useRef<Record<string, ISeriesApi<"Line">>>({});

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const replayIndexRef = useRef(0);
  useEffect(() => { replayIndexRef.current = replayIndex; }, [replayIndex]);

  // Drawing tools (e.g. Fibonacci's "duck under the candle body" line gaps) key off
  // window.__chartFullData, which always holds the FULL dataset regardless of replay —
  // only what's actually setData()'d on the series is cropped. Without this, a tool
  // would still carve out a gap for a candle's body even though that candle isn't
  // currently rendered (rewound past), leaving a hole in the line with nothing under it.
  useEffect(() => {
    (window as any).__replayVisibleCutoff = mode !== 'idle' ? replayIndex : null;
  }, [mode, replayIndex]);

  // Call before the candles get a dataset with different bar times (new interval, symbol
  // or go-to date). Otherwise the time scale briefly holds the overlays' old bar times
  // alongside the new candle times, and when the overlays are refilled lightweight-charts
  // paints the candles with stale bar indices and throws "Value is null".
  // Price axis / legend decimals follow the symbol's own quotes (EUR/USD to 5 places, stocks
  // to 2), set whenever the candles get a new dataset
  const [pricePrecision, setPricePrecision] = useState(2);
  const pricePrecisionRef = useRef(2);
  const priceFormatFor = (p: number) => ({ type: 'price' as const, precision: p, minMove: Math.pow(10, -p) });
  const applyPricePrecision = (data: any[]) => {
    const p = detectPrecision(data, symbolRef.current);
    pricePrecisionRef.current = p;
    (window as any).__pricePrecision = p;
    engine.setPrecision(symbolRef.current, p);
    setPricePrecision(p);
    candleSeriesRef.current?.applyOptions({ priceFormat: priceFormatFor(p) });
    Object.values(emasRef.current).forEach(s => s.applyOptions({ priceFormat: priceFormatFor(p) }));
  };

  const clearOverlaySeriesData = () => {
    Object.values(emasRef.current).forEach(s => s.setData([]));
    volumeSeriesRef.current?.setData([]);
  };

  // Bottom bar date ranges ("3 months in 1 hour intervals"…): the page switches the
  // interval, and the chart shows that span ending at the newest bar — right away if the
  // interval is unchanged, else once the new interval's bars are loaded.
  const pendingDateRangeRef = useRef<{ interval: string; span: DateRangeSpan } | null>(null);
  const showDateRange = (span: DateRangeSpan, data: any[]) => {
    if (!chartRef.current || data.length === 0) return;
    const last = data[data.length - 1].time as number;
    let fromIdx: number;
    if (span === 'all') fromIdx = 0;
    else if (span !== 'ytd' && span.days) {
      // Trading days, not calendar days (so 5D over a weekend is still 5 sessions):
      // walk back through the last N dates that actually have bars
      let seen = 0, prevDate = '', i = data.length - 1;
      for (; i >= 0; i--) {
        const date = new Date(data[i].time * 1000).toISOString().slice(0, 10);
        if (date !== prevDate) { prevDate = date; if (++seen > span.days) break; }
      }
      fromIdx = i + 1;
    } else {
      let fromTime: number;
      if (span === 'ytd') fromTime = Date.UTC(new Date(last * 1000).getUTCFullYear(), 0, 1) / 1000;
      else {
        const d = new Date(last * 1000);
        d.setUTCMonth(d.getUTCMonth() - (span.months || 0));
        fromTime = d.getTime() / 1000;
      }
      fromIdx = Math.max(0, data.findIndex(b => b.time >= fromTime));
    }
    chartRef.current.timeScale().setVisibleLogicalRange({ from: fromIdx, to: data.length - 1 + 3 });
  };
  useEffect(() => {
    const onRange = (e: Event) => {
      const { interval: target, span } = (e as CustomEvent).detail || {};
      if (!span) return;
      if (target === intervalRef.current && fullDataRef.current.length > 0) showDateRange(span, fullDataRef.current);
      else pendingDateRangeRef.current = { interval: target, span };
    };
    window.addEventListener('tv:apply-date-range', onRange);
    return () => window.removeEventListener('tv:apply-date-range', onRange);
  }, []);

  const updateEmaData = (data: any[]) => {
    if (!data || data.length === 0) return;
    // In replay mode, clip data to the replay index
    let effectiveData = data;
    if (modeRef.current !== 'idle' && replayIndexRef.current >= 0 && replayIndexRef.current < data.length) {
      effectiveData = data.slice(0, replayIndexRef.current + 1);
    }
    Object.keys(emasRef.current).forEach(id => {
      const config = emaConfigsRef.current[id] || { length: 9, source: 'Close', color: '#2962ff' };
      const length = config.length || 9;
      const sourceKey = config.source.toLowerCase();
      let emaData = [];
      const k = 2 / (length + 1);
      let prevEma = effectiveData[0][sourceKey] || effectiveData[0].close;
      for (let i = 0; i < effectiveData.length; i++) {
        const price = effectiveData[i][sourceKey] || effectiveData[i].close;
        const currentEma = (price - prevEma) * k + prevEma;
        emaData.push({ time: effectiveData[i].time, value: currentEma });
        prevEma = currentEma;
      }
      emasRef.current[id].setData(emaData);
    });
    // Also clip volume in replay mode
    if (modeRef.current !== 'idle' && volumeSeriesRef.current && effectiveData !== data) {
      const volData = volumeHistogram(effectiveData, 'rgba(38, 166, 154, 0.5)', 'rgba(239, 83, 80, 0.5)');
      volumeSeriesRef.current.setData(volData);
    }
  };

  const sessionBoxesRef = useRef<any[]>([]);
  const overlayContainerRef = useRef<HTMLDivElement>(null);
  const updateSessionDOMRef = useRef<() => void>();
  
  updateSessionDOMRef.current = () => {
    requestAnimationFrame(() => {
    if (!overlayContainerRef.current || !chartRef.current || !candleSeriesRef.current) return;
    const ts = chartRef.current.timeScale();
    const ps = candleSeriesRef.current;
    const boxes = sessionBoxesRef.current;
    const container = overlayContainerRef.current;
    
    let boxDivs = Array.from(container.children).filter(c => c.classList.contains('session-box')) as HTMLDivElement[];
    
    while (boxDivs.length < boxes.length) {
       const div = document.createElement('div');
       div.className = 'session-box';
       div.style.position = 'absolute';
       div.style.pointerEvents = 'none';
       div.style.border = '1px solid';
       div.style.borderTop = 'none';
       div.style.borderBottom = 'none';
       
       const label = document.createElement('div');
       label.style.position = 'absolute';
       label.style.bottom = '-18px';
       label.style.left = '4px';
       label.style.fontSize = '10px';
       label.style.fontWeight = '600';
       label.className = 'session-label';
       label.style.whiteSpace = 'nowrap';
       
       div.appendChild(label);
       container.appendChild(div);
       boxDivs.push(div);
    }
    while (boxDivs.length > boxes.length) {
       const divToRemove = boxDivs.pop();
       if (divToRemove) container.removeChild(divToRemove);
    }
    
    for (let i = 0; i < boxes.length; i++) {
       const box = boxes[i];
       const div = boxDivs[i];
       const logicalRange = ts.getVisibleLogicalRange();
       if (!logicalRange) {
         div.style.display = 'none';
         continue;
       }
       
       const barSpacing = container.clientWidth / (logicalRange.to - logicalRange.from);
       const getX = (logical: number) => {
         let x = ts.logicalToCoordinate(logical);
         if (x === null || isNaN(x)) {
           x = (logical - logicalRange.from) * barSpacing;
         }
         return x;
       };

       let x1 = getX(box.firstLogical);
       let x2 = getX(box.lastLogical);
       
       const y1 = ps.priceToCoordinate(box.maxH);
       const y2 = ps.priceToCoordinate(box.minL);
       
       if (y1 === null || y2 === null || isNaN(x1) || isNaN(x2)) {
         div.style.display = 'none';
         continue;
       }
       if (Math.abs(x2 - x1) < 2) x2 = x1 + 10;
       
       const w = Math.max(x2 - x1, 2); 
       const h = Math.abs(y2 - y1); 
       const top = Math.min(y1, y2);
       
       div.style.display = 'block';
       div.style.left = `${x1}px`;
       div.style.top = `${top}px`;
       div.style.width = `${w}px`;
       div.style.height = `${h}px`;
       div.style.backgroundColor = box.bg;
       div.style.borderColor = box.color;
       
       const label = div.querySelector('.session-label') as HTMLDivElement;
       label.textContent = `${box.label} = ${box.maxH.toFixed(2)} ADR = ${(box.maxH - box.minL).toFixed(2)}`;
       label.style.color = box.color;
    }
    }); // end requestAnimationFrame
  };

  const sessionConfigRef = useRef(sessionConfig);
  const sessionVisibleRef = useRef(sessionVisible);
  useEffect(() => { sessionConfigRef.current = sessionConfig; }, [sessionConfig]);
  useEffect(() => { sessionVisibleRef.current = sessionVisible; }, [sessionVisible]);

  const recalcSessionBoxes = (data: any[]) => {
    const showFXN = activeIndicatorsRef.current?.some(i => i.name === "FXN - Asian Session Range" && i.visible !== false);
    const isVisible = sessionVisibleRef.current;
    
    // Visibility checks based on interval
    // For simplicity, we just toggle everything if sessionVisible is false.
    // A robust version would parse sessionConfig.visibility against the current interval.
    
    if (!showFXN || !isVisible || !data || data.length === 0) {
      sessionBoxesRef.current = [];
      if (updateSessionDOMRef.current) updateSessionDOMRef.current();
      return;
    }
    
    const config = sessionConfigRef.current;
    
    const days: Record<string, any[]> = {};
    data.forEach(bar => {
      const d = new Date(bar.time * 1000);
      const dateStr = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      if (!days[dateStr]) days[dateStr] = [];
      days[dateStr].push(bar);
    });
    
    const boxes: any[] = [];
    Object.values(days).forEach(dayBars => {
      const extractSession = (startH: number, endH: number, color: string, bg: string, label: string) => {
        const sessionBars = dayBars.filter(b => {
          const h = new Date(b.time * 1000).getUTCHours();
          return startH < endH ? (h >= startH && h < endH) : (h >= startH || h < endH);
        });
        if (sessionBars.length > 0) {
          const firstBar = sessionBars[0];
          const lastBar = sessionBars[sessionBars.length - 1];
          const firstLogical = data.indexOf(firstBar);
          const lastLogical = data.indexOf(lastBar);
          const maxH = Math.max(...sessionBars.map(b => b.high));
          const minL = Math.min(...sessionBars.map(b => b.low));
          boxes.push({ 
            firstTime: firstBar.time, lastTime: lastBar.time, 
            firstLogical, lastLogical,
            maxH, minL, color, bg, label 
          });
        }
      };
      
      const toUTC = (edtH: number) => (edtH + 4) % 24;
      
      if (config.asian.bgEnabled) {
         extractSession(toUTC(config.asian.startH), toUTC(config.asian.endH), config.asian.borderColor, config.asian.bgColor, 'A');
      }
      if (config.london.show && config.london.bgEnabled) {
         extractSession(toUTC(config.london.startH), toUTC(config.london.endH), config.london.borderColor, config.london.bgColor, 'L');
      }
      if (config.ny.show && config.ny.bgEnabled) {
         extractSession(toUTC(config.ny.startH), toUTC(config.ny.endH), config.ny.borderColor, config.ny.bgColor, 'N');
      }
    });
    
    sessionBoxesRef.current = boxes;
    if (updateSessionDOMRef.current) updateSessionDOMRef.current();
  };

  useEffect(() => {
    if (!chartRef.current) return;
    
    const showVolume = activeIndicators?.some(i => i.name === "Volume" && i.visible !== false);
    
    if (showVolume && !volumeSeriesRef.current) {
      const volumeSeries = chartRef.current.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // set as an overlay
      });
      chartRef.current.priceScale('').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeriesRef.current = volumeSeries;
      
      // Compute data if available
      const data = fullDataRef.current;
      if (data && data.length > 0) {
        const volData = volumeHistogram(data, volumeConfigRef.current.upColor, volumeConfigRef.current.downColor);
        volumeSeries.setData(volData);
      }
    } else if (!showVolume && volumeSeriesRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }

    const currentEmas = activeIndicators?.filter(i => i.name === "Moving Average Exponential" && i.visible !== false) || [];
    const currentEmaIds = currentEmas.map(i => i.id);
    let changed = false;
    
    currentEmas.forEach(ema => {
      if (!emasRef.current[ema.id]) {
        const config = emaConfigsRef.current[ema.id] || { length: 9, source: 'Close', offset: 0, color: '#2962ff' };
        const series = chartRef.current!.addSeries(LineSeries, {
          color: config.color,
          lineWidth: 1.5,
          priceFormat: priceFormatFor(pricePrecisionRef.current),
          crosshairMarkerVisible: false,
          visible: emaVisibilitiesRef.current[ema.id] ?? true,
          // Painted by CandleBodyAwareLine instead (ducking under candle bodies);
          // this series stays invisible but still drives the price-axis label.
          lineVisible: false
        });
        series.attachPrimitive(new CandleBodyAwareLine());
        emasRef.current[ema.id] = series;
        if (!emaConfigsRef.current[ema.id]) setEmaConfigs(prev => ({ ...prev, [ema.id]: config }));
        if (emaVisibilitiesRef.current[ema.id] === undefined) setEmaVisibilities(prev => ({ ...prev, [ema.id]: true }));
        changed = true;
      }
    });
    
    Object.keys(emasRef.current).forEach(id => {
      if (!currentEmaIds.includes(id)) {
        chartRef.current!.removeSeries(emasRef.current[id]);
        delete emasRef.current[id];
        changed = true;
      }
    });

    if (changed) updateEmaData(fullDataRef.current);
    recalcSessionBoxes(fullDataRef.current);
    // `chart`: a rebuilt chart (e.g. after a theme change) gets its indicators added again
  }, [activeIndicators, chart]);

  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: volumeVisible });
    }
  }, [volumeVisible, activeIndicators]);

  useEffect(() => {
    Object.keys(emasRef.current).forEach(id => {
      emasRef.current[id].applyOptions({
        visible: emaVisibilities[id] ?? true,
        color: emaConfigs[id]?.color || '#2962ff'
      });
    });
    updateEmaData(fullDataRef.current);
  }, [emaConfigs, emaVisibilities]);

  const updateReplayDataRef = useRef(updateReplayData);
  const startReplayAtRef = useRef(startReplayAt);
  startReplayAtRef.current = startReplayAt;
  updateReplayDataRef.current = updateReplayData;

  // Clip EMA and volume data to the replay index during replay mode
  useEffect(() => {
    if (mode !== 'idle' && fullDataRef.current.length > 0 && replayIndex >= 0) {
      updateEmaData(fullDataRef.current);
    } else if (mode === 'idle' && fullDataRef.current.length > 0) {
      // Restore full data when replay stops
      updateEmaData(fullDataRef.current);
    }
  }, [mode, replayIndex]);

  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;

  // Bar replay trades in its own account, filled at the replay's prices and bar times
  useEffect(() => {
    if (mode === 'active') engine.startReplaySession();
    else engine.endReplaySession();
  }, [mode]);
  useEffect(() => () => engine.endReplaySession(), []);
  useEffect(() => {
    if (mode !== 'active') return;
    const bar = fullDataRef.current[replayIndex];
    if (!bar) return;
    const t = (bar.time as number) * 1000;
    // The bar's path: open, the nearer extreme, the farther one, close
    const path = bar.close >= bar.open ? [bar.open, bar.low, bar.high, bar.close] : [bar.open, bar.high, bar.low, bar.close];
    for (const p of path) engine.setReplayQuote(symbol, p, t);
  }, [mode, replayIndex, symbol]);

  // Update document title dynamically
  useEffect(() => {
    if (lastPriceData) {
      const { price, prevPrice } = lastPriceData;
      const formattedPrice = price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
      const change = price - prevPrice;
      const changePercent = (change / prevPrice) * 100;
      const sign = change >= 0 ? '▲' : '▼';
      const prefix = change >= 0 ? '+' : '';
      document.title = `${symbol} ${formattedPrice} ${sign} ${prefix}${changePercent.toFixed(2)}% | TradePilot`;
      
      // The last loaded bar is a quote for paper trading (a newer live quote wins)
      if (mode === 'idle') {
        const bars = fullDataRef.current;
        const lastTime = bars.length ? (bars[bars.length - 1].time as number) * 1000 : Date.now();
        engine.setQuote(symbol, price, lastTime);
      }
      checkAlerts(symbol, price);
    } else {
      document.title = `${symbol} | TradePilot`;
    }
  }, [symbol, lastPriceData, checkAlerts, mode]);

  // "Add order on AAPL at 180.00…": the ticket as a limit/stop at that price
  const addOrderAt = (price: number) => {
    if (!engine.getState().connected) { tradingUi.set({ dialog: { kind: 'broker', then: { side: 'buy', symbol } } }); return; }
    const f = Math.pow(10, pricePrecisionRef.current);
    const p = Math.round(price * f) / f;
    openTicket({ symbol, side: 'buy', type: orderTypeAt(symbol, 'buy', p), price: p });
  };
  const addOrderAtRef = useRef(addOrderAt);
  addOrderAtRef.current = addOrderAt;

  // Trading shortcuts at the crosshair price: Alt+Shift+B / Alt+Shift+S project a buy / sell
  // limit or stop there, Shift+T opens the ticket at that price
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (isTypingTarget(t)) return;
      if (e.ctrlKey || e.metaKey || !e.shiftKey) return;
      const price = crosshairPriceRef.current;
      if (price === null || !(price > 0) || mode !== 'idle') return;
      const f = Math.pow(10, pricePrecisionRef.current);
      const p = Math.round(price * f) / f;
      if (e.altKey && (e.code === 'KeyB' || e.code === 'KeyS')) {
        e.preventDefault(); e.stopPropagation();
        const side = e.code === 'KeyB' ? 'buy' : 'sell';
        projectChartOrder(symbolRef.current, side, orderTypeAt(symbolRef.current, side, p), p);
      } else if (!e.altKey && e.code === 'KeyT') {
        e.preventDefault(); e.stopPropagation();
        addOrderAtRef.current(p);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode]);

  // Live prices from the paper-trading quote feed move the last candle (or open the next one)
  useEffect(() => {
    const onLive = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || d.symbol !== symbolRef.current || mode !== 'idle' || !d.marketOpen) return;
      const bars = fullDataRef.current;
      const cs = candleSeriesRef.current;
      if (!bars.length || !cs) return;
      const step = getIntervalMs(intervalRef.current) / 1000;
      if (!(step > 0)) return;
      const last = bars[bars.length - 1];
      const t = toChartTime(d.symbol, d.time);
      let bar: any;
      if (t >= last.time && t < last.time + step) {
        bar = { ...last, high: Math.max(last.high, d.price), low: Math.min(last.low, d.price), close: d.price };
        bars[bars.length - 1] = bar;
      } else if (step < 86400 && t >= last.time + step && t < last.time + 2 * step) {
        bar = { time: last.time + step, open: last.close, high: Math.max(last.close, d.price), low: Math.min(last.close, d.price), close: d.price };
        bars.push(bar);
      } else return;
      try { cs.update(bar); } catch { return; }
      updateEmaData(bars);
      setLastPriceData({ price: d.price, prevPrice: bars.length > 1 ? bars[bars.length - 2].close : d.price });
      // Script execution "On realtime bar tick": the strategy recalculates on each real-time update
      // (at most every 1.5 s, one run at a time)
      if (strategyDock.get().onRealtimeTick && Date.now() - realtimeRerunRef.current.last > 1500) realtimeRerunRef.current.run();
    };
    window.addEventListener('tv:live-price', onLive);
    return () => window.removeEventListener('tv:live-price', onLive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Open chart settings on a tab
  useEffect(() => {
    const onOpen = (e: Event) => {
      setChartSettingsTab((e as CustomEvent).detail?.tab);
      setShowChartSettings(true);
    };
    window.addEventListener('tv:open-chart-settings', onOpen);
    return () => window.removeEventListener('tv:open-chart-settings', onOpen);
  }, []);

  // "Draw horizontal line at …" from the price axis "+" menu: a horizontal level from the
  // first loaded bar, spanning the chart
  useEffect(() => {
    const onDraw = (e: Event) => {
      const price = (e as CustomEvent).detail?.price;
      const bars = fullDataRef.current;
      if (typeof price !== 'number' || !bars.length) return;
      const id = `horizontal_ray-${Date.now()}`;
      setDrawings(prev => [...prev, {
        id, type: 'horizontal_ray', visible: true, locked: false, stroke: '#2962ff', strokeWidth: 2,
        points: [{ logical: 0, price, time: bars[0].time }],
      } as any]);
    };
    window.addEventListener('tv:draw-hline', onDraw);
    return () => window.removeEventListener('tv:draw-hline', onDraw);
  }, [setDrawings]);

  useEffect(() => {
    recalcSessionBoxes(fullDataRef.current);
  }, [sessionConfig, sessionVisible]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartContainerRef.current) {
        const w = chartContainerRef.current.clientWidth;
        const h = chartContainerRef.current.clientHeight;
        setDimensions({ width: w, height: h });
        if (chartRef.current) {
          // As on TradingView, a resize (a side panel shown or hidden, the Pine Editor's split
          // view, the window) keeps the bar spacing and the right edge: candles and drawings stay
          // where they are on screen, and the chart just shows more or fewer bars on the left.
          chartRef.current.applyOptions({ width: w, height: h });
        }
      }
    };

    const w = chartContainerRef.current.clientWidth;
    const h = chartContainerRef.current.clientHeight;
    setDimensions({ width: w, height: h });

    const newChart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: canvasColorsRef.current.background }, textColor: canvasColorsRef.current.text },
      grid: { vertLines: { color: canvasColorsRef.current.gridVert }, horzLines: { color: canvasColorsRef.current.gridHorz } },
      width: w, height: h,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: canvasColorsRef.current.lines,
        tickMarkFormatter: (time: any, tickMarkType: TickMarkType) => {
          const ts = typeof time === 'number' ? time : (time?.timestamp ?? 0);
          return formatTickMark(ts, tickMarkType, chartTimezoneRef.current);
        },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: canvasColorsRef.current.crosshair },
        horzLine: { color: canvasColorsRef.current.crosshair }
      },
      localization: {
        timeFormatter: (time: any) => {
          const ts = typeof time === 'number' ? time : (time?.timestamp ?? 0);
          return formatCrosshairTime(ts, chartTimezoneRef.current);
        },
      },
    });

    const candleSeries = newChart.addSeries(CandlestickSeries, {
      upColor: candleColorsRef.current.bodyVisible ? candleColorsRef.current.upColor : 'transparent', 
      downColor: candleColorsRef.current.bodyVisible ? candleColorsRef.current.downColor : 'transparent',
      borderVisible: candleColorsRef.current.borderVisible,
      borderUpColor: candleColorsRef.current.borderVisible ? candleColorsRef.current.borderUpColor : 'transparent',
      borderDownColor: candleColorsRef.current.borderVisible ? candleColorsRef.current.borderDownColor : 'transparent',
      wickVisible: candleColorsRef.current.wickVisible,
      wickUpColor: candleColorsRef.current.wickVisible ? candleColorsRef.current.wickUpColor : 'transparent', 
      wickDownColor: candleColorsRef.current.wickVisible ? candleColorsRef.current.wickDownColor : 'transparent',
    });

    newChart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (updateSessionDOMRef.current) updateSessionDOMRef.current();
    });
    newChart.timeScale().subscribeVisibleTimeRangeChange(() => {
      if (updateSessionDOMRef.current) updateSessionDOMRef.current();
      
      if (isNavigatingRef.current) return;
      
      // Notify parent of center timestamp for state persistence
      if (onChartStateChange && fullDataRef.current.length > 0) {
        const ts = newChart.timeScale();
        const range = ts.getVisibleLogicalRange();
        if (range) {
          const centerLogical = Math.floor((range.from + range.to) / 2);
          if (centerLogical >= 0 && centerLogical < fullDataRef.current.length) {
            const centerTime = fullDataRef.current[centerLogical].time;
            const barSpacing = ts.options().barSpacing || 6;
            console.log(`[ChartState] TimeRangeChange triggered save for centerTime: ${centerTime}, barSpacing: ${barSpacing}`);
            onChartStateChange(centerTime, barSpacing);
          }
        }
      }
    });

    newChart.subscribeCrosshairMove((param) => {
      if (updateSessionDOMRef.current) updateSessionDOMRef.current();
      try {
        crosshairPriceRef.current = param.point ? (candleSeries.coordinateToPrice(param.point.y) as number | null) : null;
      } catch { crosshairPriceRef.current = null; }
      if (param.time) {
        const data = param.seriesData.get(candleSeries);
        setHoveredBarData(data || null);
        
        const newHovered: Record<string, any> = {};
        Object.keys(emasRef.current).forEach(id => {
          newHovered[id] = param.seriesData.get(emasRef.current[id]) || null;
        });
        setHoveredEmasData(newHovered);
      } else {
        setHoveredBarData(null);
        setHoveredEmasData({});
      }
    });

    const loadData = async () => {
      console.log(`[ChartLoad] Starting loadData. initialTargetTimestamp: ${initialTargetTimestamp}`);
      setIsLoading(true);
      setApiLimitReached(false);
      try {
        let stockData;
        if (initialTargetTimestamp) {
          // Fetch data centered around initialTargetTimestamp
          let halfMs = 2500 * getIntervalMs(interval);
          let fetchEndDateStr = undefined;
          if (halfMs > 0) {
             const targetMs = initialTargetTimestamp * 1000;
             const endTargetMs = targetMs + halfMs;
             // Don't ask for dates in the future
             if (endTargetMs < Date.now()) {
                 const endTargetDate = new Date(endTargetMs);
                 fetchEndDateStr = endTargetDate.toISOString().split('T')[0];
             }
          }
          stockData = await fetchStockData(symbol, interval, fetchEndDateStr);
        } else {
          stockData = await fetchStockData(symbol, interval);
        }
        
      // Deduplicate and sort by time to ensure strictly increasing timestamps
      stockData = stockData.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => t.time === v.time) === i);
      stockData.sort((a: any, b: any) => (a.time as number) - (b.time as number));

      // Filter out weekends and "dead" bars (identifiable by identical open prices and low volatility)
      // Filter out weekend bars only — keep all trading-session candles regardless of range
      stockData = stockData.filter((d: any) => {
        const day = new Date(d.time * 1000).getUTCDay();
        return day !== 0 && day !== 6;
      });

      const oldInitData = fullDataRef.current; // May be empty on first load, but helps for subsequent remaps
      clearOverlaySeriesData();
      candleSeries.setData(stockData);
      applyPricePrecision(stockData);
      fullDataRef.current = stockData;
      (window as any).__chartFullData = stockData;

      // Pre-compute higher timeframes from 1m data for instant switching
      if (interval === '1min' && stockData.length > 0) {
        precomputeAllTimeframes(symbol, stockData);
      }
      // Also cache this interval's data in agg cache for future use
      if (AGGREGATABLE_INTERVALS[interval] && stockData.length > 0) {
        setAggCachedData(symbol, interval, stockData);
      }
      
      // Re-map drawings logically based on time to survive timeframe changes
      setDrawings(prevDrawings => remapDrawingPoints(prevDrawings, stockData, 'DrawingRemap-InitLoad', oldInitData));
      
      if (volumeSeriesRef.current) {
        const volData = volumeHistogram(stockData, 'rgba(38, 166, 154, 0.5)', 'rgba(239, 83, 80, 0.5)');
        volumeSeriesRef.current.setData(volData);
      }
      
      updateEmaData(stockData);
      
      if (stockData.length > 1) {
        setLastPriceData({
          price: stockData[stockData.length - 1].close,
          prevPrice: stockData[stockData.length - 2].close
        });
      }

      if (initialTargetTimestamp && stockData.length > 0) {
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < stockData.length; i++) {
          const diff = Math.abs(stockData[i].time - initialTargetTimestamp);
          if (diff < minDiff) { minDiff = diff; closestIdx = i; }
        }
        const timeScale = newChart.timeScale();
        
        if (initialBarSpacing) {
          timeScale.applyOptions({ barSpacing: initialBarSpacing });
        }
        
        let retries = 0;
        const applyPosition = () => {
          const visibleRange = timeScale.getVisibleLogicalRange();
          if (visibleRange && visibleRange.to - visibleRange.from > 0) {
            const halfWidth = (visibleRange.to - visibleRange.from) / 2;
            console.log(`[ChartLoad] Applying position. closestIdx: ${closestIdx}, halfWidth: ${halfWidth}`);
            timeScale.setVisibleLogicalRange({ from: closestIdx - halfWidth, to: closestIdx + halfWidth });
          } else if (retries < 20) {
            retries++;
            console.log(`[ChartLoad] Chart not ready (retries: ${retries}). Waiting...`);
            requestAnimationFrame(applyPosition);
          } else {
            console.log(`[ChartLoad] Chart position timeout. Fallback centering.`);
            timeScale.setVisibleLogicalRange({ from: closestIdx - 50, to: closestIdx + 50 });
          }
        };
        applyPosition();
      }
      } catch (err: any) {
        if (err.message === 'API_LIMIT') onApiLimit(err, () => { if (chartRef.current === newChart) loadData(); });
      } finally {
        setIsLoading(false);
      }
    };
    loadData();

    // Infinite scroll handler
    let isFetchingMore = false;
    newChart.timeScale().subscribeVisibleTimeRangeChange(async (range) => {
      if (!range || isFetchingMore || isNavigatingRef.current || isSwitchingIntervalRef.current) return;
      
      const logicalRange = newChart.timeScale().getVisibleLogicalRange();
      if (!logicalRange || fullDataRef.current.length === 0) return;

      const isScrollingLeft = logicalRange.from < 50;
      const isScrollingRight = logicalRange.to > fullDataRef.current.length - 50;

      if (isScrollingLeft || isScrollingRight) {
        isFetchingMore = true;
        setIsLoading(true);
        setApiLimitReached(false);
        try {
          let moreData: any[] = [];
          const interval = intervalRef.current;
          
          if (isScrollingLeft) {
          const oldestBar = fullDataRef.current[0];
          const dateStr = new Date(oldestBar.time * 1000).toISOString().split('T')[0];
          console.log(`[Chart] Infinite scroll (LEFT) triggered. Loading before ${dateStr}`);
          moreData = await fetchStockData(symbolRef.current, interval, dateStr, oldestBar.close);
        } else if (isScrollingRight) {
          const newestBar = fullDataRef.current[fullDataRef.current.length - 1];
          const isLiveEdge = Date.now() / 1000 - newestBar.time < 35 * 86400; // Within ~1 month, safe for all intervals
          if (isLiveEdge) {
            isFetchingMore = false;
            setIsLoading(false);
            return;
          }
          const startDateStr = new Date(newestBar.time * 1000).toISOString().split('T')[0];
          
          // Compute future end date to ensure we fetch enough data going forward
          let addMs = 4000 * getIntervalMs(interval);
          
          if (addMs < 3 * 24 * 60 * 60 * 1000 && !interval.includes('day') && !interval.includes('week') && !interval.includes('month')) {
             addMs += 3 * 24 * 60 * 60 * 1000; // guarantee jumping over weekend
          }
          
          const endTimestamp = Math.min(new Date(startDateStr).getTime() + addMs, Date.now());
          const d = new Date(endTimestamp);
          const pad = (n: number) => n.toString().padStart(2, '0');
          const endDateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
          
          console.log(`[Chart] Infinite scroll (RIGHT) triggered. Loading from ${startDateStr} to ${endDateStr}`);
          moreData = await fetchStockData(symbolRef.current, interval, endDateStr, newestBar.close, startDateStr);
        }
        
        if (moreData.length > 0) {
          let gapSeconds = 0;
          if (isScrollingLeft) {
            const currentOldest = fullDataRef.current[0]?.time || 0;
            const newestOfMore = moreData.reduce((max: number, d: any) => Math.max(max, d.time), 0);
            gapSeconds = currentOldest - newestOfMore;
          } else {
            const currentNewest = fullDataRef.current[fullDataRef.current.length - 1]?.time || 0;
            const oldestOfMore = moreData.reduce((min: number, d: any) => Math.min(min, d.time), Infinity);
            gapSeconds = oldestOfMore - currentNewest;
          }
          
          // If the gap is > 30 days (on intraday) or > 1 year (on daily), skip merge
          const maxGap = intervalRef.current.includes('day') || intervalRef.current.includes('week') ? 365 * 86400 : 30 * 86400;
          if (gapSeconds > maxGap) {
            console.log(`[Chart] Skipping merge: gap of ${Math.round(gapSeconds / 86400)} days detected`);
            isFetchingMore = false;
            setIsLoading(false);
            return;
          }

          // Merge and strictly deduplicate using a Map for performance and reliability
          const dataMap = new Map<number, any>();
          
          // Add old data first
          moreData.forEach((d: any) => dataMap.set(d.time, d));
          // Add current data (will overwrite if same timestamp exists)
          fullDataRef.current.forEach((d: any) => dataMap.set(d.time, d));
          
          let unique = Array.from(dataMap.values());
          unique.sort((a: any, b: any) => (a.time as number) - (b.time as number));
          
          // Filter out weekend bars only — keep all trading-session candles regardless of range
          unique = unique.filter((d: any) => {
            const day = new Date(d.time * 1000).getUTCDay();
            return day !== 0 && day !== 6; // Remove Saturday (6) and Sunday (0)
          });
          
          // Calculate shift for drawings
          const oldFirstTime = fullDataRef.current.length > 0 ? fullDataRef.current[0].time : null;
          let shift = 0;
          if (oldFirstTime !== null) {
            const newIdx = unique.findIndex(d => d.time === oldFirstTime);
            if (newIdx > 0) shift = newIdx;
          }

          if (shift > 0) {
            console.log(`[Chart] Historical data loaded. Shifting drawings by ${shift}`);
            shiftDrawings(shift);
          }
          
          // Notify the ReplayContext first if active
          if (modeRef.current !== 'idle') {
            updateReplayDataRef.current(unique);
          } else {
            // Only update the series directly if NOT in replay mode
            candleSeries.setData(unique);
            if (volumeSeriesRef.current) {
              const volData = volumeHistogram(unique, volumeConfigRef.current.upColor, volumeConfigRef.current.downColor);
              volumeSeriesRef.current.setData(volData);
            }
            updateEmaData(unique);
          }

          fullDataRef.current = unique;
          (window as any).__chartFullData = unique;
          recalcSessionBoxes(unique);
          
          // Update aggregated cache with expanded data for future instant switching
          const currentInterval = intervalRef.current;
          const currentSymbol = symbolRef.current;
          if (AGGREGATABLE_INTERVALS[currentInterval] && unique.length > 0) {
            setAggCachedData(currentSymbol, currentInterval, unique);
          }
        }
        } catch (err: any) {
          if (err.message === 'API_LIMIT') onApiLimit(err);
        } finally {
          setIsLoading(false);
          isFetchingMore = false;
        }
      }
    });

    setChart(newChart);
    chartRef.current = newChart;
    setSeries(candleSeries);
    candleSeriesRef.current = candleSeries;
    (window as any).__chartInstance = newChart;
    (window as any).__chartSeries = candleSeries;

    // Loads a window of history (end date, optionally a start date) into the chart and every
    // series that mirrors it, replacing what was loaded. Returns the bars, or null if none came.
    const pad2 = (n: number) => n.toString().padStart(2, '0');
    const apiDate = (ms: number) => {
      const d = new Date(ms);
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:00`;
    };
    const loadWindow = async (endDateStr: string, startDateStr?: string): Promise<any[] | null> => {
      isNavigatingRef.current = true; // Block infinite scroll during navigation
      setIsLoading(true);
      setApiLimitReached(false);
      try {
        let stockData = await fetchStockData(symbolRef.current, intervalRef.current, endDateStr, undefined, startDateStr);
        // Deduplicate, sort, filter
        stockData = stockData.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => t.time === v.time) === i);
        stockData.sort((a: any, b: any) => (a.time as number) - (b.time as number));
        stockData = stockData.filter((d: any) => {
          const day = new Date(d.time * 1000).getUTCDay();
          return day !== 0 && day !== 6;
        });
        if (stockData.length === 0) return null;

        // IMPORTANT: Update refs BEFORE setData so any synchronous scroll
        // handler events during setData see the new data, not the old data
        fullDataRef.current = stockData;
        (window as any).__chartFullData = stockData;

        // Cache in agg cache for future instant switching
        const currentInterval = intervalRef.current;
        const currentSymbol = symbolRef.current;
        if (AGGREGATABLE_INTERVALS[currentInterval] && stockData.length > 0) {
          setAggCachedData(currentSymbol, currentInterval, stockData);
        }

        // Now replace the chart data
        clearOverlaySeriesData();
        candleSeries.setData(stockData);
        applyPricePrecision(stockData);
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(volumeHistogram(stockData, volumeConfigRef.current.upColor, volumeConfigRef.current.downColor));
        }
        updateEmaData(stockData);

        if (stockData.length > 1) {
          setLastPriceData({
            price: stockData[stockData.length - 1].close,
            prevPrice: stockData[stockData.length - 2].close
          });
        }
        return stockData;
      } catch (err: any) {
        if (err.message === 'API_LIMIT') onApiLimit(err);
        console.error('[LoadWindow] Failed to fetch historical data:', err);
        return null;
      } finally {
        setIsLoading(false);
        // Release the guard after a tiny delay — just enough to catch synchronous events
        // from setData/setVisibleLogicalRange, but short enough that user scrolling works immediately
        setTimeout(() => { isNavigatingRef.current = false; }, 50);
      }
    };

    // Expose a goToDate function for the GoToModal calendar
    (window as any).__goToDate = async (dateStr: string, timeStr: string) => {
      const targetTimestamp = new Date(`${dateStr}T${timeStr}`).getTime() / 1000;
      const centreOn = (data: any[]) => {
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < data.length; i++) {
          const diff = Math.abs(data[i].time - targetTimestamp);
          if (diff < minDiff) { minDiff = diff; closestIdx = i; }
        }
        const timeScale = newChart.timeScale();
        const visibleRange = timeScale.getVisibleLogicalRange();
        if (visibleRange) {
          const halfWidth = (visibleRange.to - visibleRange.from) / 2;
          timeScale.setVisibleLogicalRange({ from: closestIdx - halfWidth, to: closestIdx + halfWidth });
        } else {
          timeScale.setVisibleLogicalRange({ from: closestIdx - 50, to: closestIdx + 50 });
        }
      };
      const currentData = fullDataRef.current;
      // Already loaded: just scroll to it
      if (currentData.length > 0 && targetTimestamp >= currentData[0].time && targetTimestamp <= currentData[currentData.length - 1].time) {
        centreOn(currentData);
        return;
      }
      // Outside the loaded range: fetch ~2500 bars either side, so the date sits in the middle
      const halfMs = 2500 * getIntervalMs(intervalRef.current);
      const stockData = await loadWindow(apiDate(Math.min(targetTimestamp * 1000 + halfMs, Date.now())));
      if (!stockData) return;
      centreOn(stockData);
      if (onChartStateChange) {
        const barSpacing = newChart.timeScale().options().barSpacing || 6;
        onChartStateChange(targetTimestamp, barSpacing);
      }
    };

    // Replay's "Select starting point" (as on TradingView): a date from the dialog, the first bar
    // the provider has, or a random bar anywhere in the history. The chart is cut just before the
    // chosen bar, so it's the first one Play reveals; history outside the loaded range is fetched.
    const replayFrom = async (detail: { kind: 'date' | 'first' | 'random'; date?: string; time?: string }) => {
      const iv = intervalRef.current;
      const daily = /day|week|month/.test(iv);
      const barMs = getIntervalMs(iv);
      const dateOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
      let data: any[] = fullDataRef.current;
      const earliest = detail.kind === 'date' ? null : await getEarliestBarTime(symbolRef.current, iv);
      // "First available" needs the provider's first bar; without it there's nothing true to show
      if (detail.kind === 'first' && earliest === null) { onApiLimit({}); return; }

      // The moment to start from, as chart time (daily bars compare by calendar date)
      let target: number;
      if (detail.kind === 'first') {
        target = earliest ?? (data[0]?.time ?? 0);
      } else if (detail.kind === 'random') {
        const lo = earliest ?? (data[0]?.time ?? 0);
        const hi = data.length ? data[data.length - 1].time : Math.floor(Date.now() / 1000);
        target = Math.floor(lo + Math.random() * Math.max(0, hi - lo));
      } else {
        target = daily
          ? Math.floor(new Date(`${detail.date}T00:00:00Z`).getTime() / 1000)
          : Math.floor(new Date(`${detail.date}T${detail.time || '00:00'}`).getTime() / 1000);
      }

      // Make sure the bars around it are loaded
      const inRange = data.length > 0 && target >= data[0].time && target <= data[data.length - 1].time + barMs / 1000;
      if (!inRange) {
        const loaded = detail.kind === 'first'
          ? await loadWindow(apiDate(Math.min(target * 1000 + 4990 * barMs, Date.now())), apiDate(target * 1000))
          : await loadWindow(apiDate(Math.min(target * 1000 + 2500 * barMs, Date.now())));
        // Couldn't fetch that part of history (e.g. the data plan's rate limit): don't start from
        // a wrong bar — the chart stays as it was, with the API-limit notice showing
        if (!loaded) return;
        data = loaded;
      }
      if (data.length === 0) return;

      let startIdx: number;
      if (detail.kind === 'first') {
        startIdx = 0;
      } else if (detail.kind === 'random') {
        // The random moment's own bar: the last one at or before it
        let i = data.findIndex((b: any) => b.time > target);
        if (i < 0) i = data.length;
        startIdx = Math.max(0, i - 1);
      } else {
        // The chosen day's bar plays next, so the chart ends on the bar before it
        const firstOnOrAfter = daily
          ? data.findIndex((b: any) => dateOf(b.time) >= (detail.date as string))
          : data.findIndex((b: any) => b.time >= target);
        startIdx = firstOnOrAfter < 0 ? data.length - 1 : Math.max(0, firstOnOrAfter - 1);
      }

      startReplayAtRef.current(startIdx, data, candleSeries, newChart);
      // Keep the bar spacing, with the start bar near the right edge
      const vr = newChart.timeScale().getVisibleLogicalRange();
      const width = vr ? Math.max(20, vr.to - vr.from) : 120;
      newChart.timeScale().setVisibleLogicalRange({ from: startIdx - width * 0.85, to: startIdx + width * 0.15 });
    };
    const onReplayStart = (e: Event) => { replayFrom((e as CustomEvent).detail); };
    window.addEventListener('tv:replay-start', onReplayStart);

    window.addEventListener("resize", handleResize);

    // Also react to container-size changes that aren't window resizes (e.g. a CSS
    // grid layout change when side panels are hidden/shown) — window never fires
    // "resize" for those, so without this the chart canvas keeps its old dimensions.
    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(chartContainerRef.current);

    // Scrolling over the price axis stretches/compresses the vertical scale
    // (zooming around the cursor's price), instead of the library's default
    // behavior of zooming the time axis no matter where the wheel event fires.
    const containerEl = chartContainerRef.current;
    const handlePriceAxisWheel = (e: WheelEvent) => {
      if (!containerEl) return;
      const rect = containerEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const priceScale = newChart.priceScale('right');
      const axisWidth = priceScale.width();
      if (axisWidth <= 0 || x < rect.width - axisWidth) return;

      // Capture-phase + stopImmediatePropagation: the library binds its own wheel
      // handler (time-axis zoom) directly on an inner canvas, deeper in the DOM than
      // this container. A bubble-phase stop here would run too late — that inner
      // handler already fired on the way up. Intercepting on the way down instead.
      e.preventDefault();
      e.stopImmediatePropagation();

      const visibleRange = priceScale.getVisibleRange();
      if (!visibleRange) return;

      const cursorPrice = candleSeries.coordinateToPrice(y);
      const anchor = cursorPrice !== null ? cursorPrice : (visibleRange.from + visibleRange.to) / 2;

      // Scroll up = zoom in (compress the visible range), scroll down = zoom out (expand it)
      const zoomFactor = e.deltaY < 0 ? 0.9 : 1 / 0.9;
      const newFrom = anchor - (anchor - visibleRange.from) * zoomFactor;
      const newTo = anchor + (visibleRange.to - anchor) * zoomFactor;
      if (newTo - newFrom < 1e-9) return;

      priceScale.setAutoScale(false);
      priceScale.setVisibleRange({ from: newFrom, to: newTo });
      setPsAutoScale(false);
      notifyPriceScaleChanged();
    };
    containerEl.addEventListener('wheel', handlePriceAxisWheel, { passive: false, capture: true });

    // Clicking and dragging directly on the price axis rescales it live — this is
    // the library's own native gesture, handled entirely internally with no
    // subscribe-to-change API (same constraint as the wheel-zoom case above), so
    // without this Konva-drawn shapes never moved at all until the drag ended,
    // rather than tracking it continuously the way panning the time axis already
    // does via useChartTick's subscribeVisibleLogicalRangeChange.
    let priceAxisDragRaf: number | null = null;
    const stopPriceAxisDragTracking = () => {
      if (priceAxisDragRaf !== null) { cancelAnimationFrame(priceAxisDragRaf); priceAxisDragRaf = null; }
      window.removeEventListener('mouseup', stopPriceAxisDragTracking);
    };
    const handlePriceAxisMouseDown = (e: MouseEvent) => {
      const rect = containerEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const priceScale = newChart.priceScale('right');
      const axisWidth = priceScale.width();
      if (axisWidth <= 0 || x < rect.width - axisWidth) return;

      const tick = () => {
        notifyPriceScaleChanged();
        priceAxisDragRaf = requestAnimationFrame(tick);
      };
      priceAxisDragRaf = requestAnimationFrame(tick);
      window.addEventListener('mouseup', stopPriceAxisDragTracking);
    };
    containerEl.addEventListener('mousedown', handlePriceAxisMouseDown);

    return () => {
      window.removeEventListener('tv:replay-start', onReplayStart);
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      containerEl.removeEventListener('wheel', handlePriceAxisWheel, { capture: true });
      containerEl.removeEventListener('mousedown', handlePriceAxisMouseDown);
      stopPriceAxisDragTracking();
      newChart.remove();
      // The removed chart's series went with it: forget them, so the next chart rebuilds
      // its indicators instead of feeding (and repainting) dead series ("Object is disposed")
      if (chartRef.current === newChart) chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      emasRef.current = {};
      pineSeriesRef.current = {};
      setChart(null); setSeries(null);
    };
    // Built once: a theme switch only recolours the chart (the canvas-colours effect applies the
    // new colours to it), so the view, the data and the drawings stay exactly where they are
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize chart when replay mode changes (container height changes via CSS)
  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return;
    // Small delay to allow the CSS height change to take effect in the DOM
    const timer = setTimeout(() => {
      if (chartContainerRef.current && chartRef.current) {
        const w = chartContainerRef.current.clientWidth;
        const h = chartContainerRef.current.clientHeight;
        let savedRange = null;
        try { savedRange = chartRef.current.timeScale().getVisibleLogicalRange(); } catch { /* ignore */ }
        chartRef.current.applyOptions({ width: w, height: h });
        if (savedRange) {
          try { chartRef.current.timeScale().setVisibleLogicalRange(savedRange); } catch { /* ignore */ }
        }
        setDimensions({ width: w, height: h });
      }
    }, 20);
    return () => clearTimeout(timer);
  }, [mode]);

  const prevIntervalRef = useRef(interval);

  useEffect(() => {
    if (series) {
      let cancelled = false;
      const refresh = async () => {
        setIsLoading(true);
        // The interval's full (uncropped) dataset gets set on the series first, with the
        // replay re-crop only applied afterward — that transient uncropped state can itself
        // trigger the infinite-scroll subscription below, which (still thinking replay is
        // idle-safe) merges in more data via the SAME-timeframe "shift by matching bar time"
        // path. That path is meaningless across a timeframe change (old and new bars almost
        // never share a timestamp) and was clobbering the correct re-crop with a stale,
        // wrongly-indexed one. Block infinite-scroll for the duration of this refresh.
        isSwitchingIntervalRef.current = true;
        // Tagged with a run id so that if another switch starts before this one's
        // trailing clear (in the finally block below) fires, that stale clear
        // becomes a no-op instead of dropping the guard mid-way through the
        // newer switch.
        const myRunId = ++refreshRunIdRef.current;
        const prevInterval = prevIntervalRef.current; // Capture old interval before processing
        try {
          let endDateStr: string | undefined = undefined;
          let targetTimestamp: number | null = null;
          let preservedRangeWidth: number | null = null;
          // Save replay timestamp BEFORE we overwrite fullDataRef
          let savedReplayTime: number | null = null;
          // A bottom-bar date range always ends at the newest bar, so it fetches the latest
          // data rather than data centered on the old view
          // (during replay it's just a timeframe change: the replay keeps its date, and the
          // range's "latest bars" view doesn't apply)
          const inReplay = modeRef.current !== 'idle';
          if (inReplay && pendingDateRangeRef.current?.interval === interval) pendingDateRangeRef.current = null;
          const switchingForDateRange = !inReplay && pendingDateRangeRef.current?.interval === interval;

          if (chartRef.current && fullDataRef.current.length > 0 && !switchingForDateRange) {
            // Determine target time: if in replay, use replay time. Otherwise use screen center.
            if (modeRef.current !== 'idle') {
              const rTime = getReplayTime();
              if (rTime) {
                targetTimestamp = rTime;
                savedReplayTime = rTime; // Save for later use after data swap
              }
            } else {
              const timeScale = chartRef.current.timeScale();
              const visibleRange = timeScale.getVisibleLogicalRange();
              if (visibleRange) {
                // Preserve the TIME DURATION of the visible window, not the bar count
                // This ensures switching from 5min to 15min keeps the same date range visible
                const fromIdx = Math.max(0, Math.floor(visibleRange.from));
                const toIdx = Math.min(fullDataRef.current.length - 1, Math.ceil(visibleRange.to));
                if (fromIdx < fullDataRef.current.length && toIdx >= 0) {
                  const fromTime = fullDataRef.current[fromIdx].time;
                  const toTime = fullDataRef.current[toIdx].time;
                  preservedRangeWidth = toTime - fromTime; // in seconds, not bars
                }
                const centerIdx = Math.round((visibleRange.from + visibleRange.to) / 2);
                if (centerIdx >= 0 && centerIdx < fullDataRef.current.length) {
                  targetTimestamp = fullDataRef.current[centerIdx].time;
                }
              }
            }

            if (targetTimestamp) {
              // We want the target timestamp to be well within the fetched data.
              // When in replay mode, we need most of the data AFTER the replay point
              // so the user can play forward through thousands of bars.
              // When not in replay, we center the data around the view.
              const forwardPaddingBars = modeRef.current !== 'idle' ? 4500 : 500;
              const paddingMs = forwardPaddingBars * getIntervalMs(interval);
              
              if (Date.now() - (targetTimestamp * 1000) > paddingMs) {
                const fetchEndTimestamp = (targetTimestamp * 1000) + paddingMs;
                const d = new Date(fetchEndTimestamp);
                const pad = (n: number) => n.toString().padStart(2, '0');
                endDateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
              }
              // When close to current time, fetch latest data (no endDate) 
              // but keep targetTimestamp for view positioning
            }
          }
          // Try aggregated cache first for instant switching (no API call)
          let stockData: any[] = [];
          let usedAggCache = false;
          
          if (AGGREGATABLE_INTERVALS[interval]) {
            const cached = getAggCachedData(symbol, interval);
            // (for a date range, only a cache that reaches the present — within a long weekend)
            const reachesPresent = !!cached?.length && Date.now() / 1000 - cached[cached.length - 1].time < 4 * 86400;
            if (cached && cached.length > 0 && (!switchingForDateRange || reachesPresent)) {
              console.log(`[AggCache] HIT for ${symbol}/${interval} (${cached.length} bars) — instant switch!`);
              stockData = cached;
              usedAggCache = true;
            }
          }
          
          if (!usedAggCache) {
            stockData = await fetchStockData(symbol, interval, endDateStr);
          }

          // A newer symbol/interval switch started while this fetch was in flight —
          // discard this stale response instead of letting it clobber the current view
          // (this is what caused the chart to occasionally "rewind" after rapid switches).
          if (cancelled) return;

          if (stockData.length === 0) return; // Don't clear chart if fetch failed silently
          
          // Filter out weekends
          stockData = stockData.filter((d: any) => {
            const day = new Date(d.time * 1000).getUTCDay();
            return day !== 0 && day !== 6;
          });

          clearOverlaySeriesData();
          series.setData(stockData);
          applyPricePrecision(stockData);
          if (volumeSeriesRef.current) {
            const volData = volumeHistogram(stockData, 'rgba(38, 166, 154, 0.5)', 'rgba(239, 83, 80, 0.5)');
            volumeSeriesRef.current.setData(volData);
          }
          const oldStockData = fullDataRef.current; // Save before overwriting
          fullDataRef.current = stockData;
          (window as any).__chartFullData = stockData;
          pineRerunOnLoadRef.current();
          
          // Cache this interval's data in agg cache for future use
          if (AGGREGATABLE_INTERVALS[interval] && stockData.length > 0) {
            setAggCachedData(symbol, interval, stockData);
          }
          
          // Re-map drawings logically based on time to survive timeframe changes
          setDrawings(prevDrawings => remapDrawingPoints(prevDrawings, stockData, 'DrawingRemap-IntervalChange', oldStockData));

          recalcSessionBoxes(stockData);
          updateEmaData(stockData);

          if (stockData.length > 1) {
            setLastPriceData({
              price: stockData[stockData.length - 1].close,
              prevPrice: stockData[stockData.length - 2].close
            });
          }

          const pendingRange = pendingDateRangeRef.current;
          if (pendingRange && pendingRange.interval === interval) {
            // Switched here by a bottom-bar date range: show that span instead of the old view
            pendingDateRangeRef.current = null;
            showDateRange(pendingRange.span, stockData);
          } else if (targetTimestamp && chartRef.current) {
            let closestIdx = 0;
            let minDiff = Infinity;
            for (let i = 0; i < stockData.length; i++) {
              const diff = Math.abs(stockData[i].time - targetTimestamp);
              if (diff < minDiff) { minDiff = diff; closestIdx = i; }
            }
            // Convert preserved time duration (seconds) to bar count in the new timeframe
            const newIntervalSec = getIntervalMs(interval) / 1000;
            let halfBars: number;
            if (preservedRangeWidth && newIntervalSec > 0) {
              const totalBars = preservedRangeWidth / newIntervalSec;
              halfBars = totalBars / 2;
            } else {
              // Fallback: show ~80 bars centered on target
              halfBars = 40;
            }
            // Centering on the old view's middle can push most of the window past the newest
            // bar (e.g. 1h → 15m near the live edge), leaving an empty chart — so stop the
            // window at the last bar plus a small right margin, keeping its width.
            let from = closestIdx - halfBars;
            let to = closestIdx + halfBars;
            const maxTo = stockData.length - 1 + 5;
            if (to > maxTo) { from -= to - maxTo; to = maxTo; }
            chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
          }

          // If interval changes, preserve active replay by mapping the time
          // Use savedReplayTime (captured BEFORE data swap) instead of getReplayTime()
          // which would read stale index from the now-replaced dataset
          if (modeRef.current !== 'idle') {
            if (savedReplayTime && stockData.length > 0) {
              const oldIntervalMs = getIntervalMs(prevInterval);
              const newIntervalMs = getIntervalMs(interval);

              let closestIdx = 0;
              if (oldIntervalMs > newIntervalMs) {
                // Higher→Lower TF: find the last candle that opens BEFORE the next old-TF candle
                // e.g. 15min candle at 12:00 → endTime = 12:15:00 → last 5min candle < 12:15 is 12:10
                const endTime = savedReplayTime + (oldIntervalMs / 1000);
                for (let i = 0; i < stockData.length; i++) {
                  if (stockData[i].time < endTime) {
                    closestIdx = i;
                  } else {
                    break; // sorted by time, no need to keep looking
                  }
                }
              } else {
                // Same TF or Lower→Higher: a higher-TF candle must be reachable
                // only once it has FULLY elapsed by the current replay position —
                // not merely "closest by open time". Picking the closest bar let
                // a brand-new, still-forming higher-TF candle (e.g. stepping just
                // one 30min bar into a new 4h period) render fully formed the
                // instant replay crossed into its span. Require the candle's own
                // close time (open + its interval) to fall at or before the close
                // of the bar we've actually replayed to.
                const currentKnownTime = savedReplayTime + (oldIntervalMs / 1000);
                const newIntervalSec = newIntervalMs / 1000;
                for (let i = 0; i < stockData.length; i++) {
                  if (stockData[i].time + newIntervalSec <= currentKnownTime) {
                    closestIdx = i;
                  } else {
                    break; // sorted by time, no need to keep looking
                  }
                }
              }
              startReplayAt(closestIdx, stockData, candleSeriesRef.current, chartRef.current);
            } else {
              stopReplay(stockData);
            }
          }
        } catch (err: any) {
          if (err.message === 'API_LIMIT') onApiLimit(err, () => { if (!cancelled) refresh(); });
        } finally {
          if (!cancelled) {
            setIsLoading(false);
            prevIntervalRef.current = interval; // Update previous interval after processing
          }
          // lightweight-charts can dispatch the visible-range-change notification for
          // the setData() calls above on a later tick than this function's own await
          // chain — clearing the guard synchronously here left a gap where it could
          // still slip through. Give it a moment to settle first, matching how
          // isNavigatingRef is released elsewhere in this file. Only clear if no
          // newer switch has started in the meantime (see myRunId above).
          setTimeout(() => {
            if (refreshRunIdRef.current === myRunId) isSwitchingIntervalRef.current = false;
          }, 100);
        }
      };
      refresh();
      return () => { cancelled = true; };
    }
  }, [interval, series, symbol]);

  // Keyboard shortcuts for replay
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (mode === 'idle') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); stepBack(); }
      if (e.code === 'ArrowRight') { e.preventDefault(); stepForward(); }
      if (e.code === 'Escape') { stopReplay(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, togglePlay, stepBack, stepForward, stopReplay]);

  // General chart navigation — Arrow keys pan by a bar, Ctrl+Arrow pans further,
  // Ctrl+Up/Down zooms in/out. Only outside replay, which already owns Left/Right for stepping.
  useEffect(() => {
    const handleNavKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (mode !== 'idle') return;
      if (!chartRef.current) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) return;

      const ts = chartRef.current.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const width = range.to - range.from;

      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const step = (e.ctrlKey || e.metaKey) ? Math.max(1, width * 0.5) : 1;
        const delta = e.code === 'ArrowLeft' ? -step : step;
        e.preventDefault();
        ts.setVisibleLogicalRange({ from: range.from + delta, to: range.to + delta });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        e.preventDefault();
        const factor = e.code === 'ArrowUp' ? 0.9 : 1 / 0.9; // Up = zoom in, Down = zoom out
        const center = (range.from + range.to) / 2;
        const newWidth = width * factor;
        ts.setVisibleLogicalRange({ from: center - newWidth / 2, to: center + newWidth / 2 });
      }
    };
    window.addEventListener('keydown', handleNavKey);
    return () => window.removeEventListener('keydown', handleNavKey);
  }, [mode]);

  // ── Mouse handlers for the select-mode overlay ──────────────────────────────
  const handleOverlayMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (modeRef.current !== 'selecting') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Magnetic snap: jump the split-line to the exact center of the nearest bar,
    // the same horizontal snap-to-candle behavior drawing tools like Fibonacci
    // already apply, instead of following the raw mouse pixel.
    if (chartRef.current && fullDataRef.current.length > 0) {
      const logical = chartRef.current.timeScale().coordinateToLogical(x);
      if (logical !== null) {
        const idx = Math.max(0, Math.min(fullDataRef.current.length - 1, Math.round(logical)));
        const snappedX = chartRef.current.timeScale().logicalToCoordinate(idx as any);
        setVLineX(snappedX !== null ? snappedX : x);
        setVLineTime(fullDataRef.current[idx].time);
        return;
      }
    }
    setVLineX(x);
  }, []);

  const handleOverlayMouseLeave = useCallback(() => {
    setVLineX(null);
    setVLineTime(null);
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (modeRef.current !== 'selecting') return;
    if (!chartRef.current || fullDataRef.current.length === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // Convert pixel X to logical index
    const logical = chartRef.current.timeScale().coordinateToLogical(x);
    if (logical === null) return;
    // Find closest data index
    const idx = Math.max(0, Math.min(fullDataRef.current.length - 1, Math.round(logical)));
    startReplayAt(idx, fullDataRef.current, candleSeriesRef.current, chartRef.current);
    setVLineX(null);
  }, [startReplayAt]);

  const isSelectMode = mode === 'selecting';
  const isActive = mode === 'active';

  useEffect(() => {
    // Zoom Out goes back one zoom-in (the ranges the Zoom In tool recorded); with none left
    // it fits the whole chart
    const handleZoomOut = () => {
      if (!chartRef.current) return;
      const stack: any[] = (window as any).__zoomStack || [];
      const prev = stack.pop();
      if (prev) chartRef.current.timeScale().setVisibleLogicalRange(prev);
      else chartRef.current.timeScale().fitContent();
      chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      notifyPriceScaleChanged();
      window.dispatchEvent(new CustomEvent('tv:zoom-depth', { detail: stack.length }));
    };
    window.addEventListener('tv-zoom-out', handleZoomOut);
    return () => window.removeEventListener('tv-zoom-out', handleZoomOut);
  }, []);

  return (
    <div 
      style={{ position: "relative", width: "100%", height: "100%" }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!chartRef.current || !candleSeriesRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const price = candleSeriesRef.current.coordinateToPrice(y as any);
        const logical = chartRef.current.timeScale().coordinateToLogical(x as any);
        const bars = fullDataRef.current;
        const idx = logical === null ? -1 : Math.max(0, Math.min(bars.length - 1, Math.round(logical)));
        setContextMenu({ x, y, clientX: e.clientX, clientY: e.clientY, price, time: idx >= 0 && bars[idx] ? bars[idx].time : null, visible: true });
      }}
    >
      {/* Watermark - bottom left like TradingView */}
      <div style={{
        position: "absolute", bottom: "32px", left: "12px",
        fontSize: "13px", fontWeight: 600, letterSpacing: "-0.3px",
        color: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        pointerEvents: "none", zIndex: 1,
        display: "flex", alignItems: "center", gap: "4px"
      }}>
        <svg width="18" height="18" viewBox="0 0 36 36" fill="currentColor">
          <path d="M18 4L4 32h28L18 4zm0 8l8 16H10l8-16z"/>
        </svg>
        TradePilot
      </div>

      {/* Legend (the status line), as on TradingView: logo, title, market status and the bar's
          values; the buy/sell buttons; then a row per indicator, which the arrow at the end
          folds away. What it shows follows Chart settings → Status line. Kept clear of the
          price axis; on a narrow chart the values wrap. */}
      {(() => {
        const sl = statusLineSettings;
        const bars = fullDataRef.current;
        const hoverIdx = hoveredBarData ? barIndexAtTime(bars, hoveredBarData.time as number) : -1;
        const idx = hoverIdx >= 0 ? hoverIdx : bars.length - 1;
        const bar = idx >= 0 ? bars[idx] : null;
        const prev = idx > 0 ? bars[idx - 1] : null;
        const upColor = candleColors.upColor, downColor = candleColors.downColor;
        const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision });
        // TradingView writes changes with a true minus sign
        const signed = (v: number, text: string) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${text}`;
        const changeText = (from: number, to: number) => {
          const d = to - from;
          const pct = from ? (d / from) * 100 : 0;
          return { text: `${signed(d, fmt(Math.abs(d)))} (${signed(pct, Math.abs(pct).toFixed(2))}%)`, color: d >= 0 ? upColor : downColor };
        };
        const barColor = bar ? (bar.close >= bar.open ? upColor : downColor) : undefined;
        const barChange = bar && prev ? changeText(prev.close, bar.close) : null;
        const dayChange = bar && sl.lastDayChange ? (() => {
          const prevDayClose = previousDayClose(bars, idx, interval);
          return prevDayClose != null ? changeText(prevDayClose, bar.close) : null;
        })() : null;

        const description = symbolInfo.description;
        const main = sl.titleMode === "Ticker" || !description ? symbol
          : sl.titleMode === "Ticker and description" ? `${symbol} · ${description}` : description;
        const titleText = [main, legendIntervalLabel(interval), symbolInfo.exchange].filter(Boolean).join(" · ");
        const marketOpen = marketOpenNow(symbolInfo);
        const legendBg = (on: boolean, pct: number) => on ? `color-mix(in srgb, var(--tv-color-pane-bg) ${pct}%, transparent)` : "transparent";
        const mainBg = legendBg(sl.background, sl.backgroundOpacity);
        const indicatorBg = legendBg(sl.indBackground, sl.indBackgroundOpacity);

        const rows: React.ReactNode[] = [];
        if (pineLegend) rows.push(
          <PineScriptLegendRow
            key="pine"
            name={pineLegend.name}
            inputs={pineLegend.inputs}
            plots={pineLegend.plots}
            status={statusLineSettings}
            background={indicatorBg}
            format={fmt}
            isVisible={pineVisible}
            onToggleVisibility={togglePineVisible}
            onOpenSettings={() => setShowPineSettings(true)}
            onOpenCode={() => window.dispatchEvent(new CustomEvent("tv:open-pine-editor", {
              detail: { code: lastPineRunRef.current?.code, scriptName: lastPineRunRef.current?.scriptName },
            }))}
            onRemove={removePineScript}
          />
        );
        activeIndicators?.forEach(ind => {
          if (ind.name === "Volume") {
            rows.push(
              <IndicatorRow
                key={ind.id}
                name="Vol" fullName="Volume" args=""
                values={[{ text: formatVolume(bar?.volume), color: barColor }]}
                status={statusLineSettings} background={indicatorBg}
                isVisible={volumeVisible}
                onToggleVisibility={() => setVolumeVisible(!volumeVisible)}
                onOpenSettings={() => setShowVolumeSettings(true)}
                onRemove={() => onRemoveIndicator?.(ind.id)}
              />
            );
          } else if (ind.name === "Moving Average Exponential") {
            const config = emaConfigs[ind.id] || { length: 9, source: 'Close', color: '#2962ff' };
            const isVis = emaVisibilities[ind.id] ?? true;
            const point = hoverIdx >= 0 ? hoveredEmasData[ind.id] : lastSeriesPoint(emasRef.current[ind.id]);
            rows.push(
              <IndicatorRow
                key={ind.id}
                name="EMA" fullName="Moving Average Exponential" args={`${config.length} ${String(config.source).toLowerCase()}`}
                values={[{ text: point && typeof point.value === "number" ? fmt(point.value) : "∅", color: config.color }]}
                status={statusLineSettings} background={indicatorBg}
                isVisible={isVis}
                onToggleVisibility={() => setEmaVisibilities(prev => ({ ...prev, [ind.id]: !isVis }))}
                onOpenSettings={() => setShowEmaSettingsFor(ind.id)}
                onRemove={() => onRemoveIndicator?.(ind.id)}
              />
            );
          } else if (ind.name === "FXN - Asian Session Range") {
            rows.push(
              <IndicatorRow
                key={ind.id}
                name="FXN - Asian Session Range" fullName="FXN - Asian Session Range" args="" values={[]}
                status={statusLineSettings} background={indicatorBg}
                isVisible={sessionVisible}
                onToggleVisibility={() => setSessionVisible(!sessionVisible)}
                onOpenSettings={() => setSessionSettingsOpen(true)}
                onRemove={() => onRemoveIndicator?.(ind.id)}
              />
            );
          }
        });

        return (
          <div style={{ position: "absolute", top: "6px", left: "9px", maxWidth: "calc(100% - 90px)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "flex-start", pointerEvents: "none", color: "var(--tv-hdr-text)" }}>
            {/* Title line */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0 8px", minHeight: "22px" }}>
              {(sl.logo || sl.title) && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "0 4px", margin: "0 -4px", borderRadius: "4px", background: mainBg }}>
                  {sl.logo && <SymbolAvatar symbol={symbol} size={18} />}
                  {sl.title && <span style={{ fontSize: "16px", lineHeight: "22px", whiteSpace: "nowrap" }}>{titleText}</span>}
                </div>
              )}
              {sl.marketStatus && marketOpen === false && (
                <Tip text="Market closed">
                  <span aria-label="Market closed" style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", height: "22px", minWidth: "26px", padding: "0 6px", borderRadius: "11px", background: "rgba(0, 0, 0, 0.08)" }}>
                    <svg width="10" height="4" viewBox="0 0 10 4" aria-hidden><rect width="10" height="4" rx="2" fill="currentColor" opacity="0.75" /></svg>
                  </span>
                </Tip>
              )}
              {bar && (sl.chartValues || sl.barChange || sl.volume || sl.lastDayChange) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0 8px", fontSize: "14px", lineHeight: "22px", padding: "0 4px", margin: "0 -4px", borderRadius: "4px", background: mainBg }}>
                  {sl.chartValues && ([["O", bar.open], ["H", bar.high], ["L", bar.low], ["C", bar.close]] as [string, number][]).map(([k, v]) => (
                    <span key={k} style={{ whiteSpace: "nowrap" }}>{k}<span style={{ color: barColor }}>{fmt(v)}</span></span>
                  ))}
                  {sl.barChange && barChange && <span style={{ color: barChange.color, whiteSpace: "nowrap" }}>{barChange.text}</span>}
                  {sl.volume && <span style={{ whiteSpace: "nowrap" }}>Vol <span style={{ color: barColor }}>{formatVolume(bar.volume)}</span></span>}
                  {dayChange && <span style={{ color: dayChange.color, whiteSpace: "nowrap" }}>{dayChange.text}</span>}
                </div>
              )}
            </div>

            {/* Buy / Sell buttons (Settings → Trading → Buy/sell buttons): the live bid and ask,
                outlined until a broker is connected and filled after, like TradingView's */}
            {tradingSettings.buySellButtons && (() => {
              const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
              const live = quoteOf(tradingState, symbol);
              if (!live && !lastBar) return null;
              const { bid, ask } = live ? { bid: live.bid, ask: live.ask } : simulatedQuote(lastBar!.close, pricePrecision);
              const connected = tradingState.connected;
              // At 3+ decimals the last (fractional pip) digit is set small, as on TradingView
              const pip = (str: string) => pricePrecision >= 3 ? { main: str.slice(0, -1), sup: str.slice(-1) } : { main: str, sup: "" };
              const spreadTicks = Math.round((ask - bid) * Math.pow(10, pricePrecision));
              const button = (side: "sell" | "buy") => {
                const parts = pip(fmt(side === "sell" ? bid : ask));
                const color = side === "sell" ? "#f23645" : "#2962ff";
                const hover = side === "sell" ? "#d5303e" : "#1e53e5";
                const idleBg = "var(--tv-color-pane-bg)";
                return (
                  <Tip key={side} text={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{side === "sell" ? "Sell Market" : "Buy Market"}<span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.3)" }} /><Kbd>Shift</Kbd><Kbd>{side === "sell" ? "S" : "B"}</Kbd></span>} placement="bottom">
                    <button
                      className="tv-buy-sell-btn"
                      aria-label={side === "sell" ? "Sell" : "Buy"}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1px",
                        padding: "0 10px", borderRadius: "6px", border: `1px solid ${color}`,
                        background: connected ? color : idleBg, color: connected ? "#ffffff" : color,
                        pointerEvents: "auto", cursor: "pointer", minWidth: "78px", height: "34px", fontFamily: "inherit",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = connected ? hover : (side === "sell" ? "rgba(242, 54, 69, 0.08)" : "rgba(41, 98, 255, 0.08)"); }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = connected ? color : idleBg; }}
                      onClick={() => onOpenOrderPanel?.(side)}
                    >
                      <span style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "flex-start", lineHeight: "15px" }}>
                        {parts.main}
                        {parts.sup && <span style={{ fontSize: "10px", lineHeight: "10px", marginLeft: "1px" }}>{parts.sup}</span>}
                      </span>
                      <span style={{ fontSize: "11px", fontWeight: 700, lineHeight: "12px" }}>{side === "sell" ? "SELL" : "BUY"}</span>
                    </button>
                  </Tip>
                );
              };
              return (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "2px 0 6px" }}>
                  {button("sell")}
                  <span style={{ fontSize: "11px", minWidth: 10, textAlign: "center" }}>{spreadTicks}</span>
                  {button("buy")}
                </div>
              );
            })()}

            {/* Indicator rows */}
            {legendExpanded && rows}

            {rows.length > 0 && (
              <Tip text={legendExpanded ? "Hide indicator legend" : "Show indicator legend"}>
                <button
                  type="button"
                  aria-label={legendExpanded ? "Hide indicator legend" : "Show indicator legend"}
                  onClick={() => setLegendExpanded(v => !v)}
                  className="tv-legend-btn"
                  style={{ pointerEvents: "auto", height: "22px", minWidth: "22px", padding: legendExpanded ? 0 : "0 6px", gap: "4px", marginTop: "1px", fontSize: "13px" }}
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                    <path d={legendExpanded ? "M1 5l4-4 4 4" : "M1 1l4 4 4-4"} />
                  </svg>
                  {!legendExpanded && <span>{rows.length}</span>}
                </button>
              </Tip>
            )}
          </div>
        );
      })()}

      {showVolumeSettings && (
        <VolumeSettingsModal onClose={() => setShowVolumeSettings(false)} theme={theme} config={volumeConfig} onChangeConfig={setVolumeConfig} />
      )}

      {showEmaSettingsFor && (
        <EmaSettingsModal 
          onClose={() => setShowEmaSettingsFor(null)} 
          theme={theme} 
          config={emaConfigs[showEmaSettingsFor] || { length: 9, source: 'Close', offset: 0, color: '#2962ff' }} 
          onChangeConfig={(newConfig) => setEmaConfigs(prev => ({ ...prev, [showEmaSettingsFor]: newConfig }))} 
        />
      )}

      {/* Replay active top stripe */}
      {(isSelectMode || isActive) && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, #2962ff, #1c7ed6)',
          zIndex: 15, pointerEvents: 'none',
        }} />
      )}

      {/* Chart canvas */}
      <div 
        ref={chartContainerRef} 
        style={{ 
          position: "relative",
          width: "100%", 
          height: mode !== 'idle' ? "calc(100% - 38px)" : "100%", 
          zIndex: 1 
        }} 
      />

      {/* Countdown to bar close, joined under the last-price label */}
      {countdown && (
        <div aria-label="Time to bar close" style={{
          position: "absolute", right: 0, top: Math.round(countdown.top + 10), width: countdown.width, height: 17,
          background: countdown.color, color: "#ffffff", fontSize: "12px", lineHeight: "15px", textAlign: "center",
          borderRadius: "0 0 2px 2px", pointerEvents: "none", zIndex: 5, fontVariantNumeric: "tabular-nums",
        }}>
          {countdown.text}
        </div>
      )}

      {/* Pine script table.new()/table.cell() output — a positioned HTML
          overlay, since this chart has no native drawing-object renderer.
          Sized to `dimensions` (chartContainerRef's own clientWidth/Height,
          the same measurement DrawingLayer uses) rather than 100% of this
          component's outer wrapper: that wrapper doesn't actually shrink
          when the Pine Editor panel opens (only the chart canvas itself
          does, via an explicit resize call), so anchoring directly to it
          placed "top_right" behind the editor panel instead of on the chart. */}
      {pineTables.length > 0 && dimensions.width > 0 && (
        <div style={{ position: "absolute", top: 0, left: 0, width: dimensions.width, height: dimensions.height, pointerEvents: "none", overflow: "hidden", zIndex: 40 }}>
          {pineTables.map((t, ti) => (
            <div
              key={ti}
              style={{
                ...pineTablePositionStyle(t.position),
                borderCollapse: "collapse" as any,
                display: "table",
                background: t.bgcolor || "rgba(30,34,45,0.9)",
                border: t.borderColor ? `1px solid ${t.borderColor}` : "1px solid rgba(255,255,255,0.1)",
                borderRadius: "2px", overflow: "hidden",
                fontFamily: "inherit",
              }}
            >
              {t.cells.map((row: any[], ri: number) => (
                <div key={ri} style={{ display: "table-row" }}>
                  {row.map((cell: any, ci: number) => (
                    <div
                      key={ci}
                      style={{
                        display: "table-cell",
                        padding: "3px 8px",
                        fontSize: "11px",
                        whiteSpace: "nowrap",
                        color: cell?.textColor || "#d1d4dc",
                        background: cell?.bgcolor || "transparent",
                      }}
                    >
                      {cell?.text ?? ""}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Strategy backtest report — appears after a successful strategy run.
          Sized to `dimensions` for the same reason as the Pine table overlay
          above: the outer wrapper doesn't shrink when a side panel opens.
          The wrapper itself stays pointer-events:none — it spans the WHOLE
          chart area regardless of the panel's own (possibly much shorter,
          e.g. minimized) height, so only the panel's own box below should
          ever intercept clicks; StrategyReportPanel re-enables pointer
          events on just its own root, matching its real rendered size. */}
      {strategyReport && (
        <StrategyReportPanel
          theme={theme}
          scriptName={strategyScriptName}
          symbol={symbol}
          report={strategyReport}
          range={backtestRange}
          busy={backtestBusy}
          tz={chartTimezone}
          pricePrecision={pricePrecision}
          onChangeRange={rerunPineForRange}
          onChangeCapital={changeInitialCapital}
          onShowTime={showTimeOnChart}
          onOpenSettings={() => setShowPineSettings(true)}
          onAddAlert={() => setShowAlertModal(true)}
          onRemove={removePineScript}
          fullRangeStart={fullDataRef.current[0]?.time}
          fullRangeEnd={fullDataRef.current[fullDataRef.current.length - 1]?.time}
        />
      )}

      {/* "Updating report" / "updated successfully" toast — pops in above
          whatever is docked at the bottom (strategy report panel included,
          hence the high z-index) and dismisses itself; the success variant's
          own fade-out is baked into its keyframe so no extra unmount timer
          juggling is needed for the exit animation. */}
      {reportToast && (
        <div style={{
          position: "fixed", bottom: "calc(var(--tv-bottom-toolbar-height) + 16px)", left: "50%",
          transform: "translateX(-50%)", zIndex: 5000, pointerEvents: "none",
        }}>
          <div
            key={reportToast}
            style={{
              display: "flex", alignItems: "center", gap: "9px",
              background: "rgba(30, 34, 45, 0.95)", color: "#fff", fontSize: "13px", fontWeight: 500,
              padding: "8px 16px", borderRadius: "6px", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              animation: reportToast === "success" ? "chartToastSuccess 2.2s ease forwards" : "chartToastIn 0.2s ease forwards",
            }}
          >
            {reportToast === "updating" ? (
              <>
                <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{
                      width: "5px", height: "5px", borderRadius: "50%", background: "#9598a1",
                      animation: `chartToastDot 1.2s ${i * 0.15}s infinite ease-in-out`,
                    }} />
                  ))}
                </span>
                Updating report
              </>
            ) : (
              <>
                <span style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "16px", height: "16px", borderRadius: "50%", background: "#26a69a", flexShrink: 0,
                }}>
                  <Check size={11} color="#fff" strokeWidth={3} />
                </span>
                The report has been updated successfully
              </>
            )}
          </div>
          <style>{`
            @keyframes chartToastIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes chartToastSuccess {
              0% { opacity: 0; transform: translateY(6px); }
              10% { opacity: 1; transform: translateY(0); }
              85% { opacity: 1; transform: translateY(0); }
              100% { opacity: 0; transform: translateY(-4px); }
            }
            @keyframes chartToastDot {
              0%, 60%, 100% { opacity: 0.35; transform: scale(0.7); }
              30% { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}

      {/* Settings modal — opened from the legend row's gear icon, built
          dynamically from the running script's own declared inputs. */}
      {showPineSettings && pineLegend && (
        <PineSettingsModal
          theme={theme}
          scriptName={pineLegend.name}
          inputsMeta={pineInputsMeta}
          currentOverrides={inputOverrides}
          initialCapital={capitalOverride ?? pineDeclMeta.initialCapital}
          pyramiding={pineDeclMeta.pyramiding}
          defaultQtyValue={pineDeclMeta.defaultQtyValue}
          defaultQtyType={pineDeclMeta.defaultQtyType}
          plots={pineLegend.plots}
          onApply={applyPineSettings}
          onClose={() => setShowPineSettings(false)}
        />
      )}

      {/* Loading & API Limit Overlay */}
      {(isLoading || apiLimitReached) && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(19, 23, 34, 0.7)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', color: '#d1d4dc', fontSize: '14px', fontWeight: 600, gap: '16px'
        }}>
          {apiLimitReached ? (
            <div style={{ padding: '24px', backgroundColor: '#1e222d', borderRadius: '8px', border: '1px solid #f23645', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <div style={{ color: '#f23645', marginBottom: '8px', fontSize: '16px' }}>{apiLimitReached === 'day' ? 'Daily data limit reached' : 'Data limit reached'}</div>
              <div style={{ color: 'var(--tv-color-text-muted)', maxWidth: 320, lineHeight: '20px' }}>
                {apiLimitReached === 'day'
                  ? "The data provider's daily allowance is used up. It resets at 00:00 UTC."
                  : "The data provider allows 8 requests a minute. Retrying automatically when the minute resets…"}
              </div>
              {apiLimitReached === 'day' ? (
                <button type="button" onClick={() => setApiLimitReached(false)} style={{ marginTop: 16, height: 32, padding: '0 16px', borderRadius: 6, border: 'none', background: '#2962ff', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>OK</button>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite", color: "#f23645", margin: "16px auto 0", display: "block" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                </svg>
              )}
            </div>
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite", color: "#2962ff" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            </svg>
          )}
        </div>
      )}

      {/* Session Overlay */}
      <div ref={overlayContainerRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50, overflow: "hidden" }} />

      {/* Replay select-mode overlay — captures mouse and shows vertical line */}
      {isSelectMode && (
        <div
          ref={overlayRef}
          onMouseMove={handleOverlayMouseMove}
          onMouseLeave={handleOverlayMouseLeave}
          onClick={handleOverlayClick}
          onContextMenu={(e) => {
            // Right-click while the scissors cursor is showing cancels the pick: drop the
            // cursor and close the replay panel instead of opening the chart context menu.
            e.preventDefault();
            e.stopPropagation();
            setVLineX(null);
            setVLineTime(null);
            stopReplay();
          }}
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 20,
            cursor: "crosshair",
            pointerEvents: activeTool ? "none" : "auto",
          }}
        >
          {/* Vertical hairline */}
          {vLineX !== null && (
            <>
              {/* Future area overlay (right of cursor — semi-transparent grey) */}
              <div style={{
                position: "absolute",
                top: 0, left: vLineX, right: 0, bottom: 0,
                backgroundColor: theme === "dark" ? "rgba(19,23,34,0.6)" : "rgba(240,243,250,0.55)",
                pointerEvents: "none",
              }} />
              {/* The vertical line itself */}
              <div style={{
                position: "absolute",
                top: 0, bottom: 0,
                left: vLineX,
                width: "1px",
                backgroundColor: theme === "dark" ? "#d1d4dc" : "#131722",
                pointerEvents: "none",
              }} />
              {/* Scissors icon near cursor */}
              <div style={{
                position: "absolute",
                left: vLineX + 8,
                top: "20px",
                pointerEvents: "none",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme === "dark" ? "#d1d4dc" : "#131722"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"/>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"/>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"/>
                </svg>
              </div>
              {/* Split time, at the vertical middle of the line */}
              {vLineTime !== null && (
                <div style={{
                  position: "absolute",
                  left: vLineX,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                  backgroundColor: theme === "dark" ? "#d1d4dc" : "#131722",
                  color: theme === "dark" ? "#131722" : "#ffffff",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  whiteSpace: "nowrap",
                }}>
                  {formatCrosshairTime(vLineTime, chartTimezone)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Drawing layer + SubBar (now persistent during replay) */}
      {chart && series && dimensions.width > 0 && (
        <>
          <DrawingLayer chart={chart} series={series} width={dimensions.width} height={dimensions.height} />
          {mode === 'idle' && (
            <TradingOverlay chart={chart} series={series} symbol={symbol} width={dimensions.width} height={dimensions.height} plusButton={psPlusButton} />
          )}
          <SubBar />
          <MultiSelectSubBar />
        </>
      )}

      {/* Replay controls bar */}
      <ReplayBar intervalLabel={intervalLabel} interval={interval} symbol={symbol} />

      {/* Session Settings Modal */}
      <SessionSettingsModal
        isOpen={sessionSettingsOpen}
        onClose={() => setSessionSettingsOpen(false)}
        config={sessionConfig}
        onSave={(newConf: any) => { setSessionConfig(newConf); setSessionSettingsOpen(false); }}
        theme={theme}
      />

      {contextMenu?.visible && (
        <ChartContextMenu
          pos={{ x: contextMenu.clientX, y: contextMenu.clientY }}
          price={contextMenu.price}
          symbol={symbol}
          theme={theme}
          onClose={() => setContextMenu(null)}
          viewChanged={isChartViewChanged()}
          onReset={() => { resetChartView(); setContextMenu(null); }}
          drawingCount={((window as any).__drawings || []).filter((d: any) => d.type !== 'measure').length}
          indicatorCount={activeIndicators.length + (pineLegend ? 1 : 0)}
          onRemoveDrawings={() => { setDrawings([]); setContextMenu(null); }}
          onRemoveIndicators={() => {
            activeIndicators.forEach(ind => onRemoveIndicator?.(ind.id));
            if (pineLegend) removePineScript();
            setContextMenu(null);
          }}
          onSettings={() => { setShowChartSettings(true); setContextMenu(null); }}
          onAddAlert={() => { setShowAlertModal(true); setContextMenu(null); }}
          precision={pricePrecision}
          onCopyPrice={(text: string) => { navigator.clipboard?.writeText(text).catch(() => {}); setContextMenu(null); }}
          canPaste={!!(window as any).__copiedDrawings?.length}
          onPaste={() => { window.dispatchEvent(new CustomEvent('tv:paste-drawings')); setContextMenu(null); }}
          quickQty={formatQty(lastQtyFor(symbol))}
          buyType={contextMenu.price !== null ? orderTypeAt(symbol, 'buy', contextMenu.price) : 'limit'}
          sellType={contextMenu.price !== null ? orderTypeAt(symbol, 'sell', contextMenu.price) : 'stop'}
          onQuickOrder={(side: 'buy' | 'sell', type: 'limit' | 'stop') => {
            if (contextMenu.price !== null) projectChartOrder(symbol, side, type, contextMenu.price);
            setContextMenu(null);
          }}
          onAddOrder={() => { if (contextMenu.price !== null) addOrderAt(contextMenu.price); setContextMenu(null); }}
          cursorLocked={lockedCursorTime !== null}
          onToggleCursorLock={() => { setLockedCursorTime(t => (t !== null ? null : contextMenu.time)); setContextMenu(null); }}
          onTableView={() => { setShowTableView(true); setContextMenu(null); }}
          onObjectTree={() => { window.dispatchEvent(new CustomEvent('tv:open-sidebar-panel', { detail: 'object_tree' })); setContextMenu(null); }}
        />
      )}
      {lockedCursorTime !== null && chartRef.current && (
        <LockedCursorLine chart={chartRef.current} time={lockedCursorTime} theme={theme} tz={chartTimezone} />
      )}
      {showTableView && (
        <ChartTableView bars={fullDataRef.current} precision={pricePrecision} theme={theme} tz={chartTimezone} onClose={() => setShowTableView(false)} />
      )}

      {showChartSettings && (
        <ChartSettingsModal 
          theme={theme} 
          initialTab={chartSettingsTab}
          onClose={() => setShowChartSettings(false)} 
          candleColors={candleColors}
          onSaveColors={async (newColors) => {
            setCandleColors(newColors);
            if (user?.uid) {
              await setDoc(doc(db, 'userSettings', user.uid), {
                chartSettings: { candleColors: newColors }
              }, { merge: true });
            }
          }}
          canvasColors={canvasColors}
          onSaveCanvasColors={async (newColors) => {
            setCanvasColors(newColors);
            if (user?.uid) {
              await setDoc(doc(db, 'userSettings', user.uid), {
                chartSettings: { canvasColors: newColors }
              }, { merge: true });
            }
          }}
        />
      )}

      {showSaveTemplate && (
        <SaveTemplateModal
          theme={theme}
          settingsToSave={{ candleColors, canvasColors }}
          onClose={(saved) => {
            setShowSaveTemplate(false);
            if (saved) fetchSavedTemplates();
          }}
        />
      )}

      {showAlertModal && (
        <CreateAlertModal
          theme={theme}
          symbol={symbol}
          initialPrice={contextMenu?.price || lastPriceData?.price || 0}
          onClose={() => setShowAlertModal(false)}
        />
      )}

      {/* Jump to real-time */}
      <button
        title="Jump to real-time"
        onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
        style={{
          position: "absolute", bottom: "32px", right: "45px",
          width: "26px", height: "26px", borderRadius: "50%",
          backgroundColor: "var(--tv-color-pane-bg)",
          border: "1.5px solid #a855f7",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 40,
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        }}
      >
        <Zap size={13} color="#a855f7" fill="#a855f7" />
        <div style={{
          position: "absolute", top: "-2px", right: "-2px",
          width: "8px", height: "8px", borderRadius: "50%",
          backgroundColor: "#f23645", border: "1.5px solid var(--tv-color-pane-bg)"
        }} />
      </button>

      {/* The time zone menu opens from the bottom bar's clock, as on TradingView */}
      {showTimezoneMenu && (
        <TimezoneMenu
          theme={theme}
          selected={chartTimezone}
          onSelect={(tz) => { setChartTimezone(tz); setShowTimezoneMenu(false); }}
          onClose={() => setShowTimezoneMenu(false)}
        />
      )}

      {/* Chart settings — sits in the corner where the price scale meets the time axis */}
      <button
        title="Chart settings"
        data-price-scale-toggle
        onClick={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          const c = e.currentTarget.parentElement?.getBoundingClientRect();
          setPsAnchor({ right: c ? c.right : b.right, top: b.top });
          setShowTimezoneMenu(false); setShowPriceScaleMenu(v => !v); setPriceScaleSubmenu(null);
        }}
        style={{
          position: "absolute", bottom: "4px", right: "6px",
          width: "20px", height: "20px", borderRadius: "50%",
          background: showPriceScaleMenu ? "var(--tv-color-hover-bg, rgba(135,141,157,0.15))" : "none",
          border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 40,
          color: "var(--tv-color-text-muted)",
        }}
      >
        <SubSettingsIcon size={18} />
      </button>
      {showPriceScaleMenu && psAnchor && (
        <PriceScaleMenu
          theme={theme}
          anchor={psAnchor}
          ratioText={priceToBarRatioText()}
          dailyOrMore={/day|week|month/.test(interval)}
          psAutoScale={psAutoScale} setPsAutoScale={setPsAutoScale}
          psLockRatio={psLockRatio} setPsLockRatio={setPsLockRatio}
          psScaleOnly={psScaleOnly} setPsScaleOnly={setPsScaleOnly}
          psInvert={psInvert} setPsInvert={setPsInvert}
          psMode={psMode} setPsMode={setPsMode}
          psScaleLeft={psScaleLeft} setPsScaleLeft={setPsScaleLeft}
          psPlusButton={psPlusButton} setPsPlusButton={setPsPlusButton}
          labelSettings={labelSettings} setLabelSettings={setLabelSettings}
          lineSettings={lineSettings} setLineSettings={setLineSettings}
          onClose={() => { setShowPriceScaleMenu(false); setPriceScaleSubmenu(null); }}
          onMoreSettings={() => { setShowPriceScaleMenu(false); setPriceScaleSubmenu(null); setShowChartSettings(true); }}
        />
      )}
    </div>
  );
}

// --- Legend helpers ---

// The bar at `time` (the crosshair's), by binary search over the loaded bars
function barIndexAtTime(bars: { time: number }[], time: number): number {
  let lo = 0, hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = bars[mid].time;
    if (t === time) return mid;
    if (t < time) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

// Close of the last bar of the day before bar `idx` (for "Last day change values"); on daily
// and longer bars that's simply the previous bar
function previousDayClose(bars: { time: number; close: number }[], idx: number, interval: string): number | null {
  if (idx <= 0) return null;
  if (/day|week|month/.test(interval)) return bars[idx - 1].close;
  const dayOf = (t: number) => { const d = new Date(t * 1000); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const today = dayOf(bars[idx].time);
  for (let i = idx - 1; i >= 0; i--) if (dayOf(bars[i].time) !== today) return bars[i].close;
  return null;
}

// A line series' latest point (the legend's value when the crosshair isn't on the chart)
function lastSeriesPoint(series: any): { value: number } | null {
  try {
    const data = series?.data?.();
    return data && data.length ? data[data.length - 1] : null;
  } catch { return null; }
}

// The interval as TradingView's legend writes it: minutes as a bare number, then 1h, 1D, 1W, 1M
function legendIntervalLabel(interval: string): string {
  const m = interval.match(/^(\d+)(min|h|day|week|month)$/);
  if (!m) return interval;
  const unit = { min: "", h: "h", day: "D", week: "W", month: "M" }[m[2] as "min"];
  return `${m[1]}${unit}`;
}

const LegendEye = ({ off }: { off?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
    <path d="M1.5 9c1.9-3.3 4.4-5 7.5-5s5.6 1.7 7.5 5c-1.9 3.3-4.4 5-7.5 5S3.4 12.3 1.5 9z" />
    <circle cx="9" cy="9" r="2.5" />
    {off && <path d="M3 15L15 3" />}
  </svg>
);
const LegendTrash = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
    <path d="M3 5.5h12M7 5.5v-2h4v2M4.5 5.5l.9 9.5a1 1 0 0 0 1 .9h5.2a1 1 0 0 0 1-.9l.9-9.5" />
  </svg>
);
const LegendMore = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
    <circle cx="4" cy="9" r="1.2" /><circle cx="9" cy="9" r="1.2" /><circle cx="14" cy="9" r="1.2" />
  </svg>
);
const LegendCode = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
    <path d="M6.5 4.5L2.5 9l4 4.5M11.5 4.5l4 4.5-4 4.5" />
  </svg>
);
const LegendStar = ({ filled }: { filled?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill={filled ? "#f7a600" : "none"} stroke={filled ? "#f7a600" : "currentColor"} strokeWidth="1" aria-hidden>
    <path d="M9 2.5l2 4.3 4.7.5-3.5 3.2 1 4.6L9 12.7l-4.2 2.4 1-4.6-3.5-3.2 4.7-.5z" />
  </svg>
);

const LegendIconBtn = forwardRef<HTMLButtonElement, { label: string; onClick?: () => void; children: React.ReactNode }>(
  function LegendIconBtn({ label, onClick, children }, ref) {
    return (
      <Tip text={label}>
        <button ref={ref} type="button" aria-label={label} className="tv-legend-btn" style={{ width: 22, height: 22, padding: 0 }}
          onClick={e => { e.stopPropagation(); onClick?.(); }}>
          {children}
        </button>
      </Tip>
    );
  }
);

// One indicator's legend row, as on TradingView: its name, inputs (grey) and values. Hovered
// (or clicked, which keeps it that way until you click elsewhere) it becomes a chip with the
// full name as a tooltip and Show/Hide, Settings, Remove and More in place of the values; a
// hidden indicator is greyed out with its "Show" eye left in view.
function IndicatorRow({
  name, fullName, args, values, status, background, isVisible = true,
  onToggleVisibility, onOpenSettings, onOpenCode, onRemove,
}: {
  name: string; fullName: string; args: string; values: { text: string; color?: string }[];
  status: StatusLineSettings; background: string; isVisible?: boolean;
  onToggleVisibility?: () => void; onOpenSettings?: () => void; onOpenCode?: () => void; onRemove?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [selected, setSelected] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const active = hovered || selected || menuOpen;

  useEffect(() => {
    if (!selected) return;
    const onDown = (e: MouseEvent) => { if (!rowRef.current?.contains(e.target as Node)) setSelected(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selected]);

  const openMenu = () => {
    setFavorite(loadFavoriteIndicators().includes(fullName));
    setMenuOpen(o => !o);
  };
  const toggleFavorite = () => {
    const list = loadFavoriteIndicators();
    const next = list.includes(fullName) ? list.filter(n => n !== fullName) : [...list, fullName];
    saveFavoriteIndicators(next);
    setMenuOpen(false);
  };

  return (
    <div
      ref={rowRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setSelected(true)}
      style={{ display: "flex", alignItems: "center", height: "24px", pointerEvents: "auto" }}
    >
      <div style={{
        display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 4px", margin: "0 -4px",
        borderRadius: "4px", fontSize: "13px", whiteSpace: "nowrap", cursor: "default",
        background: active ? "var(--tv-color-bg)" : background,
        boxShadow: selected ? "inset 0 0 0 1px var(--tv-color-accent)" : undefined,
        color: isVisible ? "inherit" : "var(--tv-legend-muted)",
      }}>
        {(status.indTitles || active) && <Tip text={fullName}><span>{name}</span></Tip>}
        {status.indInputs && args && <span style={{ color: isVisible ? "var(--tv-legend-args)" : "inherit" }}>{args}</span>}
        {!active && isVisible && status.indValues && values.map((v, i) => (
          <span key={i} style={{ color: v.color }}>{v.text}</span>
        ))}
        {active ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "2px", color: "var(--tv-hdr-text)" }}>
            <LegendIconBtn label={isVisible ? "Hide" : "Show"} onClick={onToggleVisibility}><LegendEye off={!isVisible} /></LegendIconBtn>
            <LegendIconBtn label="Settings" onClick={onOpenSettings}><TVSettingsIcon size={18} /></LegendIconBtn>
            {onOpenCode && <LegendIconBtn label="Source code" onClick={onOpenCode}><LegendCode /></LegendIconBtn>}
            <LegendIconBtn label="Remove" onClick={onRemove}><LegendTrash /></LegendIconBtn>
            <LegendIconBtn ref={moreRef} label="More" onClick={openMenu}><LegendMore /></LegendIconBtn>
          </span>
        ) : !isVisible && (
          <LegendIconBtn label="Show" onClick={onToggleVisibility}><LegendEye off /></LegendIconBtn>
        )}
      </div>
      <Popover anchor={moreRef.current} open={menuOpen} onClose={() => setMenuOpen(false)} width={280}>
        <MenuItem icon={<LegendStar filled={favorite} />} onClick={toggleFavorite}>
          {favorite ? "Remove this indicator from favorites" : "Add this indicator to favorites"}
        </MenuItem>
        <MenuDivider />
        <MenuItem icon={<LegendEye off={isVisible} />} onClick={() => { setMenuOpen(false); onToggleVisibility?.(); }}>{isVisible ? "Hide" : "Show"}</MenuItem>
        <MenuItem icon={<LegendTrash />} onClick={() => { setMenuOpen(false); onRemove?.(); }}>Remove</MenuItem>
        <MenuDivider />
        <MenuItem icon={<TVSettingsIcon size={18} />} onClick={() => { setMenuOpen(false); onOpenSettings?.(); }}>Settings…</MenuItem>
      </Popover>
    </div>
  );
}

// Legend row for a script added from the Pine Editor: its name, its real current input values
// (TradingView's "name + inputs" legend text) and each plot's latest value in the plot's colour
function PineScriptLegendRow({
  name, inputs, plots, status, background, format, isVisible, onToggleVisibility, onOpenSettings, onOpenCode, onRemove,
}: {
  name: string; inputs: string[]; plots: { title: string; color: string; lastValue: number | null }[];
  status: StatusLineSettings; background: string; format: (v: number) => string;
  isVisible: boolean; onToggleVisibility: () => void; onOpenSettings?: () => void; onOpenCode?: () => void; onRemove?: () => void;
}) {
  return (
    <IndicatorRow
      name={name} fullName={name} args={inputs.join(" ")}
      values={plots.filter(p => p.lastValue !== null && !isNaN(p.lastValue)).map(p => ({ text: format(p.lastValue as number), color: p.color }))}
      status={status} background={background} isVisible={isVisible}
      onToggleVisibility={onToggleVisibility} onOpenSettings={onOpenSettings} onOpenCode={onOpenCode} onRemove={onRemove}
    />
  );
}


function TimezoneMenu({ theme, selected, onSelect, onClose }: {
  theme: string; selected: string; onSelect: (tz: string) => void; onClose: () => void;
}) {
  useEscapeClose(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(target) && !target.closest?.('[data-timezone-toggle]')) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const isDark = theme === "dark";
  const bg = isDark ? "#1e222d" : "#ffffff";
  const text = isDark ? "#d1d4dc" : "#131722";
  const border = isDark ? "#2a2e39" : "#e0e3eb";
  const hoverBg = isDark ? "#2a2e39" : "#f0f3fa";

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", top: "8px", bottom: "30px", right: "8px",
        width: "230px", overflowY: "auto",
        backgroundColor: bg, color: text, border: `1px solid ${border}`,
        borderRadius: "6px", boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        zIndex: 1000, padding: "6px 0", fontSize: "13px",
      }}
    >
      {TIMEZONES.map((item) => {
        const isSelected = item.tz === selected;
        return (
          <div
            key={item.label}
            onClick={() => onSelect(item.tz)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "6px 12px", cursor: "pointer",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            <span style={{ width: "14px", display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>
              {isSelected && <Check size={13} />}
            </span>
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function PriceScaleMenu({
  theme, anchor, ratioText, dailyOrMore,
  psAutoScale, setPsAutoScale, psLockRatio, setPsLockRatio, psScaleOnly, setPsScaleOnly,
  psInvert, setPsInvert, psMode, setPsMode, psScaleLeft, setPsScaleLeft, psPlusButton, setPsPlusButton,
  labelSettings, setLabelSettings, lineSettings, setLineSettings,
  onClose, onMoreSettings,
}: any) {
  const toggleLabel = (key: string) => setLabelSettings((s: any) => ({ ...s, [key]: !s[key] }));
  const toggleLine = (key: string) => setLineSettings((s: any) => ({ ...s, [key]: !s[key] }));
  // TradingView's price scale menu (the gear under the price scale); checkable rows stay open
  const items: TvMenuItem[] = [
    { label: "Auto (fits data to screen)", checked: !!psAutoScale, keepOpen: true, onClick: () => setPsAutoScale(!psAutoScale) },
    { label: "Lock price to bar ratio", checked: !!psLockRatio, shortcut: ratioText, keepOpen: true, onClick: () => setPsLockRatio(!psLockRatio) },
    { label: "Scale price chart only", checked: !!psScaleOnly, keepOpen: true, onClick: () => setPsScaleOnly(!psScaleOnly) },
    { label: "Invert scale", checked: !!psInvert, shortcut: "Alt + I", keepOpen: true, onClick: () => setPsInvert(!psInvert) },
    { kind: "divider" },
    { label: "Regular", checked: psMode === PriceScaleMode.Normal, keepOpen: true, onClick: () => setPsMode(PriceScaleMode.Normal) },
    { label: "Percent", checked: psMode === PriceScaleMode.Percentage, shortcut: "Alt + P", keepOpen: true, onClick: () => setPsMode(PriceScaleMode.Percentage) },
    { label: "Indexed to 100", checked: psMode === PriceScaleMode.IndexedTo100, keepOpen: true, onClick: () => setPsMode(PriceScaleMode.IndexedTo100) },
    { label: "Logarithmic", checked: psMode === PriceScaleMode.Logarithmic, shortcut: "Alt + L", keepOpen: true, onClick: () => setPsMode(PriceScaleMode.Logarithmic) },
    { kind: "divider" },
    { label: "Move scale to left", checked: !!psScaleLeft, keepOpen: true, onClick: () => setPsScaleLeft(!psScaleLeft) },
    { kind: "divider" },
    { label: "Labels", testId: "ps-labels", submenu: [
      { label: "Symbol name label", checked: !!labelSettings.symbolName, keepOpen: true, onClick: () => toggleLabel('symbolName') },
      { label: "Symbol last price label", checked: !!labelSettings.lastPrice, keepOpen: true, onClick: () => toggleLabel('lastPrice') },
      { label: "Symbol previous day close price label", checked: !dailyOrMore && !!labelSettings.prevClose, disabled: dailyOrMore, keepOpen: true, onClick: () => toggleLabel('prevClose') },
      { label: "Pre/post/night market price label", checked: false, disabled: true },
      { label: "High and low price labels", checked: !!labelSettings.highLow, keepOpen: true, onClick: () => toggleLabel('highLow') },
      { label: "Bid and ask labels", checked: !!labelSettings.bidAsk, keepOpen: true, onClick: () => toggleLabel('bidAsk') },
      { label: "Indicators and financials name labels", checked: !!labelSettings.indicatorName, keepOpen: true, onClick: () => toggleLabel('indicatorName') },
      { label: "Indicators and financials value labels", checked: !!labelSettings.indicatorValue, keepOpen: true, onClick: () => toggleLabel('indicatorValue') },
      { label: "Countdown to bar close", checked: !!labelSettings.countdown, keepOpen: true, onClick: () => toggleLabel('countdown') },
      { kind: "divider" },
      { label: "No overlapping labels", checked: !!labelSettings.noOverlap, keepOpen: true, onClick: () => toggleLabel('noOverlap') },
    ] },
    { label: "Lines", testId: "ps-lines", submenu: [
      { label: "Price line", checked: !!lineSettings.priceLine, keepOpen: true, onClick: () => toggleLine('priceLine') },
      { label: "Previous day close price line", checked: !dailyOrMore && !!lineSettings.prevClose, disabled: dailyOrMore, keepOpen: true, onClick: () => toggleLine('prevClose') },
      { label: "Pre/post/night market price line", checked: false, disabled: true },
      { label: "High and low price lines", checked: !!lineSettings.highLow, keepOpen: true, onClick: () => toggleLine('highLow') },
      { label: "Bid and ask lines", checked: !!lineSettings.bidAsk, keepOpen: true, onClick: () => toggleLine('bidAsk') },
    ] },
    { label: "Plus button", checked: !!psPlusButton, keepOpen: true, onClick: () => setPsPlusButton(!psPlusButton) },
    { kind: "divider" },
    { label: "More settings…", icon: <MenuSettingsIcon />, onClick: onMoreSettings },
  ];
  return <TvMenu items={items} position={{ above: anchor }} isDark={theme === "dark"} onClose={onClose} ariaLabel="Price scale" testId="price-scale-menu" />;
}

// The vertical cursor line locked at a bar's time ("Lock vertical cursor line by time"), with
// its time label on the time axis, drawn like the crosshair's
function LockedCursorLine({ chart, time, theme, tz }: { chart: any; time: number; theme: string; tz: string }) {
  useChartTick(chart);
  const x = chart.timeScale().timeToCoordinate(time as any);
  if (x === null || x === undefined) return null;
  const axisH = chart.timeScale().height();
  const dark = theme === "dark";
  return (
    <>
      <div aria-hidden data-testid="locked-cursor-line" style={{ position: "absolute", top: 0, bottom: axisH, left: Math.round(x), width: 0, borderLeft: `1px dashed ${dark ? "#758696" : "#9598a1"}`, pointerEvents: "none", zIndex: 5 }} />
      <div aria-hidden style={{ position: "absolute", bottom: 0, height: axisH, left: Math.round(x), transform: "translateX(-50%)", display: "flex", alignItems: "center", padding: "0 6px", background: dark ? "#363a45" : "#131722", color: "#ffffff", fontSize: 12, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 6 }}>
        {formatCrosshairTime(time, tz)}
      </div>
    </>
  );
}

// TradingView's right-click menu on the chart
function ChartContextMenu({ pos, price, precision = 3, symbol, theme, onClose, viewChanged, onReset, drawingCount, indicatorCount, onRemoveDrawings, onRemoveIndicators, onSettings, onAddAlert, onCopyPrice, onPaste, canPaste, onQuickOrder, onAddOrder, quickQty, buyType, sellType, cursorLocked, onToggleCursorLock, onTableView, onObjectTree }: any) {
  const p = price !== null ? price.toFixed(precision) : "0";
  // The limit order comes first, with its shortcut (a buy below the market, a sell above it)
  const buy: TvMenuItem = { label: `Buy ${quickQty} ${symbol} @ ${p} ${buyType}`, icon: <MenuBuyIcon />, shortcut: buyType === 'limit' ? "Alt + Shift + B" : undefined, onClick: () => onQuickOrder('buy', buyType) };
  const sell: TvMenuItem = { label: `Sell ${quickQty} ${symbol} @ ${p} ${sellType}`, icon: <MenuSellIcon />, shortcut: sellType === 'limit' ? "Alt + Shift + S" : undefined, onClick: () => onQuickOrder('sell', sellType) };
  const removals: TvMenuItem[] = [
    ...(drawingCount > 0 ? [{ label: "Remove drawings", onClick: onRemoveDrawings } as TvMenuItem] : []),
    ...(indicatorCount > 0 ? [{ label: `Remove ${indicatorCount} indicator${indicatorCount === 1 ? "" : "s"}`, onClick: onRemoveIndicators } as TvMenuItem] : []),
  ];
  const items: TvMenuItem[] = [
    ...(viewChanged ? [{ label: "Reset chart view", icon: <MenuResetIcon />, shortcut: "Alt + R", onClick: onReset } as TvMenuItem, { kind: "divider" } as TvMenuItem] : []),
    { label: `Copy price ${p}`, onClick: () => onCopyPrice(p) },
    { label: "Paste", shortcut: "Ctrl + V", disabled: !canPaste, onClick: onPaste },
    { kind: "divider" },
    { label: `Add alert on ${symbol} at ${p}…`, icon: <MenuAlertIcon />, shortcut: "Alt + A", onClick: onAddAlert },
    ...(buyType === 'limit' ? [buy, sell] : [sell, buy]),
    { label: `Add order on ${symbol} at ${p}…`, icon: <MenuAddOrderIcon />, shortcut: "Shift + T", onClick: onAddOrder },
    { kind: "divider" },
    { label: cursorLocked ? "Unlock vertical cursor line" : "Lock vertical cursor line by time", onClick: onToggleCursorLock },
    { kind: "divider" },
    { label: "Table view", onClick: onTableView },
    { label: "Object tree", onClick: onObjectTree },
    ...(removals.length ? [{ kind: "divider" } as TvMenuItem, ...removals] : []),
    { kind: "divider" },
    { label: "Settings…", icon: <MenuSettingsIcon />, onClick: onSettings },
  ];
  return <TvMenu items={items} position={pos} isDark={theme === "dark"} onClose={onClose} ariaLabel="Chart" testId="chart-context-menu" />;
}
