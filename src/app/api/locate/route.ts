import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 施設登録用: Google マップの共有リンク、または住所から位置を求める。
 * - リンク: 短縮 URL（maps.app.goo.gl）のリダイレクトをたどり、最終 URL の座標と施設名を読む
 * - 住所: 国土地理院の住所検索
 * リダイレクトは Google マップのホストだけたどる（任意の URL を取りに行かないように）。
 */
const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
  "www.google.com",
  "google.com",
  "maps.google.com",
  "www.google.co.jp",
  "google.co.jp",
  "maps.google.co.jp",
]);

type Located = { lat: number; lng: number; name?: string; address?: string; matched?: string };

function parseMapsUrl(url: URL): Located | null {
  const s = decodeURIComponent(url.href);
  // 施設の位置（!3d緯度!4d経度）を優先。なければ地図の中心（@緯度,経度）や q=緯度,経度
  const pin = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const q = s.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  const m = pin ?? q ?? at;
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
  const name = place ? decodeURIComponent(place[1]!).replace(/\+/g, " ").trim() : undefined;
  return { lat, lng, name };
}

async function resolveMapsLink(input: string): Promise<Located | null> {
  let url = new URL(input);
  for (let hop = 0; hop < 6; hop++) {
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) throw new Error("Google マップのリンクではありません");
    const direct = parseMapsUrl(url);
    if (direct) return direct;
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), cache: "no-store" });
    const next = res.headers.get("location");
    if (!next) return null;
    url = new URL(next, url);
  }
  return null;
}

async function geocodeAddress(q: string): Promise<Located | null> {
  const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`, {
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const list = (await res.json()) as { geometry: { coordinates: [number, number] }; properties: { title: string } }[];
  const hit = list[0];
  if (!hit) return null;
  return { lat: hit.geometry.coordinates[1], lng: hit.geometry.coordinates[0], address: q, matched: hit.properties.title };
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 2000) return NextResponse.json({ error: "リンクか住所を入力してください" }, { status: 400 });
  try {
    const found = /^https?:\/\//i.test(q) ? await resolveMapsLink(q) : await geocodeAddress(q);
    if (!found) return NextResponse.json({ error: "位置が見つかりませんでした" }, { status: 404 });
    return NextResponse.json(found);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "位置を調べられませんでした" }, { status: 400 });
  }
}
