import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import AppIconSync from "@/components/AppIconSync";

export const metadata: Metadata = {
  title: "On-siteNav",
  applicationName: "On-siteNav",
  description: "現地で顧客と一緒に見る、周辺施設のファクト・ダッシュボード",
  manifest: "/manifest.webmanifest",
  // iOS: ホーム画面に追加したときに全画面のアプリとして開く
  appleWebApp: { capable: true, statusBarStyle: "default", title: "On-siteNav" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
        <PwaRegister />
        <AppIconSync />
      </body>
    </html>
  );
}
