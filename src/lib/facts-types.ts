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

export type CrimeCounts = {
  total: number;
  byType: { type: string; count: number }[];
};

export type CrimeSection = {
  status: SectionStatus;
  /** その地点の県のデータを用意しているか */
  available: boolean;
  pref: string | null;
  year: number | null;
  /** 基準点に近い町丁目（代表点までの距離順、最大4件） */
  nearby: (CrimeCounts & { name: string; distanceM: number })[];
  /** 500m 以内の町丁目の合計 */
  around500m: (CrimeCounts & { townCount: number }) | null;
  sourceUrl: string | null;
};

/** 鑑定評価書（XCT001）から取れる、地価公示地点の補足情報 */
export type Appraisal = {
  /** 相続税路線価（円/㎡） */
  routePrice: number | null;
  routePriceYear: number | null;
  /** 高度地区の高さ制限（例: 最高 20m） */
  heightLimit: string | null;
  baseCoverageRatio: number | null;
  baseFloorAreaRatio: number | null;
  /** 取引事例比較法による比準価格（円/㎡） */
  comparablePrice: number | null;
  /** 収益還元法による収益価格（円/㎡） */
  incomePrice: number | null;
  /** 還元利回り（%） */
  capRate: number | null;
  /** 前面道路（方位・幅員・種別） */
  frontRoad: string | null;
  areaDivision: string | null;
  currentUse: string | null;
};

export type LandPricePoint = {
  id: string;
  /** 標準地番号（例: さいたま南-2） */
  label: string;
  location: { lat: number; lng: number };
  distanceM: number;
  address: string;
  pricePerSqm: number;
  /** 前年比（%） */
  changeRate: number | null;
  useCategory: string | null;
  zoning: string | null;
  nearestStation: string | null;
  stationDistance: string | null;
  surroundings: string | null;
  kind: "地価公示" | "地価調査";
  cityCode: string | null;
  appraisal?: Appraisal;
};

export type LandPriceSection = {
  status: SectionStatus;
  year: number;
  points: LandPricePoint[];
};

export type LiquefactionSection = {
  status: SectionStatus;
  /** 「やや液状化しやすい」など */
  tendency: string | null;
  /** 1〜5（大きいほど液状化しやすい） */
  level: number | null;
  landform: string | null;
};

export type Shelter = {
  id: string;
  name: string;
  address: string | null;
  location: { lat: number; lng: number };
  distanceM: number;
  /** 対応する災害種別（洪水・地震・土砂 …） */
  hazards: string[];
};

export type ShelterSection = {
  status: SectionStatus;
  shelters: Shelter[];
};

export type ElevationSection = {
  status: SectionStatus;
  elevationM: number | null;
  /** 標高データの種別（5mレーザー など） */
  source: string | null;
};

/** /api/trades */
export type Trade = {
  category: string;
  type: string;
  period: string;
  price: number;
  area: number | null;
  totalFloorArea: number | null;
  buildingYear: string | null;
  structure: string | null;
  floorPlan: string | null;
  zoning: string | null;
  purpose: string | null;
};

export type TradesResponse = {
  city: string;
  town: string;
  years: [number, number];
  totalInTown: number;
  trades: Trade[];
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

export type SchoolInfo = {
  name: string;
  /** 学校コード（学区データと学校データで共通） */
  code: string | null;
  address: string | null;
  /** 学校の所在地点。学校データと照合できなかった場合は null */
  location: { lat: number; lng: number } | null;
};

export type SchoolSection = {
  status: SectionStatus;
  elementary: SchoolInfo | null;
  juniorHigh: SchoolInfo | null;
};

/** /api/route のレスポンス */
export type RouteResponse = {
  distanceM: number;
  durationS: number;
  /** 経路の折れ線（緯度経度） */
  path: { lat: number; lng: number }[];
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
  crime: CrimeSection;
  elevation: ElevationSection;
  liquefaction: LiquefactionSection;
  shelters: ShelterSection;
  landPrice: LandPriceSection;
  zoning: ZoningSection;
  school: SchoolSection;
  population: PopulationSection;
  /** 犯罪マップなど、外部で確認するためのリンク */
  links: { label: string; url: string }[];
};
