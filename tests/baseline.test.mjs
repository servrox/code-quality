import assert from "node:assert/strict";
import test from "node:test";

import { createBaseline, findRegressions, normalizeKnip, normalizeLint } from "../src/baseline.mjs";

/** @param {string} message - Input to validate or compare. @param {string} code - Input to validate or compare. @param {string} filename - Input to validate or compare. */
const diagnostic = (message, code = "eslint(max-lines)", filename = "apps/a.ts") => ({
  message,
  code,
  filename,
  severity: "error",
});
/** @param {...ReturnType<typeof diagnostic>} items - Input to validate or compare. */
const findings = (...items) => normalizeLint({ diagnostics: items, number_of_files: 1 });

void test("legacy file length may shrink but must not grow", () => {
  const baseline = createBaseline(findings(diagnostic("File has too many lines (450).")));
  assert.equal(
    findRegressions(findings(diagnostic("File has too many lines (400).")), baseline).length,
    0
  );
  assert.equal(
    findRegressions(findings(diagnostic("File has too many lines (451).")), baseline).length,
    1
  );
});

void test("new files and extra findings cannot borrow another file's budget", () => {
  const item = diagnostic(
    "Maximum 8 top-level functions per file.",
    "eslint-js(no-restricted-syntax)"
  );
  const baseline = createBaseline(findings(item));
  assert.equal(findRegressions(findings(item, item), baseline).length, 1);
  assert.equal(findRegressions(findings({ ...item, filename: "apps/new.ts" }), baseline).length, 1);
});

void test("uncountable module syntax cannot be accepted by a baseline refresh", () => {
  const items = findings(
    diagnostic(
      "Export one symbol per statement outside explicit package entrypoints.",
      "eslint-js(no-restricted-syntax)"
    )
  );
  assert.throws(() => createBaseline(items), /uncountable module syntax/u);
  assert.throws(
    () => findRegressions(items, { version: 1, entries: {} }),
    /uncountable module syntax/u
  );
});

void test("named complexity and cognitive complexity compare numeric values", () => {
  for (const [code, before, improved, worsened] of [
    [
      "eslint(complexity)",
      "function `parse` has a complexity of 12. Maximum allowed is 8.",
      "function `parse` has a complexity of 9. Maximum allowed is 8.",
      "function `parse` has a complexity of 13. Maximum allowed is 8.",
    ],
    [
      "sonarjs(cognitive-complexity)",
      "Refactor this function to reduce its Cognitive Complexity from 16 to the 10 allowed.",
      "Refactor this function to reduce its Cognitive Complexity from 11 to the 10 allowed.",
      "Refactor this function to reduce its Cognitive Complexity from 17 to the 10 allowed.",
    ],
  ]) {
    const baseline = createBaseline(findings(diagnostic(before, code)));
    assert.equal(findRegressions(findings(diagnostic(improved, code)), baseline).length, 0);
    assert.equal(findRegressions(findings(diagnostic(worsened, code)), baseline).length, 1);
  }
});

void test("source line movement does not create a different Sonar duplicate finding", () => {
  const code = "sonarjs(no-identical-functions)";
  const baseline = createBaseline(findings(diagnostic("Identical to the one on line 12.", code)));
  assert.equal(
    findRegressions(findings(diagnostic("Identical to the one on line 24.", code)), baseline)
      .length,
    0
  );
});

void test("malformed reports and unclassified diagnostics fail closed", () => {
  assert.throws(() => normalizeLint({}));
  assert.throws(() =>
    normalizeLint({ number_of_files: 1, diagnostics: [{ message: "Failed to load plugin" }] })
  );
  assert.throws(() => normalizeLint({ number_of_files: 0, diagnostics: [] }));
  assert.throws(() => findings(diagnostic("Parser failed", "oxc")));
  assert.throws(() => findRegressions([], { version: 1, entries: { invalid: [-1] } }));
});

void test("depth and nested callback budgets compare their numbers", () => {
  for (const [code, before, improved, worsened] of [
    [
      "eslint(max-depth)",
      "Blocks are nested too deeply (5).",
      "Blocks are nested too deeply (4).",
      "Blocks are nested too deeply (6).",
    ],
    [
      "eslint(max-nested-callbacks)",
      "Too many nested callbacks (5).",
      "Too many nested callbacks (4).",
      "Too many nested callbacks (6).",
    ],
  ]) {
    const baseline = createBaseline(findings(diagnostic(before, code)));
    assert.equal(findRegressions(findings(diagnostic(improved, code)), baseline).length, 0);
    assert.equal(findRegressions(findings(diagnostic(worsened, code)), baseline).length, 1);
  }
});

void test("Knip unused files and nested duplicate groups count; CODEOWNERS does not", () => {
  const actual = normalizeKnip({
    issues: [
      {
        file: "apps/new.ts",
        owners: [{ name: "@maintainer" }],
        files: [{ name: "apps/new.ts" }],
        exports: [],
        duplicates: [[{ name: "first" }, { name: "second" }]],
      },
    ],
  });
  assert.equal(actual.length, 3);
  assert.equal(findRegressions(actual, createBaseline([])).length, 3);
  assert.throws(() => normalizeKnip({ issues: [{ file: "apps/a.ts", exports: [{}] }] }));
});
