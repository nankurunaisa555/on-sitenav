"use client";

import { useMemo } from "react";
import { PlaceRow } from "./PlaceList";
import { NIMBY_KINDS, type NimbyKindKey } from "@/lib/nimby";
import type { NimbyResponse } from "@/lib/types";

type Props = {
  data: NimbyResponse | null;
  loading: boolean;
  error: string | null;
  hasSearch: boolean;
  onSearch: () => void;
  /** 表示中の種別（既定は全部 ON） */
  activeKinds: ReadonlySet<NimbyKindKey>;
  onToggleKind: (key: NimbyKindKey) => void;
  onAllKinds: () => void;
  onNoKinds: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/** 「嫌悪施設」タブ。ボタンを押したときだけ探索し、種別ごとに ON/OFF できる */
export default function NimbyPanel({
  data,
  loading,
  error,
  hasSearch,
  onSearch,
  activeKinds,
  onToggleKind,
  onAllKinds,
  onNoKinds,
  selectedId,
  onSelect,
}: Props) {
  const counts = useMemo(() => {
    const m = new Map<NimbyKindKey, number>();
    for (const p of data?.items ?? []) m.set(p.sub.key as NimbyKindKey, (m.get(p.sub.key as NimbyKindKey) ?? 0) + 1);
    return m;
  }, [data]);

  const available = NIMBY_KINDS.filter((k) => (counts.get(k.key) ?? 0) > 0);
  const allOn = available.every((k) => activeKinds.has(k.key));
  const noneOn = available.every((k) => !activeKinds.has(k.key));

  const groups = NIMBY_KINDS.map((kind) => ({
    kind,
    items: (data?.items ?? []).filter((p) => p.sub.key === kind.key && activeKinds.has(kind.key)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!data && (
        <div className="px-4 pb-3">
          <button
            type="button"
            disabled={!hasSearch || loading}
            onClick={onSearch}
            className="w-full rounded-xl bg-red-800 px-4 py-3 text-sm font-semibold text-white shadow active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "半径1.5kmを探索中…" : "⚠️ 基準点の周辺 1.5km の嫌悪施設を探す"}
          </button>
          {!hasSearch && (
            <p className="mt-2 text-center text-xs text-gray-500">先に「このエリアを検索」で基準点を決めてください</p>
          )}
          {error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
          <p className="mt-3 text-[11px] leading-snug text-gray-500">
            対象: パチンコ店・工場・ガソリンスタンド・キャバクラ／風俗店・ごみ処理／清掃工場・下水処理場・産廃処理場・
            火葬場・墓地／霊園／寺・葬儀場・大型物流施設・変電所・ガスタンク・牧場／養豚／養鶏。
            Google マップの登録情報を名称・業種から自動判定するため、誤検出や漏れがあります。
            暴力団事務所は公開データに存在しないため対象外です。
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-1 px-4 pb-2">
            <button
              type="button"
              onClick={onAllKinds}
              aria-pressed={allOn}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                allOn ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              すべて
            </button>
            <button
              type="button"
              onClick={onNoKinds}
              aria-pressed={noneOn}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                noneOn ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              解除
            </button>
            {NIMBY_KINDS.map((kind) => {
              const count = counts.get(kind.key) ?? 0;
              const on = activeKinds.has(kind.key) && count > 0;
              return (
                <button
                  key={kind.key}
                  type="button"
                  disabled={count === 0}
                  onClick={() => onToggleKind(kind.key)}
                  aria-pressed={on}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-35 ${
                    on
                      ? "border-red-800 bg-red-800 text-white"
                      : "border-gray-300 bg-white text-gray-500 line-through decoration-gray-400"
                  }`}
                >
                  {kind.emoji} {kind.label}
                  <span className={`ml-1 ${on ? "text-white/80" : "text-gray-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)]">
            <p className="my-2 rounded-lg bg-red-50 p-2 text-[11px] leading-snug text-red-800">
              半径1.5kmの候補 {data.items.length} 件。名称・業種からの自動判定のため誤検出や漏れがあります。現地で必ずご確認ください。
              暴力団事務所は公開データに存在しないため対象外です。
            </p>
            {data.items.length === 0 && (
              <p className="my-8 text-center text-sm text-gray-500">該当する施設は見つかりませんでした</p>
            )}
            {groups.map(({ kind, items }) => (
              <div key={kind.key} className="mb-3">
                <h3 className="sticky top-0 bg-white py-1.5 text-xs font-semibold tracking-wide text-gray-500">
                  {kind.emoji} {kind.label}
                  <span className="ml-1 font-normal text-gray-400">{items.length}</span>
                </h3>
                <ul className="divide-y divide-gray-100">
                  {items.map((p) => (
                    <PlaceRow key={p.id} place={{ ...p, sub: undefined }} selected={p.id === selectedId} onSelect={onSelect} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
