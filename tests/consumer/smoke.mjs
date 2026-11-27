import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "@servrox/code-quality/package.json" with { type: "json" };
import { normalizeLint } from "@servrox/code-quality/baseline";

await Promise.all(Object.keys(manifest.exports).map(async (subpath) => {
  const specifier = "@servrox/code-quality/" + subpath.slice(2);
  if (subpath === "./jscpd" || subpath === "./package.json") {
    await import(specifier, { with: { type: "json" } });
  } else {
    await import(specifier);
  }
}));

const installedRoot = path.dirname(fileURLToPath(import.meta.resolve("@servrox/code-quality/package.json")));
assert.equal(manifest.license, "Apache-2.0");
assert.match(readFileSync(path.join(installedRoot, "LICENSE"), "utf8"), /Apache License\s+Version 2\.0/);
for (const excluded of ["tests", "scripts", ".github", "tsconfig.json", "oxlint.config.ts"]) {
  assert.equal(existsSync(path.join(installedRoot, excluded)), false, excluded + " must not be packed");
}

const oxlint = fileURLToPath(new URL("../bin/oxlint", import.meta.resolve("oxlint")));
const lint = (source, profile) => {
  writeFileSync("candidate.ts", source);
  writeFileSync("oxlint.config.mjs",
    'import preset from "@servrox/code-quality/oxlint/' + profile + '";\n' +
    'export default { categories: {correctness: "off"}, extends: [preset] };\n');
  const result = spawnSync(process.execPath, [oxlint, "--config", "oxlint.config.mjs", "--format=json", "candidate.ts"],
    { encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  return { status: result.status, findings: normalizeLint(JSON.parse(result.stdout)) };
};

for (const count of [8, 9]) {
  const source = Array.from({ length: count }, (_, i) => "function f" + i + "() { return " + i + "; }").join("\n");
  const result = lint(source, "modularity");
  assert.equal(result.status, count === 8 ? 0 : 1);
  assert.equal(result.findings.length, count - 8);
}

const strict = lint("const answer = (value) => { const result = value + 1; return result; };", "strict");
assert.ok(strict.findings.some((finding) => finding.rule === "sonarjs(prefer-immediate-return)"));

const antiSlop = lint("const options = { ...(enabled ? { flag: true } : {}) };", "anti-slop");
assert.ok(antiSlop.findings.some((finding) => finding.rule === "anti-slop(no-conditional-empty-object-spread)"));

const runtimeBaseDir = path.join(process.cwd(), "runtime-roots");
const runtimeEntry = path.join(runtimeBaseDir, "entry.mjs");
mkdirSync(runtimeBaseDir);
writeFileSync("runtime-config.mjs",
  'import createRuntimeConfig from "@servrox/code-quality/dependency-cruiser/create-runtime-config";\n' +
  'export default createRuntimeConfig({ baseDir: ' + JSON.stringify(runtimeBaseDir) + ' });\n');

const depcruise = fileURLToPath(new URL("../../bin/dependency-cruiser.mjs", import.meta.resolve("dependency-cruiser")));
const cruise = (source) => {
  writeFileSync(runtimeEntry, source);
  const result = spawnSync(process.execPath,
    [depcruise, "--config", "runtime-config.mjs", "--output-type", "err-long", "entry.mjs"],
    { encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  return { status: result.status, output: result.stdout + result.stderr };
};

const runtimeClean = cruise('import "node:fs";');
assert.equal(runtimeClean.status, 0, runtimeClean.output);
const runtimeTooling = cruise('import "@servrox/code-quality/dependency-cruiser";');
assert.equal(runtimeTooling.status, 1, runtimeTooling.output);
assert.match(runtimeTooling.output, /no-runtime-to-quality-tooling: entry\.mjs →/u);

writeFileSync("duplicate-scan.ts", Array.from(
  { length: 20 }, (_, index) => "export const value" + index + " = " + index + ";"
).join("\n"));

console.log("Installed exports, plugin resolution and package file allowlist passed.");
