"use client";

import { useCallback, useRef, useState } from "react";
import { distanceMeters } from "@/lib/geo";
import { NIMBY_MAX_DISTANCE_M, snapToNimbyGrid } from "@/lib/nimby-grid";
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

  const load = useCallback(async (center: LatLng) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      // 約100mのグリッドに丸めて問い合わせる（同じ近所なら CDN のキャッシュが返り、Google の課金が発生しない）
      const grid = snapToNimbyGrid(center);
      const params = new URLSearchParams({ lat: grid.lat.toFixed(3), lng: grid.lng.toFixed(3) });
      const res = await fetch(`/api/nimby?${params}`, { signal: controller.signal });
      const json = (await res.json()) as NimbyResponse | { error: string };
      if (!res.ok || "error" in json) throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      // 距離は実際の基準点から測り直して絞り込む
      const items = json.items
        .map((p) => ({ ...p, distanceM: distanceMeters(center, p.location) }))
        .filter((p) => p.distanceM <= NIMBY_MAX_DISTANCE_M)
        .sort((a, b) => a.distanceM - b.distanceM);
      setData({ ...json, center, items });
      setEnabled(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  /** チップを押したとき: 未取得なら取得して ON、取得済みなら ON/OFF を切り替える */
  const toggle = useCallback(
    async (center: LatLng) => {
      if (data) {
        setEnabled((v) => !v);
        return;
      }
      await load(center);
    },
    [data, load],
  );

  /** 取得し直す（一部のデータ元に接続できなかったとき用） */
  const retry = useCallback((center: LatLng) => load(center), [load]);

  return { data, enabled, loading, error, toggle, retry, reset };
}
