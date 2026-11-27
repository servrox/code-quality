import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { regularFiles, selectFiles } from "../check/git-files.mjs";

/** @param {import("node:test").TestContext} context - Current test and cleanup lifecycle. */
const fixture = (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "quality-git-"));
  context.after(() => {
    rmSync(root, { force: true, recursive: true });
  });
  /** @param {...string} args - Git command arguments. */
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  /** @param {string} file @param {string} content */
  const write = (file, content) => {
    writeFileSync(path.join(root, file), content);
  };

  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("config", "commit.gpgsign", "false");

  for (const file of ["staged.js", "unstaged.js", "unchanged.js", "deleted.js"]) {
    write(file, "const initial = 0;\n");
  }

  write(".gitignore", "*.ignored\n");
  git("add", ".");
  git("commit", "-qm", "initial");
  git("branch", "base");

  return { git, root, write };
};

await test("selects staged, unstaged, changed and all paths from a real Git repository", (context) => {
  const { git, root, write } = fixture(context);
  write("committed.js", "const committed = 1;\n");
  git("add", "committed.js");
  git("commit", "-qm", "committed change");
  write("staged.js", "const staged = 1;\n");
  git("add", "staged.js");
  git("rm", "deleted.js");
  write("unstaged.js", "const unstaged = 1;\n");
  write("new file.js", "const untracked = 1;\n");
  write("hidden.ignored", "ignored\n");

  /** @param {import("../check/git-files.mjs").Scope} scope @param {string} [base] */
  const files = (scope, base) =>
    regularFiles(root, selectFiles({ base, pathspecs: ["*.js"], root, scope }));

  assert.deepEqual(files("staged"), ["staged.js"]);
  assert.deepEqual(files("unstaged"), ["new file.js", "unstaged.js"]);
  assert.deepEqual(files("changed", "base"), [
    "committed.js",
    "new file.js",
    "staged.js",
    "unstaged.js",
  ]);
  assert.deepEqual(files("all"), [
    "committed.js",
    "new file.js",
    "staged.js",
    "unchanged.js",
    "unstaged.js",
  ]);
});

await test("rejects partially staged or missing working copies for selected staged paths", (context) => {
  const { git, root, write } = fixture(context);

  write("staged.js", "const staged = 1;\n");
  git("add", "staged.js");
  write("staged.js", "const unstaged = 2;\n");

  /** @type {Parameters<typeof selectFiles>[0]} */
  const options = { pathspecs: ["staged.js"], root, scope: "staged" };
  assert.throws(() => selectFiles(options), /Staged paths also have unstaged changes/u);
  rmSync(path.join(root, "staged.js"));
  assert.throws(() => selectFiles(options), /Staged paths also have unstaged changes/u);
});
