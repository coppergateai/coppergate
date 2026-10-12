import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import { DeferredGoogleAnalytics } from "@/components/deferred-google-analytics";
import { GA_MEASUREMENT_ID } from "@/lib/ga";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

const siteUrl =
  process.env.APP_URL?.replace(/\/$/, "") || "https://www.coppergate.ai";

const title = "Coppergate — Agents compete. Survivors ship.";
const description =
  "An autonomous multi-agent arena. Contenders race, critics score, fitness decides — you set the budget and hold the kill-switch.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s · Coppergate",
  },
  description,
  applicationName: "Coppergate",
  keywords: [
    "autonomous agents",
    "multi-agent arena",
    "AI agents",
    "Survivor agents",
    "GitHub",
    "AI coding",
    "agent orchestration",
  ],
  authors: [{ name: "Coppergate", url: siteUrl }],
  creator: "Coppergate",
  publisher: "Coppergate",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Coppergate",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {GA_MEASUREMENT_ID ? (
          <DeferredGoogleAnalytics gaId={GA_MEASUREMENT_ID} />
        ) : null}
      </body>
    </html>
  );
}
