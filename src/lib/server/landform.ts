import codes from "@/lib/landform-codes.json";
import type { LandformInfo, LandformSection } from "@/lib/facts-types";
import { lngLatToTile } from "@/lib/tile";
import type { LatLng } from "@/lib/types";

/**
 * 国土地理院 ベクトルタイル提供実験「地形分類（自然地形／人工地形）」
 * https://github.com/gsi-cyberjapan/experimental_landformclassification
 * code → 名称・成り立ち・リスクの対応は同サイトの style.js から抽出（landform-codes.json）。
 */
const TILE_URLS = [
  "https://cyberjapandata.gsi.go.jp/xyz/experimental_landformclassification1/{z}/{x}/{y}.geojson",
  "https://cyberjapandata.gsi.go.jp/xyz/experimental_landformclassification2/{z}/{x}/{y}.geojson",
];
/** 実データが入っている最大ズーム */
const ZOOM = 16;

/** 人工地形として扱う分類名。それ以外は自然地形 */
const ARTIFICIAL_NAMES = new Set(["切土地", "農耕平坦化地", "盛土地･埋立地", "干拓地", "改変工事中"]);

type CodeEntry = { name: string; origin: string; risk: string; color: string | null };
const CODE_TABLE = codes as Record<string, CodeEntry>;

type Geometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };
type Feature = { geometry: Geometry | null; properties: { code?: string | number } };

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
  if (!g) return false;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some(([outer, ...holes]) => outer && inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}

async function fetchFeatures(template: string, center: LatLng): Promise<Feature[]> {
  const t = lngLatToTile(center, ZOOM);
  const url = template.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`landform tile ${res.status}`);
  const json = (await res.json()) as { features?: Feature[] };
  return json.features ?? [];
}

function toInfo(code: string | number | undefined): LandformInfo | null {
  if (code === undefined) return null;
  const entry = CODE_TABLE[String(code)];
  if (!entry) return null;
  return { code: String(code), name: entry.name, origin: entry.origin, risk: entry.risk, color: entry.color };
}

export function gsiMapUrl(center: LatLng): string {
  return `https://maps.gsi.go.jp/#16/${center.lat}/${center.lng}/&base=pale&ls=pale%7Cexperimental_landformclassification1%7Cexperimental_landformclassification2&disp=111`;
}

export async function fetchLandform(center: LatLng): Promise<LandformSection> {
  const tiles = await Promise.all(TILE_URLS.map((u) => fetchFeatures(u, center)));
  const hits = tiles
    .flat()
    .filter((f) => contains(center, f.geometry))
    .map((f) => toInfo(f.properties.code))
    .filter((x): x is LandformInfo => x !== null);

  // 同じ地点に自然地形と人工地形が重なることがある（例: 氾濫平野の上の盛土地）
  const natural = hits.find((h) => !ARTIFICIAL_NAMES.has(h.name) && h.name !== "水部") ?? hits.find((h) => h.name === "水部") ?? null;
  const artificial = hits.find((h) => ARTIFICIAL_NAMES.has(h.name)) ?? null;

  return { status: "ok", natural, artificial, sourceUrl: gsiMapUrl(center) };
}
