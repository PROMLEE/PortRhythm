"use client";

import { useId } from "react";
import { DRAWDOWN_INDEXES, indexLabel, sortStages, type DrawdownPlan, type DrawdownStage, type IndexDrawdown } from "./drawdown";
import type { IndexOverviewState } from "./use-index-drawdown";
import styles from "./IndexOverview.module.css";

const value = (number: number) =>
  number.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (number: number) => (Math.round(number * 10) / 10).toFixed(1);
const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

/** 52-week low-to-high range per U.S. index, with today's close placed on it. */
export default function IndexOverview({
  overview,
  plan,
}: {
  overview: IndexOverviewState;
  plan: DrawdownPlan | null;
}) {
  const titleId = useId();
  const rows = overview.data ?? [];
  const showsStages = Boolean(plan?.enabled && plan.stages.some((stage) => stage.threshold > 0) && rows.some((row) => row.index === plan.index));
  return (
    <section className={styles.market} aria-labelledby={titleId}>
      <h2 id={titleId}>주요 지수 52주 위치</h2>
      {overview.loading && !rows.length && (
        <ul className={styles.rows} aria-hidden="true">
          {DRAWDOWN_INDEXES.map((row) => (
            <li key={row.id} className={styles.placeholder}><strong>{row.label}</strong><i /></li>
          ))}
        </ul>
      )}
      {overview.error && <p className={styles.error}>{overview.error}</p>}
      {rows.length > 0 && (
        <ul className={styles.rows}>
          {rows.map((row) => {
            const planned = Boolean(plan?.enabled && plan.index === row.index);
            return (
              <li key={row.index}>
                <IndexRangeRow row={row} stages={planned ? plan!.stages : []} badge={planned} />
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && <p className={styles.note}>각 지수의 최근 종가와 최근 52주 종가로 계산합니다.{showsStages && ` ${indexLabel(plan!.index)} 막대의 세로선은 하락 단계가 시작되는 지점입니다.`}</p>}
    </section>
  );
}

/** One index on its 52-week low-to-high bar; stage starts appear as ticks. Shared by the dashboard and the drawdown tab. */
export function IndexRangeRow({
  row,
  stages,
  badge = false,
}: {
  row: IndexDrawdown;
  stages: DrawdownStage[];
  badge?: boolean;
}) {
  const span = row.high - row.low;
  const position = span > 0 ? ((row.close - row.low) / span) * 100 : 100;
  const ticks = sortStages(stages)
    .filter((stage) => stage.threshold > 0)
    .map((stage) => ({ id: stage.id, threshold: stage.threshold, level: row.high * (1 - stage.threshold / 100) }))
    .filter((tick) => tick.level > row.low && span > 0);
  return (
    <div className={styles.row}>
      <div className={styles.head}>
        <strong>{indexLabel(row.index)}</strong>
        {badge && <span className={styles.badge}>하락 단계 기준</span>}
        <b>{value(row.close)}</b>
        <small className={styles.closeDate}>{monthDay(row.closeDate)}</small>
      </div>
      <div
        className={styles.range}
        role="img"
        aria-label={`52주 저점 ${value(row.low)}, 고점 ${value(row.high)}, 현재 ${value(row.close)}. 저점보다 ${percent(row.risePercent)}% 높고 고점보다 ${percent(row.drawdownPercent)}% 낮습니다.`}
      >
        <span className={styles.fill} style={{ width: `${position}%` }} />
        {ticks.map((tick) => (
          <span
            key={tick.id}
            className={styles.tick}
            style={{ left: `${((tick.level - row.low) / span) * 100}%` }}
            title={`고점 대비 −${tick.threshold}%`}
          />
        ))}
        <span className={styles.dot} style={{ left: `${position}%` }} />
      </div>
      <div className={styles.ends}>
        <span className={styles.up}>저점 대비 +{percent(row.risePercent)}%</span>
        <span className={styles.down}>고점 대비 −{percent(row.drawdownPercent)}%</span>
      </div>
      <div className={styles.levels}>
        <span>{value(row.low)}({monthDay(row.lowDate)})</span>
        <span>{value(row.high)}({monthDay(row.highDate)})</span>
      </div>
    </div>
  );
}

export const indexCloseDay = monthDay;
