import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL?.replace(/\/$/, "") || "https://coppergate.ai",
  ),
  title: {
    default: "Coppergate — From idea to reviewed PR",
    template: "%s · Coppergate",
  },
  description:
    "Direct an AI product team that plans, codes, and opens pull requests. You open the gate for what ships.",
  openGraph: {
    title: "Coppergate — From idea to reviewed PR",
    description:
      "Direct an AI product team that plans, codes, and opens pull requests. You open the gate for what ships.",
    siteName: "Coppergate",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Coppergate" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Coppergate — From idea to reviewed PR",
    description:
      "Direct an AI product team that plans, codes, and opens pull requests. You open the gate for what ships.",
    images: ["/og.png"],
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
    <html lang="en" className={spaceGrotesk.variable}>
      <body>{children}</body>
    </html>
  );
}
