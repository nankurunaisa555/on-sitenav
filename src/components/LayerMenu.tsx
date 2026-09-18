"use client";

import { useState } from "react";
import type { HazardKey } from "@/lib/facts-types";
import { HAZARD_LAYERS } from "@/lib/hazard-layers";

type Props = {
  enabled: ReadonlySet<HazardKey>;
  onToggle: (key: HazardKey) => void;
};

/** 地図右上の「レイヤー」ボタンと、ハザードレイヤーの ON/OFF メニュー */
export default function LayerMenu({ enabled, onToggle }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="ハザードレイヤーの表示切替"
        className={`flex h-12 items-center gap-1.5 rounded-full px-4 text-sm font-medium shadow-lg active:scale-95 ${
          enabled.size > 0 ? "bg-gray-900 text-white" : "bg-white text-gray-800"
        }`}
      >
        <span aria-hidden>🗺️</span>
        レイヤー
        {enabled.size > 0 && (
          <span className="rounded-full bg-white/20 px-1.5 text-xs">{enabled.size}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 bottom-14 w-72 rounded-xl bg-white p-2 shadow-xl">
          <p className="px-2 pt-1 pb-2 text-xs font-semibold text-gray-500">
            ハザードマップを重ねる
          </p>
          <ul>
            {HAZARD_LAYERS.map((layer) => {
              const on = enabled.has(layer.key);
              return (
                <li key={layer.key}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 active:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(layer.key)}
                      className="h-4 w-4 accent-gray-900"
                    />
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: layer.color, opacity: on ? 1 : 0.35 }}
                    />
                    <span className="min-w-0 flex-1 text-sm text-gray-900">{layer.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="px-2 pt-2 pb-1 text-[11px] leading-snug text-gray-400">
            出典: 国土地理院「重ねるハザードマップ」
          </p>
        </div>
      )}
    </div>
  );
}
