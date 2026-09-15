"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SymbolSearch from "./SymbolSearch";
import IndicatorsModal from "./IndicatorsModal";
import { useDrawing } from "./drawing/core/DrawingContext";
import { useAuth } from "@/context/AuthContext";
import Link from 'next/link';
import { 
  Search, 
  ChevronDown, 
  ChevronUp,
  BarChart2, 
  Maximize, 
  Camera, 
  Undo2, 
  Redo2, 
  Moon, 
  Sun,
  Bell,
  Save,
  ChevronLeft,
  ChevronRight,
  Plus,
  ChevronsLeft,
  Star,
  X
} from "lucide-react";
import { TVSettingsIcon } from "./icons/TVIcons";

interface TopBarProps {
  theme: string;
  toggleTheme: () => void;
  interval: string;
  onIntervalChange: (interval: string) => void;
  onReplayClick?: () => void;
  isReplayActive?: boolean;
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onIndicatorSelect?: (indicator: string) => void;
  isBotActive: boolean;
  onToggleBot: () => void;
  onAlertClick?: () => void;
  symbolSearchOpen?: boolean;
  symbolSearchInitial?: string;
  onSymbolSearchClose?: () => void;
  onSettingsClick?: () => void;
}

const DEFAULT_FAVORITES = ['1min', '5min', '15min', '30min', '45min', '1h', '4h'];

const TIMEFRAME_GROUPS = [
  {
    label: 'MINUTES',
    items: [
      { display: '1 minute', value: '1min', short: '1m' },
      { display: '2 minutes', value: '2min', short: '2m' },
      { display: '3 minutes', value: '3min', short: '3m' },
      { display: '5 minutes', value: '5min', short: '5m' },
      { display: '10 minutes', value: '10min', short: '10m' },
      { display: '15 minutes', value: '15min', short: '15m' },
      { display: '30 minutes', value: '30min', short: '30m' },
      { display: '45 minutes', value: '45min', short: '45m' },
    ]
  },
  {
    label: 'HOURS',
    items: [
      { display: '1 hour', value: '1h', short: '1H' },
      { display: '2 hours', value: '2h', short: '2H' },
      { display: '3 hours', value: '3h', short: '3H' },
      { display: '4 hours', value: '4h', short: '4H' },
    ]
  },
  {
    label: 'DAYS',
    items: [
      { display: '1 day', value: '1day', short: 'D' },
      { display: '1 week', value: '1week', short: 'W' },
      { display: '1 month', value: '1month', short: 'M' },
    ]
  },
];

const ALL_TIMEFRAMES = TIMEFRAME_GROUPS.flatMap(g => g.items);

function getShortLabel(value: string): string {
  const found = ALL_TIMEFRAMES.find(t => t.value === value);
  if (found) return found.short;
  const m = value.match(/^(\d+)min$/);
  return m ? m[1] + 'm' : value;
}