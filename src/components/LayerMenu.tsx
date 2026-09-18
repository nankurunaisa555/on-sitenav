"use client";

import { useState } from "react";
import type { HazardKey } from "@/lib/facts-types";
import { HAZARD_LAYERS } from "@/lib/hazard-layers";
import { CRIME_LEGEND } from "@/lib/crime";

type Props = {
  enabled: ReadonlySet<HazardKey>;
  onToggle: (key: HazardKey) => void;
  crimeEnabled: boolean;
  onToggleCrime: () => void;
  /** 基準点の県に犯罪データがあるか（無ければ理由を表示） */
  crimeAvailable: boolean;
  crimeLabel: string;
};

/** 地図右上の「レイヤー」ボタンと、ハザードレイヤーの ON/OFF メニュー */
export default function LayerMenu({
  enabled,
  onToggle,
  crimeEnabled,
  onToggleCrime,
  crimeAvailable,
  crimeLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = enabled.size + (crimeEnabled ? 1 : 0);

  return (
    <div className="pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="ハザードレイヤーの表示切替"
        className={`flex h-12 items-center gap-1.5 rounded-full px-4 text-sm font-medium shadow-lg active:scale-95 ${
          activeCount > 0 ? "bg-gray-900 text-white" : "bg-white text-gray-800"
        }`}
      >
        <span aria-hidden>🗺️</span>
        レイヤー
        {activeCount > 0 && (
          <span className="rounded-full bg-white/20 px-1.5 text-xs">{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 bottom-14 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl bg-white p-1.5 text-xs shadow-xl">
          <p className="px-2 pt-1 pb-1 text-[11px] font-semibold text-gray-500">ハザードマップを重ねる</p>
          <ul>
            {HAZARD_LAYERS.map((layer) => {
              const on = enabled.has(layer.key);
              return (
                <li key={layer.key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 active:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(layer.key)}
                      className="h-3.5 w-3.5 accent-gray-900"
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: layer.color, opacity: on ? 1 : 0.35 }}
                    />
                    <span className="min-w-0 flex-1 leading-tight text-gray-900">{layer.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="px-2 pt-0.5 pb-0.5 text-[10px] leading-snug text-gray-400">出典: 国土地理院「重ねるハザードマップ」</p>

          <p className="mt-1 border-t border-gray-100 px-2 pt-1.5 pb-0.5 text-[11px] font-semibold text-gray-500">
            犯罪発生（窃盗7手口・町丁目別）
          </p>
          <label
            className={`flex items-center gap-2 rounded-md px-2 py-1 ${
              crimeAvailable ? "cursor-pointer active:bg-gray-50" : "opacity-50"
            }`}
          >
            <input
              type="checkbox"
              checked={crimeEnabled}
              disabled={!crimeAvailable}
              onChange={onToggleCrime}
              className="h-3.5 w-3.5 accent-gray-900"
            />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" style={{ opacity: crimeEnabled ? 1 : 0.35 }} />
            <span className="min-w-0 flex-1 leading-tight text-gray-900">{crimeLabel}</span>
          </label>
          {crimeEnabled && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 px-2 pb-1">
              {CRIME_LEGEND.map((l) => (
                <span key={l.label} className="flex items-center gap-1 text-[10px] text-gray-600">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          )}
          <p className="px-2 pt-0.5 pb-0.5 text-[10px] leading-snug text-gray-400">
            {crimeAvailable
              ? "町丁目の代表点に年間件数を集約。出典: 県警 犯罪オープンデータ／国交省 位置参照情報"
              : "この地域の犯罪オープンデータは未整備です（現在は埼玉県のみ）"}
          </p>
        </div>
      )}
    </div>
  );
}
