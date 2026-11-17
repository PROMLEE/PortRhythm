import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(
  await readFile(new URL("../app/unsaved-changes.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { BUILDER_VIEWS, isBuilderView, navigationNeedsConfirm, shouldConfirmNavigation } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const confirm = (from, to, draftDirty, otherDirty = false) =>
  navigationNeedsConfirm({ from, to, draftDirty, otherDirty });

test("moves between builder views with only the draft dirty need no confirmation", () => {
  assert.equal(confirm("portfolio", "strategy", true), false);
  assert.equal(confirm("strategy", "portfolio", true), false);
  assert.equal(confirm("composition", "detail", true), false);
  assert.equal(confirm("detail", "composition", true), false);
});

test("leaving the builder for another page with a dirty draft needs confirmation", () => {
  assert.equal(confirm("strategy", "holdings", true), true);
  assert.equal(confirm("portfolio", "import", true), true);
});

test("entering the builder from outside is confirmed only when other input is dirty", () => {
  assert.equal(confirm("import", "portfolio", false, true), true);
  assert.equal(confirm("import", "portfolio", false, false), false);
});

test("a form dirty on the target screen is confirmed even without a draft", () => {
  assert.equal(confirm("composition", "strategy", false, true), true);
});

test("navigating to the same view never needs confirmation", () => {
  assert.equal(confirm("strategy", "strategy", true, true), false);
  assert.equal(confirm("strategy", "strategy", false, false), false);
});

test("no dirty state never needs confirmation", () => {
  assert.equal(confirm("strategy", "holdings", false, false), false);
  assert.equal(confirm("portfolio", "edit", false, false), false);
});

test("the edit screen is not a builder view, so a dirty draft is confirmed", () => {
  assert.equal(confirm("portfolio", "edit", true), true);
});

test("unknown view strings are not builder views", () => {
  assert.equal(isBuilderView("unknown"), false);
  assert.equal(confirm("unknown", "portfolio", true), true);
});

test("BUILDER_VIEWS lists exactly the eight shared builder views", () => {
  assert.deepEqual(
    [...BUILDER_VIEWS].sort(),
    [
      "portfolio", "strategy", "preferences", "composition",
      "allocation", "rebalance", "history", "detail",
    ].sort(),
  );
  assert.equal(BUILDER_VIEWS.length, 8);
});

test("skipConfirm turns off the confirmation for the save-then-navigate case", () => {
  assert.equal(
    shouldConfirmNavigation({ from: "import", to: "holdings", draftDirty: false, otherDirty: true, skipConfirm: true }),
    false,
  );
});

test("without skipConfirm the same import-to-holdings move still asks for confirmation", () => {
  assert.equal(
    shouldConfirmNavigation({ from: "import", to: "holdings", draftDirty: false, otherDirty: true }),
    true,
  );
});

test("skipConfirm false still confirms when a dirty draft leaves the builder", () => {
  assert.equal(
    shouldConfirmNavigation({ from: "strategy", to: "holdings", draftDirty: true, otherDirty: false, skipConfirm: false }),
    true,
  );
});
