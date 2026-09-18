/** /api/facts のレスポンス型。各セクションはデータ元ごとに独立して成否を持つ */

export type SectionStatus = "ok" | "error" | "unavailable";

export type HazardKey = "flood" | "naisui" | "hightide" | "tsunami" | "sediment";

export type HazardHit = {
  key: HazardKey;
  label: string;
  /** null = 該当なし。文字列 = 浸水深区分や区域種別 */
  level: string | null;
  /** 凡例色に一致しない着色があった場合 true（区分は不明だが該当あり） */
  uncertain: boolean;
};

export type HazardSection = {
  status: SectionStatus;
  items: HazardHit[];
  /** 重ねるハザードマップ（この地点） */
  sourceUrl: string;
};

export type QuakeSection = {
  status: SectionStatus;
  /** 30年以内に震度6弱以上の揺れに見舞われる確率（0〜1） */
  p30Int55: number | null;
  /** 30年以内に震度5強以上 */
  p30Int50: number | null;
  /** 表層地盤増幅率 */
  arv: number | null;
  /** 微地形区分名（例: 干拓地, 台地） */
  landform: string | null;
  sourceUrl: string;
};

export type ZoningSection = {
  status: SectionStatus;
  useArea: string | null;
  floorAreaRatio: string | null;
  buildingCoverageRatio: string | null;
  fireZone: string | null;
  prefecture: string | null;
  city: string | null;
  /** 用途地域から導いた高さ制限の目安 */
  heightNote: string | null;
};

export type SchoolSection = {
  status: SectionStatus;
  elementary: string | null;
  juniorHigh: string | null;
};

export type PopulationSection = {
  status: SectionStatus;
  /** 地点を含む 250m メッシュ */
  mesh: { y2020: number; y2030: number; y2050: number } | null;
  /** 地点から約500m 以内のメッシュ合計 */
  around500m: { y2020: number; y2030: number; y2050: number; meshCount: number } | null;
};

export type FactsResponse = {
  hazard: HazardSection;
  quake: QuakeSection;
  zoning: ZoningSection;
  school: SchoolSection;
  population: PopulationSection;
  /** 犯罪マップなど、外部で確認するためのリンク */
  links: { label: string; url: string }[];
};
