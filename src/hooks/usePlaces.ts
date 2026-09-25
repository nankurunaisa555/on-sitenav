"use client";

import { useCallback, useRef, useState } from "react";
import { distanceMeters } from "@/lib/geo";
import { gridParam, snapToGrid } from "@/lib/grid";
import { NEAREST_STATION_COUNT, PLACES_GRID_DEG, STATION_GRID_DEG } from "@/lib/places-config";
import { pickDistinctStations } from "@/lib/stations";
import type {
  LatLng,
  Place,
  PlacesApiResponse,
  PlacesErrorResponse,
  PlacesResponse,
  StationsResponse,
} from "@/lib/types";

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const json = (await res.json()) as T | PlacesErrorResponse;
  if (!res.ok || (typeof json === "object" && json !== null && "error" in json)) {
    throw new Error("error" in (json as PlacesErrorResponse) ? (json as PlacesErrorResponse).error : `HTTP ${res.status}`);
  }
  return json as T;
}

/** 実際の基準点からの距離に測り直して近い順に */
function remeasure(list: readonly Place[], center: LatLng): Place[] {
  return list.map((p) => ({ ...p, distanceM: distanceMeters(center, p.location) })).sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * 周辺施設と最寄り駅。
 * どちらも座標をグリッドに丸めて問い合わせ、近所の検索と Vercel CDN のキャッシュを共有する
 * （同じ近所の2回目以降は Google に問い合わせない）。距離と半径の絞り込みはここで行う。
 */
export function usePlaces() {
  const [data, setData] = useState<PlacesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (center: LatLng, radiusM: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const pg = snapToGrid(center, PLACES_GRID_DEG);
      const sg = snapToGrid(center, STATION_GRID_DEG);
      const placesUrl = `/api/places?${new URLSearchParams({
        lat: gridParam(pg.lat, PLACES_GRID_DEG),
        lng: gridParam(pg.lng, PLACES_GRID_DEG),
        radius: radiusM.toString(),
      })}`;
      const stationsUrl = `/api/stations?${new URLSearchParams({
        lat: gridParam(sg.lat, STATION_GRID_DEG),
        lng: gridParam(sg.lng, STATION_GRID_DEG),
      })}`;
      const [placesRes, stationsRes] = await Promise.all([
        getJson<PlacesApiResponse>(placesUrl, controller.signal),
        // 駅が取れなくても周辺施設は出す
        getJson<StationsResponse>(stationsUrl, controller.signal).catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          console.error("[stations]", err);
          return { center: sg, stations: [] } satisfies StationsResponse;
        }),
      ]);

      const stations = remeasure(stationsRes.stations, center);
      const places = remeasure(placesRes.places, center).filter((p) => p.distanceM <= radiusM);
      // 半径内の駅は周辺施設の一覧にも入れる（交通タブの「駅」ピン）
      const ids = new Set(places.map((p) => p.id));
      const withStations = [...places, ...stations.filter((s) => s.distanceM <= radiusM && !ids.has(s.id))].sort(
        (a, b) => a.distanceM - b.distanceM,
      );
      setData({
        center,
        radiusM,
        places: withStations,
        nearestStations: pickDistinctStations(stations, NEAREST_STATION_COUNT),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  return { data, loading, error, search };
}
