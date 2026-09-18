import type { CategoryKey } from "./types";

export type CategoryDef = {
  key: CategoryKey;
  label: string;
  emoji: string;
  /** Places API (New) の includedTypes に渡す type 名 */
  googleTypes: readonly string[];
  /** マーカー・チップの色（Tailwind の任意値ではなく hex を直接使う） */
  color: string;
};

/**
 * 表示順 = 現地案内で説明する優先順。
 * 先頭のカテゴリほど「住む上での重要度」が高いものを並べている。
 */
export const CATEGORIES: readonly CategoryDef[] = [
  { key: "station", label: "駅", emoji: "🚉", googleTypes: ["train_station", "subway_station", "light_rail_station"], color: "#2563eb" },
  { key: "bus", label: "バス停", emoji: "🚌", googleTypes: ["bus_station", "bus_stop"], color: "#0ea5e9" },
  { key: "supermarket", label: "スーパー", emoji: "🛒", googleTypes: ["supermarket", "grocery_store"], color: "#16a34a" },
  { key: "convenience", label: "コンビニ", emoji: "🏪", googleTypes: ["convenience_store"], color: "#f97316" },
  { key: "medical", label: "病院・クリニック", emoji: "🏥", googleTypes: ["hospital", "doctor", "dental_clinic"], color: "#dc2626" },
  { key: "pharmacy", label: "薬局", emoji: "💊", googleTypes: ["pharmacy", "drugstore"], color: "#e11d48" },
  { key: "school", label: "学校", emoji: "🏫", googleTypes: ["primary_school", "secondary_school", "school"], color: "#7c3aed" },
  { key: "childcare", label: "保育園・幼稚園", emoji: "🧸", googleTypes: ["preschool", "child_care_agency"], color: "#a855f7" },
  { key: "park", label: "公園", emoji: "🌳", googleTypes: ["park"], color: "#059669" },
  { key: "shopping", label: "商業施設", emoji: "🏬", googleTypes: ["shopping_mall", "department_store", "home_goods_store"], color: "#d946ef" },
  { key: "restaurant", label: "飲食店", emoji: "🍽️", googleTypes: ["restaurant", "cafe"], color: "#ca8a04" },
  { key: "bank", label: "銀行", emoji: "🏦", googleTypes: ["bank", "atm"], color: "#475569" },
  { key: "post", label: "郵便局", emoji: "📮", googleTypes: ["post_office"], color: "#b91c1c" },
  // 以下は Places ではなく国交省データから「最寄り」を取る（半径外でも表示）
  { key: "government", label: "役所", emoji: "🏛️", googleTypes: [], color: "#334155" },
  { key: "library", label: "図書館", emoji: "📚", googleTypes: [], color: "#0f766e" },
  // 嫌悪施設はオンデマンド（/api/nimby）。sub に種別が入る
  { key: "nimby", label: "嫌悪施設", emoji: "⚠️", googleTypes: [], color: "#7f1d1d" },
] as const;

export const CATEGORY_MAP: ReadonlyMap<CategoryKey, CategoryDef> = new Map(
  CATEGORIES.map((c) => [c.key, c]),
);

export const CATEGORY_KEYS: readonly CategoryKey[] = CATEGORIES.map((c) => c.key);

/** Google の types 配列を、当アプリのカテゴリに割り当てる。優先順は CATEGORIES の並び。 */
export function classify(types: readonly string[]): CategoryKey | null {
  for (const cat of CATEGORIES) {
    if (cat.googleTypes.some((t) => types.includes(t))) return cat.key;
  }
  return null;
}

export function isCategoryKey(value: string): value is CategoryKey {
  return CATEGORY_MAP.has(value as CategoryKey);
}
