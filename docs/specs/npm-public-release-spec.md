# Public release of `@servrox/code-quality` 0.1.0

## Goal

A new consumer can install `@servrox/code-quality@0.1.0`, run the documented configuration, and find the Agent Skills setup workflow. [ADR 0001](../adrs/0001-npm-release-with-github-actions.md) defines publication.

## README and package

- Lead with the package purpose, linked npm, CI, and Apache-2.0 badges, and an exact-version quickstart. Keep the Git-SHA install path, preset reference, and baseline guidance.
- Use the maintainer-supplied banner at `docs/assets/code-quality-banner.svg`. Verify the image on GitHub and npm.
- Recheck the companion Agent Skills PR before finalizing setup. Link the canonical skill and verify its install command after merge. Until then, link the catalog and provide a copyable setup prompt.
- Add an Apache-2.0 license, contribution and security reporting guidance, and a changelog. Enable GitHub private vulnerability reporting and require the two existing CI checks on `main`.
- Publish the package under its existing name with public access. Preserve version 0.1.0, the exports, Node engine floor, and peer requirements.

## Workflow and recovery

1. Add `.github/workflows/publish-release.yml` with an expected version and three modes. Default to `verify`, with explicit `bootstrap-stage` and `trusted-stage` modes. Allow staging from protected `main` of the canonical repository. Match the expected version against `package.json`. Use GitHub-hosted runners and SHA-pinned actions.
2. Install from the frozen lockfile, run `pnpm check` and `pnpm test`, and create one tarball with `npm pack`. Extend `pnpm test:package` to accept that tarball and keep its existing default. Upload the checked archive and digest. Check the digest again in the staging job.
3. Scope `NPM_BOOTSTRAP_TOKEN` to the bootstrap environment and staging step. Give only the trusted staging job `id-token: write`. The verification job uses read-only GitHub permissions. Record the stage ID, version, commit, and archive digest in the run summary.
4. Review and approve 0.1.0 on npm with 2FA. Remove the bootstrap secret and revoke the token. When the next release is ready, configure `publish-release.yml` and the `npm-release` environment as the stage-only trusted publisher and complete the first trusted release within two days. Inspect staged packages before retrying after an uncertain submission. Reject a bad stage before approval. Ship post-release corrections under a new version.

## Validation

- Run `pnpm verify` and the packed-consumer smoke test against the exact npm release archive. Confirm that the tarball includes the license and public exports.
- Verify that PRs, other refs, version mismatches, and verification-only runs cannot stage.
- After maintainer approval, check `npm view @servrox/code-quality@0.1.0` and confirm `latest` points to 0.1.0. Run the README example in a fresh project using the registry package. Create the matching GitHub release from the verified commit after those checks.

The source review at `25946cc` found the two-version CI matrix and packed-consumer smoke test. npm's staging and trusted-publishing documentation supports the selected flow. The public package lookup returned `404`, and the terminal npm session returned `401`. The npm account owner supplies the bootstrap credential and approves the stage.

## Codex handoff

Read this spec and ADR 0001. Prepare and validate the README, public metadata, and workflow first. Continue into live staging and release with the relevant authorization. Report local checks, GitHub Actions results, npm publication, and fresh-consumer verification separately.
