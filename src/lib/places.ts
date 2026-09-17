export async function fetchPlaces(lat: number, lng: number) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

  if (!apiKey) {
    console.warn("NEXT_PUBLIC_GOOGLE_API_KEY が設定されていません");
    return [];
  }

  const url = "https://places.googleapis.com/v1/places:searchNearby";

  const body = {
    includedTypes: [
      "supermarket",
      "grocery_store",
      "hospital",
      "clinic",
      "school",
      "park",
      "restaurant",
      "cafe",
      "convenience_store",
    ],
    maxResultCount: 10,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 800.0,
      },
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.types,places.location,places.rating",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Places API エラー (${res.status}):`, errText);
      return [];
    }

    const data = await res.json();
    const places = data.places || [];

    return places.map((place: any) => ({
      name: place.displayName?.text ?? "名称不明",
      types: place.types ?? [],
      location: place.location,
      rating: place.rating,
      category: classifyPlace(place),
    }));
  } catch (e) {
    console.error("fetchPlaces エラー:", e);
    return [];
  }
}

function classifyPlace(place: any) {
  const t = place.types || [];

  if (t.includes("supermarket") || t.includes("grocery_store"))
    return "🛒 スーパー";
  if (t.includes("convenience_store"))
    return "🏪 コンビニ";
  if (t.includes("hospital") || t.includes("clinic"))
    return "🏥 病院";
  if (t.includes("school"))
    return "🏫 学校";
  if (t.includes("park"))
    return "🌳 公園";
  if (t.includes("restaurant") || t.includes("cafe"))
    return "🍽️ 飲食店";

  return "📍 その他";
}
