import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/publish-release.yml", import.meta.url),
  "utf-8"
);
const filter = readFileSync(
  new URL("../../scripts/release/merged-release-pr.jq", import.meta.url),
  "utf-8"
);

/** @param {string} name - Step whose literal shell block must be extracted. */
const runBlock = (name) => {
  const lines = workflow.split("\n");
  const marker = `      - name: ${name}`;
  assert.equal(lines.filter((line) => line === marker).length, 1, `Expected one step: ${name}`);
  const start = lines.indexOf(marker) + 1;
  const nextStep = lines.findIndex((line, index) => index >= start && line.startsWith("      - "));
  const end = nextStep === -1 ? lines.length : nextStep;
  const run = lines.findIndex(
    (line, index) => index >= start && index < end && line === "        run: |"
  );
  assert.ok(run !== -1, `Expected a literal run block: ${name}`);
  const body = [];
  for (const line of lines.slice(run + 1, end)) {
    assert.ok(line.trim() === "" || line.startsWith("          "), `Malformed run block: ${name}`);
    body.push(line.slice(10));
  }
  assert.ok(
    body.some((line) => line.trim() !== ""),
    `Empty run block: ${name}`
  );
  return body.join("\n");
};

const candidateScript = runBlock("Verify release candidate");
const stagingScript = runBlock("Check the verified version is still current on protected main");

/**
 * @param {string} command - Local executable, with only gh and curl replaced by fixtures.
 * @param {string[]} args - Command arguments.
 * @param {string} cwd - Temporary repository.
 * @param {NodeJS.ProcessEnv} env - Isolated test environment.
 */
const execute = (command, args, cwd, env) => {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf-8", timeout: 10_000 });
  assert.equal(result.error, undefined, `${command}: ${result.error?.message}`);
  assert.notEqual(result.status, null, `${command} did not exit: ${result.stderr}`);
  return result;
};

/** @type {[string, "merge" | "squash" | "rebase", boolean, string, boolean][]} */
const histories = [
  ["normal merge stages one release commit", "merge", false, "none", true],
  ["normal merge stages a later changelog edit", "merge", true, "none", true],
  ["squash merge stages a later changelog edit", "squash", true, "none", true],
  ["rebase merge stages one release commit", "rebase", false, "none", true],
  ["rebase merge stages a later changelog edit", "rebase", true, "none", true],
  ["later main documentation changes preserve a release", "rebase", false, "docs", true],
  ["version rollback rejects the abandoned run", "rebase", false, "rollback", false],
  ["version reuse rejects the abandoned run", "rebase", false, "reuse-old", false],
  ["version reuse permits the replacement run", "rebase", false, "reuse-new", true],
  ["main without the reviewed head rejects its run", "rebase", true, "rewrite", false],
];

