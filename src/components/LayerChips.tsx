"use client";

import type { HazardKey } from "@/lib/facts-types";
import { HAZARD_LAYERS } from "@/lib/hazard-layers";
import { CRIME_LEGEND } from "@/lib/crime";

type Props = {
  enabled: ReadonlySet<HazardKey>;
  onToggle: (key: HazardKey) => void;
  onNone: () => void;
  crimeEnabled: boolean;
  crimeAvailable: boolean;
  crimeLabel: string;
  onToggleCrime: () => void;
};

/** 土地・災害タブ上部の、地図に重ねるレイヤーの ON/OFF チップ（周辺施設のカテゴリと同じ形式） */
export default function LayerChips({
  enabled,
  onToggle,
  onNone,
  crimeEnabled,
  crimeAvailable,
  crimeLabel,
  onToggleCrime,
}: Props) {
  const anyOn = enabled.size > 0 || crimeEnabled;
  return (
    <div className="px-4 pb-2">
      <p className="mb-1 text-[11px] font-semibold text-gray-500">地図に重ねる</p>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={onNone}
          aria-pressed={!anyOn}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
            !anyOn ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700"
          }`}
        >
          すべて解除
        </button>
        {HAZARD_LAYERS.map((layer) => {
          const on = enabled.has(layer.key);
          return (
            <button
              key={layer.key}
              type="button"
              onClick={() => onToggle(layer.key)}
              aria-pressed={on}
              style={on ? { backgroundColor: layer.color, borderColor: layer.color } : undefined}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                on ? "text-white" : "border-gray-300 bg-white text-gray-600"
              }`}
              title={layer.label}
            >
              {layer.short}
            </button>
          );
        })}
        <button
          type="button"
          disabled={!crimeAvailable}
          onClick={onToggleCrime}
          aria-pressed={crimeEnabled}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-35 ${
            crimeEnabled ? "border-red-700 bg-red-700 text-white" : "border-gray-300 bg-white text-gray-600"
          }`}
          title={crimeLabel}
        >
          犯罪発生
        </button>
      </div>
      {crimeEnabled && (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
          {CRIME_LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1 text-[10px] text-gray-600">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      <p className="mt-1 text-[10px] leading-snug text-gray-400">
        ハザード: 国土地理院「重ねるハザードマップ」／犯罪発生: 県警 犯罪オープンデータ（町丁目別
        {crimeAvailable ? "" : "・この地域は未整備"}）
      </p>
    </div>
  );
}
