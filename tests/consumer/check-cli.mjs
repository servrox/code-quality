import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import manifest from "@servrox/code-quality/package.json" with { type: "json" };

import { createCheckFixture } from "./check-fixture.mjs";

const installedRoot = path.dirname(
  fileURLToPath(import.meta.resolve("@servrox/code-quality/package.json"))
);
const cli = path.resolve(installedRoot, manifest.bin["code-quality-check"]);

void test("the installed CLI resolves both peers and preserves their success and error statuses", (context) => {
  const { run, write } = createCheckFixture(context, cli);
  const args = ["--scope", "all", "--check", "both", "--", "candidate.js"];
  write("candidate.js", 'debugger;export const answer="ready";\n');

  const invalid = run(args);
  assert.equal(invalid.status, 1, invalid.output);
  assert.match(invalid.output, /no-debugger/u);
  assert.match(invalid.output, /Format issues found/u);

  write("candidate.js", "export const answer = 'ready'\n");
  const clean = run(args);
  assert.equal(clean.status, 0, clean.output);
});
