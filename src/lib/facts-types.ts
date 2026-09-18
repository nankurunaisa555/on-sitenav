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

export type LandformInfo = {
  code: string;
  /** 地形分類名（例: 氾濫平野・海岸平野, 盛土地･埋立地） */
  name: string;
  /** 土地の成り立ち */
  origin: string;
  /** その地形に伴う自然災害リスクの説明 */
  risk: string;
  /** 国土地理院の凡例色 */
  color: string | null;
};

export type LandformSection = {
  status: SectionStatus;
  /** 自然地形（台地・段丘、氾濫平野 など） */
  natural: LandformInfo | null;
  /** 人工地形（盛土地・切土地 など）。改変が無ければ null */
  artificial: LandformInfo | null;
  /** 地理院地図（地形分類レイヤー表示） */
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
  landform: LandformSection;
  zoning: ZoningSection;
  school: SchoolSection;
  population: PopulationSection;
  /** 犯罪マップなど、外部で確認するためのリンク */
  links: { label: string; url: string }[];
};
