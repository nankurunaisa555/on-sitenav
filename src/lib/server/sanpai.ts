import { distanceMeters } from "@/lib/geo";
import { NIMBY_KIND_MAP } from "@/lib/nimby";
import type { LatLng, NimbyPlace } from "@/lib/types";

/**
 * 産業廃棄物の処理施設（中間処理・破砕・切断・焼却など）。
 * 埼玉県・さいたま市の「産業廃棄物処分業者名簿」から scripts/build_sanpai_data.py で作ったデータ。
 * 解体・スクラップの工場は Google・OSM にほぼ載っていないため、公式の名簿で補う（現在は埼玉県のみ）。
 */
type SanpaiItem = {
  name: string;
  address: string;
  methods: string[];
  source: string;
  lat: number;
  lng: number;
  /** block=街区まで一致 / chome=町丁目の代表点 / oaza=大字の代表点（おおよそ） */
  precision: "block" | "chome" | "oaza";
};

let data: SanpaiItem[] | null = null;

async function load(): Promise<SanpaiItem[]> {
  if (!data) data = ((await import("@/data/sanpai-11.json")).default as { items: SanpaiItem[] }).items;
  return data;
}

const PRECISION_NOTE: Record<SanpaiItem["precision"], string> = {
  block: "",
  chome: "（位置は町丁目の代表点）",
  oaza: "（位置は大字の代表点でおおよそ）",
};

export async function findSanpaiNear(center: LatLng, radiusM: number): Promise<NimbyPlace[]> {
  const kind = NIMBY_KIND_MAP.get("waste")!;
  const out: NimbyPlace[] = [];
  for (const [i, x] of (await load()).entries()) {
    // 大まかな事前判定（緯度0.01度≒1.1km）
    if (Math.abs(x.lat - center.lat) > 0.02 || Math.abs(x.lng - center.lng) > 0.025) continue;
    const location = { lat: x.lat, lng: x.lng };
    const distanceM = distanceMeters(center, location);
    if (distanceM > radiusM) continue;
    out.push({
      id: `sanpai:${i}`,
      name: `${x.name}（産廃処理：${x.methods.join("・")}）`,
      category: "nimby",
      location,
      address: `${x.address}${PRECISION_NOTE[x.precision]}`,
      distanceM,
      sub: { key: kind.key, label: kind.label, emoji: kind.emoji },
    });
  }
  return out;
}
