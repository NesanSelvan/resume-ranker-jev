import type { Metadata } from "next";
import { Inter } from "next/font/google";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

/**
 * Minimal Swiss: one family, hierarchy from weight and size alone.
 * Self-hosted by next/font with display:swap, so no render-blocking request
 * and no invisible-text flash.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Resume Ranker",
  description: "Rank candidates against a role with typed decisions from Jev.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
