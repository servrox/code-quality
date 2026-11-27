# @servrox/code-quality

Shared Ultracite/Oxc policy for multiple projects.

- Reusable presets, exact tool versions and fixture tests live here.
- Each project owns its paths, framework selection, entrypoints and migration baselines.
- Upstream rules provide the diagnostics; no custom lint plugin or second ESLint runner.
- Ready-to-run JavaScript and declarations; no install, prepare or build lifecycle.

## Install in a project

Use an approved **full 40-character Git commit SHA** in place of `COMMIT_SHA`:

```sh
pnpm add -D '@servrox/code-quality@git+https://github.com/servrox/code-quality.git#COMMIT_SHA' \
  ultracite@8.2.1 oxlint@1.93.0 oxfmt@0.78.0 oxlint-tsgolint@7.0.2007
```

Commit the manifest and lockfile; CI installs with `pnpm install --frozen-lockfile`. The public GitHub source requires no registry or GitHub token.

Use a commit retained in the repository's history. For the initial linked PRs, merge the package PR with a merge commit before merging the consumer PR. If the package PR is squash-merged instead, update the consumer to the resulting main commit and regenerate its lockfile before merging it.

Git pins select source content. pnpm additionally records archive integrity; GitHub may regenerate archive compression. An integrity failure requires a reviewed lockfile update, never disabling integrity verification.

The package currently keeps `private: true` and `license: "UNLICENSED"`. It is not published to npm. A future approved registry release can use the same package name and imports; consumers then replace the Git specifier with an exact version. Dependencies retain their own licenses.

## Configure a project

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

`normalizeLint` validates Oxlint JSON; `normalizeKnip` validates Knip 6 JSON. `createBaseline` groups findings by file, rule and normalized message. `findRegressions` compares the current values with committed allowances.

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

## Updates

- Change rules/tool versions in this repository through a reviewed PR.
- Treat stricter defaults and removed exports as consumer-visible policy changes.
- Run `pnpm verify` and inspect the packed file list.
- Update each consumer's Git SHA and lockfile in its own PR.
- Run that project's existing lint, compiler, quality and CI checks.
- Review and prune migration baselines in the consumer; do not copy them here.

No automatic registry publication or cross-project upgrades are configured.
