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
    const container = containerRef.current;
    if (!target || !container) return;
    setState("loading");
    const service = new google.maps.StreetViewService();
    let cancelled = false;

    // モーダルを開くたびに描画先の要素が作り直されるので、パノラマも毎回新しく作る
    // （古いインスタンスを再利用すると破棄済みの要素に描こうとして真っ暗になる）
    const pano = new google.maps.StreetViewPanorama(container, {
      visible: false,
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      showRoadLabels: true,
      zoom: 0.8,
    });
    panoRef.current = pano;

    void service
      .getPanorama({
        location: target,
        radius: SEARCH_RADIUS_M,
        source: google.maps.StreetViewSource.OUTDOOR,
        preference: google.maps.StreetViewPreference.NEAREST,
      })
      .then(({ data }) => {
        if (cancelled || !data.location?.latLng || !data.location.pano) return;
        // カメラは撮影地点から対象地点の方を向ける
        const heading = google.maps.geometry?.spherical
          ? google.maps.geometry.spherical.computeHeading(data.location.latLng, new google.maps.LatLng(target))
          : 0;
        pano.setPano(data.location.pano);
        pano.setPov({ heading, pitch: 0 });
        pano.setVisible(true);
        setState("ok");
        // レイアウト確定後にサイズを再計算させる（初回描画が欠けるのを防ぐ）
        requestAnimationFrame(() => google.maps.event.trigger(pano, "resize"));
        setTimeout(() => google.maps.event.trigger(pano, "resize"), 400);
      })
      .catch(() => {
        if (!cancelled) setState("none");
      });

    return () => {
      cancelled = true;
      pano.setVisible(false);
      google.maps.event.clearInstanceListeners(pano);
      panoRef.current = null;
    };
  }, [target]);

  if (!target) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="ストリートビュー">
      <header className="flex items-center justify-between gap-3 bg-black/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="min-w-0">
          <p className="text-xs text-white/70">📷 ストリートビュー</p>
          <p className="truncate text-sm font-semibold">{title ?? `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${target.lat},${target.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white/15 px-3 py-2 text-xs font-medium active:bg-white/25"
            aria-label="Google マップアプリでストリートビューを開く"
          >
            Google マップ ↗
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium active:bg-white/25"
          >
            閉じる ✕
          </button>
        </div>
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
      <p className="bg-black/80 px-4 py-2 text-center text-[11px] leading-snug text-white/60">
        撮影時期は Google 側のデータによります。画面が黒いままの場合は、ブラウザの広告ブロック／シールドで WebGL
        が制限されている可能性があります（右上「Google マップ ↗」で同じ地点をアプリで開けます）。
      </p>
    </div>
  );
}
