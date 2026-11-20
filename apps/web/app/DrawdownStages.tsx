"use client";

import { Plus, Trash2 } from "lucide-react";
import NumberInput from "./NumberInput";
import {
  DRAWDOWN_INDEXES,
  MAX_DRAWDOWN_STAGES,
  applyDrawdownStage,
  createDrawdownPlan,
  indexLabel,
  recommendedStage,
  sortStages,
  stageLabel,
  stageMatchesBuckets,
  stageTarget,
  stageTotal,
  type DrawdownIndex,
  type DrawdownPlan,
  type DrawdownStage,
} from "./drawdown";
import type { Portfolio } from "./portfolio-model";
import type { IndexDrawdownState } from "./use-index-drawdown";
import base from "./portfolio.module.css";
import styles from "./DrawdownStages.module.css";

type Props = {
  portfolio: Portfolio;
  drawdown: IndexDrawdownState;
  onChange: (next: Portfolio) => void;
  onNotice: (message: string) => void;
};

const indexValue = (value: number) =>
  value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
const signedPoints = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(Math.round(value * 10) / 10)}%p`;

export default function DrawdownStages({ portfolio, drawdown, onChange, onNotice }: Props) {
  const plan = portfolio.drawdownPlan ?? null;
  const buckets = portfolio.buckets;

  function update(next: DrawdownPlan) {
    onChange({ ...portfolio, drawdownPlan: next });
  }

  if (!plan) {
    return (
      <section className={`${base.panel} ${styles.panel}`} aria-labelledby="drawdown-title">
        <div className={base.panelHead}>
          <h2 id="drawdown-title">지수 하락 단계</h2>
        </div>
        <p className={styles.lead}>
          S&amp;P 500이나 나스닥이 52주 고점에서 얼마나 내려왔는지에 따라 쓸 목표 비중을 미리 정해 둡니다.
          단계에 들어서면 리밸런싱 화면에서 안내하고, 목표는 확인한 뒤에만 바뀝니다.
        </p>
        <button
          type="button"
          className={base.ghost}
          onClick={() => update(createDrawdownPlan(buckets, () => crypto.randomUUID()))}
        >
          <Plus size={16} /> 하락 단계 만들기
        </button>
      </section>
    );
  }

  const stages = sortStages(plan.stages);
  const baseStage = stages[0];
  const deepest = stages.at(-1)!.threshold;
  const current = drawdown.data?.drawdownPercent ?? null;
  const scale = Math.max(30, Math.ceil((Math.max(deepest, current ?? 0) + 8) / 10) * 10);
  const suggested = plan.enabled && current !== null ? recommendedStage(plan, current) : null;
  const applied = stages.find((stage) => stage.id === plan.appliedStageId) ?? null;
  const suggestedInUse = suggested ? stageMatchesBuckets(suggested, buckets) : false;

  function editStage(id: string, next: Partial<DrawdownStage>) {
    update({ ...plan!, stages: plan!.stages.map((stage) => (stage.id === id ? { ...stage, ...next } : stage)) });
  }
  function addStage() {
    if (stages.length >= MAX_DRAWDOWN_STAGES) return;
    const last = stages.at(-1)!;
    update({
      ...plan!,
      stages: [...plan!.stages, { id: crypto.randomUUID(), threshold: Math.min(90, last.threshold + 10), targets: { ...last.targets } }],
    });
  }
  function removeStage(id: string) {
    update({
      ...plan!,
      stages: plan!.stages.filter((stage) => stage.id !== id),
      appliedStageId: plan!.appliedStageId === id ? null : plan!.appliedStageId,
      appliedAt: plan!.appliedStageId === id ? null : plan!.appliedAt,
    });
  }
  function copyInto(id: string, sourceId: string) {
    const source = stages.find((stage) => stage.id === sourceId);
    if (source) editStage(id, { targets: { ...source.targets } });
  }
  function apply(stage: DrawdownStage) {
    onChange(applyDrawdownStage(portfolio, stage.id, new Date()));
    onNotice(`목표 비중을 ${stageLabel(stage)} 단계 값으로 바꿨습니다. 변경 내용을 저장하면 적용됩니다.`);
  }

  return (
    <section className={`${base.panel} ${styles.panel}`} aria-labelledby="drawdown-title">
      <div className={base.panelHead}>
        <h2 id="drawdown-title">지수 하락 단계</h2>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={plan.enabled}
            onChange={(event) => update({ ...plan, enabled: event.target.checked })}
          />
          사용
        </label>
      </div>

      <div className={styles.settings}>
        <label>
          기준 지수
          <select
            value={plan.index}
            onChange={(event) => update({ ...plan, index: event.target.value as DrawdownIndex })}
          >
            {DRAWDOWN_INDEXES.map((row) => (
              <option key={row.id} value={row.id}>{row.label}</option>
            ))}
          </select>
        </label>
        <label>
          회복 여유
          <span className={styles.unitInput}>
            <NumberInput
              min="0" max="20" step="0.5"
              value={plan.recoveryBuffer}
              aria-label="회복 여유 퍼센트포인트"
              onValueChange={(value) => update({ ...plan, recoveryBuffer: Number(value) })}
            />
            %p
          </span>
        </label>
        <small>
          지수가 반등할 때는 단계 기준보다 {plan.recoveryBuffer}%p 더 회복해야 이전 단계로 돌아갑니다.
          기준선 근처에서 목표가 자꾸 바뀌지 않게 하려는 값입니다.
        </small>
      </div>

      <figure className={styles.ruler} aria-label={current === null ? "지수 하락률 눈금" : `${indexLabel(plan.index)} 52주 고점 대비 −${current}%`}>
        <div className={styles.track}>
          <div className={styles.bands}>
            {stages.map((stage, position) => {
              const end = stages[position + 1]?.threshold ?? scale;
              return (
                <span
                  key={stage.id}
                  className={styles.segment}
                  data-active={suggested?.id === stage.id || undefined}
                  style={{
                    left: `${(stage.threshold / scale) * 100}%`,
                    width: `${((end - stage.threshold) / scale) * 100}%`,
                    ["--depth" as string]: String(position / Math.max(1, stages.length - 1)),
                  }}
                />
              );
            })}
          </div>
          {current !== null && (
            <i className={styles.marker} style={{ left: `${Math.min(current / scale, 1) * 100}%` }} aria-hidden="true" />
          )}
        </div>
        <div className={styles.ticks} aria-hidden="true">
          {stages.map((stage) => (
            <span key={stage.id} style={{ left: `${(stage.threshold / scale) * 100}%` }}>
              {stage.threshold === 0 ? "고점" : `−${stage.threshold}%`}
            </span>
          ))}
        </div>
        <figcaption>
          {drawdown.loading && `${indexLabel(plan.index)} 시세를 불러오는 중입니다.`}
          {drawdown.error && <span className={base.warning}>{drawdown.error}</span>}
          {drawdown.data && (
            <>
              <strong>{indexLabel(plan.index)} −{drawdown.data.drawdownPercent}%</strong>
              <span>
                {monthDay(drawdown.data.closeDate)} 종가 {indexValue(drawdown.data.close)}, 52주 고점 {indexValue(drawdown.data.high)}({monthDay(drawdown.data.highDate)})
              </span>
            </>
          )}
        </figcaption>
      </figure>

      {plan.enabled && suggested && (
        <div className={styles.suggestion} data-pending={!suggestedInUse || undefined}>
          {suggestedInUse ? (
            <p>지금 목표 비중이 {stageLabel(suggested)} 단계와 같습니다.</p>
          ) : (
            <>
              <p>
                지금 하락률이면 <strong>{stageLabel(suggested)}</strong> 단계를 쓰도록 정해 두셨습니다.
                {applied ? ` 마지막으로 적용한 단계는 ${stageLabel(applied)}입니다.` : ""}
              </p>
              <button type="button" className={styles.apply} onClick={() => apply(suggested)}>
                이 단계 목표 적용
              </button>
            </>
          )}
        </div>
      )}

      <ol className={styles.stages}>
        {stages.map((stage) => {
          const total = stageTotal(stage, buckets);
          const balanced = Math.abs(total - 100) <= 0.05;
          const isBase = stage.id === baseStage.id;
          return (
            <li key={stage.id} className={styles.stage} data-suggested={suggested?.id === stage.id || undefined}>
              <div className={styles.stageHead}>
                {isBase ? (
                  <strong>평상시</strong>
                ) : (
                  <label className={styles.threshold}>
                    고점 대비 −
                    <NumberInput
                      min="0.1" max="90" step="0.1"
                      value={stage.threshold}
                      aria-label="단계 시작 하락률"
                      onValueChange={(value) => editStage(stage.id, { threshold: Number(value) })}
                    />
                    %부터
                  </label>
                )}
                <div className={styles.mix} aria-hidden="true">
                  {buckets.map((bucket) => (
                    <i key={bucket.id} style={{ width: `${Math.min(stageTarget(stage, bucket.id), 100)}%`, background: bucket.color }} />
                  ))}
                </div>
                <span className={balanced ? base.ok : base.warning}>합계 {total}%</span>
              </div>
              <div className={styles.targets}>
                {buckets.map((bucket) => {
                  const diff = stageTarget(stage, bucket.id) - stageTarget(baseStage, bucket.id);
                  return (
                    <label key={bucket.id}>
                      <span><i style={{ background: bucket.color }} />{bucket.name}</span>
                      <span className={styles.unitInput}>
                        <NumberInput
                          min="0" max="100" step="0.1"
                          value={stageTarget(stage, bucket.id)}
                          aria-label={`${isBase ? "평상시" : stageLabel(stage)} ${bucket.name} 목표`}
                          onValueChange={(value) => editStage(stage.id, { targets: { ...stage.targets, [bucket.id]: Number(value) } })}
                        />
                        %
                      </span>
                      {!isBase && <small data-sign={diff > 0 ? "up" : diff < 0 ? "down" : undefined}>{signedPoints(diff)}</small>}
                    </label>
                  );
                })}
              </div>
              <div className={styles.stageActions}>
                <select
                  value=""
                  aria-label={`${isBase ? "평상시" : stageLabel(stage)} 단계에 다른 단계 비중 불러오기`}
                  onChange={(event) => copyInto(stage.id, event.target.value)}
                >
                  <option value="">다른 단계 비중 불러오기</option>
                  {stages.filter((other) => other.id !== stage.id).map((other) => (
                    <option key={other.id} value={other.id}>{stageLabel(other)}</option>
                  ))}
                </select>
                <button type="button" className={base.ghost} disabled={!balanced || stageMatchesBuckets(stage, buckets)} onClick={() => apply(stage)}>
                  {stageMatchesBuckets(stage, buckets) ? "현재 목표와 같음" : "목표로 적용"}
                </button>
                {!isBase && (
                  <button type="button" className={`${base.iconButton} ${styles.remove}`} aria-label={`${stageLabel(stage)} 단계 삭제`} onClick={() => removeStage(stage.id)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className={base.ghost} disabled={stages.length >= MAX_DRAWDOWN_STAGES} onClick={addStage}>
        <Plus size={16} /> 단계 추가
      </button>
      <p className={base.help}>
        지수는 하루 한 번 미국장 종가 기준으로 계산합니다. 목표 비중은 단계의 목표로 적용 버튼을 누른 뒤 저장해야 바뀝니다.
      </p>
    </section>
  );
}

/** Rebalance-screen reminder shown only when the plan suggests targets that differ from the current ones. */
export function DrawdownNotice({ portfolio, drawdown, onReview }: { portfolio: Portfolio; drawdown: IndexDrawdownState; onReview: () => void }) {
  const plan = portfolio.drawdownPlan;
  if (!plan?.enabled || !drawdown.data) return null;
  const suggested = recommendedStage(plan, drawdown.data.drawdownPercent);
  if (!suggested || stageMatchesBuckets(suggested, portfolio.buckets)) return null;
  return (
    <p className={styles.notice}>
      <span>
        {indexLabel(plan.index)} 지수가 고점보다 {drawdown.data.drawdownPercent}% 낮습니다. {suggested.threshold === 0 ? "평상시" : `−${suggested.threshold}%`} 단계 목표로 바꿀지 확인해 주세요.
      </span>
      <button type="button" onClick={onReview}>단계 확인</button>
    </p>
  );
}
