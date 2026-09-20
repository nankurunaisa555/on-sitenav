import type { HazardKey } from "./facts-types";

/**
 * 国土地理院「重ねるハザードマップ」配信タイル。
 * 地図オーバーレイ（クライアント）と地点判定（サーバー）の両方で使う。
 * https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html
 */
export type HazardLayerDef = {
  key: HazardKey;
  label: string;
  short: string;
  /** 複数テンプレートがある場合はいずれかに色があれば該当とみなす */
  tiles: readonly string[];
  maxZoom: number;
  color: string;
};

const GSI = "https://disaportaldata.gsi.go.jp/raster";

export const HAZARD_LAYERS: readonly HazardLayerDef[] = [
  {
    key: "flood",
    label: "洪水浸水想定（想定最大規模）",
    short: "洪水",
    tiles: [`${GSI}/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png`],
    maxZoom: 17,
    color: "#2563eb",
  },
  {
    key: "naisui",
    label: "内水浸水想定区域",
    short: "内水",
    tiles: [`${GSI}/02_naisui_data/{z}/{x}/{y}.png`],
    maxZoom: 17,
    color: "#0891b2",
  },
  {
    key: "hightide",
    label: "高潮浸水想定区域",
    short: "高潮",
    tiles: [`${GSI}/03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png`],
    maxZoom: 17,
    color: "#7c3aed",
  },
  {
    key: "tsunami",
    label: "津波浸水想定",
    short: "津波",
    tiles: [`${GSI}/04_tsunami_newlegend_data/{z}/{x}/{y}.png`],
    maxZoom: 17,
    color: "#db2777",
  },
  {
    key: "sediment",
    label: "土砂災害警戒区域（土石流・急傾斜・地すべり）",
    short: "土砂",
    tiles: [
      `${GSI}/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png`,
      `${GSI}/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png`,
      `${GSI}/05_jisuberikeikaikuiki/{z}/{x}/{y}.png`,
    ],
    maxZoom: 17,
    color: "#b45309",
  },
] as const;

export const HAZARD_LAYER_MAP: ReadonlyMap<HazardKey, HazardLayerDef> = new Map(
  HAZARD_LAYERS.map((l) => [l.key, l]),
);

/** 重ねるハザードマップの該当地点を開く URL */
export function disaportalUrl(lat: number, lng: number): string {
  return `https://disaportal.gsi.go.jp/maps/?ll=${lat.toFixed(6)},${lng.toFixed(6)}&z=16&base=pale&vs=c1j0l0u0t0h0z0`;
}

/** 浸水深の凡例色（洪水・内水・高潮・津波で共通の「新凡例」）。サーバーの色判定と地図の凡例表示で共用 */
export const DEPTH_LEGEND: readonly { rgb: readonly [number, number, number]; hex: string; label: string }[] = [
  { rgb: [247, 245, 169], hex: "#f7f5a9", label: "0.5m未満" },
  { rgb: [255, 216, 192], hex: "#ffd8c0", label: "0.5〜3m" },
  { rgb: [255, 183, 183], hex: "#ffb7b7", label: "3〜5m" },
  { rgb: [255, 145, 145], hex: "#ff9191", label: "5〜10m" },
  { rgb: [242, 133, 201], hex: "#f285c9", label: "10〜20m" },
  { rgb: [220, 122, 220], hex: "#dc7adc", label: "20m以上" },
];

/** 土砂災害警戒区域の凡例 */
export const SEDIMENT_LEGEND: readonly { hex: string; label: string }[] = [
  { hex: "#ffe81c", label: "警戒区域（イエロー）" },
  { hex: "#c00000", label: "特別警戒区域（レッド）" },
];

/** レイヤーの説明（凡例と一緒に出す一言） */
export const HAZARD_NOTES: Record<HazardKey, string> = {
  flood: "想定最大規模の降雨で河川が氾濫した場合の浸水深",
  naisui: "下水道などで排水しきれない雨水による浸水想定（公表自治体のみ）",
  hightide: "想定最大規模の高潮による浸水深",
  tsunami: "最大クラスの津波による浸水深",
  sediment: "土石流・急傾斜地の崩壊・地すべりの警戒区域",
};
