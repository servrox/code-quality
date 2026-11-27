import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** @param {import("node:test").TestContext} context @param {string} cli */
export const createCheckFixture = (context, cli) => {
  const root = mkdtempSync(path.join(tmpdir(), "quality-check-cli-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** @param {...string} args - Git command arguments. */
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf-8", stdio: "pipe" });

  /** @param {string} file @param {string} contents */
  const write = (file, contents) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };

  /** @param {string[]} args @param {string} [cwd] */
  const run = (args, cwd = root) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: "utf-8",
      maxBuffer: 5 * 1024 * 1024,
      timeout: 15_000,
    });
    assert.ifError(result.error);
    const output = result.stdout + result.stderr;
    assert.equal(result.signal, null, output);
    assert.notEqual(result.status, null, output);
    return { status: result.status, output };
  };

  git("init", "-q");
  write(
    ".oxlintrc.json",
    JSON.stringify({ categories: { correctness: "off" }, rules: { "no-debugger": "error" } })
  );
  write(".oxfmtrc.json", JSON.stringify({ singleQuote: true, semi: false }));

  return { git, root, run, write };
};
