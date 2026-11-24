import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/kis-pacing.ts", import.meta.url), "utf8");
const pacing = new Function(
  "exports",
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText + ";return exports;",
)({});

test("real accounts pace well under the 18 calls per second limit", () => {
  const interval = pacing.kisQuoteIntervalMs("https://openapi.koreainvestment.com:9443");
  assert.equal(interval, 150);
  assert.ok(1000 / interval <= 9, "leaves room for a second instance on the same key");
});

test("paper accounts stay under one call per second", () => {
  assert.ok(pacing.kisQuoteIntervalMs("https://openapivts.koreainvestment.com:29443") > 1000);
});

test("requests start at least one interval apart, in call order", async () => {
  let clock = 0;
  const starts = [];
  const pace = pacing.createRequestPacer(
    150,
    () => clock,
    async (ms) => {
      clock += ms;
    },
  );
  await Promise.all(
    ["a", "b", "c", "d"].map(async (name) => {
      await pace();
      starts.push([name, clock]);
    }),
  );
  assert.deepEqual(starts, [
    ["a", 0],
    ["b", 150],
    ["c", 300],
    ["d", 450],
  ]);
});

test("eighteen quotes now wait about 2.6 seconds instead of 10.2", async () => {
  let clock = 0;
  const pace = pacing.createRequestPacer(
    pacing.kisQuoteIntervalMs("https://openapi.koreainvestment.com:9443"),
    () => clock,
    async (ms) => {
      clock += ms;
    },
  );
  for (let i = 0; i < 18; i++) await pace();
  assert.equal(clock, 17 * 150);
});

test("no wait when the previous request was long enough ago", async () => {
  let clock = 0;
  let slept = 0;
  const pace = pacing.createRequestPacer(
    150,
    () => clock,
    async (ms) => {
      slept += ms;
      clock += ms;
    },
  );
  await pace();
  clock += 500;
  await pace();
  assert.equal(slept, 0);
});
