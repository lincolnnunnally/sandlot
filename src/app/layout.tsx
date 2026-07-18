import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sandlot — fidget trading, toys & playdates",
  description:
    "Trade fidgets and other toys, and set up supervised playdates with other families. Free parent-run swaps and meetups. A United Under God app.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0fa06b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
