import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

/** @typedef {"all" | "changed" | "staged" | "unstaged"} Scope */

/** @param {string} cwd @param {string[]} args */
const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });

/** @param {string} cwd - Directory inside the Git worktree. */
export const repositoryRoot = (cwd) => git(cwd, ["rev-parse", "--show-toplevel"]).trimEnd();

/** @param {string} output - NUL-delimited Git paths. */
const pathsFrom = (output) => output.split("\0").filter((file) => file !== "");

/** @param {string} root @param {string} base */
const baseCommit = (root, base) =>
  git(root, ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`]).trim();

/** @param {string} root @param {string[]} args @param {string[]} pathspecs */
const changed = (root, args, pathspecs) =>
  pathsFrom(
    git(root, [
      "diff",
      "--no-renames",
      "--name-only",
      "--diff-filter=ACMTU",
      "-z",
      ...args,
      "--",
      ...pathspecs,
    ])
  );

/** @param {string} root @param {string[]} staged @param {string[]} pathspecs */
const requireIndexContent = (root, staged, pathspecs) => {
  const unstaged = new Set(
    pathsFrom(git(root, ["diff", "--no-renames", "--name-only", "-z", "--", ...pathspecs]))
  );

  const mismatches = staged.filter((file) => unstaged.has(file));

  if (mismatches.length > 0) {
    const files = mismatches.map((file) => JSON.stringify(file)).join(", ");

    throw new Error(
      `Staged paths also have unstaged changes: ${files}. Use --scope changed to check the working copy, or make the index and working copy agree for these paths.`
    );
  }
};

/** @param {{ root: string, scope: Scope, base?: string, pathspecs: string[] }} options - Git selection arguments. */
export const selectFiles = ({ root, scope, base = "HEAD", pathspecs }) => {
  if (scope === "all") {
    return pathsFrom(
      git(root, [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        ...pathspecs,
      ])
    );
  }

  if (scope === "staged") {
    const staged = changed(root, ["--cached"], pathspecs);

    requireIndexContent(root, staged, pathspecs);

    return staged;
  }

  const revision = scope === "changed" ? [baseCommit(root, base)] : [];

  const untracked = pathsFrom(
    git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...pathspecs])
  );

  return [...changed(root, revision, pathspecs), ...untracked];
};

/** @param {string} root @param {string[]} files */
export const regularFiles = (root, files) => {
  const canonicalRoot = realpathSync(root);

  return [...new Set(files)]
    .filter((file) => {
      const candidate = path.resolve(root, file);

      return (
        lstatSync(candidate, { throwIfNoEntry: false })?.isFile() === true &&
        realpathSync(candidate).startsWith(canonicalRoot + path.sep)
      );
    })
    .toSorted();
};
