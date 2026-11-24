"use client";

import { Plus, Trash2 } from "lucide-react";
import NumberInput from "./NumberInput";
import { IndexRangeRow, indexCloseDay } from "./IndexOverview";
import {
  DRAWDOWN_INDEXES,
  MAX_DRAWDOWN_STAGES,
  applyDrawdownStage,
  appliedDeeperStage,
  createDrawdownPlan,
  drawdownTargetsLeftOver,
  indexLabel,
  recommendedStage,
  restoreBaseTargets,
  setDrawdownEnabled,
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
          코스피, S&amp;P 500, 나스닥이 52주 고점에서 얼마나 내려왔는지에 따라 쓸 목표 비중을 미리 정해 둡니다.
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
  const current = drawdown.data?.drawdownPercent ?? null;
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
  function toggle(enabled: boolean) {
    const result = setDrawdownEnabled(portfolio, enabled);
    onChange(result.portfolio);
    if (result.restored)
      onNotice("하락 단계를 끄면서 목표 비중을 평상시 단계 값으로 되돌렸습니다. 변경 내용을 저장하면 적용됩니다.");
  }
  function restoreBase() {
    onChange(restoreBaseTargets(portfolio));
    onNotice("목표 비중을 평상시 단계 값으로 되돌렸습니다. 변경 내용을 저장하면 적용됩니다.");
  }
  const leftOver = drawdownTargetsLeftOver(portfolio) ? appliedDeeperStage(plan) : null;
  const baseBalanced = Math.abs(stageTotal(baseStage, buckets) - 100) <= 0.05;

  return (
    <section className={`${base.panel} ${styles.panel}`} aria-labelledby="drawdown-title">
      <div className={base.panelHead}>
        <h2 id="drawdown-title">지수 하락 단계</h2>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={plan.enabled}
            onChange={(event) => toggle(event.target.checked)}
          />
          사용
        </label>
      </div>

      {leftOver && (
        <div className={styles.suggestion} data-pending>
          <p>
            하락 단계를 껐지만 목표 비중은 아직 <strong>{stageLabel(leftOver)}</strong> 단계 값입니다.
            리밸런싱도 이 목표를 기준으로 계산됩니다.
          </p>
          <button type="button" className={styles.apply} disabled={!baseBalanced} onClick={restoreBase}>
            평상시 목표로 되돌리기
          </button>
        </div>
      )}

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

      <div className={styles.status} aria-live="polite">
        {drawdown.loading && <span>{indexLabel(plan.index)} 시세를 불러오는 중입니다.</span>}
        {drawdown.error && <span className={base.warning}>{drawdown.error}</span>}
        {drawdown.data && (
          <>
            <IndexRangeRow row={drawdown.data} stages={plan.stages} />
            <small>
              {indexCloseDay(drawdown.data.closeDate)} 종가 기준입니다. 막대는 최근 52주 저점부터 고점까지이고, 세로선은 하락 단계가 시작되는 지점입니다.
            </small>
          </>
        )}
      </div>

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
              {suggested?.id === stage.id && <span className={styles.current}>지금 지수가 이 단계에 있습니다</span>}
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
        지수는 각 시장의 최근 종가로 계산합니다. 목표 비중은 단계의 목표로 적용 버튼을 누른 뒤 저장해야 바뀝니다.
      </p>
    </section>
  );
}

/** Rebalance-screen reminder shown only when the plan suggests targets that differ from the current ones. */
export function DrawdownNotice({ portfolio, drawdown, onReview }: { portfolio: Portfolio; drawdown: IndexDrawdownState; onReview: () => void }) {
  const plan = portfolio.drawdownPlan;
  const leftOver = drawdownTargetsLeftOver(portfolio) ? appliedDeeperStage(plan) : null;
  if (leftOver)
    return (
      <p className={styles.notice}>
        <span>하락 단계를 껐지만 목표 비중이 아직 {stageLabel(leftOver)} 단계 값입니다. 평상시 목표로 되돌릴 수 있습니다.</span>
        <button type="button" onClick={onReview}>단계 확인</button>
      </p>
    );
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
