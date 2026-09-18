"use client";

import { useMap } from "@vis.gl/react-google-maps";

/** 地図の拡大・縮小ボタン（Google 標準の UI は消しているため自前で用意） */
export default function ZoomButtons() {
  const map = useMap();
  const step = (delta: number) => {
    if (!map) return;
    map.setZoom((map.getZoom() ?? 15) + delta);
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
