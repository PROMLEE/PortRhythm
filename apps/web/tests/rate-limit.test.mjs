import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/rate-limit.ts", import.meta.url), "utf8");
const { rateLimited } = new Function(
  "exports",
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText + ";return exports;",
)({});

test("requests over the limit are rejected until the window resets", () => {
  const start = 1_000_000;
  for (let i = 0; i < 3; i += 1) assert.equal(rateLimited("quotes:a", 3, 60_000, start + i), false);
  assert.equal(rateLimited("quotes:a", 3, 60_000, start + 10), true);
  assert.equal(rateLimited("quotes:a", 3, 60_000, start + 60_000), false);
});

test("users and endpoints are counted separately", () => {
  const start = 2_000_000;
  assert.equal(rateLimited("quotes:b", 1, 60_000, start), false);
  assert.equal(rateLimited("quotes:b", 1, 60_000, start), true);
  assert.equal(rateLimited("quotes:c", 1, 60_000, start), false);
  assert.equal(rateLimited("instruments:b", 1, 60_000, start), false);
});
