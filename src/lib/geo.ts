import type { LatLng } from "./types";

const EARTH_RADIUS_M = 6_371_000;

/** 2地点間の距離（メートル）。Haversine 公式。 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** 距離の表示用フォーマット: 80m / 1.2km */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** 徒歩分数（80m/分 = 不動産表示の基準） */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.ceil(meters / 80));
}

/** 位置情報が取れないときのフォールバック（東京駅） */
export const DEFAULT_CENTER: LatLng = { lat: 35.6812, lng: 139.7671 };

/**
 * シートに隠れていない地図部分の中心が、地図の幾何学的な中心より何度北にあるか。
 * bottomInsetPx はシートの高さ（px）。見える部分の中心は、その半分だけ上にある。
 */
export function visibleCenterLatOffset(lat: number, zoom: number, bottomInsetPx: number): number {
  if (bottomInsetPx <= 0) return 0;
  const metersPerPx = (156_543.033_92 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return ((bottomInsetPx / 2) * metersPerPx) / 111_320;
}
