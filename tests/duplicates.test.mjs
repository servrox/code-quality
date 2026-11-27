import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../jscpd/cli.mjs", import.meta.url));
const baseline = "clone baseline.json";
const copy = `export function computeTotals(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = subtotal > 100 ? subtotal * 0.1 : 0;
  const tax = (subtotal - discount) * 0.05;
  const total = subtotal - discount + tax;
  return { subtotal, discount, tax, total };
}
`;
const padding = Array.from(
  { length: 750 },
  (_, index) => `export const padding${index} = ${index};`
).join("\n");

/** @param {import("node:test").TestContext} context - Owner of the isolated fixture. */
const createFixture = (context) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "quality-duplicates-"));
  context.after(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  /**
   * @param {string} name - Relative fixture path.
   * @param {string} contents - Fixture contents.
   */
  const write = (name, contents) => {
    writeFileSync(path.join(cwd, name), contents);
  };

  /**
   * @param {string} command - Duplicate scan mode.
   * @param {...string} args - CLI arguments.
   */
  const run = (command, ...args) => {
    const result = spawnSync(process.execPath, [cli, command, ...args], {
      cwd,
      encoding: "utf-8",
      timeout: 15_000,
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  };

  return {
    cwd,
    write,
    readBaseline: () => readFileSync(path.join(cwd, baseline), "utf-8"),
    run,
  };
};

const flags = ["--baseline", baseline];

void test("check requires zero duplication by default without a baseline", (context) => {
  const { write, run } = createFixture(context);
  write("first.ts", copy);
  write("padding.ts", padding);
  const clean = run("check", "--", ".");
  assert.equal(clean.status, 0, clean.output);

  write("second.ts", copy);
  const strict = run("check", "--", ".");
  assert.equal(strict.status, 1, strict.output);
  assert.match(strict.output, /too many duplicates/u);

  const explicitLimit = run("check", "--threshold", "3", "--", ".");
  assert.equal(explicitLimit.status, 0, explicitLimit.output);
});

void test("check accepts known copies below 3% and fails on a new clone without writing", (context) => {
  const { write, run, readBaseline } = createFixture(context);
  write("first.ts", copy);
  write("second.ts", copy);
  write("padding.ts", padding);
  const update = run("update-baseline", ...flags, "--", ".");
  assert.equal(update.status, 0, update.output);
  const previous = readBaseline();

  const check = run("check", ...flags, "--", ".");
  assert.equal(check.status, 0, check.output);
  assert.match(check.output, /3% total.*0 new clones/u);
  assert.doesNotMatch(check.output, /Auto-refactor with AI/u);

  write("third.ts", copy);
  const report = run("report", "--", ".");
  assert.equal(report.status, 0, report.output);
  const regression = run("check", ...flags, "--", ".");
  assert.equal(regression.status, 1, regression.output);
  assert.match(regression.output, /new clones not in the baseline/u);
  assert.equal(readBaseline(), previous);
});

void test("known duplicates over the limit fail and a failed update preserves the baseline", (context) => {
  const { write, run, readBaseline } = createFixture(context);
  write("first.ts", copy);
  write("second.ts", copy);
  const update = run("update-baseline", ...flags, "--threshold", "100", "--", ".");
  assert.equal(update.status, 0, update.output);
  const previous = readBaseline();

  const check = run("check", ...flags, "--", ".");
  assert.equal(check.status, 1, check.output);
  assert.match(check.output, /too many duplicates/u);
  const stricterUpdate = run("update-baseline", ...flags, "--threshold", "0", "--", ".");
  assert.equal(stricterUpdate.status, 1, stricterUpdate.output);
  assert.equal(readBaseline(), previous);
});

void test("threshold 0 is enforced even below the default ceiling", (context) => {
  const { write, run } = createFixture(context);
  write("first.ts", copy);
  write("second.ts", copy);
  write("padding.ts", padding);
  const result = run("report", "--threshold", "0", "--", ".");
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /too many duplicates/u);
});

void test("missing and malformed baselines fail, and an empty scan fails closed", (context) => {
  const { write, run } = createFixture(context);
  const missing = run("check", ...flags, "--", ".");
  assert.equal(missing.status, 1, missing.output);
  assert.match(missing.output, /baseline/u);

  write(baseline, '{"version":1,"fingerprints":{"bad":0}}');
  const malformed = run("check", ...flags, "--", ".");
  assert.equal(malformed.status, 1, malformed.output);
  assert.match(malformed.output, /baseline/u);

  const empty = run("report", "--", ".");
  assert.equal(empty.status, 1, empty.output);
  assert.match(empty.output, /no files|zero files|0 files/iu);
});

void test("updating a symlink baseline fails without replacing it or its target", (context) => {
  const { cwd, write, run } = createFixture(context);
  const target = "native-baseline.json";
  const original = '{"version":1,"fingerprints":{}}';
  const link = path.join(cwd, baseline);
  write("source.ts", padding);
  write(target, original);
  try {
    symlinkSync(target, link, "file");
  } catch (error) {
    if (
      process.platform === "win32" &&
      error instanceof Error &&
      "code" in error &&
      error.code === "EPERM"
    ) {
      context.skip("Creating file symlinks requires Windows Developer Mode or symlink privileges.");
      return;
    }
    throw error;
  }

  const update = run("update-baseline", ...flags, "--", ".");

  assert.equal(update.status, 1, update.output);
  assert.match(update.output, /symbolic link/u);
  assert.equal(readlinkSync(link), target);
  assert.equal(readFileSync(path.join(cwd, target), "utf-8"), original);
});
