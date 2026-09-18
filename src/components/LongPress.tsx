"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import type { LatLng } from "@/lib/types";

const HOLD_MS = 600;
const MOVE_TOLERANCE_PX = 10;

/**
 * 地図の長押しを検出して、その地点の緯度経度を返す。
 * Google Maps は mousedown を公開していないので、地図コンテナの pointer イベントで自前判定し、
 * OverlayView の投影で画面座標→緯度経度に変換する。
 */
export default function LongPress({ onLongPress }: { onLongPress: (p: LatLng) => void }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const div = map.getDiv();

    // 投影を得るためのダミー OverlayView
    class Probe extends google.maps.OverlayView {
      onAdd() {}
      draw() {}
      onRemove() {}
    }
    const probe = new Probe();
    probe.setMap(map);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;

    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      start = null;
    };

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      cancel();
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        if (!start) return;
        const rect = div.getBoundingClientRect();
        const proj = probe.getProjection();
        const ll = proj?.fromContainerPixelToLatLng(
          new google.maps.Point(start.x - rect.left, start.y - rect.top),
        );
        cancel();
        if (ll) onLongPress({ lat: ll.lat(), lng: ll.lng() });
      }, HOLD_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
    };
    const onContextMenu = (e: Event) => e.preventDefault(); // 長押し時のブラウザメニューを抑止

    div.addEventListener("pointerdown", onDown);
    div.addEventListener("pointermove", onMove);
    div.addEventListener("pointerup", cancel);
    div.addEventListener("pointercancel", cancel);
    div.addEventListener("contextmenu", onContextMenu);
    return () => {
      cancel();
      probe.setMap(null);
      div.removeEventListener("pointerdown", onDown);
      div.removeEventListener("pointermove", onMove);
      div.removeEventListener("pointerup", cancel);
      div.removeEventListener("pointercancel", cancel);
      div.removeEventListener("contextmenu", onContextMenu);
    };
  }, [map, onLongPress]);

  return null;
}
