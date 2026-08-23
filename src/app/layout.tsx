import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plexmono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "fitcheck — the intelligent wardrobe",
  description:
    "Upload your wardrobe, anchor a piece, and let the harmony engine pair your fits using colour theory and style codes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${grotesk.variable} ${plex.variable} bg-bone font-body text-ink antialiased`}
      >
        <div className="grain" aria-hidden="true" />
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
