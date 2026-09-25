import { distanceMeters } from "@/lib/geo";
import { NIMBY_KIND_MAP, type NimbyKindKey } from "@/lib/nimby";
import type { LatLng, NimbyPlace } from "@/lib/types";
import extra from "@/data/nimby-extra.json";

/**
 * 地図データ（Google・Yahoo!・OSM）のどれにも載っていない嫌悪施設の手動登録（src/data/nimby-extra.json）。
 * 新しく開店した店など、利用者から指摘があったものを追加する。
 */
type ExtraItem = { name: string; kind: NimbyKindKey; address: string; lat: number; lng: number };

export function findExtraNear(center: LatLng, radiusM: number): NimbyPlace[] {
  const out: NimbyPlace[] = [];
  (extra.items as ExtraItem[]).forEach((x, i) => {
    const kind = NIMBY_KIND_MAP.get(x.kind);
    if (!kind) return;
    const location = { lat: x.lat, lng: x.lng };
    const distanceM = distanceMeters(center, location);
    if (distanceM > radiusM) return;
    out.push({
      id: `extra:${i}`,
      name: x.name,
      category: "nimby",
      location,
      address: x.address,
      distanceM,
      sub: { key: kind.key, label: kind.label, emoji: kind.emoji },
    });
  });
  return out;
}
