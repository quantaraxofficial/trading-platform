import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Questions about TradePilot, an account or a feature? Send us a message and we'll answer by email.",
  alternates: { canonical: "/contact" },
};

export default function Layout({ children }: { children: React.ReactNode }) { return children; }
