import type { CivicPlace, CivicSection } from "@/lib/facts-types";
import { distanceMeters } from "@/lib/geo";
import { lngLatToTile } from "@/lib/tile";
import type { LatLng } from "@/lib/types";

/**
 * 役所（本庁）と図書館。半径に関係なく「最寄り」を返す。
 *  - XKT018 市区町村役場及び集会施設等（P05）: P05_002=1 が本庁（市役所・区役所・町村役場）
 *  - XKT017 図書館（P27）
 *  - XKT013 将来推計人口メッシュの SHICODE で、基準点の市区町村コード（政令市は区）を得る
 */
const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";
const LIBRARY_COUNT = 2;

type Geometry = { type: "Point" | "Polygon" | "MultiPolygon" | string; coordinates: unknown };
type Feature = { geometry: Geometry | null; properties: Record<string, unknown> };

async function fetchTileXY(api: string, z: number, x: number, y: number): Promise<Feature[]> {
  const key = process.env.REINFOLIB_API_KEY;
  if (!key) throw new Error("REINFOLIB_API_KEY missing");
  // api に "XPT002?year=2026" のように追加パラメータを含めてもよい
  const sep = api.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}/${api}${sep}response_format=geojson&z=${z}&x=${x}&y=${y}`, {
    headers: { "Ocp-Apim-Subscription-Key": key },
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`reinfolib ${api} ${res.status}`);
  const json = (await res.json()) as { features?: Feature[] };
  return json.features ?? [];
}

/** 中心タイルと周囲 (2r+1)^2 タイル */
async function fetchAround(api: string, center: LatLng, z: number, r: number): Promise<Feature[]> {
  const t = lngLatToTile(center, z);
  const coords: [number, number][] = [];
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) coords.push([t.x + dx, t.y + dy]);
  const results = await Promise.all(coords.map(([x, y]) => fetchTileXY(api, z, x, y).catch(() => [] as Feature[])));
  return results.flat();
}

function pointOf(f: Feature): LatLng | null {
  const g = f.geometry;
  if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) return null;
  const [lng, lat] = g.coordinates as number[];
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

function containsPolygon(p: LatLng, g: Geometry | null): boolean {
  if (!g) return false;
  if (g.type === "Polygon") {
    const ring = (g.coordinates as number[][][])[0];
    return Boolean(ring && inRing(p, ring));
  }
  if (g.type === "MultiPolygon") {
    return (g.coordinates as number[][][][]).some((poly) => poly[0] && inRing(p, poly[0]));
  }
  return false;
}

/**
 * 基準点の市区町村コード（政令市は区）。
 * 1) 250m メッシュ人口の SHICODE → 2) 用途地域ポリゴンの city_code → 3) 最寄りの地価公示地点の city_code
 * （住人のいない業務地区ではメッシュが無いことがあるため多段にしている）
 */
async function cityCodeOf(center: LatLng): Promise<string | null> {
  const t14 = lngLatToTile(center, 14);
  const t15 = lngLatToTile(center, 15);
  const [mesh, zoning, prices] = await Promise.all([
    fetchTileXY("XKT013", 14, t14.x, t14.y).catch(() => [] as Feature[]),
    fetchTileXY("XKT002", 15, t15.x, t15.y).catch(() => [] as Feature[]),
    fetchTileXY(`XPT002?year=${new Date().getFullYear()}`, 14, t14.x, t14.y).catch(() => [] as Feature[]),
  ]);
  const m = mesh.find((f) => containsPolygon(center, f.geometry));
  if (m) return str(m.properties.SHICODE);
  const z = zoning.find((f) => containsPolygon(center, f.geometry));
  const zc = z ? str(z.properties.city_code) : null;
  if (zc && zc.length === 5) return zc;
  let best: { code: string; d: number } | null = null;
  for (const f of prices) {
    const loc = pointOf(f);
    const code = str(f.properties.city_code);
    if (!loc || !code) continue;
    const d = distanceMeters(center, loc);
    if (!best || d < best.d) best = { code, d };
  }
  return best?.code ?? zc ?? null;
}

/** 公立図書館らしい名前か（専門・大学図書館より優先して出す） */
function looksPublicLibrary(name: string): boolean {
  if (/大学|専門|附属|付属|企業|協会|証券|学園|学校|国会|支部|法務|研究/.test(name)) return false;
  return /市立|区立|町立|村立|都立|県立|府立|道立|市民|公民館|図書館|図書室/.test(name);
}

function toCivic(f: Feature, center: LatLng, name: string | null, address: string | null, kind: CivicPlace["kind"]): CivicPlace | null {
  const loc = pointOf(f);
  if (!loc || !name) return null;
  return {
    id: `${kind}:${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`,
    kind,
    name,
    address,
    location: loc,
    distanceM: Math.round(distanceMeters(center, loc)),
  };
}

export async function fetchCivic(center: LatLng): Promise<CivicSection> {
  const [cityCode, offices, libraries] = await Promise.all([
    cityCodeOf(center),
    fetchAround("XKT018", center, 13, 1), // 約15km四方
    fetchAround("XKT017", center, 13, 1),
  ]);

  // 役所: 同じ市区町村コードの本庁。無ければ範囲を広げて再検索、それでも無ければ最寄りの本庁
  const isMain = (f: Feature) => String(f.properties.P05_002) === "1";
  let offCandidates = offices.filter(isMain);
  let sameCity = cityCode ? offCandidates.filter((f) => str(f.properties.P05_001) === cityCode) : [];
  if (cityCode && sameCity.length === 0) {
    const wider = await fetchAround("XKT018", center, 12, 1); // 約30km四方
    offCandidates = wider.filter(isMain);
    sameCity = offCandidates.filter((f) => str(f.properties.P05_001) === cityCode);
  }
  const pool = sameCity.length > 0 ? sameCity : offCandidates;
  const cityHall = pool
    .map((f) => toCivic(f, center, str(f.properties.P05_003_ja), str(f.properties.P05_004_ja), "cityhall"))
    .filter((c): c is CivicPlace => c !== null)
    .sort((a, b) => a.distanceM - b.distanceM)[0] ?? null;

  const allLibs = libraries
    .map((f) => toCivic(f, center, str(f.properties.P27_005_ja), str(f.properties.P27_006_ja), "library"))
    .filter((c): c is CivicPlace => c !== null)
    .sort((a, b) => a.distanceM - b.distanceM);
  const publicLibs = allLibs.filter((l) => looksPublicLibrary(l.name));
  const libs = [...publicLibs, ...allLibs.filter((l) => !publicLibs.includes(l))].slice(0, LIBRARY_COUNT);

  return {
    status: "ok",
    cityCode,
    cityHall: cityHall ? { ...cityHall, sameCity: sameCity.length > 0 } : null,
    libraries: libs,
  };
}
