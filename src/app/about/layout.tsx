import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About us",
  description: "What TradePilot is and why we built it: professional trading charts, practice and analytics tools that are simple to use.",
  alternates: { canonical: "/about" },
};

export default function Layout({ children }: { children: React.ReactNode }) { return children; }
