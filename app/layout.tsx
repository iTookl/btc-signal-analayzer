import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTC / Polymarket Analyzer",
  description: "BTC 15m candle + Polymarket signal analyzer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, padding: 0, background: '#0a0e1a' }}>{children}</body>
    </html>
  );
}
