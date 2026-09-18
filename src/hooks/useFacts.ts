"use client";

import { useCallback, useRef, useState } from "react";
import type { FactsResponse } from "@/lib/facts-types";
import type { LatLng } from "@/lib/types";

export function useFacts() {
  const [data, setData] = useState<FactsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (center: LatLng) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ lat: center.lat.toString(), lng: center.lng.toString() });
      const res = await fetch(`/api/facts?${params}`, { signal: controller.signal });
      const json = (await res.json()) as FactsResponse | { error: string };
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

  return { data, loading, error, load };
}
