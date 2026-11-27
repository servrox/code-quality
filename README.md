# @servrox/code-quality

![Abstract code with diagnostic markers and a dependency graph](./docs/assets/code-quality-banner.svg)

[![npm version](https://img.shields.io/npm/v/%40servrox%2Fcode-quality)](https://www.npmjs.com/package/@servrox/code-quality) [![Package checks](https://github.com/servrox/code-quality/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/servrox/code-quality/actions/workflows/ci.yml) [![Apache-2.0 license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/servrox/code-quality/blob/main/LICENSE)

Share linting, formatting, duplication, and dependency rules across TypeScript projects. The package provides versioned Ultracite and Oxc presets tested together. Each consumer owns its framework selection, paths, and migration baselines.

## Quick start

Use Node.js **24.15.0 or newer**. Once `0.1.0` is available on npm, install it with the matching tools.

```sh
pnpm add -D -E @servrox/code-quality@0.1.0 \
  ultracite@8.2.1 oxlint@1.93.0 oxfmt@0.78.0 oxlint-tsgolint@7.0.2007
```

<details>
<summary>Install from a reviewed Git commit</summary>

Replace `COMMIT_SHA` with a full 40-character SHA retained in the public repository.

```sh
pnpm add -D -E '@servrox/code-quality@git+https://github.com/servrox/code-quality.git#COMMIT_SHA' \
  ultracite@8.2.1 oxlint@1.93.0 oxfmt@0.78.0 oxlint-tsgolint@7.0.2007
```

Review lockfile updates if GitHub regenerates archive compression and the archive integrity changes.

</details>

### Configure a project

`oxlint.config.ts`:

```ts
import antiSlop from "@servrox/code-quality/oxlint/anti-slop";
import core from "@servrox/code-quality/oxlint/core";
import modularity from "@servrox/code-quality/oxlint/modularity";
import strict from "@servrox/code-quality/oxlint/strict";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [core, strict, modularity, antiSlop],
  env: { node: true, browser: false },
  options: {
    typeAware: true,
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
  },
  ignorePatterns: [...(core.ignorePatterns ?? []), "**/_generated/**"],
});
```

`oxfmt.config.ts`:

```ts
import shared from "@servrox/code-quality/oxfmt";
import { defineConfig } from "oxfmt";

export default defineConfig({
  ...shared,
  ignorePatterns: [...(shared.ignorePatterns ?? []), "pnpm-lock.yaml"],
});
```

Projects keep root-only Oxlint options at their root. Environments, ignores and framework-specific paths remain explicit in each consumer. React applies only to React workspaces. Enable other framework tooling when the project adopts it.

For an existing codebase, introduce additional policies separately from an already-passing core gate. The optional baseline helpers support measured adoption; this repository contains **no application baselines**.

Run `pnpm exec ultracite check` from the project root. Commit the manifest and lockfile with your project configs. Use `pnpm install --frozen-lockfile` in CI.

### Set up with a coding agent

Use the [Agent Skills repository](https://github.com/stark-ai-de/agent-skills) for installation and usage instructions for your agent. Give the agent this setup prompt from your project root.

> Set up `@servrox/code-quality` using the [package quick start](https://github.com/servrox/code-quality#quick-start). Inspect the existing lint and format configs, package scripts, and CI first. Use an exact public npm version, or a reviewed full Git SHA if the version is unavailable. Wire the presets into the existing config, run the project's checks, and report any existing failures before expanding the enforced rules.

## Public exports

| Export                | Responsibility                                             |
| --------------------- | ---------------------------------------------------------- |
| `/oxlint/core`        | Ultracite core                                             |
| `/oxlint/strict`      | Native complexity/size rules, selected Unicorn and SonarJS |
| `/oxlint/modularity`  | File length and syntax-based function/export budgets       |
| `/oxlint/anti-slop`   | Ultracite's bundled Anti-Slop                              |
| `/oxlint/react`       | Ultracite React rules                                      |
| `/oxlint/playwright`  | Native Ultracite Playwright compatibility overrides        |
| `/oxfmt`              | Ultracite formatting, 100-column width                     |
| `/jscpd`              | Duplicate-detection defaults, 3% target                    |
| `/dependency-cruiser` | Runtime-cycle policy and runtime resolution defaults       |
| `/baseline`           | Validated reports and non-increasing diagnostic budgets    |
| `/package.json`       | Version and export metadata                                |

The Playwright export is the limited native Ultracite preset, not the complete `eslint-plugin-playwright` rule set. Solid, TanStack, Jest, Vitest and Storybook are not forced on unrelated consumers.

Dependency Cruiser is an **optional peer**. Install `dependency-cruiser@18.9.0` only when using that export. Its analyzer requires a supported TypeScript compiler API; projects using TypeScript 7.0 can supply TypeScript 6.0.3 to that tool through pnpm `packageExtensions`, as this repository does for tests.

When enforcing application imports against external tooling, retain dependency edges into `node_modules` with `doNotFollow`; excluding those targets completely would remove the edges that the boundary rule needs.

Runtime-cycle analysis excludes erased type-only imports **before** detecting cycles. Filtering a reported cycle afterwards can miss a runtime cycle when shorter type-only cycles overlap it. Supply the project's actual TypeScript configuration: the graph follows its emit semantics. For native TypeScript type-stripping runtimes, use `verbatimModuleSyntax: true` so unused value imports remain runtime edges.

## Limits and counting

| Metric                                                  | Default |
| ------------------------------------------------------- | ------: |
| Physical file lines, including comments and blank lines |     300 |
| Test/spec file lines                                    |     500 |
| Top-level function declarations/bindings                |       8 |
| Explicit ESM exports                                    |       5 |
| Properties in an inline CommonJS export object          |       5 |
| Function lines, excluding comments and blank lines      |      50 |
| Cyclomatic / cognitive complexity                       |  8 / 10 |
| Block nesting / nested callbacks                        |   3 / 3 |
| Parameters / statements per function                    |  4 / 20 |
| Classes per file                                        |       1 |

Function counting recognizes declarations with bodies, direct arrow/function bindings, exported declarations, default functions and inline CommonJS export functions, including TypeScript `export =` functions. One direct `as`, `satisfies` or non-null wrapper is supported for bindings and ESM default expressions. Nested callbacks, methods, arbitrary aliases and factory-returned implementations are outside this syntax policy.

Value, type, default and namespace ESM exports count. Grouped declarations, specifier lists, destructuring and wildcard exports are marked outside explicit consumer-owned entrypoints. CommonJS supports inline export objects and functions in both `module.exports` and TypeScript `export =` forms; spreads, incremental assignments, indirect values and common mutation helpers are marked. Dot and literal bracket spellings of the configured mutation helpers are checked. Arbitrary runtime mutation is not inferred.

These limits are policy choices. Each project must still review cohesion and intentional public API boundaries.

## Baseline helpers

`normalizeLint` validates Oxlint JSON; `normalizeKnip` validates Knip 6 JSON. `createBaseline` groups findings by file, rule and normalized message. `findRegressions` compares the current values with committed allowances. Uncountable module syntax is reported with an allowance of zero alongside other regressions. Baseline creation rejects that syntax.

Knip member and catalog identities retain their declared owner, for example `First["Unused"]`; an allowance for one enum, namespace or catalog cannot cover a same-named member in another. Export/type identities use the declaration's name: their reported namespace is a consumer-local import alias, so changing that alias does not change the budget.

- New groups or occurrences fail.
- Increased numeric metrics fail even when the diagnostic count stays constant.
- Source-line movement in supported Sonar messages is normalized.
- Within an identical group, metrics are compared in descending order.
- Improvements become permanent when the consumer prunes and commits its baseline.
- Uncountable module syntax cannot be grandfathered; fix it or scope a deliberate entrypoint exception in the project.
- Missing, malformed or unclassified reports fail closed.

Baseline storage, command orchestration and migration approval remain with each consumer. Native jscpd/Dependency Cruiser baselines likewise stay project-local.

## Develop and verify

Requires Node **>=24.15.0** and pnpm **12.16.1**.

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`verify` runs:

1. Core/type-aware lint, formatting and additional policy checks.
2. TypeScript and exported-file checks.
3. Real Oxlint boundary fixtures, baseline tests and runtime-cycle regression tests.
4. `pnpm pack`, installation outside the checkout, all runtime exports, actual ESLint/SonarJS/Anti-Slop plugin execution and strict consumer types.

Implementation files are explicit TypeScript roots; sibling declaration files are excluded from glob discovery to prevent them from hiding JavaScript sources. Imported declarations remain type-checked, including the strict packed consumer.

The install smoke test clears `NODE_PATH` and checks that source tests, development scripts and repository configs are absent from the installed package. CI uses pinned actions and runs on Node 24.15.0 and Node 26.

## Contributing and security

See the [contribution guide](https://github.com/servrox/code-quality/blob/main/CONTRIBUTING.md) for changes and release steps, the [changelog](https://github.com/servrox/code-quality/blob/main/CHANGELOG.md) for consumer-visible changes, and the [security policy](https://github.com/servrox/code-quality/blob/main/SECURITY.md) for private reporting.

This project is licensed under [Apache-2.0](https://github.com/servrox/code-quality/blob/main/LICENSE).
