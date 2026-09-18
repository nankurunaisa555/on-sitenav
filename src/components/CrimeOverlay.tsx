"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import {
  CRIME_PREFS,
  crimeColor,
  crimeRadiusM,
  crimeTotal,
  guessPrefCode,
  type CrimeDataset,
  type CrimePoint,
} from "@/lib/crime";
import type { LatLng } from "@/lib/types";

/** これより広域では円が潰れて意味が無いので描かない */
const MIN_ZOOM = 12;

type Props = {
  enabled: boolean;
  /** どの県のデータを読むかの手がかり（検索の基準点） */
  center: LatLng | null;
  onDatasetChange?: (ds: CrimeDataset | null) => void;
};

/**
 * 犯罪オープンデータ（町丁目ごとの窃盗件数）を円で重ねる。
 * 表示範囲内の地点だけ描き、地図が止まるたびに差分更新する。
 */
export default function CrimeOverlay({ enabled, center, onDatasetChange }: Props) {
  const map = useMap();
  const [dataset, setDataset] = useState<CrimeDataset | null>(null);
  const circles = useRef(new Map<CrimePoint, google.maps.Circle>());
  const infoWindow = useRef<google.maps.InfoWindow | null>(null);

  // データ読み込み（県ごとに1回）
  useEffect(() => {
    if (!enabled || !center) return;
    const code = guessPrefCode(center);
    const def = code !== null ? CRIME_PREFS[code] : undefined;
    if (!def) {
      setDataset(null);
      onDatasetChange?.(null);
      return;
    }
    if (dataset?.prefCode === code) return;
    let cancelled = false;
    void def.load().then((ds) => {
      if (cancelled) return;
      setDataset(ds);
      onDatasetChange?.(ds);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, center?.lat, center?.lng]);

  // 描画（表示範囲内だけ）
  useEffect(() => {
    if (!map) return;
    const current = circles.current;

    const clearAll = () => {
      for (const c of current.values()) c.setMap(null);
      current.clear();
      infoWindow.current?.close();
    };

    if (!enabled || !dataset) {
      clearAll();
      return;
    }

    const render = () => {
      const bounds = map.getBounds();
      const zoom = map.getZoom() ?? 0;
      if (!bounds || zoom < MIN_ZOOM) {
        clearAll();
        return;
      }
      const visible = new Set<CrimePoint>();
      for (const pt of dataset.points) {
        if (!bounds.contains(pt)) continue;
        visible.add(pt);
        if (current.has(pt)) continue;
        const total = crimeTotal(pt);
        const circle = new google.maps.Circle({
          map,
          center: pt,
          radius: crimeRadiusM(total),
          fillColor: crimeColor(total),
          fillOpacity: 0.45,
          strokeColor: crimeColor(total),
          strokeOpacity: 0.8,
          strokeWeight: 1,
          clickable: true,
          zIndex: 5,
        });
        circle.addListener("click", () => {
          infoWindow.current ??= new google.maps.InfoWindow();
          infoWindow.current.setContent(popupHtml(dataset, pt));
          infoWindow.current.setPosition(pt);
          infoWindow.current.open({ map });
        });
        current.set(pt, circle);
      }
      for (const [pt, circle] of current) {
        if (!visible.has(pt)) {
          circle.setMap(null);
          current.delete(pt);
        }
      }
    };

    render();
    const listener = map.addListener("idle", render);
    return () => {
      listener.remove();
      clearAll();
    };
  }, [map, enabled, dataset]);

  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function popupHtml(ds: CrimeDataset, pt: CrimePoint): string {
  const rows = ds.types
    .map((t, i) => ({ t, n: pt.c[i] ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .map(
      (r) =>
        `<div style="display:flex;justify-content:space-between;gap:12px"><span>${escapeHtml(r.t)}</span><b>${r.n}件</b></div>`,
    )
    .join("");
  return `<div style="font:13px/1.5 system-ui;min-width:180px;color:#111">
    <div style="font-weight:700;margin-bottom:4px">${escapeHtml(pt.n)}</div>
    <div style="color:#555;font-size:11px;margin-bottom:6px">${ds.year}年 窃盗7手口 合計 <b style="color:#111">${crimeTotal(pt)}件</b></div>
    ${rows}
    <div style="color:#888;font-size:10px;margin-top:6px">出典: ${escapeHtml(ds.pref)}警察 犯罪オープンデータ</div>
  </div>`;
}
