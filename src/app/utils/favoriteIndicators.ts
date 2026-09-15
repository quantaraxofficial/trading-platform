// Shared localStorage-backed favorite-indicators list, used by both the full
// Indicators modal (where they're starred) and the TopBar's quick-access dropdown.

const FAVORITE_INDICATORS_KEY = "tv:favoriteIndicators";

export const DEFAULT_FAVORITE_INDICATORS = ["Moving Average Exponential", "Volume"];

export function loadFavoriteIndicators(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITE_INDICATORS_KEY);
    if (!raw) return DEFAULT_FAVORITE_INDICATORS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(v => typeof v === "string")) {
      return parsed;
    }
    return DEFAULT_FAVORITE_INDICATORS;
  } catch {
    return DEFAULT_FAVORITE_INDICATORS;
  }
}

export function saveFavoriteIndicators(values: string[]): void {
  try {
    localStorage.setItem(FAVORITE_INDICATORS_KEY, JSON.stringify(values));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — favorites just won't persist
  }
}
