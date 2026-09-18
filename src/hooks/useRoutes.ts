"use client";

import { useCallback, useState } from "react";
import type { RouteResponse } from "@/lib/facts-types";
import type { LatLng } from "@/lib/types";

export type RouteTarget = "station" | "elementary" | "juniorHigh";

export type RouteState = {
  target: RouteTarget;
  label: string;
  destination: LatLng;
  color: string;
  status: "loading" | "ok" | "error";
  distanceM?: number;
  durationS?: number;
  path?: LatLng[];
  error?: string;
};

export const ROUTE_COLORS: Record<RouteTarget, string> = {
  station: "#2563eb",
  elementary: "#7c3aed",
  juniorHigh: "#a855f7",
};

/** 基準点から各目的地への徒歩ルート（最大3本）を ON/OFF で管理する */
export function useRoutes() {
  const [routes, setRoutes] = useState<Map<RouteTarget, RouteState>>(new Map());

  const clear = useCallback(() => setRoutes(new Map()), []);

  const remove = useCallback((target: RouteTarget) => {
    setRoutes((prev) => {
      const next = new Map(prev);
      next.delete(target);
      return next;
    });
  }, []);

  const toggle = useCallback(
    async (target: RouteTarget, label: string, from: LatLng, to: LatLng) => {
      let existed = false;
      setRoutes((prev) => {
        existed = prev.has(target);
        const next = new Map(prev);
        if (existed) next.delete(target);
        else next.set(target, { target, label, destination: to, color: ROUTE_COLORS[target], status: "loading" });
        return next;
      });
      if (existed) return;

      try {
        const params = new URLSearchParams({ from: `${from.lat},${from.lng}`, to: `${to.lat},${to.lng}` });
        const res = await fetch(`/api/route?${params}`);
        const json = (await res.json()) as RouteResponse | { error: string };
        if (!res.ok || "error" in json) throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
        setRoutes((prev) => {
          if (!prev.has(target)) return prev; // 取得中に OFF にされた
          const next = new Map(prev);
          next.set(target, { ...prev.get(target)!, status: "ok", ...json });
          return next;
        });
      } catch (err) {
        setRoutes((prev) => {
          if (!prev.has(target)) return prev;
          const next = new Map(prev);
          next.set(target, {
            ...prev.get(target)!,
            status: "error",
            error: err instanceof Error ? err.message : "不明なエラー",
          });
          return next;
        });
      }
    },
    [],
  );

  return { routes, toggle, remove, clear };
}
