import type { Appraisal, LandPricePoint } from "@/lib/facts-types";
import { distanceMeters } from "@/lib/geo";

/**
 * 不動産情報ライブラリ XCT001（鑑定評価書情報）。
 * 地価公示の標準地ごとに、相続税路線価・高度地区の高さ・利回り・前面道路などが入っている。
 * 都道府県×用途区分×年で一括取得（数百 KB）し、座標で地価公示地点に紐付ける。
 */
const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";

/** XPT002 の用途（use_category_name_ja）→ XCT001 の division */
const DIVISION_BY_USE: Record<string, string> = {
  住宅地: "00",
  宅地見込地: "03",
  商業地: "05",
  準工業地: "07",
  工業地: "09",
  市街化調整区域内宅地: "10",
  市街化調整区域内林地: "13",
};

/** 標準地と鑑定評価書を同一とみなす距離 */
const MATCH_M = 25;

type Row = Record<string, string | number | undefined>;

async function fetchDivision(year: number, prefCode: string, division: string): Promise<Row[]> {
  const key = process.env.REINFOLIB_API_KEY;
  if (!key) return [];
  const res = await fetch(`${BASE}/XCT001?year=${year}&area=${prefCode}&division=${division}`, {
    headers: { "Ocp-Apim-Subscription-Key": key },
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: Row[] };
  return json.data ?? [];
}

function num(v: string | number | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: string | number | undefined): string | null {
  const s = v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
}

function toAppraisal(r: Row): Appraisal {
  const heightKind = str(r["標準地 法令上の規制等 その他 高度地区1 高度区分"]);
  const height = num(r["標準地 法令上の規制等 その他 高度地区1 高度"]);
  const road = [
    str(r["標準地 接面道路の状況 前面道路 方位"]),
    (() => {
      const w = num(r["標準地 接面道路の状況 前面道路 道路幅員"]);
      return w ? `${w}m` : null;
    })(),
    str(r["標準地 接面道路の状況 前面道路 道路種別"]),
  ]
    .filter(Boolean)
    .join("・");

  return {
    routePrice: num(r["路線価 相続税路線価"]) || null,
    routePriceYear: num(r["路線価 年"]),
    heightLimit: height && height > 0 ? `${heightKind ?? "最高"} ${height}m` : null,
    baseCoverageRatio: num(r["標準地 法令上の規制等 その他 基準建ぺい率"]),
    baseFloorAreaRatio: num(r["標準地 法令上の規制等 その他 基準容積率"]),
    comparablePrice: num(r["鑑定評価手法の適用 取引事例比較法比準価格"]) || null,
    incomePrice: num(r["鑑定評価手法の適用 収益還元法 収益価格"]) || null,
    capRate: num(r["収益価格算定内訳還元利回り"]) || null,
    frontRoad: road || null,
    areaDivision: str(r["標準地 法令上の規制等 区域区分"]),
    currentUse: str(r["標準地 土地利用の現況 現況"]),
  };
}

/** 地価公示地点の配列に鑑定評価書の情報を付け足して返す（地価調査地点は対象外） */
export async function attachAppraisals(points: LandPricePoint[], year: number): Promise<LandPricePoint[]> {
  const targets = points.filter((p) => p.kind === "地価公示" && p.cityCode && p.useCategory);
  if (targets.length === 0) return points;

  // 必要な（県, 用途区分）だけ取得
  const combos = new Set<string>();
  for (const p of targets) {
    const div = DIVISION_BY_USE[p.useCategory ?? ""];
    if (div) combos.add(`${p.cityCode!.slice(0, 2)}|${div}`);
  }
  const rowsByCombo = new Map<string, Row[]>();
  await Promise.all(
    [...combos].map(async (c) => {
      const [pref, div] = c.split("|") as [string, string];
      rowsByCombo.set(c, await fetchDivision(year, pref, div).catch(() => []));
    }),
  );

  return points.map((p) => {
    const div = DIVISION_BY_USE[p.useCategory ?? ""];
    if (p.kind !== "地価公示" || !div || !p.cityCode) return p;
    const rows = rowsByCombo.get(`${p.cityCode.slice(0, 2)}|${div}`) ?? [];
    const hit = rows.find((r) => {
      const lat = num(r["位置座標 緯度"]);
      const lng = num(r["位置座標 経度"]);
      return lat !== null && lng !== null && distanceMeters(p.location, { lat, lng }) <= MATCH_M;
    });
    return hit ? { ...p, appraisal: toAppraisal(hit) } : p;
  });
}
