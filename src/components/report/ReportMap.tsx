"use client";

import { useMemo } from "react";
import type { HazardKey } from "@/lib/facts-types";
import { HAZARD_LAYER_MAP } from "@/lib/hazard-layers";
import type { RouteState, RouteTarget } from "@/hooks/useRoutes";
import type { LatLng } from "@/lib/types";

/** レポートの地図に置く番号付きピン（表の番号と対応させる） */
export type ReportMarker = { n: number; location: LatLng; color: string };

type Props = {
  center: LatLng;
  markers: readonly ReportMarker[];
  hazards?: ReadonlySet<HazardKey>;
  routes?: ReadonlyMap<RouteTarget, RouteState>;
  height?: number;
};

/** 紙面の本文幅（A4 210mm − 余白 12mm×2 = 186mm ≒ 703px）。プレビューと印刷で同じ */
const WIDTH = 703;
const TILE = 256;
const MAX_ZOOM = 16;
const PAD = 36;
const BASE_TILE = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
/** 淡色地図はこのズームまである */
const BASE_MAX_ZOOM = 18;
const NO_HAZARDS: ReadonlySet<HazardKey> = new Set();

/** 緯度経度 → ズーム z の世界座標（px） */
function project(p: LatLng, z: number): { x: number; y: number } {
  const size = TILE * 2 ** z;
  const sin = Math.sin((p.lat * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** 基準点とピンがすべて入る最大のズーム（寄りすぎない上限つき） */
function fitZoom(points: LatLng[], height: number): number {
  for (let z = MAX_ZOOM; z >= 8; z--) {
    const ps = points.map((p) => project(p, z));
    const w = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
    const h = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
    if (w <= WIDTH - PAD * 2 && h <= height - PAD * 2) return z;
  }
  return 8;
}

/**
 * 印刷用の地図。国土地理院の淡色地図タイルを並べ、ハザードのタイル・徒歩ルート・番号ピンを重ねる。
 * Google マップ（JS）は画面外で描画を止めたり印刷時に描き直したりして、PDF で空白やピン抜けが起きるため、
 * レポートではただの画像の組み合わせにしている（料金もかからない）。
 */
export default function ReportMap({ center, markers, hazards = NO_HAZARDS, routes, height = 240 }: Props) {
  const view = useMemo(() => {
    const routePts = [...(routes?.values() ?? [])].flatMap((r) => (r.status === "ok" && r.path ? [r.path[r.path.length - 1]!] : []));
    const pts = [center, ...markers.map((m) => m.location), ...routePts];
    const z = fitZoom(pts, height);
    const ps = pts.map((p) => project(p, z));
    // 表示の中心は、すべての点の外接矩形の中心
    const cx = (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2;
    const cy = (Math.min(...ps.map((p) => p.y)) + Math.max(...ps.map((p) => p.y))) / 2;
    const left = cx - WIDTH / 2;
    const top = cy - height / 2;
    const tiles: { x: number; y: number; px: number; py: number }[] = [];
    const n = 2 ** z;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + WIDTH) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue;
        tiles.push({ x: ((tx % n) + n) % n, y: ty, px: tx * TILE - left, py: ty * TILE - top });
      }
    }
    // 背景の淡色地図は1段細かいタイルを半分の大きさで並べる（地名の文字が大きくなりすぎず、印刷でも精細）
    const bz = Math.min(BASE_MAX_ZOOM, z + 1);
    const half = TILE / 2 ** (bz - z);
    const baseTiles: { x: number; y: number; px: number; py: number; size: number }[] = [];
    const bn = 2 ** bz;
    for (let tx = Math.floor(left / half); tx <= Math.floor((left + WIDTH) / half); tx++) {
      for (let ty = Math.floor(top / half); ty <= Math.floor((top + height) / half); ty++) {
        if (ty < 0 || ty >= bn) continue;
        baseTiles.push({ x: ((tx % bn) + bn) % bn, y: ty, px: tx * half - left, py: ty * half - top, size: half });
      }
    }
    const toPx = (p: LatLng) => {
      const w = project(p, z);
      return { x: w.x - left, y: w.y - top };
    };
    return { z, bz, tiles, baseTiles, toPx };
  }, [center, markers, routes, height]);

  const hazardTemplates = [...hazards].flatMap((k) => HAZARD_LAYER_MAP.get(k)?.tiles ?? []);
  const url = (tpl: string, t: { x: number; y: number }) =>
    tpl.replace("{z}", String(view.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));
  const c = view.toPx(center);
  const routeList = [...(routes?.values() ?? [])].filter((r) => r.status === "ok" && r.path && r.path.length > 1);

  return (
    <div className="osn-avoid-break">
      <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100" style={{ width: WIDTH, height }}>
        {view.baseTiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`b${t.x}-${t.y}-${t.px}`}
            src={BASE_TILE.replace("{z}", String(view.bz)).replace("{x}", String(t.x)).replace("{y}", String(t.y))}
            alt=""
            width={t.size}
            height={t.size}
            className="absolute max-w-none select-none"
            style={{ left: t.px, top: t.py, width: t.size, height: t.size }}
          />
        ))}
        {hazardTemplates.map((tpl) =>
          view.tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`h${tpl}-${t.x}-${t.y}-${t.px}`}
              src={url(tpl, t)}
              alt=""
              width={TILE}
              height={TILE}
              className="absolute max-w-none select-none"
              style={{ left: t.px, top: t.py, opacity: 0.6 }}
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          )),
        )}
        {routeList.length > 0 && (
          <svg className="absolute inset-0" width={WIDTH} height={height}>
            {routeList.map((r) => {
              const d = r.path!.map((p) => view.toPx(p)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
              return (
                <g key={r.target}>
                  <polyline points={d} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
                  <polyline points={d} fill="none" stroke={r.color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}
          </svg>
        )}
        {markers.map((m) => {
          const p = view.toPx(m.location);
          return (
            <span
              key={m.n}
              className="absolute flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow"
              style={{ left: p.x - 11, top: p.y - 11, backgroundColor: m.color }}
            >
              {m.n}
            </span>
          );
        })}
        <div className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: c.x, top: c.y - 26 }}>
          <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-white shadow">基準点</span>
          <span className="mt-0.5 h-3 w-3 rounded-full border-2 border-white bg-gray-900 shadow" />
        </div>
      </div>
      <div className="mt-0.5 text-right text-[8px] text-gray-400">
        地図：国土地理院（淡色地図{hazardTemplates.length ? "・重ねるハザードマップ" : ""}）
      </div>
    </div>
  );
}
