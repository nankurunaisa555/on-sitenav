import { PNG } from "pngjs";
import type { HazardHit, HazardKey } from "@/lib/facts-types";
import { HAZARD_LAYERS } from "@/lib/hazard-layers";
import { lngLatToTile, tileUrl } from "@/lib/tile";
import type { LatLng } from "@/lib/types";

const SAMPLE_ZOOM = 16;

type RGB = readonly [number, number, number];

/** 浸水深の凡例色（洪水・内水・高潮・津波で共通の「新凡例」） */
const DEPTH_LEGEND: readonly { rgb: RGB; label: string }[] = [
  { rgb: [247, 245, 169], label: "0.5m未満" },
  { rgb: [255, 216, 192], label: "0.5〜3m" },
  { rgb: [255, 183, 183], label: "3〜5m" },
  { rgb: [255, 145, 145], label: "5〜10m" },
  { rgb: [242, 133, 201], label: "10〜20m" },
  { rgb: [220, 122, 220], label: "20m以上" },
  // 旧凡例（計画規模など）で使われる色も拾う
  { rgb: [255, 255, 179], label: "0.5m未満" },
  { rgb: [247, 193, 143], label: "0.5〜1m" },
  { rgb: [255, 160, 122], label: "1〜2m" },
];

const COLOR_TOLERANCE = 28;

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function classifyDepth(rgb: RGB): { label: string; uncertain: boolean } {
  let best: { label: string; d: number } | null = null;
  for (const entry of DEPTH_LEGEND) {
    const d = colorDistance(rgb, entry.rgb);
    if (!best || d < best.d) best = { label: entry.label, d };
  }
  if (best && best.d <= COLOR_TOLERANCE) return { label: best.label, uncertain: false };
  return { label: "浸水想定あり（区分不明）", uncertain: true };
}

function classifySediment(rgb: RGB): string {
  // 特別警戒区域は赤系、警戒区域は黄系で塗られる
  const [r, g] = rgb;
  return r > 170 && g < 130 ? "特別警戒区域（レッドゾーン）" : "警戒区域（イエローゾーン）";
}

async function samplePixel(url: string, px: number, py: number): Promise<RGB | null> {
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  // データが無いタイルは 404 で返る＝該当なし
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tile ${res.status}: ${url}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const png = PNG.sync.read(buf);
  const scaleX = png.width / 256;
  const scaleY = png.height / 256;
  const x = Math.min(png.width - 1, Math.floor(px * scaleX));
  const y = Math.min(png.height - 1, Math.floor(py * scaleY));
  const i = (y * png.width + x) * 4;
  const a = png.data[i + 3] ?? 0;
  if (a < 32) return null;
  return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0];
}

export async function sampleHazards(center: LatLng): Promise<HazardHit[]> {
  const t = lngLatToTile(center, SAMPLE_ZOOM);

  return Promise.all(
    HAZARD_LAYERS.map(async (layer): Promise<HazardHit> => {
      const pixels = await Promise.all(
        layer.tiles.map((tpl) => samplePixel(tileUrl(tpl, t), t.px, t.py)),
      );
      const hit = pixels.find((p): p is RGB => p !== null);
      if (!hit) return { key: layer.key, label: layer.short, level: null, uncertain: false };

      if (layer.key === "sediment") {
        return { key: layer.key, label: layer.short, level: classifySediment(hit), uncertain: false };
      }
      const { label, uncertain } = classifyDepth(hit);
      return { key: layer.key, label: layer.short, level: label, uncertain };
    }),
  );
}

export const HAZARD_KEYS: readonly HazardKey[] = HAZARD_LAYERS.map((l) => l.key);
