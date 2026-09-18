import { NextResponse } from "next/server";
import { distanceMeters } from "@/lib/geo";
import { classifyNimby, NIMBY_GLOBAL_EXCLUDE, NIMBY_KIND_MAP, NIMBY_NEARBY_TYPES, NIMBY_TEXT_QUERIES } from "@/lib/nimby";
import type { LatLng, NimbyPlace, NimbyResponse } from "@/lib/types";
import { fetchOsmNimby } from "@/lib/server/overpass";

export const runtime = "nodejs";

/**
 * 嫌悪施設の探索。Nearby Search（タイプ指定）＋ Text Search（語句）を並列に投げ、
 * 名称・タイプで種別を判定する。Text Search は1クエリごとに課金されるため、
 * 通常の周辺施設検索とは分けてオンデマンドで呼ぶ。
 */
const SEARCH_RADIUS_M = 300;
/** バイアス外の遠い結果は捨てる（少しだけ余裕を持たせる） */
const MAX_DISTANCE_M = 350;
const CACHE_TTL_MS = 30 * 60 * 1000;
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
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: SEARCH_RADIUS_M } },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`nearby ${res.status}`);
  return ((await res.json()) as { places?: GooglePlace[] }).places ?? [];
}

async function textSearch(apiKey: string, center: LatLng, query: string): Promise<GooglePlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 10,
      languageCode: "ja",
      regionCode: "JP",
      locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: SEARCH_RADIUS_M } },
    }),
    cache: "no-store",
  });
  if (!res.ok) return [];
  return ((await res.json()) as { places?: GooglePlace[] }).places ?? [];
}

function tidyAddress(address: string): string {
  return address.replace(/^日本[、,]\s*/, "").replace(/^〒?\d{3}-?\d{4}\s*/, "").trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseCoord(searchParams.get("lat"), -90, 90);
  const lng = parseCoord(searchParams.get("lng"), -180, 180);
  if (lat === null || lng === null) return NextResponse.json({ error: "lat と lng は必須です" }, { status: 400 });
  const center: LatLng = { lat, lng };

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY が未設定です" }, { status: 500 });

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`; // 約100m グリッド
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT" } });

  try {
    const [osm, near, ...texts] = await Promise.all([
      // OSM は寺社・墓地・変電所などの網羅性が高い。失敗しても Google だけで続ける
      fetchOsmNimby(center, SEARCH_RADIUS_M).catch((err) => {
        console.error("[api/nimby] overpass", err);
        return [] as NimbyPlace[];
      }),
      nearby(apiKey, center).catch(() => [] as GooglePlace[]),
      ...NIMBY_TEXT_QUERIES.map((q) => textSearch(apiKey, center, q.query)),
    ]);

    // 結果と「どのクエリ由来か」を並べる（Nearby 由来は fallback 無し）
    const tagged: { raw: GooglePlace; fallback: (typeof NIMBY_TEXT_QUERIES)[number]["fallback"] }[] = [
      ...near.map((raw) => ({ raw, fallback: null })),
      ...texts.flatMap((list, i) => list.map((raw) => ({ raw, fallback: NIMBY_TEXT_QUERIES[i]?.fallback ?? null }))),
    ];

    const seen = new Set<string>();
    const items: NimbyPlace[] = [];
    for (const { raw, fallback } of tagged) {
      const plat = raw.location?.latitude;
      const plng = raw.location?.longitude;
      const name = raw.displayName?.text;
      if (!raw.id || plat === undefined || plng === undefined || !name || seen.has(raw.id)) continue;
      if (raw.businessStatus === "CLOSED_PERMANENTLY") continue;
      let kind = classifyNimby(name, raw.types ?? []);
      if (!kind && fallback && !NIMBY_GLOBAL_EXCLUDE.test(name)) kind = NIMBY_KIND_MAP.get(fallback) ?? null;
      if (!kind) continue;
      const location = { lat: plat, lng: plng };
      const distanceM = distanceMeters(center, location);
      if (distanceM > MAX_DISTANCE_M) continue;
      // 同じ施設が別名で二重登録されていることがある（㈱表記違いなど）。同種で近接なら1件に
      if (items.some((g) => g.sub.key === kind!.key && distanceMeters(g.location, location) < 40)) continue;
      seen.add(raw.id);
      items.push({
        id: raw.id,
        name,
        category: "nimby",
        location,
        address: tidyAddress(raw.formattedAddress ?? ""),
        distanceM,
        sub: { key: kind.key, label: kind.label, emoji: kind.emoji },
      });
    }
    // OSM 由来を合流。Google 側に近接する同種の地物があれば重複とみなして落とす
    const SAME_M = 60;
    for (const o of osm) {
      if (o.distanceM > MAX_DISTANCE_M) continue;
      const dup = items.some(
        (g) => (g.sub.key === o.sub.key && distanceMeters(g.location, o.location) < SAME_M) || distanceMeters(g.location, o.location) < 15,
      );
      if (!dup) items.push(o);
    }
    items.sort((a, b) => a.distanceM - b.distanceM);

    const data: NimbyResponse = { center, radiusM: SEARCH_RADIUS_M, items };
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
  } catch (err) {
    console.error("[api/nimby]", err);
    return NextResponse.json({ error: "嫌悪施設の検索に失敗しました" }, { status: 502 });
  }
}
