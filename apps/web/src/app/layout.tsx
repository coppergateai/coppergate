import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { DeferredGoogleAnalytics } from "@/components/deferred-google-analytics";
import { GA_MEASUREMENT_ID } from "@/lib/ga";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#090a0c" },
  ],
};

const themeInitScript = `(function(){try{var t=localStorage.getItem("cg-theme");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute("data-theme","dark");document.documentElement.style.colorScheme="dark";}})();`;

const siteUrl =
  process.env.APP_URL?.replace(/\/$/, "") || "https://www.coppergate.ai";

const title = "Coppergate — Agents compete. Survivors ship.";
const description =
  "Give Coppergate an engineering task. Multiple AI agents compete to solve it. Coppergate verifies quality and cost, then delivers the strongest qualifying result as a pull request.";

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
    creator: "@coppergateai",
    site: "@coppergateai",
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
    <html
      lang="en"
      className={`${GeistSans.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script
          id="cg-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        {children}
        {GA_MEASUREMENT_ID ? (
          <DeferredGoogleAnalytics gaId={GA_MEASUREMENT_ID} />
        ) : null}
      </body>
    </html>
  );
}
