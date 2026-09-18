"use client";

import { useEffect, useMemo, useRef } from "react";
import CategoryFilter from "./CategoryFilter";
import { CATEGORY_MAP, LIST_CATEGORIES } from "@/lib/categories";
import { formatDistance, walkMinutes } from "@/lib/geo";
import type { CategoryKey, Place } from "@/lib/types";

type Props = {
  /** 一覧対象の施設（駅・バス停・嫌悪施設は含まない） */
  places: Place[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  active: ReadonlySet<CategoryKey>;
  onToggleCategory: (key: CategoryKey) => void;
  onAllCategories: () => void;
  onNoCategories: () => void;
};

export default function PlaceList({
  places,
  loading,
  error,
  selectedId,
  onSelect,
  active,
  onToggleCategory,
  onAllCategories,
  onNoCategories,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const m = new Map<CategoryKey, number>();
    for (const p of places) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [places]);

  const groups = useMemo(
    () =>
      LIST_CATEGORIES.map((cat) => ({
        cat,
        items: places.filter((p) => p.category === cat.key && active.has(cat.key)),
      })).filter((g) => g.items.length > 0),
    [places, active],
  );

  // 地図でピンを選んだら、その行までスクロールして見せる
  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-place-id="${selectedId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <>
      <CategoryFilter
        categories={LIST_CATEGORIES}
        counts={counts}
        active={active}
        onToggle={onToggleCategory}
        onAll={onAllCategories}
        onNone={onNoCategories}
      />
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)]"
      >
        {error && <p className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!error && !loading && places.length === 0 && (
          <p className="my-8 text-center text-sm text-gray-500">この範囲に施設が見つかりませんでした</p>
        )}
        {!error && places.length > 0 && groups.length === 0 && (
          <p className="my-8 text-center text-sm text-gray-500">表示するカテゴリを選んでください</p>
        )}
        {groups.map(({ cat, items }) => (
          <div key={cat.key} className="mb-3">
            <h3 className="sticky top-0 bg-white py-1.5 text-xs font-semibold tracking-wide text-gray-500">
              {cat.emoji} {cat.label}
              <span className="ml-1 font-normal text-gray-400">{items.length}</span>
            </h3>
            <ul className="divide-y divide-gray-100">
              {items.map((p) => (
                <PlaceRow key={p.id} place={p} selected={p.id === selectedId} onSelect={onSelect} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

export function PlaceRow({
  place,
  selected,
  onSelect,
}: {
  place: Place;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const color = CATEGORY_MAP.get(place.category)?.color ?? "#6b7280";
  return (
    <li data-place-id={place.id}>
      <button
        type="button"
        onClick={() => onSelect(selected ? null : place.id)}
        aria-pressed={selected}
        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition ${
          selected ? "bg-sky-50" : "active:bg-gray-50"
        }`}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-gray-900">
            {place.sub && (
              <span className="mr-1 rounded bg-red-100 px-1 py-0.5 text-[11px] font-semibold text-red-800">
                {place.sub.emoji} {place.sub.label}
              </span>
            )}
            {place.name}
          </span>
          {place.address && <span className="block truncate text-xs text-gray-500">{place.address}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums text-gray-900">
            {formatDistance(place.distanceM)}
          </span>
          <span className="block text-xs text-gray-500">徒歩{walkMinutes(place.distanceM)}分</span>
        </span>
      </button>
    </li>
  );
}
