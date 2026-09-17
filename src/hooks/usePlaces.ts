"use client";

import { useCallback, useRef, useState } from "react";
import type { LatLng, PlacesErrorResponse, PlacesResponse } from "@/lib/types";

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
      const params = new URLSearchParams({
        lat: center.lat.toString(),
        lng: center.lng.toString(),
        radius: radiusM.toString(),
      });
      const res = await fetch(`/api/places?${params}`, { signal: controller.signal });
      const json = (await res.json()) as PlacesResponse | PlacesErrorResponse;
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      setData(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  return { data, loading, error, search };
}
