import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(
  await readFile(new URL("../app/portfolio-model.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { countUnassignedAssets } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const bucket = { id: "b1", name: "미국", targetPercent: 100, color: "#000" };
const rule = {
  id: "r1",
  bucketId: "b1",
  market: "US",
  symbol: "AAPL",
  exchange: "NAS",
  name: "Apple",
  manualPrice: null,
  quotedPrice: 200,
  quoteCheckedAt: null,
};
const portfolio = (overrides = {}) => ({
  title: "test",
  usdKrw: 1400,
  usdKrwUpdatedAt: null,
  usdKrwMode: "manual",
  usdKrwRateDate: null,
  tolerancePercent: 5,
  buckets: [bucket],
  rules: [rule],
  manualAssets: [],
  cryptoAssets: [],
  assignments: [],
  snapshots: [],
  cashFlows: [],
  ...overrides,
});
const holding = (id, market, symbol, currentPrice = 100) => ({
  id,
  broker: "b",
  account: "a",
  market,
  name: symbol,
  symbol,
  quantity: 1,
  capturedPrice: currentPrice,
  averageCost: null,
  capturedAt: "2026-10-09T00:00:00Z",
  currentPrice,
  quoteLabel: null,
  quoteCheckedAt: null,
});
const manual = (id, bucketId) => ({
  id,
  bucketId,
  name: id,
  valueKrw: 1000,
  valueUsd: null,
});
const crypto = (id, bucketId) => ({
  id,
  bucketId,
  marketCode: "BTC",
  name: id,
  quantity: 1,
  averageCostKrw: null,
  quotedPriceKrw: 100,
  quoteCheckedAt: null,
  lastTradeAt: null,
});

test("counts stocks, manual assets and crypto that have no valid bucket", () => {
  const holdings = [
    holding("h-aapl", "US", "AAPL"),
    holding("h-msft", "US", "MSFT"),
    holding("h-005930", "KR", "005930"),
    holding("h-tsla", "US", "TSLA"),
  ];
  const value = portfolio({
    assignments: [
      { holdingId: "h-005930", bucketId: "b1", source: "manual" },
      { holdingId: "h-tsla", bucketId: null, source: "manual" },
    ],
    manualAssets: [manual("m-null", null), manual("m-b1", "b1")],
    cryptoAssets: [crypto("c-gone", "gone")],
  });
  assert.equal(countUnassignedAssets(value, holdings), 4);
});

test("empty holdings and assets count as zero", () => {
  assert.equal(countUnassignedAssets(portfolio(), []), 0);
});

test("an unassigned stock counts even when it has no price", () => {
  const priceless = { ...holding("h-msft", "US", "MSFT"), currentPrice: null, capturedPrice: null };
  assert.equal(countUnassignedAssets(portfolio(), [priceless]), 1);
});

test("with no buckets every asset is unassigned", () => {
  const value = portfolio({
    buckets: [],
    rules: [],
    manualAssets: [manual("m1", "b1")],
    cryptoAssets: [crypto("c1", "b1")],
  });
  const holdings = [holding("h-aapl", "US", "AAPL"), holding("h-msft", "US", "MSFT")];
  assert.equal(countUnassignedAssets(value, holdings), 4);
});
