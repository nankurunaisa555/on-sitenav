import { distanceMeters } from "@/lib/geo";
import type { Place } from "@/lib/types";

/** これより近い駅同士は同一駅（別路線・別出入口）とみなす */
const SAME_STATION_M = 250;

/** 「東京駅（丸ノ内線）」「東京駅 八重洲口」→「東京」のように、駅名の本体だけを比べる */
export function stationKey(name: string): string {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s.*$/, "")
    .replace(/駅$/, "")
    .trim();
}

/** 距離順の駅候補から、同一駅とみなせるものを除いて上位 n 件を選ぶ */
export function pickDistinctStations(candidates: readonly Place[], n: number): Place[] {
  const picked: Place[] = [];
  for (const c of candidates) {
    const dup = picked.some(
      (p) => stationKey(p.name) === stationKey(c.name) || distanceMeters(p.location, c.location) < SAME_STATION_M,
    );
    if (!dup) picked.push(c);
    if (picked.length >= n) break;
  }
  return picked;
}
