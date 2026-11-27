import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const lintSource = /\.(?:[cm]?[jt]s|jsx|tsx)$/u;

const formatSource =
  /\.(?:[cm]?[jt]s|jsx|tsx|css|scss|less|html|jsonc?|mdx?|ya?ml|toml|graphql|gql|vue|svelte|astro)$/u;

const batchSize = 12_000;

/** @param {"oxlint" | "oxfmt"} tool - Installed Oxc tool. */
const toolEntry = (tool) =>
  path.join(path.dirname(require.resolve(`${tool}/package.json`)), "bin", tool);

/**
 * @param {string[]} files - Paths to pass to the tool.
 * @yields {string[]} A bounded set of arguments.
 */
const batches = function* batches(files) {
  /** @type {string[]} */
  let batch = [];
  let size = 0;

  for (const file of files) {
    const length = Buffer.byteLength(file) + 1;

    if (size + length > batchSize && batch.length > 0) {
      yield batch;
      batch = [];
      size = 0;
    }

    batch.push(file);
    size += length;
  }

  if (batch.length > 0) {
    yield batch;
  }
};

/** @param {string} root @param {"oxlint" | "oxfmt"} tool @param {string | undefined} config @param {string[]} files */
export const runTool = (root, tool, config, files) => {
  const matching = files.filter((file) =>
    (tool === "oxlint" ? lintSource : formatSource).test(file)
  );

  console.log(`${tool}: ${matching.length} selected files`);

  if (matching.length === 0) {
    return 0;
  }

  const args = tool === "oxfmt" ? ["--check"] : [];

  if (config !== undefined) {
    args.push("--config", config);
  }

  let status = 0;

  for (const batch of batches(matching)) {
    const result = spawnSync(process.execPath, [toolEntry(tool), ...args, "--", ...batch], {
      cwd: root,
      stdio: "inherit",
    });

    if (result.error !== undefined) {
      throw result.error;
    }

    status = Math.max(status, result.status ?? 1);
  }

  return status;
};
