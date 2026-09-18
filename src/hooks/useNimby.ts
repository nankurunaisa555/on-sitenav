"use client";

import { useCallback, useRef, useState } from "react";
import type { LatLng, NimbyResponse } from "@/lib/types";

/** 嫌悪施設の探索（オンデマンド）。ON/OFF と取得状態を持つ */
export function useNimby() {
  const [data, setData] = useState<NimbyResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setData(null);
    setEnabled(false);
    setLoading(false);
    setError(null);
  }, []);

  /** チップを押したとき: 未取得なら取得して ON、取得済みなら ON/OFF を切り替える */
  const toggle = useCallback(
    async (center: LatLng) => {
      if (data) {
        setEnabled((v) => !v);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ lat: center.lat.toString(), lng: center.lng.toString() });
        const res = await fetch(`/api/nimby?${params}`, { signal: controller.signal });
        const json = (await res.json()) as NimbyResponse | { error: string };
        if (!res.ok || "error" in json) throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
        setData(json);
        setEnabled(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "不明なエラー");
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [data],
  );

  return { data, enabled, loading, error, toggle, reset };
}
