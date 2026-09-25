import { NextResponse } from "next/server";
import { gridSlackM, snapToGrid } from "@/lib/grid";
import { PLACES_GRID_DEG } from "@/lib/places-config";
import { searchNearbyCategories } from "@/lib/server/google-nearby";
import type { CategoryKey, LatLng, Place, PlacesApiResponse } from "@/lib/types";

export const runtime = "nodejs";

const DEFAULT_RADIUS_M = 800;
const MIN_RADIUS_M = 200;
const MAX_RADIUS_M = 2000;
/** 店舗は開閉店があるので嫌悪施設より短め。14日たったら次の人の検索で取り直す */
const CDN_CACHE = "public, s-maxage=1209600";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * 1リクエストあたり最大20件しか返らないため、カテゴリをグループ分けして並列に問い合わせる。
 * グループ数 = 課金される Nearby Search の回数（月5,000回まで無料）なので、むやみに増やさない。
 * 駅は /api/stations（粗いグリッドで近所と共有）から取るので、ここではバス停だけ。
 */
const REQUEST_GROUPS: readonly { keys: readonly CategoryKey[]; max: number }[] = [
  { keys: ["bus"], max: 10 },
  { keys: ["supermarket", "convenience", "pharmacy", "shopping"], max: 20 },
  { keys: ["medical", "school", "childcare", "park"], max: 20 },
  { keys: ["restaurant", "bank", "post"], max: 20 },
];

// 同一インスタンス内の再読込用。本命のキャッシュは Vercel CDN（Cache-Control）
const cache = new Map<string, { expires: number; data: PlacesApiResponse }>();

function parseCoord(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * 周辺施設。座標は約100mのグリッドに丸めて受け取り（同じ近所なら同じ URL → CDN のキャッシュを共有）、
 * 丸めた分だけ広めに探す。基準点からの距離の計算と半径での絞り込みはクライアント側で行う。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseCoord(searchParams.get("lat"), -90, 90);
  const lng = parseCoord(searchParams.get("lng"), -180, 180);
  if (lat === null || lng === null) {
    return NextResponse.json({ error: "lat と lng は必須です" }, { status: 400 });
  }
  const radiusM = parseCoord(searchParams.get("radius"), MIN_RADIUS_M, MAX_RADIUS_M) ?? DEFAULT_RADIUS_M;
  const center: LatLng = snapToGrid({ lat, lng }, PLACES_GRID_DEG);
  const queryRadiusM = radiusM + gridSlackM(PLACES_GRID_DEG);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "サーバー環境変数 GOOGLE_MAPS_API_KEY が未設定です" }, { status: 500 });
  }

  const key = `${center.lat},${center.lng},${radiusM}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT", "Cache-Control": CDN_CACHE } });
  }

  try {
    const groups = await Promise.all(
      REQUEST_GROUPS.map((g) => searchNearbyCategories(apiKey, center, queryRadiusM, g.keys, g.max)),
    );
    const seen = new Set<string>();
    const places: Place[] = [];
    for (const place of groups.flat()) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      places.push(place);
    }
    places.sort((a, b) => a.distanceM - b.distanceM);

    const data: PlacesApiResponse = { center, radiusM, places };
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
    return NextResponse.json(data, { headers: { "X-Cache": "MISS", "Cache-Control": CDN_CACHE } });
  } catch (err) {
    console.error("[api/places]", err);
    return NextResponse.json({ error: "周辺施設の取得に失敗しました" }, { status: 502 });
  }
}
