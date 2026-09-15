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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
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
