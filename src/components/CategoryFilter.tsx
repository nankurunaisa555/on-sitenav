"use client";

import { CATEGORIES } from "@/lib/categories";
import type { CategoryKey } from "@/lib/types";

type Props = {
  counts: ReadonlyMap<CategoryKey, number>;
  active: ReadonlySet<CategoryKey>;
  onToggle: (key: CategoryKey) => void;
  onReset: () => void;
  /** 嫌悪施設チップの状態（オンデマンド取得） */
  nimby: { loaded: boolean; enabled: boolean; loading: boolean; onClick: () => void };
};

export default function CategoryFilter({ counts, active, onToggle, onReset, nimby }: Props) {
  const filtering = active.size > 0;
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={onReset}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          filtering
            ? "border-gray-300 bg-white text-gray-600"
            : "border-gray-900 bg-gray-900 text-white"
        }`}
      >
        すべて
      </button>
      {CATEGORIES.map((cat) => {
        const count = counts.get(cat.key) ?? 0;
        const on = active.has(cat.key);
        if (cat.key === "nimby") {
          // 未取得: 「探す」ボタン / 取得済み: 表示 ON/OFF（一覧の絞り込みではなくピン・一覧への出し入れ）
          return (
            <button
              key={cat.key}
              type="button"
              disabled={nimby.loading}
              onClick={nimby.onClick}
              aria-pressed={nimby.enabled}
              style={nimby.enabled ? { backgroundColor: cat.color, borderColor: cat.color } : undefined}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
                nimby.enabled ? "text-white" : "border-red-300 bg-red-50 text-red-800"
              }`}
            >
              {cat.emoji} {cat.label}
              <span className={`ml-1 text-xs ${nimby.enabled ? "text-white/80" : "text-red-500"}`}>
                {nimby.loading ? "検索中…" : nimby.loaded ? count : "探す"}
              </span>
            </button>
          );
        }
        return (
          <button
            key={cat.key}
            type="button"
            disabled={count === 0}
            onClick={() => onToggle(cat.key)}
            style={on ? { backgroundColor: cat.color, borderColor: cat.color } : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-35 ${
              on ? "text-white" : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            {cat.emoji} {cat.label}
            <span className={`ml-1 text-xs ${on ? "text-white/80" : "text-gray-400"}`}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
