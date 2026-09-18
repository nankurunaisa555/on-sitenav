import type { PopulationSection, SchoolInfo, SchoolSection, ZoningSection } from "@/lib/facts-types";
import { lngLatToTile } from "@/lib/tile";
import type { LatLng } from "@/lib/types";

/**
 * 国土交通省「不動産情報ライブラリ」API（要 API キー・無料）
 * https://www.reinfolib.mlit.go.jp/help/apiManual/
 * ベクタタイル（GeoJSON）を取得し、地点を含むポリゴンをサーバー側で判定する。
 */
const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";
const TILE_ZOOM = 15;

type Geometry =
  | { type: "Point"; coordinates: number[] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };
type Feature = { geometry: Geometry | null; properties: Record<string, unknown> };
type FeatureCollection = { features?: Feature[] };

export function hasReinfolibKey(): boolean {
  return Boolean(process.env.REINFOLIB_API_KEY);
}

async function fetchTile(api: string, center: LatLng, z = TILE_ZOOM): Promise<Feature[]> {
  return fetchTileXY(api, lngLatToTile(center, z));
}

async function fetchTileXY(api: string, t: { z: number; x: number; y: number }): Promise<Feature[]> {
  const key = process.env.REINFOLIB_API_KEY;
  if (!key) throw new Error("REINFOLIB_API_KEY missing");
  const url = `${BASE}/${api}?response_format=geojson&z=${t.z}&x=${t.x}&y=${t.y}`;
  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": key },
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (res.status === 404) return []; // データ無し
  if (!res.ok) throw new Error(`reinfolib ${api} ${res.status}`);
  const json = (await res.json()) as FeatureCollection;
  return json.features ?? [];
}

