import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/site";

// /robots.txt: search engines may read the public pages, not the API, the admin, the signed-in
// tools or one-off links; where the sitemap is
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/analytics", "/profile", "/snapshot", "/m", "/mobile"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
