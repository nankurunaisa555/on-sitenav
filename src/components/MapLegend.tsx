"use client";

import type { HazardKey } from "@/lib/facts-types";
import { DEPTH_LEGEND, HAZARD_LAYER_MAP, HAZARD_NOTES, SEDIMENT_LEGEND } from "@/lib/hazard-layers";
import { CRIME_LEGEND } from "@/lib/crime";

type Props = {
  hazards: ReadonlySet<HazardKey>;
  crime: boolean;
  /** true なら地図上の小さな箱として描く（チップ下の説明より簡潔に） */
  compact?: boolean;
};

/** 表示中のレイヤーの凡例。ハザードは浸水深の色、土砂は区域の色、犯罪は件数の色 */
export default function MapLegend({ hazards, crime, compact = false }: Props) {
  const depthLayers = [...hazards].filter((k) => k !== "sediment");
  const sediment = hazards.has("sediment");
  if (depthLayers.length === 0 && !sediment && !crime) return null;

  const box = compact
    ? "pointer-events-none rounded-lg bg-white/92 px-2 py-1.5 text-[10px] leading-tight text-gray-800 shadow"
    : "rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] leading-snug text-gray-700";

  return (
    <div className={`${box} space-y-1`}>
      {depthLayers.length > 0 && (
        <div>
          <div className="mb-0.5 font-semibold">
            {depthLayers.map((k) => HAZARD_LAYER_MAP.get(k)?.short).join("・")}の浸水深
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {DEPTH_LEGEND.map((d) => (
              <span key={d.label} className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-3.5 rounded-sm border border-black/10" style={{ backgroundColor: d.hex }} />
                {d.label}
              </span>
            ))}
          </div>
          {!compact && depthLayers.map((k) => <div key={k} className="text-gray-500">・{HAZARD_LAYER_MAP.get(k)?.short}: {HAZARD_NOTES[k]}</div>)}
        </div>
      )}
      {sediment && (
        <div>
          <div className="mb-0.5 font-semibold">土砂災害警戒区域</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {SEDIMENT_LEGEND.map((d) => (
              <span key={d.label} className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-3.5 rounded-sm border border-black/10" style={{ backgroundColor: d.hex }} />
                {d.label}
              </span>
            ))}
          </div>
          {!compact && <div className="text-gray-500">・{HAZARD_NOTES.sediment}</div>}
        </div>
      )}
      {crime && (
        <div>
          <div className="mb-0.5 font-semibold">犯罪発生（町丁目・年間件数）</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {CRIME_LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {!compact && <div className="text-gray-400">色が付いていない場所は想定区域外（または未公表）です</div>}
    </div>
  );
}
