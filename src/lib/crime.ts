import type { LatLng } from "./types";

/** scripts/build-crime-data.mjs が生成する JSON の形 */
export type CrimeDataset = {
  prefCode: number;
  pref: string;
  year: number;
  /** 手口名。points[].c の並びと対応 */
  types: string[];
  total: number;
  unmatched: number;
  generatedAt: string;
  source: string;
  sourceUrl: string;
  points: CrimePoint[];
};

export type CrimePoint = {
  /** 「さいたま市南区 白幡４丁目」 */
  n: string;
  lat: number;
  lng: number;
  /** 手口別件数 */
  c: number[];
};

/** データを用意している都道府県コード。JIS X 0401 */
export const CRIME_PREFS: Record<number, { name: string; load: () => Promise<CrimeDataset> }> = {
  11: {
    name: "埼玉県",
    load: () => import("@/data/crime-11.json").then((m) => m.default as CrimeDataset),
  },
};

/** 緯度経度からおおまかに都道府県を判定する（データが県単位なので、どの県のデータを読むか決めるため） */
export function guessPrefCode(p: LatLng): number | null {
  // 埼玉県の外接矩形（多少はみ出しても隣県データが無いだけで害はない）
  if (p.lat >= 35.72 && p.lat <= 36.29 && p.lng >= 138.7 && p.lng <= 139.95) return 11;
  return null;
}

export function crimeTotal(pt: CrimePoint): number {
  return pt.c.reduce((a, b) => a + b, 0);
}

/** 年間件数 → 円の色。町丁目単位の窃盗件数なので、数件〜100件超の幅を対数的に割り当てる */
export function crimeColor(total: number): string {
  if (total >= 60) return "#7f1d1d";
  if (total >= 30) return "#b91c1c";
  if (total >= 15) return "#dc2626";
  if (total >= 8) return "#f97316";
  if (total >= 3) return "#f59e0b";
  return "#fcd34d";
}

/** 年間件数 → 円の半径（m）。町丁目の広さ（数百 m）を超えないように上限を置く */
export function crimeRadiusM(total: number): number {
  return Math.min(220, 40 + Math.sqrt(total) * 18);
}

export const CRIME_LEGEND: readonly { label: string; color: string }[] = [
  { label: "1〜2件", color: crimeColor(1) },
  { label: "3〜7件", color: crimeColor(3) },
  { label: "8〜14件", color: crimeColor(8) },
  { label: "15〜29件", color: crimeColor(15) },
  { label: "30〜59件", color: crimeColor(30) },
  { label: "60件以上", color: crimeColor(60) },
];
