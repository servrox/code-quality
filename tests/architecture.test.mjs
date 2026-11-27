import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const binary = fileURLToPath(
  new URL("../../bin/dependency-cruiser.mjs", import.meta.resolve("dependency-cruiser"))
);
const preset = new URL("../dependency-cruiser/core.cjs", import.meta.url).href;

/** @param {Record<string, string>} files - TypeScript modules to analyze. */
const cruiseFixture = (files) => {
  const directory = mkdtempSync(path.join(tmpdir(), "quality-architecture-"));

  try {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(path.join(directory, name), source);
    }
    writeFileSync(
      path.join(directory, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { module: "ESNext", verbatimModuleSyntax: true } })
    );
    writeFileSync(
      path.join(directory, "dependency-cruiser.config.mjs"),
      `import shared from ${JSON.stringify(preset)};\n` +
        'export default { ...shared, options: { ...shared.options, tsConfig: { fileName: "tsconfig.json" } } };\n'
    );

    const result = spawnSync(
      process.execPath,
      [
        binary,
        "--config",
        "dependency-cruiser.config.mjs",
        "--output-type",
        "err-long",
        ...Object.keys(files),
      ],
      { cwd: directory, encoding: "utf-8", timeout: 15_000, maxBuffer: 1024 * 1024 }
    );
    assert.equal(result.error, undefined);
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

void test("pure type-only cycles are outside the runtime graph", () => {
  const result = cruiseFixture({
    "a.ts": 'import type { B } from "./b.ts"; export type A = { b: B };',
    "b.ts": 'import type { A } from "./a.ts"; export type B = { a: A };',
  });
  assert.equal(result.status, 0, result.output);
});

void test("type-only edges cannot hide a real three-module runtime cycle", () => {
  const result = cruiseFixture({
    "a.ts":
      'import { b } from "./b.ts"; import type { C } from "./c.ts"; export const a = () => b(); export type A = { c: C };',
    "b.ts":
      'import { c } from "./c.ts"; import type { A } from "./a.ts"; export const b = () => c(); export type B = { a: A };',
    "c.ts":
      'import { a } from "./a.ts"; import type { B } from "./b.ts"; export const c = () => a(); export type C = { b: B };',
  });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /no-runtime-cycles/u);
});

void test("side-effect and unused value imports remain runtime edges with verbatim emit", () => {
  for (const files of [
    { "a.ts": 'import "./b.ts";', "b.ts": 'import "./a.ts";' },
    {
      "a.ts": 'import { b } from "./b.ts"; export const a = 1;',
      "b.ts": 'import { a } from "./a.ts"; export const b = 2;',
    },
  ]) {
    const result = cruiseFixture(files);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /no-runtime-cycles/u);
  }
});
