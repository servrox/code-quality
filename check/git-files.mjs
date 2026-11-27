import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

/** @typedef {"all" | "changed" | "staged" | "unstaged"} Scope */

/** @param {string} cwd @param {string[]} args @param {number[]} [successStatuses] */
const git = (cwd, args, successStatuses = [0]) => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status === null || !successStatuses.includes(result.status)) {
    throw new Error(result.stderr.trim() || "Git did not complete.");
  }

  return result.stdout;
};

/** @param {string} cwd - Directory inside the Git worktree. */
export const repositoryRoot = (cwd) => git(cwd, ["rev-parse", "--show-toplevel"]).slice(0, -1);

/** @param {string} output - NUL-delimited Git paths. */
const pathsFrom = (output) => output.split("\0").filter((file) => file !== "");

/** @param {string} root @param {string | undefined} base */
const baseCommit = (root, base) => {
  const revision = git(
    root,
    [
      "rev-parse",
      "--verify",
      ...(base === undefined ? ["--quiet"] : []),
      "--end-of-options",
      `${base ?? "HEAD"}^{commit}`,
    ],
    base === undefined ? [0, 1] : [0]
  ).trim();

  return revision === "" ? undefined : revision;
};

// Numstat compares contents even with external diff drivers disabled, avoiding
// stat-only changes without refreshing the index. Renames stay disabled so each
// NUL-delimited record contains two counts followed by one literal path.
/** @param {string} root @param {string[]} args @param {string[]} pathspecs @param {boolean} [includeDeleted] */
const changed = (root, args, pathspecs, includeDeleted = false) =>
  pathsFrom(
    git(
      root,
      [
        "-c",
        "diff.autoRefreshIndex=false",
        "diff",
        "--no-renames",
        "--no-ext-diff",
        "--no-textconv",
        "--numstat",
        "--exit-code",
        ...(includeDeleted ? [] : ["--diff-filter=ACMTU"]),
        "-z",
        ...args,
        "--",
        ...pathspecs,
      ],
      [0, 1]
    )
  ).map((record) => record.split("\t").slice(2).join("\t"));

/** @param {string} root @param {string[]} staged @param {string[]} pathspecs */
const requireIndexContent = (root, staged, pathspecs) => {
  const hidden = new Set(
    pathsFrom(git(root, ["ls-files", "-v", "-z", "--", ...pathspecs]))
      .filter((entry) => /^[a-zS] /u.test(entry))
      .map((entry) => entry.slice(2))
  );

  const flagged = staged.filter((file) => hidden.has(file));

  if (flagged.length > 0) {
    const files = flagged.map((file) => JSON.stringify(file)).join(", ");

    throw new Error(
      `Cannot verify staged content for paths marked assume-unchanged or skip-worktree: ${files}. Clear these index flags before checking staged content.`
    );
  }

  const unstaged = new Set(changed(root, [], pathspecs, true));

  const mismatches = staged.filter((file) => unstaged.has(file));

  if (mismatches.length > 0) {
    const files = mismatches.map((file) => JSON.stringify(file)).join(", ");

    throw new Error(
      `Staged paths also have unstaged changes: ${files}. Use --scope changed to check the working copy, or make the index and working copy agree for these paths.`
    );
  }
};

/** @param {{ root: string, scope: Scope, base?: string, pathspecs: string[] }} options - Git selection arguments. */
export const selectFiles = ({ root, scope, base, pathspecs }) => {
  const revision = scope === "changed" ? baseCommit(root, base) : undefined;

  if (scope === "all" || (scope === "changed" && revision === undefined)) {
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

  const untracked = pathsFrom(
    git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...pathspecs])
  );

  return [...changed(root, revision === undefined ? [] : [revision], pathspecs), ...untracked];
};

/** @param {string} root @param {string[]} files */
export const regularFiles = (root, files) => {
  const canonicalRoot = realpathSync(root);

  return [...new Set(files)]
    .filter((file) => {
      const candidate = path.resolve(root, file);
      let directory = canonicalRoot;

      for (const component of file.split("/").slice(0, -1)) {
        directory = path.join(directory, component);

        if (lstatSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) {
          return false;
        }
      }

      return (
        lstatSync(candidate, { throwIfNoEntry: false })?.isFile() === true &&
        realpathSync(candidate).startsWith(canonicalRoot + path.sep)
      );
    })
    .toSorted();
};
