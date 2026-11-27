#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { z } from "zod";

import preset from "./core.json" with { type: "json" };

const usage =
  "Usage: code-quality-duplicates <check|report|update-baseline> " +
  "[--baseline <file>] [--threshold <0..100>] [--ignore <glob> ...] -- <roots...>";

const modes = z.enum(["check", "report", "update-baseline"]);

const defaults = z
  .looseObject({ threshold: z.number(), ignore: z.array(z.string()) })
  .parse(preset);

const thresholdWithoutBaseline = {
  check: 0,
  report: defaults.threshold,
  "update-baseline": defaults.threshold,
};

const baselineSchema = z.object({
  version: z.literal(1),
  fingerprints: z.record(z.string().regex(/^[0-9a-f]{16}$/u), z.number().int().positive()),
});

const runnerManifest = z.object({ bin: z.object({ jscpd: z.string().min(1) }) });

/** @param {string} file - Native jscpd baseline file. */
const readBaseline = (file) => {
  try {
    baselineSchema.parse(JSON.parse(readFileSync(file, "utf-8")));
  } catch (error) {
    throw new Error(`Missing or invalid jscpd baseline: ${file}`, { cause: error });
  }
};

const resolveRunner = () => {
  let manifest;

  try {
    manifest = new URL(import.meta.resolve("jscpd/package.json"));
  } catch (error) {
    throw new Error("Install the jscpd peer dependency to run this command.", { cause: error });
  }

  const { bin } = runnerManifest.parse(JSON.parse(readFileSync(manifest, "utf-8")));

  return fileURLToPath(new URL(bin.jscpd, manifest));
};

/**
 * @param {string | undefined} value - Optional total limit.
 * @param {z.infer<typeof modes>} mode - Scan mode.
 * @param {string | undefined} baseline - Explicit baseline path.
 */
const parseThreshold = (value, mode, baseline) => {
  const fallback = baseline === undefined ? thresholdWithoutBaseline[mode] : defaults.threshold;
  const threshold = Number(value ?? fallback);

  if (value?.trim() === "" || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error("--threshold must be a percentage between 0 and 100.");
  }

  return threshold;
};

const parseInvocation = () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      baseline: { type: "string" },
      help: { type: "boolean", short: "h" },
      ignore: { type: "string", multiple: true, default: [] },
      threshold: { type: "string" },
    },
  });

  if (values.help === true) {
    return null;
  }

  const mode = modes.parse(positionals[0]);
  const roots = z.array(z.string().min(1)).min(1).parse(positionals.slice(1));

  const baseline =
    values.baseline === undefined
      ? undefined
      : path.resolve(z.string().min(1).parse(values.baseline));

  if (mode === "update-baseline" && baseline === undefined) {
    throw new Error(`${mode} requires --baseline <file>.`);
  }

  if (mode === "report" && baseline !== undefined) {
    throw new Error("report does not use a baseline.");
  }

  const threshold = parseThreshold(values.threshold, mode, baseline);

  return { mode, roots, threshold, baseline, ignore: values.ignore };
};

/** @typedef {NonNullable<ReturnType<typeof parseInvocation>>} Invocation */

/**
 * @param {Invocation} invocation - Parsed scan settings.
 * @param {string} directory - Isolated configuration directory.
 */
const runScan = ({ mode, roots, threshold, baseline, ignore }, directory) => {
  const config = path.join(directory, "jscpd.json");

  writeFileSync(
    config,
    JSON.stringify({ ...defaults, threshold, baseline, ignore: [...defaults.ignore, ...ignore] })
  );

  const args = [resolveRunner(), "--config", config, "--fail-on-empty", "--no-tips"];

  if (mode === "check" && baseline !== undefined) {
    readBaseline(baseline);
    console.log(`Duplicate limits: ${threshold}% total and 0 new clones.`);
    args.push("--fail-on-new-clones", "0");
  } else if (mode === "update-baseline") {
    args.push("--update-baseline");
  }

  const result = spawnSync(process.execPath, [...args, "--", ...roots], { stdio: "inherit" });

  if (result.status === null) {
    throw result.error ?? new Error(`jscpd was interrupted (${result.signal}).`);
  }

  return result.status;
};

/**
 * @param {Invocation} invocation - Parsed baseline update.
 * @param {string} directory - Staging directory on the baseline's filesystem.
 */
const updateBaseline = (invocation, directory) => {
  const { baseline } = invocation;
  const candidate = path.join(directory, "baseline.json");
  const destination = lstatSync(baseline, { throwIfNoEntry: false });

  if (destination !== undefined && destination.isSymbolicLink()) {
    throw new Error("The jscpd baseline is a symbolic link. Update its target directly.");
  }

  if (existsSync(baseline)) {
    copyFileSync(baseline, candidate);
  }

  const status = runScan({ ...invocation, baseline: candidate }, directory);

  if (status === 0) {
    readBaseline(candidate);
    renameSync(candidate, baseline);
  }

  return status;
};

/** @param {Invocation} invocation - Parsed CLI settings. */
const run = (invocation) => {
  const updating = invocation.mode === "update-baseline";
  const parent = updating ? path.dirname(invocation.baseline) : tmpdir();
  const directory = mkdtempSync(path.join(parent, ".quality-jscpd-"));

  try {
    return updating ? updateBaseline(invocation, directory) : runScan(invocation, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

try {
  const invocation = parseInvocation();

  if (invocation === null) {
    console.log(usage);
  } else {
    process.exitCode = run(invocation);
  }
} catch (error) {
  console.error("code-quality-duplicates:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
