"use client";

import { useCallback, useRef, useState } from "react";
import type { TradesResponse } from "@/lib/facts-types";

export function useTrades() {
  const [data, setData] = useState<TradesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastAddress = useRef<string | null>(null);

  /** 基準点近くの施設の住所から町名を決めて取引事例を引く。同じ住所なら再取得しない */
  const load = useCallback(async (address: string | null) => {
    if (!address) {
      setData(null);
      setError("周辺施設の住所から町名を特定できませんでした");
      return;
    }
    if (address === lastAddress.current) return;
    lastAddress.current = address;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades?address=${encodeURIComponent(address)}`, { signal: controller.signal });
      const json = (await res.json()) as TradesResponse | { error: string };
      if (!res.ok || "error" in json) throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setData(null);
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    lastAddress.current = null;
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, load, reset };
}
