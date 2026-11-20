import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function load(path) {
  const source = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}
const {
  applyDrawdownStage, createDrawdownPlan, fiftyTwoWeekDrawdown, parseDrawdownPlan,
  pruneDrawdownPlan, recommendedStage, stageMatchesBuckets, stageTotal,
} = await load("../app/drawdown.ts");
const { parseIndexRows, previousDay } = await load("../lib/index-history.ts");

const buckets = [
  { id: "stock", name: "주식", targetPercent: 60, color: "#111" },
  { id: "bond", name: "채권", targetPercent: 40, color: "#222" },
];
const plan = (overrides = {}) => ({
  enabled: true,
  index: "SPX",
  recoveryBuffer: 3,
  appliedStageId: null,
  appliedAt: null,
  stages: [
    { id: "s0", threshold: 0, targets: { stock: 60, bond: 40 } },
    { id: "s10", threshold: 10, targets: { stock: 70, bond: 30 } },
    { id: "s20", threshold: 20, targets: { stock: 80, bond: 20 } },
  ],
  ...overrides,
});

test("52-week drawdown uses the highest close within 364 days of the latest close", () => {
  const rows = [
    { date: "2025-11-01", close: 9000 }, // older than 52 weeks, ignored
    { date: "2026-02-10", close: 6000 },
    { date: "2026-11-19", close: 5400 },
  ];
  const result = fiftyTwoWeekDrawdown("SPX", rows);
  assert.equal(result.high, 6000);
  assert.equal(result.highDate, "2026-02-10");
  assert.equal(result.drawdownPercent, 10);
  assert.equal(result.closeDate, "2026-11-19");
  assert.equal(result.low, 5400);
  assert.equal(result.risePercent, 0);
});

test("52-week rise is measured from the lowest close in the window", () => {
  const result = fiftyTwoWeekDrawdown("NDX", [
    { date: "2025-11-01", close: 100 }, // outside the window
    { date: "2026-03-02", close: 8000 },
    { date: "2026-06-15", close: 10000 },
    { date: "2026-11-19", close: 9000 },
  ]);
  assert.equal(result.low, 8000);
  assert.equal(result.lowDate, "2026-03-02");
  assert.equal(result.risePercent, 12.5);
  assert.equal(result.drawdownPercent, 10);
});

test("52-week drawdown is zero at a new high and null without data", () => {
  assert.equal(fiftyTwoWeekDrawdown("SPX", [{ date: "2026-11-18", close: 5000 }, { date: "2026-11-19", close: 5100 }]).drawdownPercent, 0);
  assert.equal(fiftyTwoWeekDrawdown("SPX", [{ date: "bad", close: 1 }]), null);
});

test("recommendation moves deeper as soon as a threshold is crossed", () => {
  assert.equal(recommendedStage(plan(), 4).id, "s0");
  assert.equal(recommendedStage(plan(), 10).id, "s10");
  assert.equal(recommendedStage(plan(), 25).id, "s20");
  assert.equal(recommendedStage(plan({ appliedStageId: "s10" }), 21).id, "s20");
});

test("recommendation waits for the recovery buffer before moving back", () => {
  const applied = plan({ appliedStageId: "s20" });
  assert.equal(recommendedStage(applied, 18).id, "s20");
  assert.equal(recommendedStage(applied, 16.9).id, "s10");
  assert.equal(recommendedStage(applied, 8).id, "s10");
  assert.equal(recommendedStage(applied, 6.9).id, "s0");
});

test("applying a stage copies its targets and records it", () => {
  const next = applyDrawdownStage({ buckets, drawdownPlan: plan() }, "s10", new Date("2026-11-20T00:00:00Z"));
  assert.deepEqual(next.buckets.map((b) => b.targetPercent), [70, 30]);
  assert.equal(next.drawdownPlan.appliedStageId, "s10");
  assert.equal(next.drawdownPlan.appliedAt, "2026-11-20T00:00:00.000Z");
  assert.ok(stageMatchesBuckets(plan().stages[1], next.buckets));
});

test("new plans start from the current targets and new buckets count as zero", () => {
  const created = createDrawdownPlan(buckets, () => "id1");
  assert.deepEqual(created.stages, [{ id: "id1", threshold: 0, targets: { stock: 60, bond: 40 } }]);
  assert.equal(stageTotal(created.stages[0], [...buckets, { id: "cash" }]), 100);
});

test("pruning removes targets for deleted buckets", () => {
  const pruned = pruneDrawdownPlan(plan(), [{ id: "stock" }]);
  assert.deepEqual(pruned.stages[1].targets, { stock: 70 });
});

test("parsing accepts a valid plan, sorts stages and drops unknown buckets", () => {
  const input = plan({ stages: [...plan().stages].reverse(), appliedStageId: "s10", appliedAt: "2026-11-20T00:00:00Z" });
  input.stages[0] = { ...input.stages[0], targets: { ...input.stages[0].targets, ghost: 5 } };
  const result = parseDrawdownPlan(input, buckets);
  assert.deepEqual(result.plan.stages.map((s) => s.id), ["s0", "s10", "s20"]);
  assert.equal(result.plan.stages[2].targets.ghost, undefined);
  assert.equal(result.plan.appliedStageId, "s10");
  assert.deepEqual(parseDrawdownPlan(null, buckets), { plan: null });
});

test("parsing rejects invalid plans with specific messages", () => {
  const unbalanced = plan();
  unbalanced.stages[1] = { ...unbalanced.stages[1], targets: { stock: 70, bond: 20 } };
  assert.match(parseDrawdownPlan(unbalanced, buckets).error, /−10%.*100%/);
  assert.ok("plan" in parseDrawdownPlan({ ...unbalanced, enabled: false }, buckets), "disabled plans may be unbalanced");
  assert.match(parseDrawdownPlan(plan({ stages: plan().stages.slice(1) }), buckets).error, /평상시/);
  const duplicate = plan();
  duplicate.stages[2] = { ...duplicate.stages[2], threshold: 10 };
  assert.match(parseDrawdownPlan(duplicate, buckets).error, /같은 하락률/);
  assert.ok("error" in parseDrawdownPlan(plan({ index: "DJI" }), buckets));
  assert.ok("error" in parseDrawdownPlan(plan({ recoveryBuffer: 50 }), buckets));
  const bad = plan();
  bad.stages[1] = { ...bad.stages[1], threshold: 10.25 };
  assert.ok("error" in parseDrawdownPlan(bad, buckets));
  assert.equal(parseDrawdownPlan(plan({ appliedStageId: "missing" }), buckets).plan.appliedStageId, null);
});

test("KIS index rows parse into dated closes and skip malformed rows", () => {
  assert.deepEqual(
    parseIndexRows([
      { stck_bsop_date: "20261119", ovrs_nmix_prpr: "6012.34" },
      { stck_bsop_date: "", ovrs_nmix_prpr: "1" },
      { stck_bsop_date: "20261118", ovrs_nmix_prpr: "0" },
    ]),
    [{ date: "2026-11-19", close: 6012.34 }],
  );
  assert.deepEqual(parseIndexRows(undefined), []);
  assert.equal(previousDay("2026-03-01"), "2026-02-28");
});
