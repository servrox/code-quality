# npm consumer migration and release automation

Status: Approved

Implements [ADR 0002](../adrs/0002-automate-npm-release-staging.md).

## 1. Migrate the consumer

- Create an isolated worktree from `servrox/stark-mechas-v3/main`. Set its existing development dependency on `@servrox/code-quality` to the exact npm `latest` version. The version confirmed during planning was `0.1.0`.
- Regenerate `pnpm-lock.yaml` with pnpm `12.16.1`. Check that both the dependency specifier and resolution refer to npm. Preserve the consumer's quality baselines and tool pins.
- Run the frozen install, `pnpm check:lint-policy`, and `pnpm quality:check`. Open a PR to `main` using the verified personal GitHub account and inspect Dagger CI on the PR head. Leave the consumer PR open for review.

## 2. Automate releases

- Anchor GitHub release `v0.1.0` at `28e1af8201a2e06692caf1a51c38d8a024899fd2`. The published tarball's SHA-512 integrity matches the first successful staging run at that commit.
- Configure Release Please for a Node package, with `skip-github-release` enabled and its manifest initialized to `0.1.0`. A GitHub App installed only on `code-quality` creates and updates release PRs so the existing required checks run.
- A merged Release Please version update triggers npm staging on protected `main`. Read the version from the checked-out `package.json` and check it against the Release Please manifest. Preserve the exact tarball smoke test and SHA-256 verification before staging it through the `npm-release` environment.
- Keep the manual verification run. Retry a failed staging run for the same candidate after checking the npm staged list. A maintainer approves on npm with 2FA. Verify `latest`, a fresh install, and the npm README before creating the matching GitHub release at the verified commit.

## 3. Retire the first-release setup

- Remove `NPM_BOOTSTRAP_TOKEN` from the bootstrap environment and revoke the original token through the npm owner account.
- Remove the `bootstrap-stage` workflow path, `npm-bootstrap` environment, manual version input, and bootstrap instructions as part of the changeover. Retain `npm-release` and its stage-only npm Trusted Publisher.
- Remove the README's Git-SHA installation instructions once the consumer switches to npm. Update the release checklist and supersede ADR 0001 when the new workflow lands.

## Validation and completion

- Confirm that only a Release Please version transition on protected `main` can stage and that manual verification still works without npm credentials. Inspect exact-head CI and the staged archive digest.
- Check the npm Trusted Publisher binding for repository `servrox/code-quality`, workflow `publish-release.yml`, environment `npm-release`, and **Stage only**. The earlier trusted run failed with `ENEEDAUTH`. Validate the binding with the next real release and record 2FA approval separately from staging.
- Do not start another Release Please cycle while the preceding release is awaiting npm approval or its matching GitHub release.
