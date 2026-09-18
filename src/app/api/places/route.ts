import { NextResponse } from "next/server";
import { CATEGORIES, classify } from "@/lib/categories";
import { distanceMeters } from "@/lib/geo";
import type { CategoryKey, LatLng, Place, PlacesResponse } from "@/lib/types";

export const runtime = "nodejs";

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
const DEFAULT_RADIUS_M = 800;
const MIN_RADIUS_M = 200;
const MAX_RADIUS_M = 2000;
const CACHE_TTL_MS = 10 * 60 * 1000;
/** 最寄り駅は半径に縛られず、この範囲から距離順に探す */
const STATION_SEARCH_RADIUS_M = 5000;
const STATION_COUNT = 2;
/** これより近い駅同士は同一駅（別路線・別出入口）とみなす */
const SAME_STATION_M = 250;

/**
 * 1リクエストあたり最大20件しか返らないため、カテゴリをグループ分けして並列に問い合わせる。
 * グループ数 = 課金される Nearby Search の回数なので、むやみに増やさない。
 */
const REQUEST_GROUPS: readonly { keys: readonly CategoryKey[]; max: number }[] = [
  { keys: ["station", "bus"], max: 10 },
  { keys: ["supermarket", "convenience", "pharmacy", "shopping"], max: 20 },
  { keys: ["medical", "school", "childcare", "park"], max: 20 },
  { keys: ["restaurant", "bank", "post"], max: 20 },
];

// rating 等を含めると上位 SKU（Enterprise）課金になるため、Pro SKU の範囲に限定する
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.types",
  "places.location",
  "places.formattedAddress",
].join(",");

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
};

// サーバーレス環境ではインスタンスごとのキャッシュだが、同一インスタンス内の再読込に効く
const cache = new Map<string, { expires: number; data: PlacesResponse }>();

function parseCoord(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function cacheKey(center: LatLng, radiusM: number): string {
  // 約50m グリッドに丸めて、僅かな地図移動で再課金されないようにする
  return `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${radiusM}`;
}

async function searchGroup(
  apiKey: string,
  center: LatLng,
  radiusM: number,
  group: { keys: readonly CategoryKey[]; max: number },
): Promise<GooglePlace[]> {
  const includedTypes = group.keys.flatMap(
    (key) => CATEGORIES.find((c) => c.key === key)?.googleTypes ?? [],
  );

  const res = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: group.max,
      rankPreference: "DISTANCE",
      languageCode: "ja",
      regionCode: "JP",
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusM,
        },
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { places?: GooglePlace[] };
  return json.places ?? [];
}

/** "日本、〒100-0005 東京都千代田区…" → "東京都千代田区…" */
function tidyAddress(address: string): string {
  return address.replace(/^日本[、,]\s*/, "").replace(/^〒?\d{3}-?\d{4}\s*/, "").trim();
}

/** 「東京駅（丸ノ内線）」「東京駅 八重洲口」→「東京」のように、駅名の本体だけを比べる */
function stationKey(name: string): string {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s.*$/, "")
    .replace(/駅$/, "")
    .trim();
}

/** 距離順の駅候補から、同一駅とみなせるものを除いて上位 n 件を選ぶ */
function pickDistinctStations(candidates: Place[], n: number): Place[] {
  const picked: Place[] = [];
  for (const c of candidates) {
    const dup = picked.some(
      (p) => stationKey(p.name) === stationKey(c.name) || distanceMeters(p.location, c.location) < SAME_STATION_M,
    );
    if (!dup) picked.push(c);
    if (picked.length >= n) break;
  }
  return picked;
}

function toPlace(raw: GooglePlace, center: LatLng): Place | null {
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  const category = classify(raw.types ?? []);
  if (!raw.id || lat === undefined || lng === undefined || !category) return null;

  const location = { lat, lng };
  return {
    id: raw.id,
    name: raw.displayName?.text ?? "名称不明",
    category,
    location,
    address: tidyAddress(raw.formattedAddress ?? ""),
    distanceM: distanceMeters(center, location),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseCoord(searchParams.get("lat"), -90, 90);
  const lng = parseCoord(searchParams.get("lng"), -180, 180);
  if (lat === null || lng === null) {
    return NextResponse.json({ error: "lat と lng は必須です" }, { status: 400 });
  }

  const radiusRaw = parseCoord(searchParams.get("radius"), MIN_RADIUS_M, MAX_RADIUS_M);
  const radiusM = radiusRaw ?? DEFAULT_RADIUS_M;
  const center: LatLng = { lat, lng };

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "サーバー環境変数 GOOGLE_MAPS_API_KEY が未設定です" },
      { status: 500 },
    );
  }

  const key = cacheKey(center, radiusM);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const [groups, stationRaw] = await Promise.all([
      Promise.all(REQUEST_GROUPS.map((g) => searchGroup(apiKey, center, radiusM, g))),
      searchGroup(apiKey, center, STATION_SEARCH_RADIUS_M, { keys: ["station"], max: 10 }),
    ]);

    const seen = new Set<string>();
    const places: Place[] = [];
    for (const raw of groups.flat()) {
      const place = toPlace(raw, center);
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      places.push(place);
    }
    places.sort((a, b) => a.distanceM - b.distanceM);

    const stationCandidates = stationRaw
      .map((raw) => toPlace(raw, center))
      .filter((p): p is Place => p !== null && p.category === "station")
      .sort((a, b) => a.distanceM - b.distanceM);
    const nearestStations = pickDistinctStations(stationCandidates, STATION_COUNT);

    const data: PlacesResponse = { center, radiusM, places, nearestStations };
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
  } catch (err) {
    console.error("[api/places]", err);
    return NextResponse.json(
      { error: "周辺施設の取得に失敗しました" },
      { status: 502 },
    );
  }
}
