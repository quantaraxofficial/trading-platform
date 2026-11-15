// The site's public address (sitemap, robots, links shared on social sites): NEXT_PUBLIC_SITE_URL
// when the site gets its own domain, else the live server's
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://34-93-138-162.sslip.io").replace(/\/$/, "");

// The public pages, for search engines (app/sitemap.ts): signed-in tools (analytics, profile) and
// one-off links (snapshots, collab invites) are left out
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/chart", priority: 0.9, changeFrequency: "daily" },
  { path: "/faq", priority: 0.8, changeFrequency: "weekly" },
  { path: "/contact", priority: 0.6, changeFrequency: "yearly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/community", priority: 0.7, changeFrequency: "daily" },
  { path: "/leaderboard", priority: 0.7, changeFrequency: "daily" },
  { path: "/reels", priority: 0.5, changeFrequency: "daily" },
  { path: "/signup", priority: 0.5, changeFrequency: "yearly" },
  { path: "/login", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
];
