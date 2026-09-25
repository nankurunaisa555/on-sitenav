import { distanceMeters } from "@/lib/geo";
import { NIMBY_KIND_MAP, type NimbyKindKey } from "@/lib/nimby";
import type { LatLng, NimbyPlace } from "@/lib/types";

/**
 * Yahoo!オープンローカルプラットフォーム（YOLP）のローカルサーチ API。
 * Google の Places API はパチンコ店・ラブホテルを返さないため、業種コードで探せる YOLP で補う。
 * 無料（1アプリ 1日5万回まで）。環境変数 YAHOO_CLIENT_ID（Yahoo! JAPAN の Client ID）がなければ使わない。
 * 業種コード: https://developer.yahoo.co.jp/webapi/map/openlocalplatform/genre.html
 */
const ENDPOINT = "https://map.yahooapis.jp/search/local/V1/localSearch";
const TIMEOUT_MS = 10_000;

/** 業種コード → 種別。1コードずつ並列に問い合わせる（複数指定の可否が仕様に明記されていないため） */
const GENRES: readonly { code: string; kind: NimbyKindKey }[] = [
  { code: "0308001", kind: "pachinko" }, // パチンコ、パチスロ
  { code: "0304009", kind: "lovehotel" }, // ラブホテル
  { code: "0412009", kind: "waste" }, // ごみ処理
  { code: "0413006", kind: "waste" }, // 自動車解体
  { code: "0415001", kind: "funeral" }, // 葬祭業
  { code: "0415002", kind: "cemetery" }, // 霊園
  { code: "0412021", kind: "gas" }, // ガソリンスタンド
];

type YolpFeature = {
  Id?: string;
  Name?: string;
  Geometry?: { Coordinates?: string };
  Property?: { Uid?: string; Address?: string; Genre?: { Code?: string; Name?: string }[] };
};

export function yolpEnabled(): boolean {
  return Boolean(process.env.YAHOO_CLIENT_ID);
}

async function searchGenre(appid: string, center: LatLng, radiusM: number, code: string, signal: AbortSignal): Promise<YolpFeature[]> {
  const params = new URLSearchParams({
    appid,
    lat: String(center.lat),
    lon: String(center.lng),
    dist: (radiusM / 1000).toFixed(2),
    gc: code,
    sort: "geo",
    results: "50",
    output: "json",
  });
  const res = await fetch(`${ENDPOINT}?${params}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`yolp ${res.status}`);
  return ((await res.json()) as { Feature?: YolpFeature[] }).Feature ?? [];
}

export async function fetchYolpNimby(center: LatLng, radiusM: number): Promise<NimbyPlace[]> {
  const appid = process.env.YAHOO_CLIENT_ID;
  if (!appid) return [];
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const lists = await Promise.all(GENRES.map((g) => searchGenre(appid, center, radiusM, g.code, signal)));
  const out: NimbyPlace[] = [];
  const seen = new Set<string>();
  lists.forEach((features, i) => {
    const genreKind = NIMBY_KIND_MAP.get(GENRES[i]!.kind)!;
    for (const f of features) {
      const [lngStr, latStr] = (f.Geometry?.Coordinates ?? "").split(",");
      const lat = Number(latStr);
      const lng = Number(lngStr);
      const uid = f.Property?.Uid ?? f.Id;
      if (!f.Name || !uid || !Number.isFinite(lat) || !Number.isFinite(lng) || seen.has(uid)) continue;
      // 業種コードで決めるが、名称の除外語（ペット霊園・遺品整理など）にかかるものは落とす
      if (genreKind.exclude?.test(f.Name)) continue;
      const kind = genreKind;
      seen.add(uid);
      const location = { lat, lng };
      out.push({
        id: `yolp:${uid}`,
        name: f.Name,
        category: "nimby",
        location,
        address: f.Property?.Address ?? "",
        distanceM: distanceMeters(center, location),
        sub: { key: kind.key, label: kind.label, emoji: kind.emoji },
      });
    }
  });
  return out;
}
