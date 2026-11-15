import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL } from "./lib/site";

const DESCRIPTION = "Professional trading charts with drawing tools and indicators, bar replay and backtesting, paper trading, live collab, a voice assistant and analytics of every trade.";

// Search engines and shared links (Google, WhatsApp, X…): the title, description and preview
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TradePilot | Professional Trading Platform",
    template: "%s | TradePilot",
  },
  description: DESCRIPTION,
  applicationName: "TradePilot",
  keywords: ["trading charts", "technical analysis", "bar replay", "backtesting", "paper trading", "trading journal", "forex charts", "gold chart", "smart money concepts", "order blocks", "trading platform"],
  openGraph: { type: "website", siteName: "TradePilot", title: "TradePilot | Professional Trading Platform", description: DESCRIPTION, url: "/" },
  twitter: { card: "summary", title: "TradePilot | Professional Trading Platform", description: DESCRIPTION },
  robots: { index: true, follow: true },
};

import { AuthProvider } from "@/context/AuthContext";
import { TelemetryProvider } from "@/context/TelemetryContext";
import { AlertsProvider } from "@/context/AlertsContext";
import { PaperTradingProvider } from "@/context/PaperTradingContext";
import CloudSync from "./components/CloudSync";
import VisitPing from "./components/VisitPing";
import LagReporter from "./components/LagReporter";
import PresencePing from "./components/PresencePing";
import SiteThemeVars from "./components/SiteThemeVars";
import VoiceDock from "./components/VoiceDock";
import FeatureTour from "./components/FeatureTour";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The saved theme, before the first paint (no light flash on a dark reload) */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('tv:theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);var v=JSON.parse(localStorage.getItem('tv:siteThemeVars')||'null');if(v)for(var k in v)document.documentElement.style.setProperty(k,v[k])}catch(e){}` }} />
      </head>
      <body>
        <AuthProvider>
          <CloudSync />
          <PresencePing />
          <VisitPing />
          <LagReporter />
          <SiteThemeVars />
          {/* the guided tours of the site's features, each shown once (lib/tours) */}
          <FeatureTour />
          <PaperTradingProvider>
            <AlertsProvider>
              <TelemetryProvider>
                {children}
                <VoiceDock />
              </TelemetryProvider>
            </AlertsProvider>
          </PaperTradingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
