import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "./lib/site";

// /sitemap.xml: every public page, for Google and other search engines (lib/site PUBLIC_PAGES);
// add a page there when a new public one is made
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_PAGES.map(p => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority }));
}
