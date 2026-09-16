export async function fetchPlaces(lat: number, lng: number) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=800&key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  return data.results.map((place: any) => ({
    name: place.name,
    types: place.types,
    location: place.geometry.location,
    rating: place.rating,
    category: classifyPlace(place),
  }));
}

function classifyPlace(place: any) {
  const t = place.types || [];

  if (t.includes("supermarket") || t.includes("grocery_or_supermarket"))
    return "スーパー";
  if (t.includes("hospital") || t.includes("clinic"))
    return "病院";
  if (t.includes("school"))
    return "学校";
  if (t.includes("park"))
    return "公園";
  if (t.includes("restaurant") || t.includes("cafe"))
    return "飲食店";

  return "その他";
}
