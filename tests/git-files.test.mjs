import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { regularFiles, repositoryRoot, selectFiles } from "../check/git-files.mjs";

/** @param {import("node:test").TestContext} context - Current test and cleanup lifecycle.
 * @param {{ commit?: boolean, directory?: string }} [options] - Initial repository state.
 */
const fixture = (context, { commit = true, directory = "worktree" } = {}) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "quality-git-"));
  const root = path.join(temporary, directory);
  mkdirSync(root);
  context.after(() => {
    rmSync(temporary, { force: true, recursive: true });
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

  if (commit) {
    git("commit", "-qm", "initial");
    git("branch", "base");
  }

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

await test("compares file content without refreshing the Git index", (context) => {
  const { git, root, write } = fixture(context);
  git("config", "diff.autoRefreshIndex", "true");
  write("staged.js", "const staged = 1;\n");
  git("add", "staged.js");

  for (const file of ["staged.js", "unchanged.js"]) {
    utimesSync(path.join(root, file), new Date(0), new Date(0));
  }

  const index = readFileSync(path.join(root, ".git", "index"));
  /** @param {import("../check/git-files.mjs").Scope} scope - Requested comparison. */
  const files = (scope) => regularFiles(root, selectFiles({ pathspecs: [], root, scope }));

  assert.deepEqual(files("changed"), ["staged.js"]);
  assert.deepEqual(files("staged"), ["staged.js"]);
  assert.deepEqual(files("unstaged"), []);
  assert.deepEqual(readFileSync(path.join(root, ".git", "index")), index);
});

await test("skips deleted descendants when a tracked directory becomes a file", (context) => {
  const { git, root, write } = fixture(context);
  mkdirSync(path.join(root, "source"));
  write("source/removed.js", "const removed = 1;\n");
  git("add", "source");
  git("commit", "-qm", "tracked directory");
  rmSync(path.join(root, "source"), { recursive: true });
  write("source", "replacement file\n");

  assert.deepEqual(regularFiles(root, selectFiles({ pathspecs: ["source"], root, scope: "all" })), [
    "source",
  ]);
});

await test(
  "preserves trailing whitespace in the repository root",
  { skip: process.platform === "win32" },
  (context) => {
    const { root } = fixture(context, { directory: "trailing whitespace \t\n" });

    assert.equal(repositoryRoot(root), root);
  }
);

await test("checks initial working files without HEAD and rejects explicit invalid bases", (context) => {
  const { root, write } = fixture(context, { commit: false });
  write("untracked.js", "const untracked = 1;\n");
  write("hidden.ignored", "ignored\n");
  rmSync(path.join(root, "deleted.js"));
  /** @type {Parameters<typeof selectFiles>[0]} */
  const options = { pathspecs: ["*.js"], root, scope: "changed" };

  assert.deepEqual(regularFiles(root, selectFiles(options)), [
    "staged.js",
    "unchanged.js",
    "unstaged.js",
    "untracked.js",
  ]);
  assert.throws(() => selectFiles({ ...options, base: "HEAD" }));
  assert.throws(() => selectFiles({ ...options, base: "missing-branch" }));
});
