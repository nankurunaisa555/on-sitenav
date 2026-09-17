"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import MapView from "./MapView";
import PlacePanel from "./PlacePanel";
import { useGeolocation } from "@/hooks/useGeolocation";
import { usePlaces } from "@/hooks/usePlaces";
import { DEFAULT_CENTER, distanceMeters } from "@/lib/geo";
import type { CategoryKey, LatLng } from "@/lib/types";

const RADIUS_M = 800;
/** 検索中心からこれ以上動いたら「このエリアを検索」を出す */
const MOVED_THRESHOLD_M = 150;

export default function OnSiteNav({ apiKey }: { apiKey: string }) {
  const geo = useGeolocation();
  const { data, loading, error, search } = usePlaces();

  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [searchCenter, setSearchCenter] = useState<LatLng | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(new Set());

  const allPlaces = data?.places ?? [];
  const visiblePlaces = useMemo(
    () =>
      activeCategories.size === 0
        ? allPlaces
        : allPlaces.filter((p) => activeCategories.has(p.category)),
    [allPlaces, activeCategories],
  );

  const toggleCategory = useCallback((key: CategoryKey) => {
    setSelectedId(null);
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const runSearch = useCallback(
    (center: LatLng) => {
      setSearchCenter(center);
      setSelectedId(null);
      void search(center, RADIUS_M);
    },
    [search],
  );

  // 起動時: 現在地を取得してそこを検索。取れなければ東京駅を表示だけする
  useEffect(() => {
    let cancelled = false;
    void geo.locate().then((pos) => {
      if (cancelled) return;
      const center = pos ?? DEFAULT_CENTER;
      setInitialCenter(center);
      if (pos) runSearch(pos);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLocate = async () => {
    const pos = await geo.locate();
    if (pos) runSearch(pos);
  };

  const moved = useMemo(() => {
    if (!mapCenter) return false;
    if (!searchCenter) return true;
    return distanceMeters(mapCenter, searchCenter) > MOVED_THRESHOLD_M;
  }, [mapCenter, searchCenter]);

  if (!initialCenter) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-50 text-sm text-gray-500">
        現在地を取得しています…
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} language="ja" region="JP">
      <div className="relative h-dvh w-full overflow-hidden bg-gray-100">
        <MapView
          initialCenter={initialCenter}
          userLocation={geo.position}
          searchCenter={searchCenter}
          radiusM={RADIUS_M}
          places={visiblePlaces}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCameraChanged={setMapCenter}
        />

        {/* 地図上のオーバーレイ UI */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 shadow backdrop-blur">
            <span className="text-sm font-bold tracking-tight text-gray-900">On-siteNav</span>
            <span className="text-xs text-gray-500">周辺施設ファクト</span>
          </div>
          {moved && mapCenter && !loading && (
            <button
              type="button"
              onClick={() => runSearch(mapCenter)}
              className="pointer-events-auto rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg active:scale-95"
            >
              このエリアを検索
            </button>
          )}
          {loading && (
            <span className="pointer-events-auto rounded-full bg-white/95 px-4 py-2 text-sm text-gray-600 shadow">
              周辺施設を検索中…
            </span>
          )}
          {geo.status === "denied" && (
            <span className="pointer-events-auto rounded-full bg-amber-50 px-4 py-2 text-xs text-amber-800 shadow">
              位置情報が許可されていません。地図を動かして「このエリアを検索」を押してください
            </span>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col">
          <button
            type="button"
            onClick={handleLocate}
            disabled={geo.status === "locating"}
            aria-label="現在地へ移動"
            className="pointer-events-auto mr-3 mb-3 flex h-12 w-12 self-end items-center justify-center rounded-full bg-white text-xl shadow-lg active:scale-95 disabled:opacity-60"
          >
            {geo.status === "locating" ? "…" : "◎"}
          </button>
          <PlacePanel
            places={allPlaces}
            radiusM={RADIUS_M}
            loading={loading}
            error={error}
            selectedId={selectedId}
            onSelect={setSelectedId}
            active={activeCategories}
            onToggleCategory={toggleCategory}
            onResetCategory={() => setActiveCategories(new Set())}
          />
        </div>
      </div>
    </APIProvider>
  );
}
