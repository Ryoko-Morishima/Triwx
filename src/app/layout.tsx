import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "TRIWX",
  description: "TRIWX — AI選曲・連続ラジオ MVP",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
