import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Booking Time with Donald",
  description: "Book a meeting with Donald: pick a free time and confirm in a minute.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fafaf9" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased">{children}</body>
    </html>
  );
}
