"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { createChart, ColorType, ISeriesApi, IChartApi, CandlestickSeries, HistogramSeries, LineSeries, PriceScaleMode, TickMarkType } from "lightweight-charts";
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
import { ToolButton } from "./LeftToolbar";
import { useAuth } from "@/context/AuthContext";
import { MultiSelectSubBar } from "./drawing/ui/MultiSelectSubBar";
import { TVSettingsIcon } from "./icons/TVIcons";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAlerts } from "@/context/AlertsContext";
import { usePaperTrading } from "@/context/PaperTradingContext";
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
const CACHE_PREFIX = 'tv_data_';
const CACHE_TTL_LIVE = 5 * 60 * 1000;      // 5 min for today's data
const CACHE_TTL_HISTORICAL = 7 * 24 * 60 * 60 * 1000; // 7 days for historical
const CACHE_MAX_ENTRIES = 200;              // Max entries before eviction

function getCacheKey(symbol: string, interval: string, endDate?: string, startDate?: string): string {
  return `${CACHE_PREFIX}${symbol}|${interval}|${endDate || 'latest'}|${startDate || ''}`;
}

function isToday(dateStr?: string): boolean {
  if (!dateStr) return true; // "latest" is always today
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

function getCachedData(key: string, endDate?: string): any[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    const age = Date.now() - ts;
    const ttl = isToday(endDate) ? CACHE_TTL_LIVE : CACHE_TTL_HISTORICAL;
    if (age > ttl) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedData(key: string, data: any[]): void {
  try {
    // Evict oldest entries if approaching limit
    const allKeys: { key: string; ts: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        try {
          const { ts } = JSON.parse(localStorage.getItem(k) || '{}');
          allKeys.push({ key: k, ts: ts || 0 });
        } catch { allKeys.push({ key: k, ts: 0 }); }
      }
    }
    if (allKeys.length >= CACHE_MAX_ENTRIES) {
      allKeys.sort((a, b) => a.ts - b.ts);
      const toRemove = allKeys.slice(0, Math.floor(CACHE_MAX_ENTRIES * 0.3));
      toRemove.forEach(e => localStorage.removeItem(e.key));
    }
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (e) {
    // Storage full — clear oldest cache entries and retry once
    console.warn('[Cache] localStorage full, evicting old entries');
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
    try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
  }
}

async function fetchStockData(symbol: string = 'AAPL', interval: string = '1min', endDate?: string, lastPrice?: number, startDate?: string) {
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
    
    if (data.error && data.error.toLowerCase().includes('limit')) {
      throw new Error('API_LIMIT');
    }
    
    if (data.error) return [];
    if (!data.values || !Array.isArray(data.values)) return [];
    const result = data.values.map((item: any) => ({
      time: new Date(item.datetime).getTime() / 1000,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close)
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
  const { setCurrentPrice, positions, orders, history } = usePaperTrading();

  // Keep track of active price lines so we can remove them when they update or close
  const priceLinesRef = useRef<any[]>([]);

  // Sync symbol with DrawingContext
  useEffect(() => {
    setDrawingSymbol(symbol);
  }, [symbol, setDrawingSymbol]);

  const [chart, setChart] = useState<IChartApi | null>(null);
  const [series, setSeries] = useState<any>(null);
  const tradeMarkersRef = useRef<any[]>([]);
  const pineMarkersRef = useRef<any[]>([]);
  const pineSeriesRef = useRef<Record<number, ISeriesApi<"Line">>>({});
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [apiLimitReached, setApiLimitReached] = useState(false);
  const [lastPriceData, setLastPriceData] = useState<{ price: number; prevPrice: number } | null>(null);
  const [hoveredBarData, setHoveredBarData] = useState<any>(null);
  // vertical line state in select mode
  const [vLineX, setVLineX] = useState<number | null>(null);
  const [vLineTime, setVLineTime] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, price: number | null, visible: boolean } | null>(null);
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  useEffect(() => {
    if (triggerSettings && triggerSettings > 0) {
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
  const [countdownText, setCountdownText] = useState('');

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

  // Ticking "time until bar close" badge shown next to the symbol legend
  useEffect(() => {
    if (!labelSettings.countdown) { setCountdownText(''); return; }
    const tick = () => {
      const data = fullDataRef.current;
      if (!data || data.length === 0) { setCountdownText(''); return; }
      const last = data[data.length - 1];
      const barMs = getIntervalMs(intervalRef.current);
      const barEndSec = last.time + Math.floor(barMs / 1000);
      const remain = barEndSec - Math.floor(Date.now() / 1000);
      if (remain <= 0) { setCountdownText('0:00'); return; }
      const h = Math.floor(remain / 3600);
      const m = Math.floor((remain % 3600) / 60);
      const s = remain % 60;
      setCountdownText(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [labelSettings.countdown]);

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
    crosshair: "#9598a1",
    text: theme === "dark" ? "#d1d4dc" : "#131722",
    lines: theme === "dark" ? "#e0e3eb" : "#e0e3eb"
  });
  const canvasColorsRef = useRef(canvasColors);
  useEffect(() => { canvasColorsRef.current = canvasColors; }, [canvasColors]);

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
              setCandleColors(data.candleColors);
              if (chartRef.current && seriesRef.current) {
                // Not using seriesRef directly for applyOptions later, wait, series might be undefined here. 
                // We'll let the standard React state flow handle updating, but lightweight charts isn't reactive.
                // It's safer to just let the standard update happen in a separate useEffect if needed, or apply directly here:
              }
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

  // Sync loaded settings to chart if chart is already ready
  useEffect(() => {
    if (chartRef.current && series) {
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
  useEffect(() => {
    // Clean up chart lines
    priceLinesRef.current.forEach(line => {
      if (series) {
        try { series.removePriceLine(line); } catch (e) {}
      }
    });
    priceLinesRef.current = [];

    // Draw active positions
    if (series) {
      positions.forEach(p => {
        if (p.symbol === symbol) {
          // Main position line
          const posLine = series.createPriceLine({
            price: p.avgFillPrice,
            color: p.side === 'buy' ? '#2962ff' : '#f23645',
            lineWidth: 1,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: `${p.quantity}${p.side === 'buy' ? 'L' : 'S'}  ${p.unrealizedPnL > 0 ? '+' : ''}${p.unrealizedPnL.toFixed(2)} USD`,
          });
          priceLinesRef.current.push(posLine);

          // Take profit line
          if (p.takeProfit) {
            const tpLine = series.createPriceLine({
              price: p.takeProfit,
              color: '#089981', // Green for TP
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `TP ${p.quantity}`,
            });
            priceLinesRef.current.push(tpLine);
          }

          // Stop loss line
          if (p.stopLoss) {
            const slLine = series.createPriceLine({
              price: p.stopLoss,
              color: '#f2a900', // Orange for SL
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `SL ${p.quantity}`,
            });
            priceLinesRef.current.push(slLine);
          }
        }
      });
      
      // Draw pending orders (Limit/Stop)
      orders.filter(o => o.status === 'Working' && o.symbol === symbol).forEach(o => {
        const orderLine = series.createPriceLine({
          price: o.price,
          color: o.side === 'buy' ? '#2962ff' : '#f23645',
          lineWidth: 1,
          lineStyle: 3, // Dotted
          axisLabelVisible: true,
          title: `${o.type} ${o.side.toUpperCase()} ${o.quantity}`,
        });
        priceLinesRef.current.push(orderLine);
      });
    }

    return () => {
      // Don't unmount chart here, just wait for next dependency change
    };
  }, [series, symbol, positions, orders]);

  // Sync Trade Execution Markers
  useEffect(() => {
    if (series && history) {
      const markers = history
        .filter(h => h.symbol === symbol)
        .map(h => {
          const isBuy = h.action === 'Buy';
          // lightweight-charts needs time in seconds
          return {
            time: Math.floor(h.time / 1000) as any, // type cast for Time
            position: isBuy ? 'belowBar' : 'aboveBar',
            color: isBuy ? '#2962ff' : '#f23645',
            shape: isBuy ? 'arrowUp' : 'arrowDown',
            text: h.action,
            size: 1,
          };
        });

      tradeMarkersRef.current = markers;
      applyAllMarkers();
    }
  }, [series, symbol, history]);

  // Merges trade-execution markers with any markers produced by a running Pine
  // script, since both share the single candle series' marker list.
  function applyAllMarkers() {
    if (!series || typeof (series as any).setMarkers !== 'function') return;
    const merged = [...tradeMarkersRef.current, ...pineMarkersRef.current].sort((a, b) => a.time - b.time);
    try {
      (series as any).setMarkers(merged);
    } catch (e) {
      // sometimes setMarkers fails if time is perfectly between bars in strict modes, ignore for clone
    }
  }

  // Runs whenever the Pine Editor's "Add to chart" is clicked, or the script is
  // removed — renders plot() output as line series and strategy/plotshape
  // output as markers on the main candle series.
  useEffect(() => {
    function handleRunPine(e: any) {
      if (!chartRef.current) return;
      Object.values(pineSeriesRef.current).forEach((s) => { try { chartRef.current!.removeSeries(s); } catch { /* ignore */ } });
      pineSeriesRef.current = {};
      const plots = e?.detail?.result?.plots || [];
      plots.forEach((p: any, idx: number) => {
        try {
          const s = chartRef.current!.addSeries(LineSeries, {
            color: p.color,
            lineWidth: 2,
            title: p.title,
            crosshairMarkerVisible: true,
          });
          s.setData(p.values);
          pineSeriesRef.current[idx] = s;
        } catch { /* ignore */ }
      });
      pineMarkersRef.current = e?.detail?.result?.markers || [];
      applyAllMarkers();
    }
    function handleClearPine() {
      if (!chartRef.current) return;
      Object.values(pineSeriesRef.current).forEach((s) => { try { chartRef.current!.removeSeries(s); } catch { /* ignore */ } });
      pineSeriesRef.current = {};
      pineMarkersRef.current = [];
      applyAllMarkers();
    }
    window.addEventListener('tv:run-pine-script', handleRunPine);
    window.addEventListener('tv:clear-pine-script', handleClearPine);
    return () => {
      window.removeEventListener('tv:run-pine-script', handleRunPine);
      window.removeEventListener('tv:clear-pine-script', handleClearPine);
    };
  }, [series]);

  const [volumeConfig, setVolumeConfig] = useState({ upColor: 'rgba(38, 166, 154, 0.5)', downColor: 'rgba(239, 83, 80, 0.5)', maColor: '#2962ff' });
  const volumeConfigRef = useRef(volumeConfig);
  useEffect(() => { volumeConfigRef.current = volumeConfig; }, [volumeConfig]);

  const [emaConfigs, setEmaConfigs] = useState<Record<string, any>>({});
  const [emaVisibilities, setEmaVisibilities] = useState<Record<string, boolean>>({});
  const emaConfigsRef = useRef(emaConfigs);
  useEffect(() => { emaConfigsRef.current = emaConfigs; }, [emaConfigs]);
  const emaVisibilitiesRef = useRef(emaVisibilities);
  useEffect(() => { emaVisibilitiesRef.current = emaVisibilities; }, [emaVisibilities]);

  const [hoveredEmasData, setHoveredEmasData] = useState<Record<string, any>>({});

  const [sessionConfig, setSessionConfig] = useState(defaultSessionConfig);
  const [sessionSettingsOpen, setSessionSettingsOpen] = useState(false);
  const [sessionVisible, setSessionVisible] = useState(true);

  const activeIndicatorsRef = useRef(activeIndicators);
  useEffect(() => { activeIndicatorsRef.current = activeIndicators; }, [activeIndicators]);

  useEffect(() => {
    volumeConfigRef.current = volumeConfig;
    if (volumeSeriesRef.current && fullDataRef.current.length > 0) {
      const volData = fullDataRef.current.map((d: any) => ({
        time: d.time,
        value: Math.floor((Math.abs(d.close - d.open) + (d.high - d.low)) * 1000) || 100,
        color: d.close >= d.open ? volumeConfig.upColor : volumeConfig.downColor
      }));
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
      const volData = effectiveData.map((d: any) => ({
        time: d.time,
        value: Math.floor((Math.abs(d.close - d.open) + (d.high - d.low)) * 1000) || 100,
        color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
      }));
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
        const volData = data.map(d => ({
          time: d.time,
          value: Math.floor((Math.abs(d.close - d.open) + (d.high - d.low)) * 1000) || 100,
          color: d.close >= d.open ? volumeConfigRef.current.upColor : volumeConfigRef.current.downColor
        }));
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
          crosshairMarkerVisible: false,
          visible: emaVisibilitiesRef.current[ema.id] ?? true
        });
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
  }, [activeIndicators]);

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
      
      setCurrentPrice(price);
      checkAlerts(symbol, price);
    } else {
      document.title = `${symbol} | TradePilot`;
    }
  }, [symbol, lastPriceData, setCurrentPrice, checkAlerts]);

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
          // Resizing can otherwise shift the visible range (e.g. lightweight-charts
          // re-anchoring to the right edge) — pin it back to wherever it was.
          let savedRange = null;
          try { savedRange = chartRef.current.timeScale().getVisibleLogicalRange(); } catch { /* ignore */ }
          chartRef.current.applyOptions({ width: w, height: h });
          if (savedRange) {
            try { chartRef.current.timeScale().setVisibleLogicalRange(savedRange); } catch { /* ignore */ }
          }
        }
      }
    };

    const isDark = theme === "dark";
    const bgColor = isDark ? "#131722" : "#ffffff";
    const textColor = isDark ? "#d1d4dc" : "#131722";
    const gridColor = isDark ? "#1e222d" : "#f0f3fa";

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
      candleSeries.setData(stockData);
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
        const volData = stockData.map((d: any) => ({
          time: d.time,
          value: Math.floor((Math.abs(d.close - d.open) + (d.high - d.low)) * 1000) || 100,
          color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
        }));
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
        if (err.message === 'API_LIMIT') setApiLimitReached(true);
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
              const volData = unique.map((d: any) => ({
                time: d.time,
                value: Math.floor((Math.abs(d.close - d.open) + (d.high - d.low)) * 1000) || 100,
                color: d.close >= d.open ? volumeConfigRef.current.upColor : volumeConfigRef.current.downColor
              }));
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
          if (err.message === 'API_LIMIT') setApiLimitReached(true);
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

    // Expose a goToDate function for the GoToModal calendar
    (window as any).__goToDate = async (dateStr: string, timeStr: string) => {
      const targetTimestamp = new Date(`${dateStr}T${timeStr}`).getTime() / 1000;
      console.log(`[GoToDate] Triggered for ${dateStr} ${timeStr}. Target timestamp: ${targetTimestamp}`);
      const currentData = fullDataRef.current;

      // Check if the target date is already within the loaded data range
      if (currentData.length > 0) {
        const oldestTime = currentData[0].time;
        const newestTime = currentData[currentData.length - 1].time;

        if (targetTimestamp >= oldestTime && targetTimestamp <= newestTime) {
          // Date is already in memory — just scroll to it
          let closestIdx = 0;
          let minDiff = Infinity;
          for (let i = 0; i < currentData.length; i++) {
            const diff = Math.abs(currentData[i].time - targetTimestamp);
            if (diff < minDiff) { minDiff = diff; closestIdx = i; }
          }
          const timeScale = newChart.timeScale();
          const visibleRange = timeScale.getVisibleLogicalRange();
          if (visibleRange) {
            const halfWidth = (visibleRange.to - visibleRange.from) / 2;
            timeScale.setVisibleLogicalRange({ from: closestIdx - halfWidth, to: closestIdx + halfWidth });
          }
          return;
        }
      }

      // Target date is outside loaded range — fetch from API
      isNavigatingRef.current = true; // Block infinite scroll during navigation
      setIsLoading(true);
      setApiLimitReached(false);
      try {
        // Shift the end_date forward by ~2500 bars so the target date is in the middle of the 5000 returned bars
        let halfMs = 2500 * getIntervalMs(interval);
        
        const fetchEndTimestamp = Math.min((targetTimestamp * 1000) + halfMs, Date.now());
        const d = new Date(fetchEndTimestamp);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const fetchEndDateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;

        let stockData = await fetchStockData(symbolRef.current, intervalRef.current, fetchEndDateStr);

        // Deduplicate, sort, filter
        stockData = stockData.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => t.time === v.time) === i);
        stockData.sort((a: any, b: any) => (a.time as number) - (b.time as number));
        stockData = stockData.filter((d: any) => {
          const day = new Date(d.time * 1000).getUTCDay();
          return day !== 0 && day !== 6;
        });

        if (stockData.length > 0) {
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
          candleSeries.setData(stockData);

          // Update volume
          if (volumeSeriesRef.current) {
            const volData = stockData.map((d: any) => ({
              time: d.time,
              value: Math.floor((Math.abs(d.close - d.open) + (d.high - d.low)) * 1000) || 100,
              color: d.close >= d.open ? volumeConfigRef.current.upColor : volumeConfigRef.current.downColor
            }));
            volumeSeriesRef.current.setData(volData);
          }

          // Update EMAs
          updateEmaData(stockData);

          // Find the closest bar to target and center on it
          let closestIdx = 0;
          let minDiff = Infinity;
          for (let i = 0; i < stockData.length; i++) {
            const diff = Math.abs(stockData[i].time - targetTimestamp);
            if (diff < minDiff) { minDiff = diff; closestIdx = i; }
          }

          const timeScale = newChart.timeScale();
          const visibleRange = timeScale.getVisibleLogicalRange();
          if (visibleRange) {
            const halfWidth = (visibleRange.to - visibleRange.from) / 2;
            timeScale.setVisibleLogicalRange({ from: closestIdx - halfWidth, to: closestIdx + halfWidth });
          } else {
            // Fallback: show last 100 bars centered around target
            timeScale.setVisibleLogicalRange({ from: closestIdx - 50, to: closestIdx + 50 });
          }

          if (onChartStateChange) {
            const barSpacing = timeScale.options().barSpacing || 6;
            console.log(`[GoToDate] Manually triggering save for targetTimestamp: ${targetTimestamp}, barSpacing: ${barSpacing}`);
            onChartStateChange(targetTimestamp, barSpacing);
          }

          // Update price display
          if (stockData.length > 1) {
            setLastPriceData({
              price: stockData[stockData.length - 1].close,
              prevPrice: stockData[stockData.length - 2].close
            });
          }
        }
      } catch (err: any) {
        if (err.message === 'API_LIMIT') setApiLimitReached(true);
        console.error('[GoToDate] Failed to fetch historical data:', err);
      } finally {
        setIsLoading(false);
        // Release the guard after a tiny delay — just enough to catch synchronous events
        // from setData/setVisibleLogicalRange, but short enough that user scrolling works immediately
        setTimeout(() => { isNavigatingRef.current = false; }, 50);
      }
    };

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

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      containerEl.removeEventListener('wheel', handlePriceAxisWheel, { capture: true });
      newChart.remove();
      setChart(null); setSeries(null);
    };
  }, [theme]);

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
          
          if (chartRef.current && fullDataRef.current.length > 0) {
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
            if (cached && cached.length > 0) {
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

          series.setData(stockData);
          if (volumeSeriesRef.current) {
            const volData = stockData.map((d: any) => ({
              time: d.time,
              value: Math.floor((Math.abs(d.close - d.open) + (d.high - d.low)) * 1000) || 100,
              color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
            }));
            volumeSeriesRef.current.setData(volData);
          }
          const oldStockData = fullDataRef.current; // Save before overwriting
          fullDataRef.current = stockData;
          (window as any).__chartFullData = stockData;
          
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

          if (targetTimestamp && chartRef.current) {
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
            chartRef.current.timeScale().setVisibleLogicalRange({ from: closestIdx - halfBars, to: closestIdx + halfBars });
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
              stopReplay();
            }
          }
        } catch (err: any) {
          if (err.message === 'API_LIMIT') setApiLimitReached(true);
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
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
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
    setVLineX(x);

    if (chartRef.current && fullDataRef.current.length > 0) {
      const logical = chartRef.current.timeScale().coordinateToLogical(x);
      if (logical !== null) {
        const idx = Math.max(0, Math.min(fullDataRef.current.length - 1, Math.round(logical)));
        setVLineTime(fullDataRef.current[idx].time);
      }
    }
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
    const handleZoomOut = () => {
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
        chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        notifyPriceScaleChanged();
      }
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
        setContextMenu({ x, y, price, visible: true });
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

      {/* Legend & Symbol info */}
      <div style={{ position: "absolute", top: "6px", left: "10px", zIndex: 10, display: "flex", flexDirection: "column", gap: "2px", pointerEvents: "none" }}>
        
        {/* Top Row: Symbol, Interval, Exchange + OHLC */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", fontSize: "12px", fontWeight: 600 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: theme === "dark" ? "#d1d4dc" : "#131722" }}>{symbol}</span>
            <span style={{ color: "var(--tv-color-text-muted)", fontSize: "11px", fontWeight: 400 }}>· {intervalLabel} · TradePilot</span>
          </div>

          {/* OHLC values */}
          {(() => {
            const data = hoveredBarData || (fullDataRef.current.length > 0 ? fullDataRef.current[fullDataRef.current.length - 1] : null);
            if (!data) return null;
            const format = (v: number) => v.toFixed(3);
            const change = data.close - data.open;
            const changePct = (change / data.open) * 100;
            const isUp = data.close >= data.open;
            const cColor = isUp ? "#089981" : "#f23645";
            return (
              <div style={{ display: "flex", gap: "6px", fontWeight: 400, fontSize: "12px", color: "var(--tv-color-text-muted)" }}>
                <span>O<span style={{ color: cColor, marginLeft: 2 }}>{format(data.open)}</span></span>
                <span>H<span style={{ color: cColor, marginLeft: 2 }}>{format(data.high)}</span></span>
                <span>L<span style={{ color: cColor, marginLeft: 2 }}>{format(data.low)}</span></span>
                <span>C<span style={{ color: cColor, marginLeft: 2 }}>{format(data.close)}</span></span>
                <span style={{ color: cColor, marginLeft: 4 }}>
                  {change > 0 ? '+' : ''}{format(change)} ({change > 0 ? '+' : ''}{changePct.toFixed(2)}%)
                </span>
                {countdownText && (
                  <span style={{ color: "var(--tv-color-text-muted)", marginLeft: 4 }}>{countdownText}</span>
                )}
              </div>
            );
          })()}
        </div>

        {/* Buy / Sell Buttons Row */}
        {(() => {
          const data = hoveredBarData || (fullDataRef.current.length > 0 ? fullDataRef.current[fullDataRef.current.length - 1] : null);
          if (!data) return null;
          
          // Generate realistic looking bid/ask based on the current close price
          const price = data.close;
          const isDark = theme === "dark";
          const sellPriceStr = (price - 0.60).toFixed(2);
          const buyPriceStr = (price + 0.60).toFixed(2);
          const spread = "120.0";

          const btnStyle: React.CSSProperties = {
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "2px 12px", borderRadius: "4px", 
            backgroundColor: isDark ? "rgba(0,0,0,0.2)" : "#ffffff",
            border: "1px solid", pointerEvents: "auto", cursor: "pointer",
            minWidth: "72px", height: "34px", fontFamily: "inherit"
          };

          return (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "2px 0 4px 0" }}>
              <button 
                className="tv-buy-sell-btn"
                style={{ ...btnStyle, borderColor: "rgba(242, 54, 69, 0.5)", color: "#f23645" }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? "rgba(242, 54, 69, 0.1)" : "rgba(242, 54, 69, 0.05)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isDark ? "rgba(0,0,0,0.2)" : "#ffffff"}
                onClick={() => onOpenOrderPanel?.("sell")}
              >
                <div style={{ fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "flex-start", lineHeight: "1" }}>
                  {sellPriceStr}
                  <span style={{ fontSize: "9px", marginTop: "1px", marginLeft: "1px" }}>0</span>
                </div>
                <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.5px", marginTop: "2px" }}>SELL</div>
              </button>
              
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)" }}>{spread}</span>
              
              <button 
                className="tv-buy-sell-btn"
                style={{ ...btnStyle, borderColor: "rgba(41, 98, 255, 0.5)", color: "#2962ff" }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? "rgba(41, 98, 255, 0.1)" : "rgba(41, 98, 255, 0.05)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isDark ? "rgba(0,0,0,0.2)" : "#ffffff"}
                onClick={() => onOpenOrderPanel?.("buy")}
              >
                <div style={{ fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "flex-start", lineHeight: "1" }}>
                  {buyPriceStr}
                  <span style={{ fontSize: "9px", marginTop: "1px", marginLeft: "1px" }}>0</span>
                </div>
                <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.5px", marginTop: "2px" }}>BUY</div>
              </button>
            </div>
          );
        })()}

        {/* Indicators Rows */}
        {activeIndicators?.map(ind => {
          if (ind.name === "Volume") {
            return (
              <IndicatorRow 
                key={ind.id}
                name="Vol" title="Volume" 
                value={hoveredBarData ? Math.floor((Math.abs(hoveredBarData.close - hoveredBarData.open) + (hoveredBarData.high - hoveredBarData.low)) * 1000) : ''} 
                theme={theme} 
                isVisible={volumeVisible}
                onToggleVisibility={() => setVolumeVisible(!volumeVisible)}
                onOpenSettings={() => setShowVolumeSettings(true)}
                onRemove={() => onRemoveIndicator?.(ind.id)}
              />
            );
          }
          if (ind.name === "Moving Average Exponential") {
            const config = emaConfigs[ind.id] || { length: 9, source: 'Close', color: '#2962ff' };
            const isVis = emaVisibilities[ind.id] ?? true;
            const hData = hoveredEmasData[ind.id];
            return (
              <IndicatorRow 
                key={ind.id}
                name="EMA" title={`EMA ${config.length} ${config.source.toLowerCase()}`} 
                value={hData ? hData.value.toFixed(3) : ''} 
                theme={theme} 
                color={config.color}
                isVisible={isVis}
                onToggleVisibility={() => setEmaVisibilities(prev => ({...prev, [ind.id]: !isVis}))}
                onOpenSettings={() => setShowEmaSettingsFor(ind.id)}
                onRemove={() => onRemoveIndicator?.(ind.id)}
              />
            );
          }
          if (ind.name === "FXN - Asian Session Range") {
            return (
              <IndicatorRow 
                key={ind.id} 
                name="FXN" 
                title="FXN - Asian Session Range" 
                value="" 
                theme={theme} 
                isVisible={sessionVisible}
                onToggleVisibility={() => setSessionVisible(!sessionVisible)}
                onOpenSettings={() => setSessionSettingsOpen(true)}
                onRemove={() => onRemoveIndicator?.(ind.id)} 
              />
            );
          }
          return null;
        })}

      </div>

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
              <div style={{ color: '#f23645', marginBottom: '8px', fontSize: '16px' }}>API Limit Reached</div>
              <div style={{ color: 'var(--tv-color-text-muted)' }}>Waiting for TwelveData limit to reset...</div>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite", color: "#f23645", margin: "16px auto 0", display: "block" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
              </svg>
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
                backgroundColor: "rgba(240,243,250,0.55)",
                pointerEvents: "none",
              }} />
              {/* The vertical line itself */}
              <div style={{
                position: "absolute",
                top: 0, bottom: 0,
                left: vLineX,
                width: "1px",
                backgroundColor: "#131722",
                pointerEvents: "none",
              }} />
              {/* Scissors icon near cursor */}
              <div style={{
                position: "absolute",
                left: vLineX + 8,
                top: "20px",
                pointerEvents: "none",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  backgroundColor: "#131722",
                  color: "#ffffff",
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
          <SubBar />
          <MultiSelectSubBar />
        </>
      )}

      {/* Replay controls bar */}
      <ReplayBar intervalLabel={intervalLabel} />

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
          x={contextMenu.x}
          y={contextMenu.y}
          price={contextMenu.price}
          symbol={symbol}
          theme={theme}
          onClose={() => setContextMenu(null)}
          onReset={() => {
            if (chartRef.current) {
              chartRef.current.timeScale().fitContent();
              chartRef.current.priceScale('right').applyOptions({ autoScale: true });
              notifyPriceScaleChanged();
            }
            setContextMenu(null);
          }}
          onRemoveDrawings={() => {
            setDrawings([]);
            setContextMenu(null);
          }}
          onSettings={() => {
            setShowChartSettings(true);
            setContextMenu(null);
          }}
          onSaveTemplate={() => {
            setShowSaveTemplate(true);
            setContextMenu(null);
          }}
          onAddAlert={() => {
            setShowAlertModal(true);
            setContextMenu(null);
          }}
          templates={savedTemplates}
          onApplyTemplate={(t: any) => {
            if (t.settings?.candleColors) setCandleColors(t.settings.candleColors);
            if (t.settings?.canvasColors) setCanvasColors(t.settings.canvasColors);
            setContextMenu(null);
          }}
        />
      )}

      {showChartSettings && (
        <ChartSettingsModal 
          theme={theme} 
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

      {/* Timezone selector — bottom-left corner of the chart pane */}
      <button
        title="Change the time zone"
        data-timezone-toggle
        onClick={() => { setShowPriceScaleMenu(false); setShowTimezoneMenu(v => !v); }}
        style={{
          position: "absolute", bottom: "4px", left: "6px",
          height: "18px", padding: "0 4px", borderRadius: "3px",
          background: showTimezoneMenu ? "var(--tv-color-hover-bg, rgba(135,141,157,0.15))" : "none",
          border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 40,
          color: "var(--tv-color-text-muted)", fontSize: "11px",
        }}
      >
        UTC
      </button>
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
        onClick={() => { setShowTimezoneMenu(false); setShowPriceScaleMenu(v => !v); setPriceScaleSubmenu(null); }}
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
        <SettingsIcon size={14} />
      </button>
      {showPriceScaleMenu && (
        <PriceScaleMenu
          theme={theme}
          submenu={priceScaleSubmenu}
          setSubmenu={setPriceScaleSubmenu}
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

function IndicatorRow({ 
  name, title, value, theme, color = "#d1d4dc",
  isVisible = true, onToggleVisibility, onOpenSettings, onRemove
}: { 
  name: string, title: string, value: any, theme: string, color?: string,
  isVisible?: boolean, onToggleVisibility?: () => void, onOpenSettings?: () => void, onRemove?: () => void
}) {
  const [hovered, setHovered] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const textColor = theme === "dark" ? "#d1d4dc" : "#131722";
  const iconColor = theme === "dark" ? "#787b86" : "#787b86";

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  return (
    <div 
      style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", pointerEvents: "auto", padding: "2px 0", borderRadius: "4px" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontWeight: 600, color: textColor }}>{name === "Vol" ? "Vol · Ticks" : title}</span>
      <span style={{ color, marginLeft: "4px" }}>{value}</span>

      {(hovered || showDropdown) && (
        <div style={{ display: "flex", gap: "6px", marginLeft: "8px" }}>
          <div onClick={onToggleVisibility} style={{ display: 'flex', alignItems: 'center' }}>
            {isVisible ? (
              <Eye size={16} color={iconColor} style={{ cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = iconColor} />
            ) : (
              <EyeOff size={16} color={iconColor} style={{ cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = iconColor} />
            )}
          </div>
          <TVSettingsIcon size={16} color={iconColor} style={{ cursor: "pointer" }} onMouseEnter={(e: any) => e.currentTarget.style.color = textColor} onMouseLeave={(e: any) => e.currentTarget.style.color = iconColor} onClick={onOpenSettings} />
          <Trash2 size={16} color={iconColor} style={{ cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = iconColor} onClick={onRemove} />
          <MoreHorizontal 
            size={16} color={iconColor} style={{ cursor: "pointer" }} 
            onMouseEnter={e => e.currentTarget.style.color = textColor} 
            onMouseLeave={e => e.currentTarget.style.color = iconColor} 
            onClick={() => setShowDropdown(!showDropdown)}
          />
        </div>
      )}

      {/* Dropdown Menu */}
      {showDropdown && (
        <div 
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "100%",
            left: "80px", // offset slightly to align with the icons
            backgroundColor: theme === "dark" ? "#1e222d" : "#ffffff",
            border: `1px solid ${theme === "dark" ? "#2a2e39" : "#e0e3eb"}`,
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            minWidth: "260px",
            padding: "6px 0",
            pointerEvents: "auto",
          }}
        >
          <DropdownItem icon={<Clock size={16} />} text={`Add alert on ${name === "Vol" ? "Vol · Ticks" : title}...`} shortcut="Alt + A" theme={theme} onClick={() => setShowDropdown(false)} />
          <DropdownItem icon={<Star size={16} />} text="Add this indicator to favorites" theme={theme} onClick={() => setShowDropdown(false)} />
          <div style={{ height: "1px", backgroundColor: theme === "dark" ? "#2a2e39" : "#e0e3eb", margin: "4px 0" }} />
          <DropdownItem icon={<Copy size={16} />} text="Copy" shortcut="Ctrl + C" theme={theme} onClick={() => setShowDropdown(false)} />
          <DropdownItem 
            icon={isVisible ? <EyeOff size={16} /> : <Eye size={16} />} 
            text={isVisible ? "Hide" : "Show"} 
            theme={theme} 
            onClick={() => { onToggleVisibility?.(); setShowDropdown(false); }} 
          />
          <DropdownItem icon={<Trash2 size={16} />} text="Remove" shortcut="Del" theme={theme} onClick={() => { onRemove?.(); setShowDropdown(false); }} />
          <div style={{ height: "1px", backgroundColor: theme === "dark" ? "#2a2e39" : "#e0e3eb", margin: "4px 0" }} />
          <DropdownItem icon={<TVSettingsIcon size={16} />} text="Settings..." theme={theme} onClick={() => { onOpenSettings?.(); setShowDropdown(false); }} />
        </div>
      )}
    </div>
  );
}

function DropdownItem({ icon, text, shortcut, theme, onClick }: any) {
  const [hovered, setHovered] = useState(false);
  const textColor = theme === "dark" ? "#d1d4dc" : "#131722";
  const iconColor = theme === "dark" ? "#787b86" : "#787b86";
  const bgHover = theme === "dark" ? "#2a2e39" : "#f0f3fa";
  
  return (
    <div 
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", cursor: "pointer", backgroundColor: hovered ? bgHover : "transparent",
        color: textColor, fontSize: "13px"
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
        <span style={{ color: iconColor, display: "flex", width: "16px", justifyContent: "center" }}>{icon}</span>
        <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>{text}</span>
      </div>
      {shortcut && <span style={{ color: iconColor, fontSize: "12px", opacity: 0.7, marginLeft: "16px" }}>{shortcut}</span>}
    </div>
  );
}

function TimezoneMenu({ theme, selected, onSelect, onClose }: {
  theme: string; selected: string; onSelect: (tz: string) => void; onClose: () => void;
}) {
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

function PriceScaleMenuRow({ label, checked, disabled, shortcut, hasSubmenu, icon, onClick, theme }: {
  label: string; checked?: boolean; disabled?: boolean; shortcut?: string; hasSubmenu?: boolean; icon?: React.ReactNode; onClick?: () => void; theme: string;
}) {
  const [hovered, setHovered] = useState(false);
  const isDark = theme === "dark";
  const text = disabled ? "var(--tv-color-text-muted)" : (isDark ? "#d1d4dc" : "#131722");
  const hoverBg = isDark ? "#2a2e39" : "#f0f3fa";
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "7px 12px", cursor: disabled ? "default" : "pointer",
        backgroundColor: hovered ? hoverBg : "transparent",
        color: text, fontSize: "13px", whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: "14px", display: "inline-flex", justifyContent: "center", flexShrink: 0, color: "var(--tv-color-text-muted)" }}>
        {icon || (checked && <Check size={13} />)}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && <span style={{ color: "var(--tv-color-text-muted)", fontSize: "11px", marginLeft: "16px" }}>{shortcut}</span>}
      {hasSubmenu && <ChevronRight size={14} style={{ color: "var(--tv-color-text-muted)", marginLeft: "16px" }} />}
    </div>
  );
}

function PriceScaleMenuDivider({ theme }: { theme: string }) {
  return <div style={{ height: "1px", backgroundColor: theme === "dark" ? "#2a2e39" : "#e0e3eb", margin: "4px 0" }} />;
}

function PriceScaleMenu({
  theme, submenu, setSubmenu,
  psAutoScale, setPsAutoScale, psLockRatio, setPsLockRatio, psScaleOnly, setPsScaleOnly,
  psInvert, setPsInvert, psMode, setPsMode, psScaleLeft, setPsScaleLeft, psPlusButton, setPsPlusButton,
  labelSettings, setLabelSettings, lineSettings, setLineSettings,
  onClose, onMoreSettings,
}: any) {
  const ref = useRef<HTMLDivElement>(null);
  const labelsAnchorRef = useRef<HTMLDivElement>(null);
  const linesAnchorRef = useRef<HTMLDivElement>(null);
  const [submenuPos, setSubmenuPos] = useState<{ right: number; bottom: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        ref.current && !ref.current.contains(target) &&
        !target.closest?.('[data-price-scale-submenu]') &&
        !target.closest?.('[data-price-scale-toggle]')
      ) {
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

  const toggleLabel = (key: string) => setLabelSettings((s: any) => ({ ...s, [key]: !s[key] }));
  const toggleLine = (key: string) => setLineSettings((s: any) => ({ ...s, [key]: !s[key] }));

  const toggleSubmenu = (name: 'labels' | 'lines', anchorRef: React.RefObject<HTMLDivElement>) => {
    if (submenu === name) { setSubmenu(null); return; }
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setSubmenuPos({ right: window.innerWidth - rect.left + 2, bottom: window.innerHeight - rect.bottom - 6 });
    setSubmenu(name);
  };

  const submenuBoxStyle = (width: number): React.CSSProperties => ({
    position: "fixed", right: submenuPos?.right ?? 0, bottom: submenuPos?.bottom ?? 0, zIndex: 3000,
    width, maxHeight: "80vh", overflowY: "auto", backgroundColor: bg, color: text,
    border: `1px solid ${border}`, borderRadius: "6px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)", padding: "6px 0",
  });

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", bottom: "26px", right: "2px",
        width: "260px", maxHeight: "80vh", overflowY: "auto", backgroundColor: bg, color: text,
        border: `1px solid ${border}`, borderRadius: "6px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)", zIndex: 1000, padding: "6px 0",
      }}
    >
      <PriceScaleMenuRow theme={theme} label="Auto (fits data to screen)" checked={psAutoScale} onClick={() => setPsAutoScale(!psAutoScale)} />
      <PriceScaleMenuRow theme={theme} label="Lock price to bar ratio" checked={psLockRatio} shortcut="0.6633" onClick={() => setPsLockRatio(!psLockRatio)} />
      <PriceScaleMenuRow theme={theme} label="Scale price chart only" checked={psScaleOnly} onClick={() => setPsScaleOnly(!psScaleOnly)} />
      <PriceScaleMenuRow theme={theme} label="Invert scale" checked={psInvert} shortcut="Alt + I" onClick={() => setPsInvert(!psInvert)} />
      <PriceScaleMenuDivider theme={theme} />
      <PriceScaleMenuRow theme={theme} label="Regular" checked={psMode === PriceScaleMode.Normal} onClick={() => setPsMode(PriceScaleMode.Normal)} />
      <PriceScaleMenuRow theme={theme} label="Percent" checked={psMode === PriceScaleMode.Percentage} shortcut="Alt + P" onClick={() => setPsMode(PriceScaleMode.Percentage)} />
      <PriceScaleMenuRow theme={theme} label="Indexed to 100" checked={psMode === PriceScaleMode.IndexedTo100} onClick={() => setPsMode(PriceScaleMode.IndexedTo100)} />
      <PriceScaleMenuRow theme={theme} label="Logarithmic" checked={psMode === PriceScaleMode.Logarithmic} shortcut="Alt + L" onClick={() => setPsMode(PriceScaleMode.Logarithmic)} />
      <PriceScaleMenuDivider theme={theme} />
      <PriceScaleMenuRow theme={theme} label="Move scale to left" checked={psScaleLeft} onClick={() => setPsScaleLeft(!psScaleLeft)} />
      <PriceScaleMenuDivider theme={theme} />
      <div ref={labelsAnchorRef}>
        <PriceScaleMenuRow theme={theme} label="Labels" hasSubmenu onClick={() => toggleSubmenu('labels', labelsAnchorRef)} />
      </div>
      <div ref={linesAnchorRef}>
        <PriceScaleMenuRow theme={theme} label="Lines" hasSubmenu onClick={() => toggleSubmenu('lines', linesAnchorRef)} />
      </div>
      <PriceScaleMenuDivider theme={theme} />
      <PriceScaleMenuRow theme={theme} label="Plus button" checked={psPlusButton} onClick={() => setPsPlusButton(!psPlusButton)} />
      <PriceScaleMenuDivider theme={theme} />
      <PriceScaleMenuRow theme={theme} label="More settings..." icon={<SettingsIcon size={13} />} onClick={onMoreSettings} />

      {submenu === 'labels' && submenuPos && createPortal(
        <div data-price-scale-submenu style={submenuBoxStyle(280)}>
          <PriceScaleMenuRow theme={theme} label="Symbol name label" checked={labelSettings.symbolName} onClick={() => toggleLabel('symbolName')} />
          <PriceScaleMenuRow theme={theme} label="Symbol last price label" checked={labelSettings.lastPrice} onClick={() => toggleLabel('lastPrice')} />
          <PriceScaleMenuRow theme={theme} label="Symbol previous day close price label" checked={labelSettings.prevClose} onClick={() => toggleLabel('prevClose')} />
          <PriceScaleMenuRow theme={theme} label="Pre/post/night market price label" disabled />
          <PriceScaleMenuRow theme={theme} label="High and low price labels" checked={labelSettings.highLow} onClick={() => toggleLabel('highLow')} />
          <PriceScaleMenuRow theme={theme} label="Bid and ask labels" checked={labelSettings.bidAsk} onClick={() => toggleLabel('bidAsk')} />
          <PriceScaleMenuRow theme={theme} label="Indicators and financials name labels" checked={labelSettings.indicatorName} onClick={() => toggleLabel('indicatorName')} />
          <PriceScaleMenuRow theme={theme} label="Indicators and financials value labels" checked={labelSettings.indicatorValue} onClick={() => toggleLabel('indicatorValue')} />
          <PriceScaleMenuRow theme={theme} label="Countdown to bar close" checked={labelSettings.countdown} onClick={() => toggleLabel('countdown')} />
          <PriceScaleMenuRow theme={theme} label="No overlapping labels" checked={labelSettings.noOverlap} onClick={() => toggleLabel('noOverlap')} />
        </div>,
        document.body
      )}
      {submenu === 'lines' && submenuPos && createPortal(
        <div data-price-scale-submenu style={submenuBoxStyle(260)}>
          <PriceScaleMenuRow theme={theme} label="Price line" checked={lineSettings.priceLine} onClick={() => toggleLine('priceLine')} />
          <PriceScaleMenuRow theme={theme} label="Previous day close price line" checked={lineSettings.prevClose} onClick={() => toggleLine('prevClose')} />
          <PriceScaleMenuRow theme={theme} label="Pre/post/night market price line" disabled />
          <PriceScaleMenuRow theme={theme} label="High and low price lines" checked={lineSettings.highLow} onClick={() => toggleLine('highLow')} />
          <PriceScaleMenuRow theme={theme} label="Bid and ask lines" checked={lineSettings.bidAsk} onClick={() => toggleLine('bidAsk')} />
        </div>,
        document.body
      )}
    </div>
  );
}

