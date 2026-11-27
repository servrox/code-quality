import type { IConfiguration } from "dependency-cruiser";
import type { OxfmtConfig } from "oxfmt";
import type { OxlintConfig } from "oxlint";
import architecture from "@servrox/code-quality/dependency-cruiser";
import createRuntimeConfig from "@servrox/code-quality/dependency-cruiser/create-runtime-config";
import runtime from "@servrox/code-quality/dependency-cruiser/runtime";
import duplicates from "@servrox/code-quality/jscpd" with { type: "json" };
import format from "@servrox/code-quality/oxfmt";
import antiSlop from "@servrox/code-quality/oxlint/anti-slop";
import core from "@servrox/code-quality/oxlint/core";
import modularity, { functionRestrictions, exportRestrictions } from "@servrox/code-quality/oxlint/modularity";
import playwright from "@servrox/code-quality/oxlint/playwright";
import react from "@servrox/code-quality/oxlint/react";
import strict from "@servrox/code-quality/oxlint/strict";
import { createBaseline, findRegressions, normalizeKnip, normalizeLint, type Finding } from "@servrox/code-quality/baseline";

const presets: OxlintConfig[] = [core, strict, modularity, antiSlop, react, playwright];
const formatter: OxfmtConfig = format;
const graph: IConfiguration = { ...architecture, forbidden: [...runtime.forbidden] };
const generatedGraphs: IConfiguration[] = [
  createRuntimeConfig(),
  createRuntimeConfig({ baseDir: process.cwd() }),
];
const findings: Finding[] = normalizeLint({ number_of_files: 1, diagnostics: [] });
const baseline = createBaseline(findings);
const version: 1 = baseline.version;
const regressions = findRegressions(normalizeKnip({ issues: [] }), baseline);
const threshold: number = duplicates.threshold;

void [presets, formatter, graph, generatedGraphs, version, regressions, threshold, functionRestrictions, exportRestrictions];
