import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const toolProcess = fileURLToPath(new URL("tool-process.mjs", import.meta.url));

/** @param {"oxlint" | "oxfmt"} tool - Installed Oxc tool. */
const toolEntry = (tool) =>
  path.join(path.dirname(require.resolve(`${tool}/package.json`)), "bin", tool);

/** @param {string} root @param {"oxlint" | "oxfmt"} tool @param {string | undefined} config @param {string[]} files */
export const runTool = (root, tool, config, files) => {
  console.log(`${tool}: ${files.length} selected files`);

  if (files.length === 0) {
    return 0;
  }

  const args = ["--no-error-on-unmatched-pattern"];

  if (tool === "oxfmt") {
    args.push("--check");
  }

  if (config !== undefined) {
    args.push("--config", config);
  }

  // Keep leading `!` filenames literal for Oxfmt's glob parser.
  const operands = files.map((file) => `./${file}`);

  // Transport argv over stdin to preserve one warning budget without OS argument limits.
  const result = spawnSync(process.execPath, [toolProcess], {
    cwd: root,
    input: JSON.stringify({ args: [...args, "--", ...operands], entry: toolEntry(tool) }),
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  return result.status ?? 1;
};
