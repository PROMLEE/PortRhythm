import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/quote-refresh.ts", import.meta.url), "utf8");
const { dailyStockQuotesFrom, dailyCryptoQuotesFrom, quoteRefreshNotice, quoteRefreshDue } =
  new Function(
    "exports",
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText + ";return exports;",
  )({});

const quotes = [
  { market: "KR", symbol: "005930", exchange: "KRX", price: 70000, previousClose: 69000, checkedAt: "2026-11-17T01:00:00Z" },
  { market: "US", symbol: "VOO", price: null, error: "VOO 시세를 저장하지 못했습니다." },
  { marketCode: "KRW-BTC", price: 100, previousClose: 90, checkedAt: "2026-11-17T01:00:00Z" },
  { price: null, error: "빗썸 원화 시세를 가져오지 못했습니다." },
];

test("stock and crypto daily baselines are separated and missing fields become null", () => {
  assert.deepEqual(dailyStockQuotesFrom(quotes), [
    { market: "KR", symbol: "005930", exchange: "KRX", previousClose: 69000, checkedAt: "2026-11-17T01:00:00Z" },
    { market: "US", symbol: "VOO", exchange: null, previousClose: null, checkedAt: null },
  ]);
  assert.deepEqual(dailyCryptoQuotesFrom(quotes), {
    "KRW-BTC": { previousClose: 90, checkedAt: "2026-11-17T01:00:00Z" },
  });
});

test("the refresh notice counts priced assets and reports the first error", () => {
  assert.deepEqual(quoteRefreshNotice(quotes), {
    firstError: "VOO 시세를 저장하지 못했습니다.",
    notice: "2개 자산의 시세를 갱신했습니다. 2개는 조회되지 않았습니다. VOO 시세를 저장하지 못했습니다.",
  });
  assert.deepEqual(quoteRefreshNotice([quotes[0]]), {
    firstError: undefined,
    notice: "1개 자산의 시세를 갱신했습니다.",
  });
});

test("refresh waits one minute without daily baselines and five minutes with them", () => {
  const minute = 60_000, now = 10 * minute;
  assert.equal(quoteRefreshDue(now, now - minute + 1, 0, false), false);
  assert.equal(quoteRefreshDue(now, now - minute, 0, false), true);
  assert.equal(quoteRefreshDue(now, now - 5 * minute + 1, 0, true), false);
  assert.equal(quoteRefreshDue(now, now - 5 * minute, 0, true), true);
});

test("another tab's attempt delays refresh only when daily baselines exist", () => {
  const minute = 60_000, now = 10 * minute;
  assert.equal(quoteRefreshDue(now, 0, now - minute, true), false);
  assert.equal(quoteRefreshDue(now, 0, now - minute, false), true);
});
