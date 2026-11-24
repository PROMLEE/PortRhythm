import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/notice-title.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { noticeTitleParts } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("splits a notice title on spaced middle dots", () => {
  assert.deepEqual(
    noticeTitleParts("2026.11.24 업데이트 · 하락 단계 해제와 저장·시세 속도 개선"),
    ["2026.11.24 업데이트", "하락 단계 해제와 저장\u2060·\u2060시세 속도 개선"],
  );
});

test("keeps a title without separators as one part", () => {
  assert.deepEqual(noticeTitleParts("서비스 점검 안내"), ["서비스 점검 안내"]);
});

const { noticeBannerTitle } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("banner title drops a leading date part", () => {
  assert.equal(
    noticeBannerTitle("2026.11.24 업데이트 · 하락 단계 해제와 저장·시세 속도 개선"),
    "하락 단계 해제와 저장·시세 속도 개선",
  );
});

test("banner title keeps titles that do not start with a date", () => {
  assert.equal(noticeBannerTitle("서비스 점검 · 11/30 02시"), "서비스 점검 · 11/30 02시");
  assert.equal(noticeBannerTitle("2026.11.24 업데이트"), "2026.11.24 업데이트");
});
