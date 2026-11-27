import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createCheckFixture } from "./consumer/check-fixture.mjs";

const cli = fileURLToPath(new URL("../check/cli.mjs", import.meta.url));

void test("both checks report configured violations without changing files or the index", (context) => {
  const { git, root, run, write } = createCheckFixture(context, cli);
  const args = ["--scope", "staged", "--check", "both", "--", "candidate.js"];

  for (const [source, status] of [
    ['debugger;export const answer="ready";\n', 1],
    ["export const answer = 'ready'\n", 0],
  ]) {
    write("candidate.js", source);
    git("add", "candidate.js");
    const index = readFileSync(path.join(root, ".git", "index"));
    const result = run(args);

    assert.equal(result.status, status, result.output);
    if (status === 1) {
      assert.match(result.output, /no-debugger/u);
      assert.match(result.output, /Format issues found/u);
    }
    assert.equal(readFileSync(path.join(root, "candidate.js"), "utf-8"), source);
    assert.deepEqual(readFileSync(path.join(root, ".git", "index")), index);
  }
});

void test("lint checks the script content of Vue, Svelte and Astro files", (context) => {
  const { run, write } = createCheckFixture(context, cli);
  const files = {
    "component.vue": "<script>\ndebugger;\n</script>\n<template><p>Fixture</p></template>\n",
    "component.svelte": "<script>\ndebugger;\n</script>\n<p>Fixture</p>\n",
    "component.astro": "---\ndebugger;\n---\n<p>Fixture</p>\n",
  };

  for (const [file, source] of Object.entries(files)) {
    write(file, source);
  }
  const result = run(["--scope", "all", "--check", "lint", "--", ...Object.keys(files)]);

  assert.equal(result.status, 1, result.output);
  for (const file of Object.keys(files)) {
    assert.ok(result.output.includes(`${file}:2:1:`), result.output);
  }
  assert.match(result.output, /no-debugger/u);
});

void test("format checks JSON5, Markdown aliases, dotfiles and configured associations", (context) => {
  const { run, write } = createCheckFixture(context, cli);
  write(
    ".oxfmtrc.json",
    JSON.stringify({ associations: [{ files: ["*.custom"], language: "json" }] })
  );
  const files = {
    "settings.json5": "{unformatted:true,answer:42}\n",
    "guide.markdown": "| name|value|\n|---|---|\n| a |b|\n",
    ".babelrc": '{"presets": ["example"],"compact":true}\n',
    ".prettierrc": '{"singleQuote":true,"semi":false}\n',
    "settings.custom": '{"answer":42}\n',
  };

  for (const [file, source] of Object.entries(files)) {
    write(file, source);
  }
  const result = run(["--scope", "all", "--check", "format", "--", ...Object.keys(files)]);

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /Format issues found/u);
  for (const file of Object.keys(files)) {
    assert.ok(result.output.includes(file), result.output);
  }
});

void test("an ignored-only selection succeeds for both tools without checking other files", (context) => {
  const { run, write } = createCheckFixture(context, cli);
  write(
    ".oxlintrc.json",
    JSON.stringify({
      categories: { correctness: "off" },
      ignorePatterns: ["ignored/**"],
      rules: { "no-debugger": "error" },
    })
  );
  write(".oxfmtrc.json", JSON.stringify({ ignorePatterns: ["ignored/**"] }));
  write("ignored/candidate.js", "debugger;const value={answer:42};\n");
  write("outside.js", "debugger;const value={answer:42};\n");

  const result = run(["--scope", "all", "--check", "both", "--", "ignored"]);

  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /no-debugger|Format issues found/u);
});

void test("empty and unsupported-only selections succeed without a broader scan", (context) => {
  const { run, write } = createCheckFixture(context, cli);
  write("outside.js", "debugger;const value={answer:42};\n");
  write("unsupported.binary", "not a supported source file\n");

  for (const selected of ["missing.js", "unsupported.binary"]) {
    const result = run(["--scope", "all", "--check", "both", "--", selected]);

    assert.equal(result.status, 0, result.output);
    assert.doesNotMatch(result.output, /no-debugger|Format issues found/u);
  }
});

void test("explicit config paths resolve from a nested invoking directory", (context) => {
  const { root, run, write } = createCheckFixture(context, cli);
  write(".oxlintrc.json", JSON.stringify({ categories: { correctness: "off" } }));
  write(".oxfmtrc.json", JSON.stringify({ singleQuote: false, semi: true }));
  write(
    "nested/configs/lint.json",
    JSON.stringify({ categories: { correctness: "off" }, rules: { "no-debugger": "error" } })
  );
  write("nested/configs/format.json", JSON.stringify({ singleQuote: true, semi: false }));
  write("candidate.js", 'debugger;\nexport const answer = "ready";\n');

  const result = run(
    [
      "--scope",
      "all",
      "--check",
      "both",
      "--oxlint-config",
      "configs/lint.json",
      "--oxfmt-config",
      "configs/format.json",
      "--",
      "candidate.js",
    ],
    path.join(root, "nested")
  );

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /no-debugger/u);
  assert.match(result.output, /Format issues found/u);
});

void test("the lint warning budget applies across a selection longer than one argument batch", (context) => {
  const { run, write } = createCheckFixture(context, cli);
  write(
    ".oxlintrc.json",
    JSON.stringify({
      categories: { correctness: "off" },
      options: { maxWarnings: 1 },
      rules: { "no-debugger": "warn" },
    })
  );

  for (let index = 0; index < 70; index += 1) {
    const filename = `source-${String(index).padStart(2, "0")}-${"x".repeat(175)}.js`;
    write(filename, index === 0 || index === 69 ? "debugger;\n" : "export const answer = 42;\n");
  }

  const result = run(["--scope", "all", "--check", "lint", "--", "*.js"]);

  assert.equal(result.status, 1, result.output);
  assert.equal(result.output.match(/warning eslint\(no-debugger\)/gu)?.length, 2, result.output);
});
