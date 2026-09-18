"use client";

import type { CategoryDef } from "@/lib/categories";
import type { CategoryKey } from "@/lib/types";

type Props = {
  categories: readonly CategoryDef[];
  counts: ReadonlyMap<CategoryKey, number>;
  /** 表示中（ON）のカテゴリ。既定は全部 ON */
  active: ReadonlySet<CategoryKey>;
  onToggle: (key: CategoryKey) => void;
  onAll: () => void;
  onNone: () => void;
};

/** カテゴリの ON/OFF チップ。折り返して全部見えるようにする（横スクロールなし） */
export default function CategoryFilter({ categories, counts, active, onToggle, onAll, onNone }: Props) {
  const available = categories.filter((c) => (counts.get(c.key) ?? 0) > 0);
  const allOn = available.every((c) => active.has(c.key));
  const noneOn = available.every((c) => !active.has(c.key));

  return (
    <div className="flex flex-wrap gap-1 px-4 pb-2">
      <button
        type="button"
        onClick={onAll}
        aria-pressed={allOn}
        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
          allOn ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700"
        }`}
      >
        すべて
      </button>
      <button
        type="button"
        onClick={onNone}
        aria-pressed={noneOn}
        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
          noneOn ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700"
        }`}
      >
        解除
      </button>
      {categories.map((cat) => {
        const count = counts.get(cat.key) ?? 0;
        const on = active.has(cat.key) && count > 0;
        return (
          <button
            key={cat.key}
            type="button"
            disabled={count === 0}
            onClick={() => onToggle(cat.key)}
            aria-pressed={on}
            style={on ? { backgroundColor: cat.color, borderColor: cat.color } : undefined}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-35 ${
              on ? "text-white" : "border-gray-300 bg-white text-gray-500 line-through decoration-gray-400"
            }`}
          >
            {cat.emoji} {cat.label}
            <span className={`ml-1 ${on ? "text-white/80" : "text-gray-400"}`}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
