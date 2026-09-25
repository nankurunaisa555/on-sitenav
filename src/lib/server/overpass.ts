import { distanceMeters } from "@/lib/geo";
import { classifyNimby, NIMBY_KIND_MAP, NIMBY_OSM_NAME_REGEX, type NimbyKindKey } from "@/lib/nimby";
import type { LatLng, NimbyPlace } from "@/lib/types";

/**
 * OpenStreetMap（Overpass API）から嫌悪施設に相当する地物を取る。
 * タグ（amenity=place_of_worship など）と、名称の語（工場・物流・斎場など）の両方で探す。
 * 無料・キー不要。探索の主役で、Google は業種タイプの Nearby Search 1回だけを併用する。
 * 公開サーバーなので控えめに使う（結果は API 側でキャッシュ）。
 */
/** 公開サーバー。本家が最も安定して速いので先頭。ほかは本家が遅いときの保険 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
/** 本家が この時間で返らなければ、次のサーバーにも同時に投げる（ヘッジ） */
const HEDGE_AFTER_MS = 5_000;
/** 全体の締め切り */
const DEADLINE_MS = 15_000;

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
  {
    // 日本の OSM ではラブホテルは amenity=love_hotel / love_hotel=* / hotel=love_hotel などで登録される
    match: (t) => t.amenity === "love_hotel" || Boolean(t.love_hotel && t.love_hotel !== "no") || t.hotel === "love_hotel",
    kind: "lovehotel",
    fallbackName: "ラブホテル",
  },
  { match: (t) => t.amenity === "fuel", kind: "gas", fallbackName: "ガソリンスタンド" },
  { match: (t) => t.man_made === "gasometer" || t.man_made === "storage_tank" && /gas|lpg/i.test(t.content ?? ""), kind: "gastank", fallbackName: "ガスタンク" },
  { match: (t) => t.power === "substation", kind: "substation", fallbackName: "変電所" },
  { match: (t) => t.man_made === "wastewater_plant", kind: "sewage", fallbackName: "下水処理場" },
  {
    match: (t) =>
      t.amenity === "waste_transfer_station" ||
      t.man_made === "incinerator" ||
      t.landuse === "landfill" ||
      t.industrial === "scrap_yard" ||
      t.amenity === "scrapyard" ||
      (t.amenity === "recycling" && t.recycling_type === "centre"),
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
    "[leisure=adult_gaming_centre]",
    "[shop=pachinko]",
    "[amenity=love_hotel]",
    "[love_hotel]",
    "[hotel=love_hotel]",
    "[industrial=scrap_yard]",
    "[amenity=scrapyard]",
    `[name~"${NIMBY_OSM_NAME_REGEX}"]`,
  ];
  return `[out:json][timeout:20];(${selectors.map((s) => `nwr${a}${s};`).join("")});out center tags;`;
}

async function queryEndpoint(ep: string, query: string, signal: AbortSignal): Promise<OsmElement[]> {
  const res = await fetch(ep, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "on-sitenav/1.0 (+https://on-sitenav.vercel.app)" },
    body: `data=${encodeURIComponent(query)}`,
    signal,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok || !text.startsWith("{")) throw new Error(`overpass ${res.status} ${ep}`);
  return (JSON.parse(text) as { elements?: OsmElement[] }).elements ?? [];
}

/**
 * 公開サーバーは混み具合で応答時間が大きくばらつき（同じ問い合わせで3秒〜40秒超）、混雑時は 429 も返す。
 * 本家に投げ、失敗したら即座に、返事がなければ HEDGE_AFTER_MS ごとに次のサーバーにも投げて、
 * 最初に返った結果を使う（残りは中断）。
 */
function runQuery(query: string): Promise<OsmElement[]> {
  return new Promise((resolve, reject) => {
    const controllers: AbortController[] = [];
    const errors: string[] = [];
    let next = 0;
    let running = 0;
    let settled = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      clearTimeout(deadline);
      controllers.forEach((c) => c.abort());
      fn();
    };
    const launch = () => {
      if (settled || next >= ENDPOINTS.length) return;
      const ep = ENDPOINTS[next++]!;
      const controller = new AbortController();
      controllers.push(controller);
      running++;
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, HEDGE_AFTER_MS);
      queryEndpoint(ep, query, controller.signal).then(
        (elements) => finish(() => resolve(elements)),
        (err: unknown) => {
          running--;
          errors.push(err instanceof Error ? err.message : String(err));
          if (next < ENDPOINTS.length) launch();
          else if (running === 0) finish(() => reject(new Error(`overpass failed: ${errors.join(" / ")}`)));
        },
      );
    };
    const deadline = setTimeout(() => finish(() => reject(new Error(`overpass deadline: ${errors.join(" / ")}`))), DEADLINE_MS);
    launch();
  });
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
    const osmName = tags["name:ja"] ?? tags.name;
    // タグで決まらなければ名称で判定（名称の語で拾った地物。除外語にかかれば落ちる）
    const kind = rule ? NIMBY_KIND_MAP.get(rule.kind) : osmName ? classifyNimby(osmName, []) : null;
    if (!kind) continue;
    const name = osmName ?? rule?.fallbackName ?? kind.label;
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
