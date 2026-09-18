import type { LatLng } from "./types";

export type TileCoord = { z: number; x: number; y: number };

/** 経緯度 → XYZ タイル座標と、タイル内ピクセル位置（256px タイル） */
export function lngLatToTile(p: LatLng, z: number): TileCoord & { px: number; py: number } {
  const n = 2 ** z;
  const xf = ((p.lng + 180) / 360) * n;
  const latRad = (p.lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  return {
    z,
    x,
    y,
    px: Math.min(255, Math.floor((xf - x) * 256)),
    py: Math.min(255, Math.floor((yf - y) * 256)),
  };
}

export function tileUrl(template: string, t: TileCoord): string {
  return template.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));
}
