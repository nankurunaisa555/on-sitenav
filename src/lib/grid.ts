import type { LatLng } from "@/lib/types";

/**
 * 座標をグリッドに丸める。近所の検索が同じ URL になり、Vercel CDN のキャッシュを共有できる
 * （2回目以降は Google に問い合わせない＝課金されない）。
 * 0.001度 ≒ 南北110m・東西90m、0.005度 ≒ 南北550m・東西450m（関東の緯度）。
 */
export function snapToGrid(p: LatLng, gridDeg: number): LatLng {
  const decimals = Math.max(0, Math.ceil(-Math.log10(gridDeg)));
  const snap = (v: number) => Number((Math.round(v / gridDeg) * gridDeg).toFixed(decimals));
  return { lat: snap(p.lat), lng: snap(p.lng) };
}

/** グリッドに丸めたことで基準点から最大どれだけずれるか（m、余裕込み） */
export function gridSlackM(gridDeg: number): number {
  return Math.ceil(gridDeg * 111_000 * 0.75) + 10;
}

/** API に渡す文字列（丸めた桁数で固定し、URL を揃える） */
export function gridParam(v: number, gridDeg: number): string {
  return v.toFixed(Math.max(0, Math.ceil(-Math.log10(gridDeg))));
}
