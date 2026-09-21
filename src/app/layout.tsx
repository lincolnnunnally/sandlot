import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Telemetry } from '../lib/TelemetryProvider';

export const metadata: Metadata = {
  title: "Sandlot — kids make real friends nearby",
  description:
    "Kids make real friends nearby. Either parent can host a playdate or help. Toy swaps and hangouts with families close to home.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0fa06b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Telemetry app="sandlot" />
      </body>
    </html>
  );
}
