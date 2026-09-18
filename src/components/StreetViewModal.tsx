"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/types";

type Props = {
  /** 表示したい地点。null で閉じる */
  target: LatLng | null;
  /** 見出し（施設名など） */
  title?: string | null;
  onClose: () => void;
};

/** 見つけたパノラマの探索半径（m）。狭い路地でも道路上のパノラマを拾える程度 */
const SEARCH_RADIUS_M = 60;

/** 地図の長押し／施設ラベルから開く、全画面のストリートビュー */
export default function StreetViewModal({ target, title, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none" | "error">("loading");

  useEffect(() => {
    if (!target || !containerRef.current) return;
    setState("loading");
    const service = new google.maps.StreetViewService();
    let cancelled = false;

    void service
      .getPanorama({
        location: target,
        radius: SEARCH_RADIUS_M,
        source: google.maps.StreetViewSource.OUTDOOR,
        preference: google.maps.StreetViewPreference.NEAREST,
      })
      .then(({ data }) => {
        if (cancelled || !containerRef.current || !data.location?.latLng) return;
        // カメラは撮影地点から対象地点の方を向ける
        const heading = google.maps.geometry?.spherical
          ? google.maps.geometry.spherical.computeHeading(data.location.latLng, new google.maps.LatLng(target))
          : 0;
        if (!panoRef.current) {
          panoRef.current = new google.maps.StreetViewPanorama(containerRef.current, {
            pano: data.location.pano,
            pov: { heading, pitch: 0 },
            zoom: 0.8,
            addressControl: false,
            fullscreenControl: false,
            motionTracking: false,
            motionTrackingControl: false,
            showRoadLabels: true,
          });
        } else {
          panoRef.current.setPano(data.location.pano ?? "");
          panoRef.current.setPov({ heading, pitch: 0 });
        }
        panoRef.current.setVisible(true);
        setState("ok");
      })
      .catch(() => {
        if (!cancelled) setState("none");
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  // 閉じるときにパノラマを片付ける
  useEffect(() => {
    if (target) return;
    panoRef.current?.setVisible(false);
  }, [target]);

  if (!target) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="ストリートビュー">
      <header className="flex items-center justify-between gap-3 bg-black/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="min-w-0">
          <p className="text-xs text-white/70">📷 ストリートビュー</p>
          <p className="truncate text-sm font-semibold">{title ?? `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full bg-white/15 px-4 py-2 text-sm font-medium active:bg-white/25"
        >
          閉じる ✕
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />
        {state !== "ok" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-sm text-white">
            {state === "loading" && "ストリートビューを読み込んでいます…"}
            {state === "none" && "この地点の付近（60m以内）にはストリートビューがありません。近くの道路上を長押ししてみてください。"}
            {state === "error" && "ストリートビューを読み込めませんでした"}
          </div>
        )}
      </div>
      <p className="bg-black/80 px-4 py-2 text-center text-[11px] text-white/60">
        撮影時期は Google 側のデータによります。現況と異なる場合があります。
      </p>
    </div>
  );
}
