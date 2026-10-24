import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { DeferredGoogleAnalytics } from "@/components/deferred-google-analytics";
import { GA_MEASUREMENT_ID } from "@/lib/ga";
import { getSiteUrl } from "@/lib/site-url";
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

const themeInitScript = `(function(){try{var t=localStorage.getItem("cg-theme");if(t!=="light"&&t!=="dark")t="light";document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute("data-theme","light");document.documentElement.style.colorScheme="light";}})();`;

const siteUrl = getSiteUrl();
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

const title = "Coppergate — Set a budget. Agents war. Survivors ship.";
const description =
  "Set a monthly spend cap. Agents compete on your project — losers get eliminated, winners ship and improve. Coppergate turns selection pressure into agent cost efficiency.";

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
  ...(googleVerification
    ? { verification: { google: googleVerification } }
    : {}),
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
