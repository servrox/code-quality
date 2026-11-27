import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeLint } from "../src/baseline.mjs";

const oxlintPackage = fileURLToPath(import.meta.resolve("oxlint/package.json"));
const oxlint = path.join(path.dirname(oxlintPackage), "bin/oxlint");

/** @param {string} source - Input to validate or compare. @param {string} filename - Input to validate or compare. @param {string} preset - Input to validate or compare. */
export const lintFixture = (source, filename = "example.ts", preset = "modularity") => {
  const directory = mkdtempSync(path.join(tmpdir(), "code-quality-"));
  const config = new URL(`../oxlint/${preset}.mjs`, import.meta.url).href;

  try {
    const target = path.join(directory, filename);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
    writeFileSync(
      path.join(directory, "oxlint.config.mjs"),
      `import preset from ${JSON.stringify(config)};\n` +
        `export default { categories: { correctness: "off" }, extends: [preset] };\n`
    );

    const result = spawnSync(
      process.execPath,
      [oxlint, "--config", "oxlint.config.mjs", "--format=json", filename],
      { cwd: directory, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, timeout: 15_000 }
    );

    if (
      result.error ||
      result.signal ||
      result.status === null ||
      ![0, 1].includes(result.status)
    ) {
      throw result.error ?? new Error(result.stderr || result.stdout || "Oxlint did not complete");
    }

    return normalizeLint(JSON.parse(result.stdout));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
