import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(
  await readFile(new URL("../app/portfolio-model.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { targetTotalStatus, missingPriceAssetNames, missingPriceMessage } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const buckets = (...values) => values.map((targetPercent) => ({ targetPercent }));

test("0.1% steps that add to 100 count as balanced despite float drift", () => {
  const raw = [66.2, 29.8, 2, 1.1, 0.1, 0.8].reduce((sum, value) => sum + value, 0);
  assert.notEqual(raw, 100); // 99.99999999999999 — the case that used to show a false warning
  const status = targetTotalStatus(buckets(66.2, 29.8, 2, 1.1, 0.1, 0.8));
  assert.equal(status.balanced, true);
  assert.equal(status.total, 100);
  assert.equal(status.remaining, 0);
  assert.equal(status.message, "목표 합계 100.0% · 저장할 수 있습니다.");
});

test("under 100 shows how many points remain", () => {
  const status = targetTotalStatus(buckets(60, 30));
  assert.equal(status.balanced, false);
  assert.equal(status.remaining, 10);
  assert.equal(status.message, "목표 합계 90.0% · 10.0%p가 남았습니다. 100%로 맞춰야 저장할 수 있습니다.");
});

test("over 100 shows the excess", () => {
  const status = targetTotalStatus(buckets(70, 35.5));
  assert.equal(status.balanced, false);
  assert.ok(status.remaining < 0);
  assert.equal(status.message, "목표 합계 105.5% · 5.5%p 초과했습니다. 100%로 맞춰야 저장할 수 있습니다.");
});

test("small gaps keep two decimals so 100.0% never shows with a warning", () => {
  const status = targetTotalStatus(buckets(50, 50.05));
  assert.equal(status.balanced, false);
  assert.equal(status.label, "목표 합계 100.05%");
  assert.match(status.message, /0\.05%p 초과/);
});

test("no buckets is an unbalanced 0% total", () => {
  const status = targetTotalStatus([]);
  assert.equal(status.balanced, false);
  assert.equal(status.remaining, 100);
});

const holding = (name, symbol, currentPrice, capturedPrice = null) => ({ name, symbol, currentPrice, capturedPrice });
const crypto = (name, marketCode, quotedPriceKrw) => ({ name, marketCode, quotedPriceKrw });

test("missing price names cover stocks and crypto with no price", () => {
  const names = missingPriceAssetNames(
    { cryptoAssets: [crypto("비트코인", "KRW-BTC", null), crypto("이더리움", "KRW-ETH", 4_000_000)] },
    [holding("삼성전자", "005930", null), holding("Apple", "AAPL", 200), holding("", "QQQM", null, null), holding("SK하이닉스", "000660", null, 180_000)],
  );
  assert.deepEqual(names, ["삼성전자", "QQQM", "비트코인"]);
});

test("the same asset held in two accounts is named once", () => {
  const names = missingPriceAssetNames({ cryptoAssets: [] }, [
    holding("삼성전자", "005930", null),
    holding("삼성전자", "005930", null),
  ]);
  assert.deepEqual(names, ["삼성전자"]);
});

test("missing price message names up to three assets", () => {
  assert.equal(missingPriceMessage([]), "");
  assert.match(missingPriceMessage(["A", "B"]), /^A, B의 가격을 확인하지 못해/);
  assert.match(missingPriceMessage(["A", "B", "C", "D", "E"]), /^A, B, C 외 2개의 가격을/);
});
