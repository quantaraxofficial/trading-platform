import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TradePilot | Professional Trading Platform",
    template: "%s | TradePilot",
  },
  description: "Advanced charting, real-time analysis, and intelligent risk management for serious traders.",
};

import { AuthProvider } from "@/context/AuthContext";
import { TelemetryProvider } from "@/context/TelemetryContext";
import { AlertsProvider } from "@/context/AlertsContext";
import { PaperTradingProvider } from "@/context/PaperTradingContext";
import CloudSync from "./components/CloudSync";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The saved theme, before the first paint (no light flash on a dark reload) */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('tv:theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}` }} />
      </head>
      <body>
        <AuthProvider>
          <CloudSync />
          <PaperTradingProvider>
            <AlertsProvider>
              <TelemetryProvider>
                {children}
              </TelemetryProvider>
            </AlertsProvider>
          </PaperTradingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
