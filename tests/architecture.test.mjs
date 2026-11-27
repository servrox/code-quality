import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const binary = fileURLToPath(
  new URL("../../bin/dependency-cruiser.mjs", import.meta.resolve("dependency-cruiser"))
);
const preset = new URL("../dependency-cruiser/core.cjs", import.meta.url).href;
const runtimePreset = new URL("../dependency-cruiser/runtime.cjs", import.meta.url).href;

/**
 * @param {Record<string, string>} files - Fixture modules and package manifests.
 * @param {string} profile - Preset to load.
 * @param {Record<string, string>} links - Fixture symlinks to package roots.
 */
const cruiseFixture = (files, profile = preset, links = {}) => {
  const directory = mkdtempSync(path.join(tmpdir(), "quality-architecture-"));

  try {
    for (const [name, source] of Object.entries(files)) {
      const target = path.join(directory, name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, source);
    }
    for (const [name, destination] of Object.entries(links)) {
      const target = path.join(directory, name);
      mkdirSync(path.dirname(target), { recursive: true });
      symlinkSync(destination, target, "junction");
    }
    writeFileSync(
      path.join(directory, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { module: "ESNext", verbatimModuleSyntax: true } })
    );
    writeFileSync(
      path.join(directory, "dependency-cruiser.config.mjs"),
      `import shared from ${JSON.stringify(profile)};\n` +
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
        ...Object.keys(files).filter((file) => file.endsWith(".ts")),
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
  for (const profile of [preset, runtimePreset]) {
    const result = cruiseFixture(
      {
        "a.ts": 'import type { B } from "./b.ts"; export type A = { b: B };',
        "b.ts": 'import type { A } from "./a.ts"; export type B = { a: A };',
      },
      profile
    );
    assert.equal(result.status, 0, result.output);
  }
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

void test("runtime preset fails on unresolved imports", () => {
  for (const files of [
    { "a.ts": 'import "./missing.ts";' },
    {
      "a.ts": 'import "#missing";',
      "package.json": '{"name":"fixture-consumer","imports":{"#missing":"missing-dependency"}}',
    },
  ]) {
    const result = cruiseFixture(files, runtimePreset);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /no-unresolved-runtime-imports/u);
    assert.equal(cruiseFixture(files).status, 0);
  }
});

void test("runtime preset requires installed npm imports to be declared", () => {
  const files = {
    "a.ts": 'import "fixture-dependency";',
    "package.json": '{"name":"fixture-consumer"}',
    "node_modules/fixture-dependency/package.json":
      '{"name":"fixture-dependency","main":"index.js"}',
    "node_modules/fixture-dependency/index.js": "module.exports = {};",
  };
  const undeclared = cruiseFixture(files, runtimePreset);
  assert.equal(undeclared.status, 1, undeclared.output);
  assert.match(undeclared.output, /no-undeclared-runtime-imports/u);
  files["package.json"] =
    '{"name":"fixture-consumer","dependencies":{"fixture-dependency":"1.0.0"}}';
  const declared = cruiseFixture(files, runtimePreset);
  assert.equal(declared.status, 0, declared.output);
});

void test("runtime preset rejects installed npm imports without a consumer manifest", () => {
  const result = cruiseFixture(
    {
      "a.ts": 'import "fixture-dependency";',
      "node_modules/fixture-dependency/package.json":
        '{"name":"fixture-dependency","main":"index.js"}',
      "node_modules/fixture-dependency/index.js": "module.exports = {};",
    },
    runtimePreset
  );
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /no-undeclared-runtime-imports/u);
});

void test("runtime preset accepts package-import aliases to declared npm dependencies", () => {
  const result = cruiseFixture(
    {
      "a.ts": 'import "#dependency";',
      "package.json": JSON.stringify({
        name: "fixture-consumer",
        dependencies: { "fixture-dependency": "1.0.0" },
        imports: { "#dependency": "fixture-dependency" },
      }),
      "node_modules/fixture-dependency/package.json":
        '{"name":"fixture-dependency","main":"index.js"}',
      "node_modules/fixture-dependency/index.js": "module.exports = {};",
    },
    runtimePreset
  );
  assert.equal(result.status, 0, result.output);
});

void test("runtime preset catches quality tooling imports even when declared", () => {
  const result = cruiseFixture(
    {
      "a.ts": 'import "@servrox/code-quality";',
      "package.json":
        '{"name":"fixture-consumer","devDependencies":{"@servrox/code-quality":"0.1.0"}}',
      "node_modules/@servrox/code-quality/package.json":
        '{"name":"@servrox/code-quality","main":"index.js"}',
      "node_modules/@servrox/code-quality/index.js": "module.exports = {};",
    },
    runtimePreset
  );
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /no-runtime-to-quality-tooling/u);
});

void test("runtime preset catches a linked installation of the quality package", () => {
  for (const specifier of ["@servrox/code-quality/dependency-cruiser", "#quality"]) {
    const result = cruiseFixture(
      {
        "a.ts": `import ${JSON.stringify(specifier)};`,
        "package.json": JSON.stringify({
          name: "fixture-consumer",
          devDependencies: { "@servrox/code-quality": "0.2.0" },
          imports: { "#quality": "@servrox/code-quality/dependency-cruiser" },
        }),
      },
      runtimePreset,
      { "node_modules/@servrox/code-quality": fileURLToPath(new URL("..", import.meta.url)) }
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /no-runtime-to-quality-tooling/u);
  }
});
