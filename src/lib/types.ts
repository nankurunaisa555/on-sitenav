export type LatLng = {
  lat: number;
  lng: number;
};

export type CategoryKey =
  | "supermarket"
  | "convenience"
  | "medical"
  | "pharmacy"
  | "school"
  | "childcare"
  | "park"
  | "station"
  | "bus"
  | "restaurant"
  | "bank"
  | "post"
  | "shopping";

export type Place = {
  id: string;
  name: string;
  category: CategoryKey;
  location: LatLng;
  address: string;
  /** 検索中心からの距離（メートル） */
  distanceM: number;
};

export type PlacesResponse = {
  center: LatLng;
  radiusM: number;
  places: Place[];
};

export type PlacesErrorResponse = {
  error: string;
};