function ChartContextMenu({ x, y, price, symbol, theme, onClose, onReset, onRemoveDrawings, onSettings, onSaveTemplate, onAddAlert, templates, onApplyTemplate }: any) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const formattedPrice = price !== null ? price.toFixed(3) : "0.000";
  const bg = theme === "dark" ? "#1e222d" : "#ffffff";
  const border = theme === "dark" ? "#2a2e39" : "#e0e3eb";
  const divider = theme === "dark" ? "#2a2e39" : "#e0e3eb";

  // Prevent menu from going off-screen (approximate height/width)
  const menuWidth = 280;
  const menuHeight = 350;
  let finalX = x;
  let finalY = y;
  
  if (typeof window !== 'undefined') {
    if (x + menuWidth > window.innerWidth) finalX = window.innerWidth - menuWidth - 20;
    if (y + menuHeight > window.innerHeight) finalY = window.innerHeight - menuHeight - 20;
  }

  const style: React.CSSProperties = {
    position: "absolute",
    top: `${Math.max(0, finalY)}px`,
    left: `${Math.max(0, finalX)}px`,
    backgroundColor: bg,
    border: `1px solid ${border}`,
    borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: 10000,
    display: "flex",
    flexDirection: "column",
    minWidth: `${menuWidth}px`,
    padding: "6px 0",
  };

  return (
    <div ref={dropdownRef} style={style} onContextMenu={(e) => e.preventDefault()}>
      <DropdownItem icon={<RotateCcw size={16}/>} text="Reset chart view" shortcut="Alt + R" theme={theme} onClick={onReset} />
      <div style={{ height: "1px", backgroundColor: divider, margin: "4px 0" }} />
      
      <DropdownItem icon={null} text={`Copy price ${formattedPrice}`} theme={theme} onClick={onClose} />
      <DropdownItem icon={null} text="Paste" shortcut="Ctrl + V" theme={theme} onClick={onClose} />
      <div style={{ height: "1px", backgroundColor: divider, margin: "4px 0" }} />
      
      <DropdownItem icon={<Clock size={16}/>} text={`Add alert on ${symbol} at ${formattedPrice}...`} shortcut="Alt + A" theme={theme} onClick={onAddAlert} />
      <DropdownItem icon={<ChevronDown size={16}/>} text={`Sell 137 ${symbol} @ ${formattedPrice} limit`} shortcut="Alt + Shift + S" theme={theme} onClick={onClose} />
      <DropdownItem icon={<ChevronUp size={16}/>} text={`Buy 137 ${symbol} @ ${formattedPrice} stop`} theme={theme} onClick={onClose} />
      <DropdownItem icon={<PlusSquare size={16}/>} text={`Add order on ${symbol} at ${formattedPrice}...`} shortcut="Shift + T" theme={theme} onClick={onClose} />
      <div style={{ height: "1px", backgroundColor: divider, margin: "4px 0" }} />
      
      <div 
         onMouseEnter={() => setShowTemplateMenu(true)} 
         onMouseLeave={() => setShowTemplateMenu(false)}
         style={{ position: 'relative' }}
      >
        <DropdownItem 
           icon={null} 
           text={<div style={{display: 'flex', justifyContent: 'space-between', width: '100%'}}><span>Chart template</span><ChevronRight size={16}/></div>} 
           theme={theme} 
           onClick={(e: any) => e.stopPropagation()} 
        />
        {showTemplateMenu && (
          <div style={{
            position: "absolute",
            top: "-4px", // Align nicely with parent item
            left: "100%",
            backgroundColor: bg,
            border: `1px solid ${border}`,
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 10001,
            padding: "6px 0",
            minWidth: "120px",
            marginLeft: "2px"
          }}>
            <DropdownItem icon={null} text="Save as..." theme={theme} onClick={onSaveTemplate} />
            {templates && templates.length > 0 && (
              <>
                <div style={{ height: "1px", backgroundColor: divider, margin: "4px 0" }} />
                {templates.map((t: any) => (
                  <DropdownItem key={t.id} icon={null} text={t.name} theme={theme} onClick={() => onApplyTemplate(t)} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <div style={{ height: "1px", backgroundColor: divider, margin: "4px 0" }} />
      
      <DropdownItem icon={null} text="Remove drawings" theme={theme} onClick={onRemoveDrawings} />
      <div style={{ height: "1px", backgroundColor: divider, margin: "4px 0" }} />
      
      <DropdownItem icon={<SettingsIcon size={16}/>} text="Settings..." theme={theme} onClick={onSettings} />
    </div>
  );
}
