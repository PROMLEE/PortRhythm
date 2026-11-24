import type { Bucket } from "./portfolio-model";

export type DrawdownIndex = "KOSPI" | "SPX" | "COMP" | "NDX";
export const DRAWDOWN_INDEXES: { id: DrawdownIndex; label: string }[] = [
  { id: "KOSPI", label: "코스피" },
  { id: "SPX", label: "S&P 500" },
  { id: "COMP", label: "나스닥 종합" },
  { id: "NDX", label: "나스닥 100" },
];
export const MAX_DRAWDOWN_STAGES = 6;

/** threshold is the drawdown (in %) from the 52-week high at which the stage begins; 0 is the base stage. */
export type DrawdownStage = {
  id: string;
  threshold: number;
  targets: Record<string, number>;
};

export type DrawdownPlan = {
  enabled: boolean;
  index: DrawdownIndex;
  recoveryBuffer: number;
  stages: DrawdownStage[];
  appliedStageId: string | null;
  appliedAt: string | null;
};

export type IndexClose = { date: string; close: number };
export type IndexDrawdown = {
  index: DrawdownIndex;
  high: number;
  highDate: string;
  close: number;
  closeDate: string;
  drawdownPercent: number;
  low: number;
  lowDate: string;
  risePercent: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

export function indexLabel(index: DrawdownIndex) {
  return DRAWDOWN_INDEXES.find((row) => row.id === index)?.label ?? index;
}

export function stageLabel(stage: Pick<DrawdownStage, "threshold">) {
  return stage.threshold === 0 ? "평상시" : `고점 대비 −${stage.threshold}%`;
}

export function sortStages(stages: DrawdownStage[]) {
  return [...stages].sort((a, b) => a.threshold - b.threshold);
}

export function targetsFromBuckets(buckets: Pick<Bucket, "id" | "targetPercent">[]) {
  return Object.fromEntries(buckets.map((bucket) => [bucket.id, bucket.targetPercent]));
}

export function createDrawdownPlan(
  buckets: Pick<Bucket, "id" | "targetPercent">[],
  id: () => string,
): DrawdownPlan {
  return {
    enabled: true,
    index: "SPX",
    recoveryBuffer: 3,
    stages: [{ id: id(), threshold: 0, targets: targetsFromBuckets(buckets) }],
    appliedStageId: null,
    appliedAt: null,
  };
}

export function stageTarget(stage: DrawdownStage, bucketId: string) {
  return stage.targets[bucketId] ?? 0;
}

export function stageTotal(stage: DrawdownStage, buckets: Pick<Bucket, "id">[]) {
  return round(buckets.reduce((sum, bucket) => sum + stageTarget(stage, bucket.id), 0));
}

/** Uses closing prices from the last 52 weeks ending at the latest close (high and low included). */
export function fiftyTwoWeekDrawdown(
  index: DrawdownIndex,
  rows: IndexClose[],
): IndexDrawdown | null {
  const valid = rows
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = valid.at(-1);
  if (!latest) return null;
  const start = new Date(`${latest.date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 364);
  const from = start.toISOString().slice(0, 10);
  let peak = latest;
  let trough = latest;
  for (const row of valid) {
    if (row.date < from) continue;
    if (row.close > peak.close) peak = row;
    if (row.close < trough.close) trough = row;
  }
  return {
    index,
    high: peak.close,
    highDate: peak.date,
    close: latest.close,
    closeDate: latest.date,
    drawdownPercent: round(Math.max(0, (1 - latest.close / peak.close) * 100)),
    low: trough.close,
    lowDate: trough.date,
    risePercent: round(Math.max(0, (latest.close / trough.close - 1) * 100)),
  };
}

/**
 * The stage the plan suggests for a drawdown. Moving deeper happens as soon as a
 * threshold is crossed; moving back toward the base stage waits until the index
 * has recovered `recoveryBuffer` points past the applied stage's threshold, so a
 * drawdown hovering around a threshold does not flip the suggestion daily.
 */
export function recommendedStage(plan: DrawdownPlan, drawdownPercent: number): DrawdownStage | null {
  const stages = sortStages(plan.stages);
  if (!stages.length) return null;
  const deeper = stages.filter((stage) => stage.threshold <= drawdownPercent).at(-1) ?? stages[0];
  const applied = stages.find((stage) => stage.id === plan.appliedStageId);
  if (!applied || deeper.threshold >= applied.threshold) return deeper;
  return (
    stages
      .filter((stage) => stage.threshold <= applied.threshold && stage.threshold - plan.recoveryBuffer <= drawdownPercent)
      .at(-1) ?? stages[0]
  );
}

export function stageMatchesBuckets(stage: DrawdownStage, buckets: Pick<Bucket, "id" | "targetPercent">[]) {
  return buckets.every((bucket) => Math.abs(stageTarget(stage, bucket.id) - bucket.targetPercent) < 0.005);
}

export function applyDrawdownStage<T extends { buckets: Bucket[]; drawdownPlan?: DrawdownPlan | null }>(
  portfolio: T,
  stageId: string,
  now: Date,
): T {
  const plan = portfolio.drawdownPlan;
  const stage = plan?.stages.find((row) => row.id === stageId);
  if (!plan || !stage) return portfolio;
  return {
    ...portfolio,
    buckets: portfolio.buckets.map((bucket) => ({ ...bucket, targetPercent: stageTarget(stage, bucket.id) })),
    drawdownPlan: { ...plan, appliedStageId: stage.id, appliedAt: now.toISOString() },
  };
}

/**
 * The non-base stage whose targets were last copied into the buckets, or null when the
 * buckets are on the base stage (or were never changed by the plan).
 */
export function appliedDeeperStage(plan: DrawdownPlan | null | undefined): DrawdownStage | null {
  if (!plan?.appliedStageId) return null;
  const stages = sortStages(plan.stages);
  const applied = stages.find((stage) => stage.id === plan.appliedStageId);
  return applied && applied.id !== stages[0]?.id ? applied : null;
}

/**
 * True when the plan is turned off but the buckets still hold a deeper stage's targets,
 * so rebalancing would keep following the drawdown stage.
 */
export function drawdownTargetsLeftOver(portfolio: { buckets: Bucket[]; drawdownPlan?: DrawdownPlan | null }) {
  const plan = portfolio.drawdownPlan;
  if (!plan || plan.enabled) return false;
  const applied = appliedDeeperStage(plan);
  const baseStage = sortStages(plan.stages)[0];
  return Boolean(applied && baseStage && !stageMatchesBuckets(baseStage, portfolio.buckets));
}

/**
 * Puts the base stage's targets back into the buckets and clears the applied stage.
 * The base stage must add up to 100%, otherwise the portfolio is returned unchanged.
 */
export function restoreBaseTargets<T extends { buckets: Bucket[]; drawdownPlan?: DrawdownPlan | null }>(portfolio: T): T {
  const plan = portfolio.drawdownPlan;
  const baseStage = plan ? sortStages(plan.stages)[0] : undefined;
  if (!plan || !baseStage || Math.abs(stageTotal(baseStage, portfolio.buckets) - 100) > 0.05) return portfolio;
  return {
    ...portfolio,
    buckets: portfolio.buckets.map((bucket) => ({ ...bucket, targetPercent: stageTarget(baseStage, bucket.id) })),
    drawdownPlan: { ...plan, appliedStageId: null, appliedAt: null },
  };
}

/**
 * Turns the plan on or off. Turning it off while a deeper stage is applied restores the
 * base stage's targets, because rebalancing reads the bucket targets directly and would
 * otherwise keep using the drawdown stage after the plan is off.
 */
export function setDrawdownEnabled<T extends { buckets: Bucket[]; drawdownPlan?: DrawdownPlan | null }>(
  portfolio: T,
  enabled: boolean,
): { portfolio: T; restored: boolean } {
  const plan = portfolio.drawdownPlan;
  if (!plan) return { portfolio, restored: false };
  const toggled = { ...portfolio, drawdownPlan: { ...plan, enabled } };
  if (enabled || !drawdownTargetsLeftOver(toggled)) return { portfolio: toggled, restored: false };
  const restored = restoreBaseTargets(toggled);
  return { portfolio: restored, restored: restored !== toggled };
}

/** Drops targets of buckets that no longer exist so stale ids are never saved. */
export function pruneDrawdownPlan(plan: DrawdownPlan, buckets: Pick<Bucket, "id">[]): DrawdownPlan {
  const ids = new Set(buckets.map((bucket) => bucket.id));
  return {
    ...plan,
    stages: plan.stages.map((stage) => ({
      ...stage,
      targets: Object.fromEntries(Object.entries(stage.targets).filter(([id]) => ids.has(id))),
    })),
  };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Validates untrusted input. Returns the cleaned plan or a user-facing message. */
export function parseDrawdownPlan(
  raw: unknown,
  buckets: Pick<Bucket, "id">[],
): { plan: DrawdownPlan | null } | { error: string } {
  if (raw === null || raw === undefined) return { plan: null };
  if (typeof raw !== "object") return { error: "지수 하락 단계 설정을 확인해 주세요." };
  const input = raw as Partial<DrawdownPlan>;
  if (typeof input.enabled !== "boolean" || !DRAWDOWN_INDEXES.some((row) => row.id === input.index))
    return { error: "지수 하락 단계 설정을 확인해 주세요." };
  if (!finite(input.recoveryBuffer) || input.recoveryBuffer < 0 || input.recoveryBuffer > 20)
    return { error: "회복 여유는 0~20%p 사이로 입력해 주세요." };
  if (!Array.isArray(input.stages) || input.stages.length < 1 || input.stages.length > MAX_DRAWDOWN_STAGES)
    return { error: `하락 단계는 1~${MAX_DRAWDOWN_STAGES}개까지 만들 수 있습니다.` };
  const ids = new Set(buckets.map((bucket) => bucket.id));
  const stages: DrawdownStage[] = [];
  for (const stage of input.stages as unknown[]) {
    const row = stage as Partial<DrawdownStage>;
    if (!row || typeof row.id !== "string" || !row.id || row.id.length > 64 || !finite(row.threshold) || !row.targets || typeof row.targets !== "object")
      return { error: "지수 하락 단계 설정을 확인해 주세요." };
    if (row.threshold < 0 || row.threshold > 90 || Math.round(row.threshold * 10) !== row.threshold * 10)
      return { error: "하락률은 0~90% 사이, 소수점 한 자리까지 입력해 주세요." };
    const targets: Record<string, number> = {};
    for (const [id, value] of Object.entries(row.targets)) {
      if (!ids.has(id)) continue;
      if (!finite(value) || value < 0 || value > 100) return { error: "단계별 목표 비중은 0~100% 사이로 입력해 주세요." };
      targets[id] = value;
    }
    stages.push({ id: row.id, threshold: row.threshold, targets });
  }
  const sorted = sortStages(stages);
  if (sorted[0].threshold !== 0) return { error: "평상시(하락률 0%) 단계가 필요합니다." };
  if (new Set(sorted.map((stage) => stage.threshold)).size !== sorted.length)
    return { error: "같은 하락률의 단계가 두 개 있습니다. 하락률을 다르게 입력해 주세요." };
  if (new Set(sorted.map((stage) => stage.id)).size !== sorted.length)
    return { error: "지수 하락 단계 설정을 확인해 주세요." };
  if (input.enabled) {
    const invalid = sorted.find((stage) => Math.abs(stageTotal(stage, buckets) - 100) > 0.05);
    if (invalid) return { error: `${stageLabel(invalid)} 단계의 목표 합계를 100%로 맞춰 주세요.` };
  }
  const appliedStageId =
    typeof input.appliedStageId === "string" && sorted.some((stage) => stage.id === input.appliedStageId)
      ? input.appliedStageId
      : null;
  const appliedAt =
    appliedStageId && typeof input.appliedAt === "string" && !Number.isNaN(Date.parse(input.appliedAt))
      ? new Date(input.appliedAt).toISOString()
      : null;
  return {
    plan: {
      enabled: input.enabled,
      index: input.index as DrawdownIndex,
      recoveryBuffer: input.recoveryBuffer,
      stages: sorted,
      appliedStageId,
      appliedAt,
    },
  };
}
