import type { MetadataRoute } from "next";

/** PWA マニフェスト（/manifest.webmanifest）。ホーム画面に追加してアプリとして起動できるようにする */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "On-siteNav 現地ファクト",
    short_name: "On-siteNav",
    description: "現地で顧客と一緒に見る、周辺施設・災害リスク・価格のファクト・ダッシュボード",
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["navigation", "business", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
