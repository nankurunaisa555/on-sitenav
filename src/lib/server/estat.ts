import type { RentStats } from "@/lib/facts-types";

/**
 * e-Stat API（政府統計の総合窓口）から、令和5年住宅・土地統計調査の市区町村別家賃を取る。
 * https://www.e-stat.go.jp/api/
 *  - 112-3-2 (0004021480): 住宅の種類別 借家の1か月当たり家賃（平均）
 *  - 123-3-1 (0004021512): 建て方×世帯人員×家賃階級別 借家世帯数（分布）
 */
const API = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";
const TABLE_AVG = "0004021480";
const TABLE_DIST = "0004021512";
const SURVEY_YEAR = 2023;

type ClassItem = { "@code": string; "@name": string };
type ClassObj = { "@id": string; "@name": string; CLASS: ClassItem | ClassItem[] };
type Value = Record<string, string> & { $: string };
type StatsData = {
  GET_STATS_DATA?: {
    RESULT?: { STATUS?: number; ERROR_MSG?: string };
    STATISTICAL_DATA?: {
      CLASS_INF?: { CLASS_OBJ: ClassObj | ClassObj[] };
      DATA_INF?: { VALUE?: Value | Value[] };
    };
  };
};
type Stats = NonNullable<StatsData["GET_STATS_DATA"]>;

export function hasEstatKey(): boolean {
  return Boolean(process.env.ESTAT_APP_ID);
}

function arr<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

async function getStats(statsDataId: string, areaCode: string): Promise<Stats | null> {
  const appId = process.env.ESTAT_APP_ID;
  if (!appId) return null;
  const params = new URLSearchParams({
    appId,
    statsDataId,
    cdArea: areaCode,
    metaGetFlg: "Y",
    cntGetFlg: "N",
    explanationGetFlg: "N",
    annotationGetFlg: "N",
  });
  const res = await fetch(`${API}?${params}`, { next: { revalidate: 60 * 60 * 24 * 30 } });
  if (!res.ok) throw new Error(`e-Stat ${res.status}`);
  const json = (await res.json()) as StatsData;
  const data = json.GET_STATS_DATA;
  if (data?.RESULT?.STATUS !== 0) throw new Error(`e-Stat: ${data?.RESULT?.ERROR_MSG ?? "unknown error"}`);
  return data;
}

/** 分類名（例: 住宅の建て方）→ その分類の id（cat01 など）と code→name 辞書 */
function findClass(data: Stats, namePattern: RegExp): { id: string; names: Map<string, string> } | null {
  for (const obj of arr(data.STATISTICAL_DATA?.CLASS_INF?.CLASS_OBJ)) {
    if (namePattern.test(obj["@name"])) {
      return { id: obj["@id"], names: new Map(arr(obj.CLASS).map((c) => [c["@code"], c["@name"]])) };
    }
  }
  return null;
}

function codeOf(names: Map<string, string>, pattern: RegExp): string | null {
  for (const [code, name] of names) if (pattern.test(name)) return code;
  return null;
}

function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 「40,000～60,000円未満」→ 40000、「200,000円以上」→ 200000、「0円」→ 0 */
function binLower(name: string): number | null {
  const m = name.replace(/,/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

type Bin = { label: string; lower: number; households: number };

/** 階級分布から中央値を線形補間で概算 */
function medianOf(bins: Bin[]): number | null {
  const total = bins.reduce((a, b) => a + b.households, 0);
  if (total <= 0) return null;
  let acc = 0;
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i]!;
    if (acc + b.households >= total / 2) {
      const upper = bins[i + 1]?.lower ?? b.lower * 1.5;
      return Math.round(b.lower + ((total / 2 - acc) / b.households) * (upper - b.lower));
    }
    acc += b.households;
  }
  return null;
}

/** e-Stat の市区町村コードは JIS 5桁。政令市の区もそのまま5桁 */
export async function fetchRentStats(cityCode: string, cityName: string): Promise<RentStats> {
  const [avg, dist] = await Promise.all([getStats(TABLE_AVG, cityCode), getStats(TABLE_DIST, cityCode)]);
  const empty: RentStats = { status: "unavailable", year: SURVEY_YEAR, city: cityName, averages: [], bins: [], median: null };
  if (!avg && !dist) return empty;

  // ---- 平均家賃: 専用住宅・家賃0円を含まない ----
  const averages: { label: string; yen: number }[] = [];
  if (avg) {
    const kind = findClass(avg, /住宅の種類/);
    const zero = findClass(avg, /家賃の平均|０円|0円/);
    const kindCode = kind ? (codeOf(kind.names, /専用住宅/) ?? codeOf(kind.names, /総数/)) : null;
    const zeroCode = zero ? codeOf(zero.names, /含まない/) : null;
    const hit = arr(avg.STATISTICAL_DATA?.DATA_INF?.VALUE).find(
      (v) => (!kind || v[`@${kind.id}`] === kindCode) && (!zero || v[`@${zero.id}`] === zeroCode),
    );
    const yen = num(hit?.$);
    if (yen) averages.push({ label: "借家（専用住宅）平均", yen });
  }

  // ---- 家賃階級の分布（建て方: 総数 / 一戸建 / 共同住宅、世帯人員: 総数） ----
  let bins: Bin[] = [];
  let median: number | null = null;
  if (dist) {
    const style = findClass(dist, /建て方/);
    const size = findClass(dist, /世帯人員/);
    const rent = findClass(dist, /家賃/);
    const values = arr(dist.STATISTICAL_DATA?.DATA_INF?.VALUE);
    const sizeTotal = size ? codeOf(size.names, /総数/) : null;

    const binsFor = (styleCode: string | null): Bin[] => {
      const out: Bin[] = [];
      for (const v of values) {
        if (style && styleCode !== null && v[`@${style.id}`] !== styleCode) continue;
        if (size && sizeTotal !== null && v[`@${size.id}`] !== sizeTotal) continue;
        const name = rent ? (rent.names.get(v[`@${rent.id}`] ?? "") ?? "") : "";
        if (!name || /総数|不詳|^0円$|^０円$/.test(name)) continue;
        const lower = binLower(name);
        const n = num(v.$);
        if (lower === null || n === null) continue;
        out.push({ label: name.replace(/円/g, "").replace(/～/g, "〜").replace(/未満$/, ""), lower, households: n });
      }
      return out.sort((a, b) => a.lower - b.lower);
    };

    bins = binsFor(style ? codeOf(style.names, /総数/) : null);
    median = medianOf(bins);
    if (style) {
      for (const [label, pattern] of [
        ["一戸建 中央値", /一戸建/],
        ["共同住宅 中央値", /共同住宅/],
      ] as const) {
        const code = codeOf(style.names, pattern);
        const m = code ? medianOf(binsFor(code)) : null;
        if (m) averages.push({ label, yen: m });
      }
    }
  }

  return { status: "ok", year: SURVEY_YEAR, city: cityName, averages, bins, median };
}
