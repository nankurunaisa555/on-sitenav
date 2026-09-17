// src/app/api/places/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat, lng required" }, { status: 400 });
  }

  // 環境変数からAPIキーを取得（GOOGLE_MAPS_API_KEY を優先）
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("Google API Key が設定されていません");
    return NextResponse.json({ places: [] });
  }

  // Google Places API (New) - Nearby Search
  const url = `https://places.googleapis.com/v1/places:searchNearby`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.types,places.location,places.rating,places.formattedAddress",
      },
      body: JSON.stringify({
        includedTypes: [
          "supermarket",
          "grocery_store",
          "convenience_store",
          "hospital",
          "clinic",
          "school",
          "park",
          "restaurant",
          "cafe",
          "pharmacy",
          "bus_station",
          "train_station",
          "shopping_mall",
          "bank",
          "post_office",
        ],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: {
              latitude: parseFloat(lat),
              longitude: parseFloat(lng),
            },
            radius: 800.0,
          },
        },
        languageCode: "ja",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Places API Error:", JSON.stringify(data));
      return NextResponse.json({ places: [] });
    }

    const places = (data.places || []).map((place: any) => ({
      name: place.displayName?.text || "名称不明",
      types: place.types || [],
      rating: place.rating || null,
      address: place.formattedAddress || "",
      category: classifyPlace(place.types || []),
    }));

    return NextResponse.json({ places });
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json({ places: [] });
  }
}

function classifyPlace(types: string[]) {
  if (types.includes("supermarket") || types.includes("grocery_store"))
    return "🛒 スーパー";
  if (types.includes("convenience_store"))
    return "🏪 コンビニ";
  if (types.includes("hospital") || types.includes("clinic"))
    return "🏥 病院";
  if (types.includes("school"))
    return "🏫 学校";
  if (types.includes("park"))
    return "🌳 公園";
  if (types.includes("restaurant") || types.includes("cafe"))
    return "🍽️ 飲食店";
  if (types.includes("pharmacy"))
    return "💊 薬局";
  if (types.includes("bus_station") || types.includes("train_station"))
    return "🚉 駅";
  if (types.includes("shopping_mall"))
    return "🏬 ショッピング";
  if (types.includes("bank"))
    return "🏦 銀行";
  if (types.includes("post_office"))
    return "📮 郵便局";
  return "📍 その他";
}