import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/api-error.ts", import.meta.url), "utf8");
const { publicErrorMessage } = new Function(
  "exports",
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText + ";return exports;",
)({});
const fallback = "요청을 처리하지 못했습니다";

test("user-facing Korean messages are returned unchanged", () => {
  assert.equal(
    publicErrorMessage(new Error("종목은 한 번에 50개까지 조회할 수 있습니다."), fallback),
    "종목은 한 번에 50개까지 조회할 수 있습니다.",
  );
});

test("configuration, runtime and database errors use the fallback", () => {
  assert.equal(publicErrorMessage(new Error("DATABASE_URL is not configured"), fallback), fallback);
  assert.equal(publicErrorMessage(new TypeError("fetch failed"), fallback), fallback);
  assert.equal(
    publicErrorMessage(Object.assign(new Error("관계 \"portfolio.plans\" 없음"), { code: "42P01" }), fallback),
    fallback,
  );
  assert.equal(publicErrorMessage(new Error("가".repeat(201)), fallback), fallback);
  assert.equal(publicErrorMessage("문자열 오류", fallback), fallback);
  assert.equal(publicErrorMessage(null, fallback), fallback);
});
