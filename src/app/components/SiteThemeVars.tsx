"use client";

// Keeps the site theme's colour variables (lib/siteThemes) on <html> on every page, following
// the chart setting (picked in Settings → Canvas, or synced from the account)
import { useEffect } from "react";
import { chartSettings } from "../lib/chartSettings";
import { applyThemeVars } from "../lib/siteThemes";

export default function SiteThemeVars() {
  const id = chartSettings.useValue().siteTheme;
  useEffect(() => { applyThemeVars(id); }, [id]);
  return null;
}
