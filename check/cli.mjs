#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import { regularFiles, repositoryRoot, selectFiles } from "./git-files.mjs";
import { runTool } from "./run-tools.mjs";

const usage =
  "Usage: code-quality-check [--scope all|staged|unstaged|changed] [--check lint|format|both] [--base <git-ref>] [--oxlint-config <path>] [--oxfmt-config <path>] [-- <git-pathspec>...]";

const scopes = z.enum(["all", "staged", "unstaged", "changed"]);
const checks = z.enum(["lint", "format", "both"]);

/** @param {string | undefined} config - Optional config path supplied by the caller. */
const configPath = (config) => (config === undefined ? undefined : path.resolve(config));

const main = () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: "string" },
      check: { default: "both", type: "string" },
      help: { short: "h", type: "boolean" },
      "oxfmt-config": { type: "string" },
      "oxlint-config": { type: "string" },
      scope: { default: "changed", type: "string" },
    },
  });

  if (values.help === true) {
    console.log(usage);

    return 0;
  }

  const scope = scopes.parse(values.scope);
  const check = checks.parse(values.check);

  if (values.base !== undefined && scope !== "changed") {
    throw new Error("--base applies to --scope changed only.");
  }

  const root = repositoryRoot(process.cwd());

  const files = regularFiles(
    root,
    selectFiles({ base: values.base, pathspecs: positionals, root, scope })
  );

  const lint =
    check === "format" ? 0 : runTool(root, "oxlint", configPath(values["oxlint-config"]), files);

  const format =
    check === "lint" ? 0 : runTool(root, "oxfmt", configPath(values["oxfmt-config"]), files);

  return Math.max(lint, format);
};

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
