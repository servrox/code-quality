import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const manager = z.string().min(1).parse(process.env.npm_execpath);
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "code-quality-consumer-"));
const childEnvironment = { ...process.env };

delete childEnvironment.NODE_PATH;

/** @param {string[]} args - Arguments for the pinned package manager. @param {string} cwd - Isolated working directory. */
const run = (args, cwd) => {
  const result = spawnSync(manager, args, {
    cwd,
    env: childEnvironment,
    stdio: "inherit",
    timeout: 180_000,
  });

  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`Package verification failed: ${args.join(" ")}`);
  }
};

try {
  let [archive] = process.argv.slice(2);

  if (archive === undefined) {
    run(["pack", "--pack-destination", temporary], root);
    const packed = readdirSync(temporary).find((name) => name.endsWith(".tgz"));

    if (packed === undefined) {
      throw new Error("Package archive was not created");
    }

    archive = path.join(temporary, packed);
  }

  const manifest = z
    .object({
      peerDependencies: z.record(z.string(), z.string()),
      devDependencies: z.record(z.string(), z.string()),
    })
    .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")));

  const consumer = path.join(temporary, "consumer");
  cpSync(new URL("../tests/consumer/", import.meta.url), consumer, { recursive: true });
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "quality-package-consumer",
      private: true,
      type: "module",
      packageManager: "pnpm@12.16.1",
      devDependencies: {
        ...manifest.peerDependencies,
        "@servrox/code-quality": `file:${path.resolve(archive)}`,
        "@types/node": manifest.devDependencies["@types/node"],
        typescript: manifest.devDependencies.typescript,
      },
    })
  );

  run(["install", "--ignore-scripts", "--no-frozen-lockfile"], consumer);
  run(["exec", "node", "smoke.mjs"], consumer);
  run(["exec", "code-quality-check", "--help"], consumer);
  run(["exec", "code-quality-duplicates", "report", "--", "duplicate-scan.ts"], consumer);
  run(["exec", "tsc", "--project", "tsconfig.json"], consumer);
  console.log("Packed consumer runtime and strict TypeScript checks passed.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
