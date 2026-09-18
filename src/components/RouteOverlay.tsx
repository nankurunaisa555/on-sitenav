"use client";

import { useEffect, useRef } from "react";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import type { RouteState, RouteTarget } from "@/hooks/useRoutes";

function targetEmoji(target: RouteTarget): string {
  if (target.startsWith("station")) return "🚉";
  if (target.startsWith("shelter")) return "🏃";
  return "🏫";
}

/** 徒歩ルートの折れ線と目的地マーカーを地図に描く */
export default function RouteOverlay({ routes }: { routes: ReadonlyMap<RouteTarget, RouteState> }) {
  const map = useMap();
  /** 各ルートは白フチ（下）と色線（上）の2本で描く */
  const lines = useRef(new Map<RouteTarget, { casing: google.maps.Polyline; line: google.maps.Polyline }>());
  const fitted = useRef(new Set<RouteTarget>());

  useEffect(() => {
    if (!map) return;
    const current = lines.current;

    // 消えたルートを片付ける
    for (const [target, pair] of current) {
      if (!routes.has(target)) {
        pair.casing.setMap(null);
        pair.line.setMap(null);
        current.delete(target);
        fitted.current.delete(target);
      }
    }

    for (const [target, route] of routes) {
      if (route.status !== "ok" || !route.path) continue;
      let pair = current.get(target);
      if (!pair) {
        pair = {
          casing: new google.maps.Polyline({
            strokeColor: "#ffffff",
            strokeOpacity: 0.95,
            strokeWeight: 11,
            clickable: false,
            zIndex: 10,
          }),
          line: new google.maps.Polyline({
            strokeColor: route.color,
            strokeOpacity: 1,
            strokeWeight: 6,
            clickable: false,
            zIndex: 11,
          }),
        };
        current.set(target, pair);
      }
      pair.casing.setPath(route.path);
      pair.line.setPath(route.path);
      pair.casing.setMap(map);
      pair.line.setMap(map);

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
      for (const pair of lines.current.values()) {
        pair.casing.setMap(null);
        pair.line.setMap(null);
      }
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
              className="flex items-center gap-1 rounded-full border-2 border-white px-2.5 py-1 text-sm font-bold text-white shadow-lg"
              style={{ backgroundColor: route.color }}
            >
              <span>{targetEmoji(route.target)}</span>
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
