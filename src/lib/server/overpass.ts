import { distanceMeters } from "@/lib/geo";
import { NIMBY_KIND_MAP, type NimbyKindKey } from "@/lib/nimby";
import type { LatLng, NimbyPlace } from "@/lib/types";

/**
 * OpenStreetMap（Overpass API）から嫌悪施設に相当する地物を取る。
 * Google Places のテキスト検索は1クエリ最大20件で寺社・墓地・変電所などを取りこぼすため、
 * タグで網羅的に引ける OSM を併用する。無料・キー不要だが公開サーバーなので控えめに使う。
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const TIMEOUT_MS = 15_000;

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** OSM タグ → 種別。上から順に評価 */
const TAG_RULES: readonly { match: (t: Record<string, string>) => boolean; kind: NimbyKindKey; fallbackName: string }[] = [
  { match: (t) => t.amenity === "crematorium", kind: "crematory", fallbackName: "火葬場" },
  { match: (t) => t.landuse === "cemetery" || t.amenity === "grave_yard", kind: "cemetery", fallbackName: "墓地" },
  {
    match: (t) => t.amenity === "place_of_worship" && (t.religion === "shinto" || t.religion === "buddhist" || !t.religion),
    kind: "shrine",
    fallbackName: "神社・寺（名称不明）",
  },
  { match: (t) => t.shop === "funeral_directors", kind: "funeral", fallbackName: "葬儀社" },
  { match: (t) => t.amenity === "gambling" || t.leisure === "adult_gaming_centre" || t.shop === "pachinko", kind: "pachinko", fallbackName: "パチンコ店" },
  { match: (t) => t.amenity === "nightclub" || t.amenity === "stripclub" || t.amenity === "brothel", kind: "adult", fallbackName: "風俗店" },
  { match: (t) => t.amenity === "fuel", kind: "gas", fallbackName: "ガソリンスタンド" },
  { match: (t) => t.man_made === "gasometer" || t.man_made === "storage_tank" && /gas|lpg/i.test(t.content ?? ""), kind: "gastank", fallbackName: "ガスタンク" },
  { match: (t) => t.power === "substation", kind: "substation", fallbackName: "変電所" },
  { match: (t) => t.man_made === "wastewater_plant", kind: "sewage", fallbackName: "下水処理場" },
  {
    match: (t) => t.amenity === "waste_transfer_station" || t.man_made === "incinerator" || t.landuse === "landfill" || t.amenity === "recycling" && t.recycling_type === "centre",
    kind: "waste",
    fallbackName: "ごみ処理施設",
  },
  { match: (t) => t.landuse === "farmyard" || t.building === "barn" || t.building === "sty" || t.building === "cowshed", kind: "livestock", fallbackName: "畜舎" },
  { match: (t) => t.building === "warehouse" && Boolean(t.name), kind: "logistics", fallbackName: "倉庫" },
  { match: (t) => t.man_made === "works" || (t.landuse === "industrial" && Boolean(t.name)), kind: "factory", fallbackName: "工場" },
];

function buildQuery(center: LatLng, radiusM: number): string {
  const a = `(around:${radiusM},${center.lat},${center.lng})`;
  const selectors = [
    "[amenity=place_of_worship]",
    "[landuse=cemetery]",
    "[amenity=grave_yard]",
    "[amenity=crematorium]",
    "[amenity=fuel]",
    "[power=substation]",
    "[man_made=wastewater_plant]",
    "[man_made=gasometer]",
    "[man_made=works]",
    "[landuse=industrial][name]",
    "[amenity=waste_transfer_station]",
    "[man_made=incinerator]",
    "[landuse=landfill]",
    "[landuse=farmyard]",
    "[building=warehouse][name]",
    "[amenity=gambling]",
    "[amenity=nightclub]",
    "[amenity=stripclub]",
    "[amenity=brothel]",
    "[shop=funeral_directors]",
  ];
  return `[out:json][timeout:20];(${selectors.map((s) => `nwr${a}${s};`).join("")});out center tags;`;
}

async function runQuery(query: string): Promise<OsmElement[]> {
  let lastErr: unknown = null;
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "on-sitenav/1.0 (+https://on-sitenav.vercel.app)" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith("{")) throw new Error(`overpass ${res.status}`);
      return (JSON.parse(text) as { elements?: OsmElement[] }).elements ?? [];
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("overpass failed");
}

export async function fetchOsmNimby(center: LatLng, radiusM: number): Promise<NimbyPlace[]> {
  const elements = await runQuery(buildQuery(center, radiusM));
  const out: NimbyPlace[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    if (lat === undefined || lng === undefined) continue;
    const rule = TAG_RULES.find((r) => r.match(tags));
    if (!rule) continue;
    const kind = NIMBY_KIND_MAP.get(rule.kind);
    if (!kind) continue;
    const name = tags["name:ja"] ?? tags.name ?? rule.fallbackName;
    const location = { lat, lng };
    const address = [tags["addr:city"], tags["addr:quarter"] ?? tags["addr:neighbourhood"], tags["addr:block_number"]]
      .filter(Boolean)
      .join("");
    out.push({
      id: `osm:${el.type}/${el.id}`,
      name,
      category: "nimby",
      location,
      address,
      distanceM: distanceMeters(center, location),
      sub: { key: kind.key, label: kind.label, emoji: kind.emoji },
    });
  }
  return out;
}