for (const [name, merge, followup, after, accepted] of histories) {
  void test(name, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "release-staging-"));
    const repository = path.join(directory, "repository");
    const bin = path.join(directory, "bin");
    mkdirSync(repository);
    mkdirSync(bin);
    const env = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GITHUB_REPOSITORY: "servrox/code-quality",
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "push",
      REF_PROTECTED: "true",
      RELEASE_APP: "release-app",
      GH_TOKEN: "test-token",
      RELEASE_VERSION: "0.2.0",
      GITHUB_OUTPUT: path.join(directory, "output"),
      GITHUB_STEP_SUMMARY: path.join(directory, "summary"),
      RELEASE_TEST_PULLS: path.join(directory, "pulls.json"),
      RELEASE_TEST_BRANCH: path.join(directory, "branch.json"),
      RELEASE_TEST_NPM: path.join(directory, "npm.json"),
    };
    /** @param {...string} args - Git arguments for the temporary repository. */
    const git = (...args) => {
      const result = execute(
        "git",
        ["-c", "user.name=Release test", "-c", "user.email=release@example.invalid", ...args],
        repository,
        env
      );
      assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
      return result.stdout.trim();
    };
    /** @param {string} version - Package and manifest version for this fixture. */
    const writeVersion = (version) => {
      writeFileSync(
        path.join(repository, ".release-please-manifest.json"),
        `${JSON.stringify({ ".": version })}\n`
      );
      writeFileSync(
        path.join(repository, "package.json"),
        `${JSON.stringify({
          name: "@servrox/code-quality",
          version,
          publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
        })}\n`
      );
    };
    /** @param {string} message - Commit describing the fixture transition. */
    const commit = (message) => {
      git("add", ".");
      git("commit", "-m", message);
      return git("rev-parse", "HEAD");
    };

    try {
      writeFileSync(
        path.join(bin, "gh"),
        `#!/bin/bash
set -euo pipefail
[[ "$1" == api && "$#" -eq 4 ]]
if [[ "$2" == --paginate && "$3" == --slurp && "$4" == "repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/pulls" ]]; then
  cat "$RELEASE_TEST_PULLS"
elif [[ "$2" == "repos/$GITHUB_REPOSITORY/branches/main" && "$3" == --jq ]]; then
  jq -r "$4" "$RELEASE_TEST_BRANCH"
else
  echo 'Unexpected gh request' >&2
  exit 2
fi
`,
        { mode: 0o755 }
      );
      writeFileSync(
        path.join(bin, "curl"),
        `#!/bin/bash
set -euo pipefail
[[ "$#" -eq 4 && "$1" == -fsSL && "$2" == --max-time && "$3" == 15 && "$4" == 'https://registry.npmjs.org/@servrox%2fcode-quality/latest' ]]
cat "$RELEASE_TEST_NPM"
`,
        { mode: 0o755 }
      );
      writeFileSync(env.RELEASE_TEST_NPM, JSON.stringify({ version: "0.1.0" }));
      git("init", "--initial-branch=main");
      mkdirSync(path.join(repository, "scripts/release"), { recursive: true });
      writeFileSync(path.join(repository, "scripts/release/merged-release-pr.jq"), filter);
      writeVersion("0.1.0");
      commit("chore: publish 0.1.0");
      git("checkout", "-b", "release-please--branches--main");
      writeVersion("0.2.0");
      commit("chore(main): release 0.2.0");
      if (followup) {
        writeFileSync(path.join(repository, "CHANGELOG.md"), "Maintainer-reviewed release notes\n");
        commit("docs: clarify release notes");
      }
      git("checkout", "main");
      writeFileSync(path.join(repository, "README.md"), "Unrelated changes on main\n");
      let before = commit("docs: main moves while the release is reviewed");
      if (merge === "rebase") {
        git("checkout", "release-please--branches--main");
        git("rebase", "main");
        git("checkout", "main");
        git("merge", "--ff-only", "release-please--branches--main");
      } else if (merge === "squash") {
        git("merge", "--squash", "release-please--branches--main");
        commit("chore(main): release 0.2.0");
      } else {
        git("merge", "--no-ff", "release-please--branches--main", "-m", "Merge release PR");
      }
      let candidate = git("rev-parse", "HEAD");
      if (after === "docs") {
        writeFileSync(path.join(repository, "README.md"), "Later documentation changes\n");
        commit("docs: update readme after the release merge");
      }
      if (after === "rollback" || after.startsWith("reuse")) {
        writeVersion("0.1.0");
        const rollback = commit("fix: abandon the release candidate");
        if (after.startsWith("reuse")) {
          writeVersion("0.2.0");
          const replacement = commit("chore(main): prepare the replacement 0.2.0");
          if (after === "reuse-new") {
            before = rollback;
            candidate = replacement;
          }
        }
      }
      if (after === "rewrite") {
        git("reset", "--hard", `${candidate}^`);
        writeFileSync(
          path.join(repository, "README.md"),
          "History drops the reviewed changelog commit\n"
        );
        commit("docs: diverge without the reviewed release head");
      }
      const main = git("rev-parse", "HEAD");
      env.BEFORE_SHA = before;
      env.GITHUB_SHA = candidate;
      writeFileSync(
        env.RELEASE_TEST_BRANCH,
        JSON.stringify({ protected: true, commit: { sha: main } })
      );
      writeFileSync(
        env.RELEASE_TEST_PULLS,
        JSON.stringify([
          [
            {
              number: 7,
              merged_at: "2026-11-27T00:00:00Z",
              merge_commit_sha: candidate,
              base: { ref: "main", repo: { full_name: "servrox/code-quality" } },
              head: {
                ref: "release-please--branches--main",
                repo: { full_name: "servrox/code-quality" },
              },
              user: { type: "Bot", login: "release-app[bot]" },
            },
          ],
        ])
      );
      git("checkout", "--detach", candidate);
      const verification = execute("bash", ["-c", candidateScript], repository, env);
      assert.equal(verification.status, 0, verification.stdout + verification.stderr);
      /** @type {Map<string, string>} */
      const outputs = new Map();
      for (const line of readFileSync(env.GITHUB_OUTPUT, "utf-8").trim().split("\n")) {
        const [key, value] = line.split("=");
        outputs.set(key, value);
      }
      assert.equal(outputs.get("version"), "0.2.0");
      assert.equal(outputs.get("stage"), "true");
      git("checkout", "--detach", main);
      const staging = execute("bash", ["-c", stagingScript], repository, env);
      assert.equal(staging.status, accepted ? 0 : 1, staging.stdout + staging.stderr);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

/** @type {[string, string, boolean][]} */
const initializations = [
  ["initializes the published baseline after an unreleased source version bump", "pending", true],
  ["initializes an unchanged published version", "unchanged", true],
  ["rejects initialization at a version absent from npm latest", "npm-mismatch", false],
  ["rejects initialization without a matching GitHub release", "release-mismatch", false],
  ["rejects initialization from a draft GitHub release", "draft", false],
  ["rejects initialization from a prerelease", "prerelease", false],
  ["rejects initialization when the GitHub release is missing", "missing-release", false],
  ["rejects initialization when the release tag is missing", "missing-tag", false],
  ["rejects initialization when the release tag is outside main history", "unrelated-tag", false],
  ["rejects initialization when the tagged package version differs", "tagged-version", false],
  ["rejects initialization on unprotected main", "unprotected", false],
  ["manual archive verification needs no published baseline lookup", "manual", true],
];

for (const [name, scenario, accepted] of initializations) {
  void test(name, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "release-initialization-"));
    const repository = path.join(directory, "repository");
    const bin = path.join(directory, "bin");
    mkdirSync(repository);
    mkdirSync(bin);
    const env = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GITHUB_REPOSITORY: "servrox/code-quality",
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: scenario === "manual" ? "workflow_dispatch" : "push",
      REF_PROTECTED: scenario === "unprotected" ? "false" : "true",
      GITHUB_OUTPUT: path.join(directory, "output"),
      GITHUB_STEP_SUMMARY: path.join(directory, "summary"),
      RELEASE_TEST_SCENARIO: scenario,
      RELEASE_TEST_RELEASE: path.join(directory, "release.json"),
      RELEASE_TEST_NPM: path.join(directory, "npm.json"),
    };
    /** @param {...string} args - Git arguments for the temporary repository. */
    const git = (...args) => {
      const result = execute(
        "git",
        ["-c", "user.name=Release test", "-c", "user.email=release@example.invalid", ...args],
        repository,
        env
      );
      assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
      return result.stdout.trim();
    };
    /** @param {string} version - Package version in this fixture. */
    const writePackage = (version) => {
      writeFileSync(
        path.join(repository, "package.json"),
        JSON.stringify({
          name: "@servrox/code-quality",
          version,
          publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
        })
      );
    };

    try {
      writeFileSync(
        path.join(bin, "gh"),
        `#!/bin/bash
set -euo pipefail
[[ "$#" -eq 7 && "$1" == release && "$2" == view && "$3" == v0.1.0 && "$4" == --repo && "$5" == "$GITHUB_REPOSITORY" && "$6" == --json && "$7" == tagName,isDraft,isPrerelease ]]
[[ "$RELEASE_TEST_SCENARIO" != missing-release && "$RELEASE_TEST_SCENARIO" != manual ]]
cat "$RELEASE_TEST_RELEASE"
`,
        { mode: 0o755 }
      );
      writeFileSync(
        path.join(bin, "curl"),
        `#!/bin/bash
set -euo pipefail
[[ "$#" -eq 4 && "$1" == -fsSL && "$2" == --max-time && "$3" == 15 && "$4" == 'https://registry.npmjs.org/@servrox%2fcode-quality/latest' ]]
[[ "$RELEASE_TEST_SCENARIO" != manual ]]
cat "$RELEASE_TEST_NPM"
`,
        { mode: 0o755 }
      );
      writeFileSync(
        env.RELEASE_TEST_NPM,
        JSON.stringify({ version: scenario === "npm-mismatch" ? "0.0.9" : "0.1.0" })
      );
      writeFileSync(
        env.RELEASE_TEST_RELEASE,
        JSON.stringify({
          tagName: scenario === "release-mismatch" ? "v0.2.0" : "v0.1.0",
          isDraft: scenario === "draft",
          isPrerelease: scenario === "prerelease",
        })
      );
      git("init", "--initial-branch=main");
      writePackage(scenario === "tagged-version" ? "0.0.9" : "0.1.0");
      git("add", ".");
      git("commit", "-m", "chore: published baseline");
      if (scenario === "unrelated-tag") {
        git("checkout", "-b", "unrelated");
        writeFileSync(path.join(repository, "unrelated.txt"), "Not in main history\n");
        git("add", ".");
        git("commit", "-m", "chore: unrelated release tag");
      }
      if (scenario !== "missing-tag") {
        git("tag", "v0.1.0");
      }
      git("checkout", "main");
      if (scenario !== "unchanged") {
        writePackage("0.2.0");
        git("add", ".");
        git("commit", "-m", "feat: pending quality gates");
      }
      env.BEFORE_SHA = git("rev-parse", "HEAD");
      writePackage("0.1.0");
      writeFileSync(
        path.join(repository, ".release-please-manifest.json"),
        JSON.stringify({ ".": "0.1.0" })
      );
      git("add", ".");
      git("commit", "-m", "ci: initialize automation at the published baseline");
      env.GITHUB_SHA = git("rev-parse", "HEAD");
      const result = execute("bash", ["-c", candidateScript], repository, env);
      assert.equal(result.status === 0, accepted, result.stdout + result.stderr);
      assert.match(readFileSync(env.GITHUB_OUTPUT, "utf-8"), /^version=0\.1\.0\nstage=false\n$/u);
      assert.doesNotMatch(result.stdout, /stage=true/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
