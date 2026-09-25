import { snapToGrid } from "@/lib/grid";
import type { LatLng } from "@/lib/types";

/** 嫌悪施設の探索半径（基準点から） */
export const NIMBY_SEARCH_RADIUS_M = 300;
/** 一覧に出す上限距離（半径ぎりぎりの施設も落とさないよう少し余裕を持たせる） */
export const NIMBY_MAX_DISTANCE_M = 350;
/** 探索を共有するグリッド（度）。0.001度 ≒ 南北110m・東西90m */
export const NIMBY_GRID_DEG = 0.001;

/** 座標をグリッドに丸める。同じ近所の探索は同じ URL になり、CDN のキャッシュが効く */
export function snapToNimbyGrid(p: LatLng): LatLng {
  return snapToGrid(p, NIMBY_GRID_DEG);
}
