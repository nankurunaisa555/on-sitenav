import { NextResponse } from "next/server";
import { distanceMeters } from "@/lib/geo";
import { classifyNimby, NIMBY_NEARBY_TYPES } from "@/lib/nimby";
import { NIMBY_GRID_DEG, NIMBY_SEARCH_RADIUS_M, snapToNimbyGrid } from "@/lib/nimby-grid";
import type { LatLng, NimbyPlace, NimbyResponse } from "@/lib/types";
import { fetchOsmNimby } from "@/lib/server/overpass";

export const runtime = "nodejs";

/**
 * 嫌悪施設の探索。無料枠に収めるため、有料の呼び出しは Google Nearby Search（業種タイプ指定）の1回だけ。
 * 寺社・墓地・工場・物流・変電所などは OpenStreetMap（無料）のタグと名称で探す。
 *
 * 座標は約100mのグリッドに丸めて受け取り、Vercel の CDN に30日キャッシュさせる。
 * 同じ物件・近所を何度開いても、2回目以降は Google にも OSM にも問い合わせない。
 * グリッドに丸めた分（最大約70m）だけ広めに探し、基準点からの距離の絞り込みはクライアント側で行う。
 */
const GRID_SLACK_M = 70;
const QUERY_RADIUS_M = NIMBY_SEARCH_RADIUS_M + 50 + GRID_SLACK_M;
const CDN_CACHE = "public, s-maxage=2592000, stale-while-revalidate=604800"; // 30日＋7日
const CDN_CACHE_PARTIAL = "no-store"; // 片方の取得に失敗したときはキャッシュしない（「もう一度探す」で取り直せるように）
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { expires: number; data: NimbyResponse }>();

const FIELD_MASK = "places.id,places.displayName,places.types,places.location,places.formattedAddress,places.businessStatus";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  businessStatus?: string;
};

function parseCoord(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

async function nearby(apiKey: string, center: LatLng): Promise<GooglePlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      includedTypes: NIMBY_NEARBY_TYPES,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      languageCode: "ja",
      regionCode: "JP",
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: QUERY_RADIUS_M } },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`nearby ${res.status}`);
  return ((await res.json()) as { places?: GooglePlace[] }).places ?? [];
}

/** 表記ゆれ（全角半角・空白・括弧内・会社の種類）を除いて、片方がもう片方を含めば同じ名称とみなす */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[（(][^）)]*[）)]/g, "")
      .replace(/株式会社|有限会社|\(株\)|\(有\)|㈱|㈲/g, "")
      .replace(/[\s・･\-－ー_.,、。]/g, "");
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

function tidyAddress(address: string): string {
  return address.replace(/^日本[、,]\s*/, "").replace(/^〒?\d{3}-?\d{4}\s*/, "").trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseCoord(searchParams.get("lat"), -90, 90);
  const lng = parseCoord(searchParams.get("lng"), -180, 180);
  if (lat === null || lng === null) return NextResponse.json({ error: "lat と lng は必須です" }, { status: 400 });
  // クライアントは丸めて送ってくるが、念のためこちらでも丸める（キャッシュのキーを揃える）
  const center: LatLng = snapToNimbyGrid({ lat, lng });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY が未設定です" }, { status: 500 });

  const key = `${center.lat},${center.lng}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT", "Cache-Control": CDN_CACHE } });
  }

  let osmFailed = false;
  let googleFailed = false;
  const [osm, near] = await Promise.all([
    fetchOsmNimby(center, QUERY_RADIUS_M).catch((err) => {
      console.error("[api/nimby] overpass", err);
      osmFailed = true;
      return [] as NimbyPlace[];
    }),
    nearby(apiKey, center).catch((err) => {
      console.error("[api/nimby] nearby", err);
      googleFailed = true;
      return [] as GooglePlace[];
    }),
  ]);
  if (osmFailed && googleFailed) {
    return NextResponse.json({ error: "嫌悪施設の検索に失敗しました" }, { status: 502 });
  }

  const items: NimbyPlace[] = [];
  const seen = new Set<string>();
  for (const raw of near) {
    const plat = raw.location?.latitude;
    const plng = raw.location?.longitude;
    const name = raw.displayName?.text;
    if (!raw.id || plat === undefined || plng === undefined || !name || seen.has(raw.id)) continue;
    if (raw.businessStatus === "CLOSED_PERMANENTLY") continue;
    const kind = classifyNimby(name, raw.types ?? []);
    if (!kind) continue;
    const location = { lat: plat, lng: plng };
    // 同じ施設が表記違いで二重登録されていることがある（㈱の有無など）。同種・近接・名称が同じなら1件に。
    // 名称まで見るのは、同じビルに入る別々の店（夜の店など）をまとめてしまわないため
    if (items.some((g) => g.sub.key === kind.key && distanceMeters(g.location, location) < 40 && sameName(g.name, name))) continue;
    seen.add(raw.id);
    items.push({
      id: raw.id,
      name,
      category: "nimby",
      location,
      address: tidyAddress(raw.formattedAddress ?? ""),
      distanceM: distanceMeters(center, location),
      sub: { key: kind.key, label: kind.label, emoji: kind.emoji },
    });
  }
  // OSM 由来を合流。Google 側と同じ施設（同種で近く、名称が同じか OSM 側に名称がない）なら落とす
  for (const o of osm) {
    const dup = items.some((g) => {
      const d = distanceMeters(g.location, o.location);
      if (g.sub.key !== o.sub.key) return false;
      return (d < 60 && (sameName(g.name, o.name) || o.name === o.sub.label)) || d < 15;
    });
    if (!dup) items.push(o);
  }
  items.sort((a, b) => a.distanceM - b.distanceM);

  const data: NimbyResponse = { center, radiusM: NIMBY_SEARCH_RADIUS_M, items, partial: osmFailed || googleFailed };
  if (!data.partial) cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
  return NextResponse.json(data, {
    headers: { "X-Cache": "MISS", "Cache-Control": data.partial ? CDN_CACHE_PARTIAL : CDN_CACHE, "X-Grid": String(NIMBY_GRID_DEG) },
  });
}
