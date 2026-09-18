import { NextResponse } from "next/server";
import { parseJapaneseAddress } from "@/lib/address";
import type { Trade, TradesResponse } from "@/lib/facts-types";

export const runtime = "nodejs";

/**
 * 不動産情報ライブラリ XIT001（不動産価格情報）から、住所の町名に該当する取引事例を返す。
 * 位置は町名単位でしか公開されないため、基準点近くの施設の住所から町名を決めて引く。
 */
const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";
const YEARS_BACK = 2; // 今年＋過去2年
const MAX_TRADES = 40;

type CityEntry = { id: string; name: string };
type RawTrade = Record<string, string | undefined>;

async function reinfo<T>(path: string, revalidateSec: number): Promise<T | null> {
  const key = process.env.REINFOLIB_API_KEY;
  if (!key) return null;
  const res = await fetch(`${BASE}/${path}`, {
    headers: { "Ocp-Apim-Subscription-Key": key },
    next: { revalidate: revalidateSec },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`reinfolib ${path.split("?")[0]} ${res.status}`);
  return (await res.json()) as T;
}

/** 都道府県内の市区町村一覧から、住所の市区町村に対応するコードを引く */
async function resolveCityCode(prefCode: number, city: string, ward: string | null): Promise<CityEntry | null> {
  const list = await reinfo<{ data?: CityEntry[] }>(`XIT002?area=${prefCode}`, 60 * 60 * 24 * 30);
  const entries = list?.data ?? [];
  // 政令市は区単位のエントリ（例: "南区"）があるので、それを優先
  if (ward) {
    const w = entries.find((e) => e.name === ward);
    if (w) return w;
  }
  return entries.find((e) => e.name === city) ?? entries.find((e) => city.endsWith(e.name)) ?? null;
}

function toTrade(r: RawTrade): Trade {
  return {
    category: r.PriceCategory ?? "",
    type: r.Type ?? "",
    period: r.Period ?? "",
    price: Number(r.TradePrice) || 0,
    area: Number(r.Area) || null,
    totalFloorArea: Number(r.TotalFloorArea) || null,
    buildingYear: r.BuildingYear || null,
    structure: r.Structure || null,
    floorPlan: r.FloorPlan || null,
    zoning: r.CityPlanning || null,
    purpose: r.Purpose || null,
  };
}

/** "2025年第1四半期" → 20251（並べ替え用） */
function periodKey(period: string): number {
  const m = period.match(/(\d{4})年第(\d)四半期/);
  return m ? Number(m[1]) * 10 + Number(m[2]) : 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address は必須です" }, { status: 400 });
  if (!process.env.REINFOLIB_API_KEY) {
    return NextResponse.json({ error: "REINFOLIB_API_KEY が未設定です" }, { status: 503 });
  }

  const parsed = parseJapaneseAddress(address);
  if (!parsed) return NextResponse.json({ error: "住所から町名を特定できませんでした" }, { status: 422 });

  try {
    const cityEntry = await resolveCityCode(parsed.prefCode, parsed.city, parsed.ward);
    if (!cityEntry) {
      return NextResponse.json({ error: `市区町村コードが見つかりません: ${parsed.city}` }, { status: 422 });
    }

    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => thisYear - i);
    const results = await Promise.all(
      years.map((y) =>
        reinfo<{ data?: RawTrade[] }>(
          `XIT001?year=${y}&area=${parsed.prefCode}&city=${cityEntry.id}`,
          60 * 60 * 24,
        ).catch(() => null),
      ),
    );

    const all = results.flatMap((r) => r?.data ?? []);
    const inTown = all.filter((r) => (r.DistrictName ?? "") === parsed.town);
    const trades = inTown
      .map(toTrade)
      .sort((a, b) => periodKey(b.period) - periodKey(a.period))
      .slice(0, MAX_TRADES);

    const data: TradesResponse = {
      city: parsed.city,
      town: parsed.town,
      years: [years[years.length - 1]!, years[0]!],
      totalInTown: inTown.length,
      trades,
    };
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/trades]", err);
    return NextResponse.json({ error: "取引事例の取得に失敗しました" }, { status: 502 });
  }
}
