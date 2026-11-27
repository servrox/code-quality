# Changelog

## [0.2.0](https://github.com/servrox/code-quality/compare/v0.1.0...v0.2.0) (2026-11-27)


### Features

* add Git-scoped quality checks ([#11](https://github.com/servrox/code-quality/issues/11)) ([32fdaed](https://github.com/servrox/code-quality/commit/32fdaedf1a8200a64e60566c2fad327ef61fe157))
* add shared duplicate and runtime dependency gates ([#5](https://github.com/servrox/code-quality/issues/5)) ([a066c68](https://github.com/servrox/code-quality/commit/a066c68188d1a6adde07213d70be4e9a22378b4a))
* default duplicate checks to zero without a baseline ([61af699](https://github.com/servrox/code-quality/commit/61af69967c608f4af89c8a7c596cb3d217ea8e83))


### Bug Fixes

* reject symlink baseline updates ([#9](https://github.com/servrox/code-quality/issues/9)) ([01aada4](https://github.com/servrox/code-quality/commit/01aada47e1642cc6e2052fab2315d957f7243019))
* **release:** integrate quality gates at the published baseline ([5ca5136](https://github.com/servrox/code-quality/commit/5ca51367c61ee95812ed0f6c00568cc16a823258))
* **release:** validate the candidate's manifest history ([2c46fe6](https://github.com/servrox/code-quality/commit/2c46fe625a59c5f3979b8ea88e75b52553d80ac9))

## 0.1.0

- Shared Ultracite and Oxc linting and formatting presets for TypeScript projects, with optional React and Playwright lint configuration.
- Duplication and dependency rules, runtime-cycle detection, and diagnostics baseline helpers for incremental adoption.
- Public npm packaging with strict consumer type checks, GitHub Actions staging, and Apache-2.0 licensing.
- Updated ESLint and SonarJS to use a patched `minimatch` dependency.
