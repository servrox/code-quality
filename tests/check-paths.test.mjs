import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createCheckFixture } from "./consumer/check-fixture.mjs";

const cli = fileURLToPath(new URL("../check/cli.mjs", import.meta.url));

void test("format treats a leading exclamation mark as a literal path in a mixed selection", (context) => {
  const { git, run, write } = createCheckFixture(context, cli);
  write("!candidate.js", "export const value={answer:42};\n");
  write("clean.js", "export const value = 42\n");
  git("add", "--", "!candidate.js", "clean.js");

  const result = run(["--scope", "staged", "--check", "format"]);

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /!candidate\.js/u);
  assert.match(result.output, /Format issues found/u);
});

void test("format does not expand a single path starting with an exclamation mark", (context) => {
  const { git, run, write } = createCheckFixture(context, cli);
  write("!candidate.js", "export const value = 42\n");
  write("outside.js", "export const value={answer:42};\n");
  git("add", "--", "!candidate.js");

  const result = run(["--scope", "staged", "--check", "format"]);

  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /outside\.js|Format issues found/u);
});
