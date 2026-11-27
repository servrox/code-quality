# Changelog

## Unreleased

- Duplicate checks default to zero detected duplication when run without a baseline. Setup guidance starts with fixing the findings and requires maintainer approval for baseline adoption.

## 0.1.0

- Shared Ultracite and Oxc linting and formatting presets for TypeScript projects, with optional React and Playwright lint configuration.
- Duplication and dependency rules, runtime-cycle detection, and diagnostics baseline helpers for incremental adoption.
- Public npm packaging with strict consumer type checks, GitHub Actions staging, and Apache-2.0 licensing.
- Updated ESLint and SonarJS to use a patched `minimatch` dependency.
