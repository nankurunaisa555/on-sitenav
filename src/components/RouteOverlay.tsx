"use client";

import { useEffect, useRef } from "react";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import type { RouteState, RouteTarget } from "@/hooks/useRoutes";

const TARGET_EMOJI: Record<RouteTarget, string> = {
  station: "🚉",
  elementary: "🏫",
  juniorHigh: "🏫",
};

/** 徒歩ルートの折れ線と目的地マーカーを地図に描く */
export default function RouteOverlay({ routes }: { routes: ReadonlyMap<RouteTarget, RouteState> }) {
  const map = useMap();
  const lines = useRef(new Map<RouteTarget, google.maps.Polyline>());
  const fitted = useRef(new Set<RouteTarget>());

  useEffect(() => {
    if (!map) return;
    const current = lines.current;

    // 消えたルートを片付ける
    for (const [target, line] of current) {
      if (!routes.has(target)) {
        line.setMap(null);
        current.delete(target);
        fitted.current.delete(target);
      }
    }

    for (const [target, route] of routes) {
      if (route.status !== "ok" || !route.path) continue;
      let line = current.get(target);
      if (!line) {
        line = new google.maps.Polyline({
          strokeColor: route.color,
          strokeOpacity: 0.9,
          strokeWeight: 5,
          clickable: false,
          zIndex: 10,
        });
        current.set(target, line);
      }
      line.setPath(route.path);
      line.setMap(map);

      // 初回だけルート全体が入るように寄せる（下のシートに隠れない余白をとる）
      if (!fitted.current.has(target)) {
        fitted.current.add(target);
        const bounds = new google.maps.LatLngBounds();
        for (const p of route.path) bounds.extend(p);
        map.fitBounds(bounds, { top: 120, bottom: window.innerHeight * 0.42, left: 40, right: 40 });
      }
    }
  }, [map, routes]);

  useEffect(
    () => () => {
      for (const line of lines.current.values()) line.setMap(null);
      lines.current.clear();
    },
    [],
  );

  return (
    <>
      {[...routes.values()].map((route) => (
        <AdvancedMarker key={route.target} position={route.destination} zIndex={900} title={route.label}>
          <div className="flex flex-col items-center">
            <div
              className="flex items-center gap-1 rounded-full border-2 border-white px-2 py-0.5 text-xs font-semibold text-white shadow-md"
              style={{ backgroundColor: route.color }}
            >
              <span>{TARGET_EMOJI[route.target]}</span>
              <span className="max-w-[10rem] truncate">{route.label}</span>
            </div>
            <div
              className="-mt-px h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent"
              style={{ borderTopColor: route.color }}
            />
          </div>
        </AdvancedMarker>
      ))}
    </>
  );
}
