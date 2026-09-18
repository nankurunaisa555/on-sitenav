"use client";

import { useCallback, useState } from "react";
import type { RouteResponse } from "@/lib/facts-types";
import type { LatLng } from "@/lib/types";

export type RouteTarget =
  | `station-${number}`
  | `bus-${number}`
  | `shelter-${number}`
  | `library-${number}`
  | "cityhall"
  | "elementary"
  | "juniorHigh";

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

const STATION_COLORS = ["#2563eb", "#0891b2"];

const SHELTER_COLORS = ["#16a34a", "#15803d", "#166534"];

const BUS_COLORS = ["#d97706", "#b45309"];
const LIBRARY_COLORS = ["#0f766e", "#115e59"];

export function routeColor(target: RouteTarget): string {
  if (target === "elementary") return "#7c3aed";
  if (target === "juniorHigh") return "#a855f7";
  if (target === "cityhall") return "#334155";
  const i = Number(target.split("-")[1] ?? 0);
  if (target.startsWith("shelter")) return SHELTER_COLORS[i % SHELTER_COLORS.length] ?? "#16a34a";
  if (target.startsWith("bus")) return BUS_COLORS[i % BUS_COLORS.length] ?? "#d97706";
  if (target.startsWith("library")) return LIBRARY_COLORS[i % LIBRARY_COLORS.length] ?? "#0f766e";
  return STATION_COLORS[i % STATION_COLORS.length] ?? "#2563eb";
}

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
        else next.set(target, { target, label, destination: to, color: routeColor(target), status: "loading" });
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
