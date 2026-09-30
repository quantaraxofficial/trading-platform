// Saved indicator templates (TopBar's "Indicator templates" button), kept in localStorage.
// A template records which indicators were on the chart with their settings, and
// optionally the symbol and interval, so applying it rebuilds that exact setup.

const INDICATOR_TEMPLATES_KEY = "tv:indicatorTemplates";

export interface IndicatorTemplateItem {
  name: string;
  visible?: boolean;
  // Per-indicator settings (e.g. an EMA's length/source/offset/color)
  config?: any;
}

export interface IndicatorTemplate {
  id: string;
  name: string;
  createdAt: number;
  indicators: IndicatorTemplateItem[];
  volumeConfig?: any;
  symbol?: string;
  interval?: string;
}

export function loadIndicatorTemplates(): IndicatorTemplate[] {
  try {
    const raw = localStorage.getItem(INDICATOR_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(t => t && typeof t.name === "string" && Array.isArray(t.indicators))
      : [];
  } catch {
    return [];
  }
}

function persist(templates: IndicatorTemplate[]) {
  try {
    localStorage.setItem(INDICATOR_TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — templates just won't persist
  }
}

// Saving under an existing name (case-insensitive) replaces that template, as TradingView does
export function saveIndicatorTemplate(template: Omit<IndicatorTemplate, "id" | "createdAt">): IndicatorTemplate[] {
  const existing = loadIndicatorTemplates();
  const same = existing.find(t => t.name.trim().toLowerCase() === template.name.trim().toLowerCase());
  const saved: IndicatorTemplate = {
    ...template,
    name: template.name.trim(),
    id: same?.id ?? Math.random().toString(36).slice(2, 10),
    createdAt: Date.now(),
  };
  const next = same ? existing.map(t => (t.id === same.id ? saved : t)) : [...existing, saved];
  persist(next);
  return next;
}

export function deleteIndicatorTemplate(id: string): IndicatorTemplate[] {
  const next = loadIndicatorTemplates().filter(t => t.id !== id);
  persist(next);
  return next;
}
