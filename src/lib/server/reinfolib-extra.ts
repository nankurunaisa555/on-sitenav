import type { LandPriceSection, LiquefactionSection, ShelterSection } from "@/lib/facts-types";
import { attachAppraisals } from "./appraisal";
import { distanceMeters } from "@/lib/geo";
import { lngLatToTile } from "@/lib/tile";
import type { LatLng } from "@/lib/types";

/**
 * 不動産情報ライブラリの追加 API（地価公示・液状化・避難場所）。
 * reinfolib.ts と同じタイル取得だが、点データ（Point）を扱う。
 */
const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";

type Geometry =
  | { type: "Point"; coordinates: number[] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };
type Feature = { geometry: Geometry | null; properties: Record<string, unknown> };

async function fetchTile(
  api: string,
  t: { z: number; x: number; y: number },
  extra = "",
  revalidateSec = 60 * 60 * 24 * 7,
): Promise<Feature[]> {
  const key = process.env.REINFOLIB_API_KEY;
  if (!key) throw new Error("REINFOLIB_API_KEY missing");
  const url = `${BASE}/${api}?response_format=geojson&z=${t.z}&x=${t.x}&y=${t.y}${extra}`;
  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": key },
    next: { revalidate: revalidateSec },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`reinfolib ${api} ${res.status}`);
  const json = (await res.json()) as { features?: Feature[] };
  return json.features ?? [];
}

/** 中心タイルと隣接 8 タイルをまとめて取る（点データが少ない地域向け） */
async function fetchTileWithNeighbors(api: string, center: LatLng, z: number, extra = ""): Promise<Feature[]> {
  const t = lngLatToTile(center, z);
  const tiles = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ z, x: t.x + dx, y: t.y + dy })));
  const results = await Promise.all(tiles.map((tt) => fetchTile(api, tt, extra).catch(() => [] as Feature[])));
  return results.flat();
}

function pointOf(f: Feature): LatLng | null {
  const g = f.geometry;
  if (!g || g.type !== "Point") return null;
  const [lng, lat] = g.coordinates;
  return lng !== undefined && lat !== undefined ? { lat, lng } : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : typeof v === "number" ? String(v) : null;
}

function inRing(p: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function contains(p: LatLng, g: Geometry | null): boolean {
  if (!g || g.type === "Point") return false;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some(([outer, ...holes]) => outer && inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}

// ---------- 地価公示・地価調査（XPT002） ----------

const LAND_PRICE_RADIUS_M = 1500;
const LAND_PRICE_COUNT = 6;

/** "377,000(円/㎡)" → 377000 */
function parsePrice(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function fetchLandPrices(center: LatLng): Promise<LandPriceSection> {
  // 最新年を優先し、未公開なら前年に落とす
  const thisYear = new Date().getFullYear();
  let year = thisYear;
  let features = await fetchTileWithNeighbors("XPT002", center, 14, `&year=${year}`);
  if (features.length === 0) {
    year = thisYear - 1;
    features = await fetchTileWithNeighbors("XPT002", center, 14, `&year=${year}`);
  }

  const points = features
    .map((f) => {
      const loc = pointOf(f);
      const price = parsePrice(f.properties.u_current_years_price_ja);
      if (!loc || price === null) return null;
      const p = f.properties;
      const rate = Number(p.year_on_year_change_rate);
      return {
        id: str(p.point_id) ?? str(p.standard_lot_number_ja) ?? `${loc.lat},${loc.lng}`,
        label: str(p.standard_lot_number_ja) ?? "",
        location: loc,
        distanceM: Math.round(distanceMeters(center, loc)),
        address: str(p.location_number_ja) ?? str(p.location) ?? "",
        pricePerSqm: price,
        changeRate: Number.isFinite(rate) ? rate : null,
        useCategory: str(p.use_category_name_ja),
        zoning: str(p.regulations_use_category_name_ja),
        nearestStation: str(p.nearest_station_name_ja),
        stationDistance: str(p.u_road_distance_to_nearest_station_name_ja),
        surroundings: str(p.current_usage_status_of_surrounding_land_name_ja),
        // 価格時点が 1月1日 なら地価公示（国）、7月1日 なら都道府県地価調査
        kind: (/7月1日/.test(str(p.target_year_name_ja) ?? "") ? "地価調査" : "地価公示") as "地価公示" | "地価調査",
        cityCode: str(p.city_code),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && p.distanceM <= LAND_PRICE_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM);

  // 地価公示（1/1）と地価調査（7/1）で同じ地点が2件になることがあるので、位置で1件にまとめる
  const seen = new Set<string>();
  const unique = points.filter((p) => {
    const k = `${p.location.lat.toFixed(5)},${p.location.lng.toFixed(5)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const selected = unique.slice(0, LAND_PRICE_COUNT);
  const withAppraisal = await attachAppraisals(selected, year).catch(() => selected);
  return { status: "ok", year, points: withAppraisal };
}

// ---------- 液状化発生傾向図（XKT025） ----------

export async function fetchLiquefaction(center: LatLng): Promise<LiquefactionSection> {
  const t = lngLatToTile(center, 14);
  const features = await fetchTile("XKT025", t);
  const hit = features.find((f) => contains(center, f.geometry));
  if (!hit) return { status: "ok", tendency: null, level: null, landform: null };
  const level = Number(hit.properties.liquefaction_tendency_level);
  return {
    status: "ok",
    tendency: str(hit.properties.note),
    level: Number.isFinite(level) ? level : null,
    landform: str(hit.properties.topographic_classification_name_ja),
  };
}

// ---------- 指定緊急避難場所（XGT001） ----------

const SHELTER_COUNT = 3;

export async function fetchShelters(center: LatLng): Promise<ShelterSection> {
  const features = await fetchTileWithNeighbors("XGT001", center, 14);
  const shelters = features
    .map((f) => {
      const loc = pointOf(f);
      const name = str(f.properties.facility_name_ja);
      if (!loc || !name) return null;
      const p = f.properties;
      const hazards: string[] = [];
      if (p.flood_flag) hazards.push("洪水");
      if (p.inland_flooding_flag) hazards.push("内水");
      if (p.high_tide_flag) hazards.push("高潮");
      if (p.tsunami_flag) hazards.push("津波");
      if (p.landslide_flag) hazards.push("土砂");
      if (p.earthquake_flag) hazards.push("地震");
      if (p.large_fire_flag) hazards.push("大火");
      if (p.volcanic_phenomenon_flag) hazards.push("火山");
      return {
        id: str(p.common_id) ?? `${loc.lat},${loc.lng}`,
        name,
        address: str(p.address_ja),
        location: loc,
        distanceM: Math.round(distanceMeters(center, loc)),
        hazards,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.distanceM - b.distanceM);

  // 同一施設が複数レコードになることがあるので ID で重複排除
  const seen = new Set<string>();
  const unique = shelters.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  return { status: "ok", shelters: unique.slice(0, SHELTER_COUNT) };
}
