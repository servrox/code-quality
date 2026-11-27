# Changelog

## 0.2.0

- Add the optional jscpd CLI with a 3% total duplication limit, zero new clones, and explicit baseline updates.
- Add an opt-in Dependency Cruiser runtime preset for cycles, unresolved imports, undeclared dependencies, and imports of the quality package.
- Reject unknown npm dependency classifications and avoid false declaration errors for Node package-import aliases; unresolved-import and tooling-boundary checks still apply to aliases.
- Add a runtime configuration factory that keeps the analysis directory and linked-package boundary aligned when scanning a project from another working directory.

## 0.1.0

- Shared Ultracite and Oxc linting and formatting presets for TypeScript projects, with optional React and Playwright lint configuration.
- Duplication and dependency rules, runtime-cycle detection, and diagnostics baseline helpers for incremental adoption.
- Public npm packaging with strict consumer type checks, GitHub Actions staging, and Apache-2.0 licensing.
- Updated ESLint and SonarJS to use a patched `minimatch` dependency.
