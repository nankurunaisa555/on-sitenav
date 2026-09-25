import { NextResponse } from "next/server";
import { snapToGrid } from "@/lib/grid";
import { STATION_CANDIDATES, STATION_GRID_DEG, STATION_SEARCH_RADIUS_M } from "@/lib/places-config";
import { searchNearbyCategories } from "@/lib/server/google-nearby";
import type { LatLng, StationsResponse } from "@/lib/types";

export const runtime = "nodejs";

/** 駅はめったに変わらないので長め */
const CDN_CACHE = "public, s-maxage=2592000";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { expires: number; data: StationsResponse }>();

function parseCoord(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * 駅の候補（半径5kmで近い順に最大10件）。
 * 最寄り駅は数百m動いてもほぼ変わらないので、約500mの粗いグリッドに丸めて近所と CDN のキャッシュを共有する
 * （Nearby Search 1回を、そのマス目の中の全検索で使い回す）。
 * 実際の基準点からの距離の計算と、同一駅の除外・上位2駅の選択はクライアント側で行う。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseCoord(searchParams.get("lat"), -90, 90);
  const lng = parseCoord(searchParams.get("lng"), -180, 180);
  if (lat === null || lng === null) {
    return NextResponse.json({ error: "lat と lng は必須です" }, { status: 400 });
  }
  const center: LatLng = snapToGrid({ lat, lng }, STATION_GRID_DEG);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "サーバー環境変数 GOOGLE_MAPS_API_KEY が未設定です" }, { status: 500 });
  }

  const key = `${center.lat},${center.lng}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT", "Cache-Control": CDN_CACHE } });
  }
  try {
    const found = await searchNearbyCategories(apiKey, center, STATION_SEARCH_RADIUS_M, ["station"], STATION_CANDIDATES);
    const data: StationsResponse = { center, stations: found.filter((p) => p.category === "station") };
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
    return NextResponse.json(data, { headers: { "X-Cache": "MISS", "Cache-Control": CDN_CACHE } });
  } catch (err) {
    console.error("[api/stations]", err);
    return NextResponse.json({ error: "駅の取得に失敗しました" }, { status: 502 });
  }
}
