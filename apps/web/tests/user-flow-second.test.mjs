import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(
  await readFile(new URL("../app/portfolio-model.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const {
  holdingStartBuckets,
  allocationOptionLabel,
  evaluationAssetCount,
  savedNoticeTarget,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("start buckets follow the markets that hold stocks with equal shares", () => {
  assert.deepEqual(
    holdingStartBuckets([{ market: "KR" }, { market: "US" }, { market: "KR" }]),
    [
      { market: "KR", name: "국내 주식", targetPercent: 50 },
      { market: "US", name: "미국 주식", targetPercent: 50 },
    ],
  );
});

test("a single market gets one full bucket and no holdings get none", () => {
  assert.deepEqual(holdingStartBuckets([{ market: "US" }]), [
    { market: "US", name: "미국 주식", targetPercent: 100 },
  ]);
  assert.deepEqual(holdingStartBuckets([]), []);
});

test("assignment option labels show the auto target and drop the direct prefix", () => {
  assert.equal(allocationOptionLabel("auto", "국내 주식"), "자동 배정 · 국내 주식");
  assert.equal(allocationOptionLabel("auto", null), "자동 배정 · 미분류");
  assert.equal(allocationOptionLabel("auto", undefined), "자동 배정 · 미분류");
  assert.equal(allocationOptionLabel("unassigned"), "미분류");
  assert.equal(allocationOptionLabel("bucket", "미국 주식"), "미국 주식");
});

test("evaluation assets count holdings without a portfolio and every asset with one", () => {
  assert.equal(evaluationAssetCount(null, 0), 0);
  assert.equal(evaluationAssetCount(null, 2), 2);
  assert.equal(
    evaluationAssetCount({ cryptoAssets: [{}], manualAssets: [{}, {}] }, 0),
    3,
  );
});

test("the first save with no holdings points to the capture import", () => {
  assert.equal(
    savedNoticeTarget({ firstSave: true, holdingCount: 0, unassigned: 0, screen: "strategy" }),
    "import",
  );
  assert.equal(
    savedNoticeTarget({ firstSave: true, holdingCount: 2, unassigned: 1, screen: "strategy" }),
    "allocation",
  );
});

test("later saves keep the allocation shortcut only when assets are unassigned", () => {
  assert.equal(
    savedNoticeTarget({ firstSave: false, holdingCount: 0, unassigned: 0, screen: "strategy" }),
    null,
  );
  assert.equal(
    savedNoticeTarget({ firstSave: false, holdingCount: 3, unassigned: 2, screen: "strategy" }),
    "allocation",
  );
  assert.equal(
    savedNoticeTarget({ firstSave: false, holdingCount: 3, unassigned: 2, screen: "allocation" }),
    null,
  );
});
