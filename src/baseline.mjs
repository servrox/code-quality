import { z } from "zod";

/** @typedef {{ file: string, rule: string, message: string, value: number }} Finding */

const diagnosticSchema = z.object({
  filename: z.string().min(1),
  code: z.string().regex(/^[\w-]+\([\w-]+\)$/u),
  message: z.string(),
});

const lintReportSchema = z.object({
  diagnostics: z.array(diagnosticSchema),
  number_of_files: z.number().int().positive(),
});

const knipEntrySchema = z.object({ name: z.string().min(1) });

const knipReportSchema = z.object({
  issues: z.array(
    z
      .object({ file: z.string().min(1) })
      .catchall(z.array(z.union([knipEntrySchema, z.array(knipEntrySchema)])))
  ),
});

const baselineSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), z.array(z.number().nonnegative())),
});

const identitySchema = z.tuple([z.string(), z.string(), z.string()]);

// Uncountable syntax must be fixed or explicitly scoped in config, never grandfathered.
const countableSyntaxMessages = new Set([
  "Maximum 8 top-level functions per file.",
  "Maximum 5 explicit ESM exports per file.",
  "Maximum 5 properties in a CommonJS export object.",
]);

const numericRules = new Map([
  ["eslint(max-lines)", /too many lines \((?<metric>\d+)\)/u],
  ["eslint(max-lines-per-function)", /too many lines \((?<metric>\d+)\)/u],
  ["eslint(complexity)", /complexity of (?<metric>\d+)/u],
  ["sonarjs(cognitive-complexity)", /Complexity from (?<metric>\d+)/u],
  ["eslint(max-depth)", /nested too deeply \((?<metric>\d+)\)/u],
  ["eslint(max-params)", /too many parameters \((?<metric>\d+)\)/u],
  ["eslint(max-statements)", /too many statements \((?<metric>\d+)\)/u],
  ["eslint(max-nested-callbacks)", /nested callbacks \((?<metric>\d+)\)/u],
  ["eslint(max-classes-per-file)", /too many classes \((?<metric>\d+)\)/u],
]);

/** @param {unknown} input - Input to validate or compare. @returns {Finding[]} */
export const normalizeLint = (input) => {
  const report = lintReportSchema.parse(input);

  return report.diagnostics.map(({ filename, code, message }) => {
    const match = numericRules.get(code)?.exec(message);

    let normalized = match
      ? message.replace(match[0], match[0].replace(match[1], "<value>"))
      : message;

    if (code.startsWith("sonarjs(")) {
      normalized = normalized.replaceAll(/\bon line \d+\b/gu, "on line <location>");
    }

    return {
      file: filename.replaceAll("\\", "/"),
      rule: code,
      message: normalized,
      value: match ? Number(match[1]) : 1,
    };
  });
};

/** @param {unknown} input - Input to validate or compare. @returns {Finding[]} */
export const normalizeKnip = (input) => {
  const report = knipReportSchema.parse(input);
  /** @type {Finding[]} */
  const findings = [];

  for (const issue of report.issues) {
    const { file, ...categories } = issue;

    for (const [rule, entries] of Object.entries(categories)) {
      if (rule === "owners") {
        continue;
      }

      for (const entry of entries.flat()) {
        findings.push({ file, rule: `knip/${rule}`, message: entry.name, value: 1 });
      }
    }
  }

  return findings;
};

/** @param {readonly Finding[]} findings - Input to validate or compare. */
export const createBaseline = (findings) => {
  /** @type {Record<string, number[]>} */
  const entries = {};

  for (const finding of findings) {
    if (
      finding.rule === "eslint-js(no-restricted-syntax)" &&
      !countableSyntaxMessages.has(finding.message)
    ) {
      throw new Error(
        `Resolve uncountable module syntax before baselining: ${finding.file}: ${finding.message}`
      );
    }

    const key = JSON.stringify([finding.file, finding.rule, finding.message]);
    (entries[key] ??= []).push(finding.value);
  }

  return {
    version: 1,
    entries: Object.fromEntries(
      Object.entries(entries)
        .toSorted(([a], [b]) => a.localeCompare(b, "en"))
        .map(([key, values]) => [key, values.toSorted((a, b) => b - a)])
    ),
  };
};

/** @param {readonly Finding[]} findings - Input to validate or compare. @param {unknown} input - Input to validate or compare. */
export const findRegressions = (findings, input) => {
  const baseline = baselineSchema.parse(input);
  const actual = createBaseline(findings);
  /** @type {(Finding & { allowed: number })[]} */
  const regressions = [];

  for (const [key, values] of Object.entries(actual.entries)) {
    const budget = (baseline.entries[key] ?? []).toSorted((a, b) => b - a);
    const [file, rule, message] = identitySchema.parse(JSON.parse(key));

    for (const [index, value] of values.entries()) {
      if (index >= budget.length || value > budget[index]) {
        regressions.push({ file, rule, message, value, allowed: budget[index] ?? 0 });
      }
    }
  }

  return regressions;
};
