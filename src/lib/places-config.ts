/** 周辺施設の検索を共有するグリッド（度）。0.001度 ≒ 南北110m・東西90m */
export const PLACES_GRID_DEG = 0.001;
/** 最寄り駅の検索を共有するグリッド（度）。0.005度 ≒ 南北550m・東西450m */
export const STATION_GRID_DEG = 0.005;
/** 最寄り駅は半径に縛られず、この範囲から距離順に探す */
export const STATION_SEARCH_RADIUS_M = 5000;
/** 駅の候補数（丸めた地点から近い順）。ここから実際の基準点に近い2駅を選ぶ */
export const STATION_CANDIDATES = 10;
/** 表示する最寄り駅の数 */
export const NEAREST_STATION_COUNT = 2;
