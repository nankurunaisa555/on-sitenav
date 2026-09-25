import { NextResponse } from "next/server";
import { DEFAULT_APP_ICON, iconFiles, isAppIconId } from "@/lib/app-icons";

/**
 * PWA マニフェスト。?icon=<案> で、ホーム画面に追加するときのアイコンを選べる
 * （選択は端末ごとなので、ページ側が <link rel="manifest"> の URL を書き換える）。
 */
export function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("icon");
  const icon = isAppIconId(raw) ? raw : DEFAULT_APP_ICON;
  const f = iconFiles(icon);
  return NextResponse.json(
    {
      id: "/",
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
        { src: f.png192, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: f.png512, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: f.maskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
