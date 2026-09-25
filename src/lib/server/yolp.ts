import { distanceMeters } from "@/lib/geo";
import { classifyNimby, NIMBY_KIND_MAP, type NimbyKindKey } from "@/lib/nimby";
import type { LatLng, NimbyPlace } from "@/lib/types";

/**
 * Yahoo!オープンローカルプラットフォーム（YOLP）のローカルサーチ API。
 * Google の Places API はパチンコ店・ラブホテルを返さないため、業種コードで探せる YOLP で補う。
 * 無料（1アプリ 1日5万回まで）。環境変数 YAHOO_CLIENT_ID（Yahoo! JAPAN の Client ID）がなければ使わない。
 * 業種コード: https://developer.yahoo.co.jp/webapi/map/openlocalplatform/genre.html
 */
const ENDPOINT = "https://map.yahooapis.jp/search/local/V1/localSearch";
const TIMEOUT_MS = 10_000;

/**
 * 問い合わせ一覧（1件ずつ並列）。業種コード（gc）で探すものは種別が決まる。
 * 語句（query）で探すものは業種が空欄の登録（例: 解体・リサイクル業者）も拾えるが、無関係なものも混ざるので名称で判定する。
 */
const SEARCHES: readonly { gc?: string; query?: string; kind: NimbyKindKey | null }[] = [
  { gc: "0308001", kind: "pachinko" }, // パチンコ、パチスロ
  { query: "パチンコ", kind: null },
  { query: "スロット", kind: null },
  { gc: "0304009", kind: "lovehotel" }, // ラブホテル
  { gc: "0412009", kind: "waste" }, // ごみ処理
  { gc: "0413006", kind: "waste" }, // 自動車解体
  { query: "解体", kind: null },
  { query: "産業廃棄物", kind: null },
  { query: "リサイクル", kind: null },
  { gc: "0415001", kind: "funeral" }, // 葬祭業
  { gc: "0415002", kind: "cemetery" }, // 霊園
  { gc: "0412021", kind: "gas" }, // ガソリンスタンド
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

async function search(
  appid: string,
  center: LatLng,
  radiusM: number,
  s: (typeof SEARCHES)[number],
  signal: AbortSignal,
): Promise<YolpFeature[]> {
  const params = new URLSearchParams({
    appid,
    lat: String(center.lat),
    lon: String(center.lng),
    dist: (radiusM / 1000).toFixed(2),
    sort: "geo",
    results: "50",
    output: "json",
  });
  if (s.gc) params.set("gc", s.gc);
  if (s.query) params.set("query", s.query);
  const res = await fetch(`${ENDPOINT}?${params}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`yolp ${res.status}`);
  return ((await res.json()) as { Feature?: YolpFeature[] }).Feature ?? [];
}

export async function fetchYolpNimby(center: LatLng, radiusM: number): Promise<NimbyPlace[]> {
  const appid = process.env.YAHOO_CLIENT_ID;
  if (!appid) return [];
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const lists = await Promise.all(SEARCHES.map((s) => search(appid, center, radiusM, s, signal)));
  const out: NimbyPlace[] = [];
  const seen = new Set<string>();
  lists.forEach((features, i) => {
    const fixedKind = SEARCHES[i]!.kind;
    for (const f of features) {
      const [lngStr, latStr] = (f.Geometry?.Coordinates ?? "").split(",");
      const lat = Number(latStr);
      const lng = Number(lngStr);
      const uid = f.Property?.Uid ?? f.Id;
      if (!f.Name || !uid || !Number.isFinite(lat) || !Number.isFinite(lng) || seen.has(uid)) continue;
      // 業種コードで探したものはその種別（名称の除外語＝ペット霊園・遺品整理などは落とす）。
      // 語句で探したものは、業種がパチンコなら pachinko、それ以外は名称で判定（「リサイクルショップ」などは除外語で落ちる）
      const genreCodes = (f.Property?.Genre ?? []).map((g) => g.Code ?? "");
      let kind = fixedKind ? NIMBY_KIND_MAP.get(fixedKind)! : null;
      if (kind?.exclude?.test(f.Name)) continue;
      // 葬祭業・霊園に登録されたお寺は「神社・寺」として出す
      if (kind && (kind.key === "funeral" || kind.key === "cemetery") && classifyNimby(f.Name, [])?.key === "shrine") {
        kind = NIMBY_KIND_MAP.get("shrine")!;
      }
      if (!kind) {
        if (genreCodes.includes("0308001")) kind = NIMBY_KIND_MAP.get("pachinko")!;
        else if (genreCodes.some((c) => c.startsWith("02"))) continue; // ショッピング（リサイクルショップ等）は対象外
        else kind = classifyNimby(f.Name, []);
      }
      if (!kind) continue;
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
