"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

const PEEK_VH = 38;
const EXPANDED_VH = 72;

export type SheetTab<K extends string> = { key: K; label: string };

type Props<K extends string> = {
  tabs: readonly SheetTab<K>[];
  activeTab: K;
  onTabChange: (key: K) => void;
  /** ヘッダー右側に出す補足（件数など） */
  meta?: ReactNode;
  children: ReactNode;
};

/** 画面下部のボトムシート。ハンドル/ヘッダーのドラッグとタップで伸縮する */
export default function BottomSheet<K extends string>({
  tabs,
  activeTab,
  onTabChange,
  meta,
  children,
}: Props<K>) {
  const [expanded, setExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; expanded: boolean } | null>(null);

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
    if (Math.abs(delta) < 8) setExpanded((v) => !v);
    else setExpanded(delta > 0);
  }, []);

  const baseVh = expanded ? EXPANDED_VH : PEEK_VH;
  const dragVh = dragOffset === null ? 0 : (dragOffset / window.innerHeight) * 100;
  const heightVh = Math.min(EXPANDED_VH, Math.max(PEEK_VH, baseVh + dragVh));

  return (
    <section
      style={{ height: `${heightVh}dvh` }}
      className={`pointer-events-auto flex w-full min-w-0 flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.15)] ${
        dragOffset === null ? "transition-[height] duration-300" : ""
      }`}
    >
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
        <header className="flex items-start justify-between gap-3 px-4 pb-2">
          <div role="tablist" className="flex min-w-0 flex-wrap gap-1 rounded-lg bg-gray-100 p-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={t.key === activeTab}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  onTabChange(t.key);
                  if (!expanded) setExpanded(true);
                }}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-semibold transition ${
                  t.key === activeTab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {meta && <p className="hidden min-w-0 shrink-0 pt-1.5 text-xs text-gray-500 min-[430px]:block">{meta}</p>}
        </header>
      </div>
      {children}
    </section>
  );
}
