import { NextResponse } from "next/server";
import type {
  FactsResponse,
  HazardSection,
  PopulationSection,
  QuakeSection,
  SchoolSection,
  SectionStatus,
  ZoningSection,
} from "@/lib/facts-types";
import { disaportalUrl } from "@/lib/hazard-layers";
import { sampleHazards } from "@/lib/server/hazard";
import { fetchQuake, jshisUrl } from "@/lib/server/jshis";
import { fetchPopulation, fetchSchools, fetchZoning, hasReinfolibKey } from "@/lib/server/reinfolib";
import type { LatLng } from "@/lib/types";

export const runtime = "nodejs";

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expires: number; data: FactsResponse }>();

function parseCoord(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** データ元ごとに失敗を閉じ込め、1つ落ちても他のセクションは返す */
async function section<T extends { status: SectionStatus }>(
  label: string,
  run: () => Promise<T>,
  fallback: (status: SectionStatus) => T,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[api/facts] ${label}:`, err);
    return fallback("error");
  }
}

const emptyQuake = (center: LatLng, status: SectionStatus): QuakeSection => ({
  status,
  p30Int55: null,
  p30Int50: null,
  arv: null,
  landform: null,
  sourceUrl: jshisUrl(center),
});
const emptyZoning = (status: SectionStatus): ZoningSection => ({
  status,
  useArea: null,
  floorAreaRatio: null,
  buildingCoverageRatio: null,
  fireZone: null,
  prefecture: null,
  city: null,
  heightNote: null,
});
const emptySchool = (status: SectionStatus): SchoolSection => ({ status, elementary: null, juniorHigh: null });
const emptyPopulation = (status: SectionStatus): PopulationSection => ({ status, mesh: null, around500m: null });

function crimeMapLinks(prefecture: string | null): { label: string; url: string }[] {
  // 都道府県警ごとに Web 地図が分かれており API は無い。代表的なものを直リンク、それ以外は検索へ
  const direct: Record<string, string> = {
    東京都: "https://map.digipolice.jp/",
    神奈川県: "https://www.police.pref.kanagawa.jp/mes/mesf0212.htm",
    大阪府: "https://www.police.pref.osaka.lg.jp/seikatsu/anzen/1/8296.html",
    愛知県: "https://www.pref.aichi.jp/police/anzen/anzenmap/",
  };
  const links = [];
  if (prefecture && direct[prefecture]) {
    links.push({ label: `犯罪発生マップ（${prefecture}警察）`, url: direct[prefecture] });
  } else {
    const q = encodeURIComponent(`${prefecture ?? ""} 警察 犯罪発生マップ`.trim());
    links.push({ label: "犯罪発生マップを検索", url: `https://www.google.com/search?q=${q}` });
  }
  return links;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseCoord(searchParams.get("lat"), -90, 90);
  const lng = parseCoord(searchParams.get("lng"), -180, 180);
  if (lat === null || lng === null) {
    return NextResponse.json({ error: "lat と lng は必須です" }, { status: 400 });
  }
  const center: LatLng = { lat, lng };

  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT" } });
  }

  const reinfo = hasReinfolibKey();

  const [hazard, quake, zoning, school, population] = await Promise.all([
    section<HazardSection>(
      "hazard",
      async () => ({ status: "ok", items: await sampleHazards(center), sourceUrl: disaportalUrl(lat, lng) }),
      (status) => ({ status, items: [], sourceUrl: disaportalUrl(lat, lng) }),
    ),
    section("quake", () => fetchQuake(center), (s) => emptyQuake(center, s)),
    reinfo ? section("zoning", () => fetchZoning(center), emptyZoning) : emptyZoning("unavailable"),
    reinfo ? section("school", () => fetchSchools(center), emptySchool) : emptySchool("unavailable"),
    reinfo ? section("population", () => fetchPopulation(center), emptyPopulation) : emptyPopulation("unavailable"),
  ]);

  const data: FactsResponse = {
    hazard,
    quake,
    zoning,
    school,
    population,
    links: crimeMapLinks(zoning.prefecture),
  };
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
  return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
}
