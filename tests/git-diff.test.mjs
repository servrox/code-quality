import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { selectFiles } from "../check/git-files.mjs";

/** @param {string} value - Path passed through Git's command shell. */
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

/** @param {import("node:test").TestContext} context - Current test and cleanup lifecycle. */
const fixture = (context) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "quality-textconv-"));
  const root = path.join(temporary, "repository");
  mkdirSync(root);
  context.after(() => {
    rmSync(temporary, { force: true, recursive: true });
  });

  /** @param {...string} args - Git command arguments. */
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf-8", stdio: "pipe" });
  /** @param {string} content - Working copy of the tracked JSON file. */
  const write = (content) => {
    writeFileSync(path.join(root, "candidate.json"), content);
  };
  const converter = path.join(temporary, "textconv.cjs");
  writeFileSync(
    converter,
    'const fs = require("node:fs");\n' +
      'process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[2], "utf-8"))) + "\\n");\n'
  );
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("config", "commit.gpgsign", "false");
  git("config", "diff.canonical-json.textconv", `${quote(process.execPath)} ${quote(converter)}`);
  git("config", "diff.canonical-json.cachetextconv", "true");
  writeFileSync(path.join(root, ".gitattributes"), "candidate.json diff=canonical-json\n");
  write('{\n  "answer": 42\n}\n');
  git("add", ".");
  git("commit", "-qm", "initial");

  return { git, root, write };
};

/** @type {import("../check/git-files.mjs").Scope[]} */
const scopes = ["changed", "unstaged", "staged"];

for (const scope of scopes) {
  void test(`${scope} selection detects raw changes hidden by a textconv driver`, (context) => {
    const { git, root, write } = fixture(context);
    write('{"answer":42}\n');

    if (scope === "staged") {
      git("add", "candidate.json");
    }

    assert.deepEqual(selectFiles({ pathspecs: ["candidate.json"], root, scope }), [
      "candidate.json",
    ]);
  });
}

await test("staged content validation detects raw changes hidden by textconv", (context) => {
  const { git, root, write } = fixture(context);
  write('{"answer":7}\n');
  git("add", "candidate.json");
  write('{\n  "answer": 7\n}\n');

  assert.throws(
    () => selectFiles({ pathspecs: ["candidate.json"], root, scope: "staged" }),
    /Staged paths also have unstaged changes/u
  );
});

await test("Git selection preserves the index and refs with textconv caching configured", (context) => {
  const { git, root, write } = fixture(context);
  write('{"answer":42}\n');
  const index = readFileSync(path.join(root, ".git", "index"));
  const refs = git("for-each-ref", "--format=%(refname) %(objectname)");

  selectFiles({ pathspecs: ["candidate.json"], root, scope: "changed" });

  assert.deepEqual(readFileSync(path.join(root, ".git", "index")), index);
  assert.equal(git("for-each-ref", "--format=%(refname) %(objectname)"), refs);
});

await test(
  "numstat selection preserves tab and newline paths and includes binary and mode changes",
  { skip: process.platform === "win32" },
  (context) => {
    const { git, root } = fixture(context);
    const unusual = "tab\tand\nnewline.js";
    writeFileSync(path.join(root, unusual), "export const answer = 1;\n");
    writeFileSync(path.join(root, "binary.dat"), Buffer.from([0, 1, 2]));
    writeFileSync(path.join(root, "mode.js"), "export const executable = true;\n");
    git("add", ".");
    git("commit", "-qm", "additional inputs");
    writeFileSync(path.join(root, unusual), "export const answer = 2;\n");
    writeFileSync(path.join(root, "binary.dat"), Buffer.from([0, 1, 3]));
    chmodSync(path.join(root, "mode.js"), 0o755);
    git("add", "--", unusual, "binary.dat", "mode.js");
    const index = readFileSync(path.join(root, ".git", "index"));

    assert.deepEqual(
      selectFiles({
        pathspecs: [unusual, "binary.dat", "mode.js"],
        root,
        scope: "staged",
      }).toSorted(),
      [unusual, "binary.dat", "mode.js"].toSorted()
    );
    assert.deepEqual(readFileSync(path.join(root, ".git", "index")), index);
  }
);
