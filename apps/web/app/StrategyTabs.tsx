"use client";

import { useId, useRef, type ReactNode } from "react";
import styles from "./PreferencesTabs.module.css";
import own from "./StrategyTabs.module.css";

const tabs = [
  { id: "targets", label: "목표 비중" },
  { id: "drawdown", label: "하락 단계" },
  { id: "calculation", label: "리밸런싱 계산" },
] as const;
export type StrategyTab = (typeof tabs)[number]["id"];

/** Splits the strategy screen into one job per tab; the draft lives in the parent, so switching never loses edits. */
export default function StrategyTabs({
  active,
  onChange,
  panels,
  attention,
}: {
  active: StrategyTab;
  onChange: (tab: StrategyTab) => void;
  panels: Record<StrategyTab, ReactNode>;
  attention?: Partial<Record<StrategyTab, string>>;
}) {
  const nav = useRef<HTMLDivElement>(null);
  const id = useId();
  return (
    <div className={own.strategy}>
      <div ref={nav} className={`${styles.tabs} ${own.tabs}`} role="tablist" aria-label="목표 설계 분류">
        {tabs.map(({ id: tab, label }, index) => (
          <button
            key={tab}
            id={`${id}-${tab}-tab`}
            type="button"
            role="tab"
            aria-selected={active === tab}
            aria-controls={`${id}-${tab}-panel`}
            tabIndex={active === tab ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              onChange(tabs[next].id);
              nav.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
            }}
          >
            <span>{label}</span>
            {attention?.[tab] && <i className={styles.unsaved} role="img" aria-label={attention[tab]} />}
          </button>
        ))}
      </div>
      {tabs.map(({ id: tab }) => (
        <div
          key={tab}
          id={`${id}-${tab}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${tab}-tab`}
          hidden={active !== tab}
          className={own.panel}
        >
          {active === tab ? panels[tab] : null}
        </div>
      ))}
    </div>
  );
}
