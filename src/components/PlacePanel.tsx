"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CategoryFilter from "./CategoryFilter";
import { CATEGORIES, CATEGORY_MAP } from "@/lib/categories";
import { formatDistance, walkMinutes } from "@/lib/geo";
import type { CategoryKey, Place } from "@/lib/types";

type Props = {
  /** 絞り込み前の全件（件数表示・チップの件数に使う） */
  places: Place[];
  radiusM: number;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  active: ReadonlySet<CategoryKey>;
  onToggleCategory: (key: CategoryKey) => void;
  onResetCategory: () => void;
};

const PEEK_VH = 38;
const EXPANDED_VH = 72;

export default function PlacePanel({
  places,
  radiusM,
  loading,
  error,
  selectedId,
  onSelect,
  active,
  onToggleCategory,
  onResetCategory,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; expanded: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ハンドル/ヘッダーを上下にドラッグして伸縮。離した時点で近い方へスナップ
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragStart.current = { y: e.clientY, expanded };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 一部環境（合成イベント等）では失敗するが、キャプチャ無しでも動作する
      }
    },
    [expanded],
  );
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    setDragOffset(dragStart.current.y - e.clientY);
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    setDragOffset(null);
    if (!start) return;
    const delta = start.y - e.clientY; // 上方向が正
    if (Math.abs(delta) < 8) {
      setExpanded((v) => !v); // タップ扱い
    } else {
      setExpanded(delta > 0);
    }
  }, []);

  const baseVh = expanded ? EXPANDED_VH : PEEK_VH;
  const dragVh = dragOffset === null ? 0 : (dragOffset / window.innerHeight) * 100;
  const heightVh = Math.min(EXPANDED_VH, Math.max(PEEK_VH, baseVh + dragVh));

  const counts = useMemo(() => {
    const m = new Map<CategoryKey, number>();
    for (const p of places) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [places]);

  const groups = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      cat,
      items: places.filter(
        (p) => p.category === cat.key && (active.size === 0 || active.has(cat.key)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [places, active]);

  // 地図でピンを選んだら、その行までスクロールして見せる
  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-place-id="${selectedId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <section
      aria-label="周辺施設"
      style={{ height: `${heightVh}dvh` }}
      className={`pointer-events-auto flex w-full min-w-0 flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.15)] ${
        dragOffset === null ? "transition-[height] duration-300" : ""
      }`}
    >
      {/* ハンドル + ヘッダー: ドラッグで伸縮、タップで切り替え */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "一覧を縮める" : "一覧を広げる"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="cursor-grab touch-none select-none active:cursor-grabbing"
      >
        <div className="flex w-full flex-col items-center pt-2 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-gray-300" />
        </div>
        <header className="flex items-baseline justify-between px-4 pb-2">
          <h2 className="text-base font-bold text-gray-900">周辺施設</h2>
          <p className="text-xs text-gray-500">
            {loading ? "検索中…" : `半径${formatDistance(radiusM)}・${places.length}件`}
          </p>
        </header>
      </div>

      <CategoryFilter counts={counts} active={active} onToggle={onToggleCategory} onReset={onResetCategory} />

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)]">
        {error && (
          <p className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        {!error && !loading && places.length === 0 && (
          <p className="my-8 text-center text-sm text-gray-500">
            この範囲に施設が見つかりませんでした
          </p>
        )}
        {groups.map(({ cat, items }) => (
          <div key={cat.key} className="mb-3">
            <h3 className="sticky top-0 bg-white py-1.5 text-xs font-semibold tracking-wide text-gray-500">
              {cat.emoji} {cat.label}
            </h3>
            <ul className="divide-y divide-gray-100">
              {items.map((p) => (
                <PlaceRow key={p.id} place={p} selected={p.id === selectedId} onSelect={onSelect} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlaceRow({
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
          <span className="block truncate text-[15px] font-medium text-gray-900">{place.name}</span>
          {place.address && (
            <span className="block truncate text-xs text-gray-500">{place.address}</span>
          )}
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
