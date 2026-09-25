"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { visibleCenterLatOffset } from "@/lib/geo";

/**
 * 地図の拡大・縮小ボタン（Google 標準の UI は消しているため自前で用意）。
 * シートに隠れていない地図部分の中心を基点に拡大縮小する（基準点が見える位置からずれないように）。
 */
export default function ZoomButtons({ bottomInsetPx }: { bottomInsetPx: number }) {
  const map = useMap();
  const step = (delta: number) => {
    if (!map) return;
    const zoom = map.getZoom() ?? 15;
    const center = map.getCenter();
    if (!center) {
      map.setZoom(zoom + delta);
      return;
    }
    const visibleLat = center.lat() + visibleCenterLatOffset(center.lat(), zoom, bottomInsetPx);
    const nextZoom = zoom + delta;
    map.moveCamera({
      zoom: nextZoom,
      center: { lat: visibleLat - visibleCenterLatOffset(visibleLat, nextZoom, bottomInsetPx), lng: center.lng() },
    });
  };
  return (
    <div className="pointer-events-auto flex flex-col overflow-hidden rounded-full bg-white shadow-lg">
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="地図を拡大"
        className="flex h-11 w-11 items-center justify-center text-xl font-medium text-gray-800 active:bg-gray-100"
      >
        ＋
      </button>
      <span className="mx-2 h-px bg-gray-200" />
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="地図を縮小"
        className="flex h-11 w-11 items-center justify-center text-xl font-medium text-gray-800 active:bg-gray-100"
      >
        −
      </button>
    </div>
  );
}
