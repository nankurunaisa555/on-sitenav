"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import type { HazardKey } from "@/lib/facts-types";
import { HAZARD_LAYERS } from "@/lib/hazard-layers";

const OVERLAY_OPACITY = 0.65;

/**
 * 重ねるハザードマップのタイルを Google Maps に重ねる。
 * enabled に含まれるレイヤーだけ ImageMapType として overlayMapTypes に載せる。
 */
export default function HazardOverlay({ enabled }: { enabled: ReadonlySet<HazardKey> }) {
  const map = useMap();
  const mounted = useRef(new Map<string, google.maps.ImageMapType>());

  useEffect(() => {
    if (!map) return;
    const current = mounted.current;

    // 外れたレイヤーを取り除く
    for (const [id, type] of current) {
      const key = id.split(":")[0] as HazardKey;
      if (!enabled.has(key)) {
        const idx = map.overlayMapTypes.getArray().indexOf(type);
        if (idx >= 0) map.overlayMapTypes.removeAt(idx);
        current.delete(id);
      }
    }

    // 追加されたレイヤーを載せる
    for (const layer of HAZARD_LAYERS) {
      if (!enabled.has(layer.key)) continue;
      layer.tiles.forEach((template, i) => {
        const id = `${layer.key}:${i}`;
        if (current.has(id)) return;
        const type = new google.maps.ImageMapType({
          name: layer.label,
          tileSize: new google.maps.Size(256, 256),
          maxZoom: layer.maxZoom,
          minZoom: 2,
          opacity: OVERLAY_OPACITY,
          getTileUrl: (coord, zoom) => {
            const n = 2 ** zoom;
            const x = ((coord.x % n) + n) % n; // 経度方向のラップ
            if (coord.y < 0 || coord.y >= n) return null;
            return template
              .replace("{z}", String(zoom))
              .replace("{x}", String(x))
              .replace("{y}", String(coord.y));
          },
        });
        map.overlayMapTypes.push(type);
        current.set(id, type);
      });
    }
  }, [map, enabled]);

  useEffect(() => {
    return () => {
      if (!map) return;
      for (const type of mounted.current.values()) {
        const idx = map.overlayMapTypes.getArray().indexOf(type);
        if (idx >= 0) map.overlayMapTypes.removeAt(idx);
      }
      mounted.current.clear();
    };
  }, [map]);

  return null;
}