// --- 点とポリゴンの内外判定（レイキャスティング） ---
function inRing(p: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    const intersects = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function inPolygon(p: LatLng, poly: number[][][]): boolean {
  const [outer, ...holes] = poly;
  if (!outer || !inRing(p, outer)) return false;
  return !holes.some((h) => inRing(p, h));
}

function contains(p: LatLng, g: Geometry | null): boolean {
  if (!g || g.type === "Point") return false;
  if (g.type === "Polygon") return inPolygon(p, g.coordinates);
  return g.coordinates.some((poly) => inPolygon(p, poly));
}

function findContaining(features: Feature[], p: LatLng): Feature | null {
  return features.find((f) => contains(p, f.geometry)) ?? null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : typeof v === "number" ? String(v) : null;
}

/** "900.0%" / "80%" / "60.0" → "900" / "80" / "60"（表示側で % を付ける） */
function ratio(v: unknown): string | null {
  const raw = str(v);
  if (!raw) return null;
  const n = Number(raw.replace("%", "").trim());
  return Number.isFinite(n) ? String(Math.round(n)) : raw;
}

/** 用途地域から高さ制限の目安を導く（正確な数値は自治体の都市計画図で確認） */
function heightNote(useArea: string | null): string | null {
  if (!useArea) return null;
  if (/低層住居専用|田園住居/.test(useArea)) {
    return "絶対高さ制限 10m または 12m（自治体の都市計画で指定）＋北側斜線制限";
  }
  if (/中高層住居専用/.test(useArea)) {
    return "絶対高さ制限なし。北側斜線・道路斜線・日影規制あり（高度地区の指定があればそれに従う）";
  }
  return "絶対高さ制限なし。道路斜線・隣地斜線・日影規制、高度地区の指定に従う";
}

export async function fetchZoning(center: LatLng): Promise<ZoningSection> {
  const [useFeatures, fireFeatures] = await Promise.all([
    fetchTile("XKT002", center),
    fetchTile("XKT014", center).catch(() => [] as Feature[]),
  ]);
  const use = findContaining(useFeatures, center)?.properties ?? {};
  const fire = findContaining(fireFeatures, center)?.properties ?? {};
  const useArea = str(use.use_area_ja);

  return {
    status: "ok",
    useArea,
    floorAreaRatio: ratio(use.u_floor_area_ratio_ja),
    buildingCoverageRatio: ratio(use.u_building_coverage_ratio_ja),
    fireZone: str(fire.fire_prevention_ja),
    prefecture: str(use.prefecture),
    city: str(use.city_name),
    heightNote: heightNote(useArea),
  };
}

/** 学区データ（A27: 小学校区, A32: 中学校区）の属性はプレフィックスが違うだけなので末尾番号で読む */
function districtField(props: Record<string, unknown>, suffix: string): string | null {
  const key = Object.keys(props).find((k) => new RegExp(`_${suffix}(_ja)?$`).test(k));
  return key ? str(props[key]) : null;
}

type SchoolPoint = { code: string | null; name: string; location: LatLng };

function toSchoolPoint(f: Feature): SchoolPoint | null {
  const g = f.geometry;
  if (!g || g.type !== "Point") return null;
  const [lng, lat] = g.coordinates;
  const name = str(f.properties.P29_004_ja);
  if (lng === undefined || lat === undefined || !name) return null;
  return { code: str(f.properties.P29_002), name, location: { lat, lng } };
}

/** 「さいたま市立田島小学校」→「田島小学校」のように設置者名を落として比較する */
function normalizeSchoolName(name: string): string {
  return name.replace(/^.*?(市立|区立|町立|村立|組合立|都立|県立|府立|道立|私立|国立)/, "").replace(/\s/g, "");
}

/**
 * 学区データの学校を、学校データ（P29, 点）から探して所在地を付ける。
 * 学校コードで一致させ、無ければ名称で照合。学区が広い場合は隣接タイルも見る。
 */
async function locateSchool(
  center: LatLng,
  code: string | null,
  name: string | null,
  cache: Map<string, Promise<SchoolPoint[]>>,
): Promise<LatLng | null> {
  if (!name && !code) return null;
  const want = name ? normalizeSchoolName(name) : null;
  const match = (pts: SchoolPoint[]) =>
    pts.find((p) => code && p.code === code) ??
    pts.find((p) => want && normalizeSchoolName(p.name) === want) ??
    null;

  const z = 13;
  const t = lngLatToTile(center, z);
  const load = (dx: number, dy: number) => {
    const key = `${z}/${t.x + dx}/${t.y + dy}`;
    let p = cache.get(key);
    if (!p) {
      p = fetchTileXY("XKT006", { z, x: t.x + dx, y: t.y + dy })
        .then((fs) => fs.map(toSchoolPoint).filter((x): x is SchoolPoint => x !== null))
        .catch(() => [] as SchoolPoint[]);
      cache.set(key, p);
    }
    return p;
  };

  const here = match(await load(0, 0));
  if (here) return here.location;

  // 隣接 8 タイル
  const neighbors = await Promise.all(
    [-1, 0, 1].flatMap((dx) => [-1, 0, 1].filter((dy) => dx !== 0 || dy !== 0).map((dy) => load(dx, dy))),
  );
  return match(neighbors.flat())?.location ?? null;
}

async function schoolInfo(
  center: LatLng,
  districtFeatures: Feature[],
  cache: Map<string, Promise<SchoolPoint[]>>,
): Promise<SchoolInfo | null> {
  const props = findContaining(districtFeatures, center)?.properties;
  if (!props) return null;
  const name = districtField(props, "004");
  if (!name) return null;
  const code = districtField(props, "003");
  const address = districtField(props, "005");
  const location = await locateSchool(center, code, name, cache);
  return { name, code, address, location };
}

export async function fetchSchools(center: LatLng): Promise<SchoolSection> {
  const [elem, jh] = await Promise.all([fetchTile("XKT004", center), fetchTile("XKT005", center)]);
  const cache = new Map<string, Promise<SchoolPoint[]>>();
  const [elementary, juniorHigh] = await Promise.all([
    schoolInfo(center, elem, cache),
    schoolInfo(center, jh, cache),
  ]);
  return { status: "ok", elementary, juniorHigh };
}

function meshCentroid(g: Geometry | null): LatLng | null {
  if (!g || g.type === "Point") return null;
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0]?.[0];
  if (!ring || ring.length === 0) return null;
  let lng = 0;
  let lat = 0;
  for (const [x = 0, y = 0] of ring) {
    lng += x;
    lat += y;
  }
  return { lng: lng / ring.length, lat: lat / ring.length };
}

function approxDistanceM(a: LatLng, b: LatLng): number {
  const dy = (b.lat - a.lat) * 111_000;
  const dx = (b.lng - a.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

function pop(props: Record<string, unknown>, year: number): number {
  const n = Number(props[`PTN_${year}`]);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export async function fetchPopulation(center: LatLng): Promise<PopulationSection> {
  // z=14 のタイル（約2.4km四方）で 500m 圏を概ねカバーできる
  const features = await fetchTile("XKT013", center, 14);
  const here = findContaining(features, center)?.properties;

  const around = features.filter((f) => {
    const c = meshCentroid(f.geometry);
    return c ? approxDistanceM(center, c) <= 500 : false;
  });
  const sum = (year: number) => around.reduce((acc, f) => acc + pop(f.properties, year), 0);

  return {
    status: "ok",
    mesh: here ? { y2020: pop(here, 2020), y2030: pop(here, 2030), y2050: pop(here, 2050) } : null,
    around500m: around.length
      ? { y2020: sum(2020), y2030: sum(2030), y2050: sum(2050), meshCount: around.length }
      : null,
  };
}
