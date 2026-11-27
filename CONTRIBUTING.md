# Contributing

Use Node.js 24.15.0 or newer and pnpm 12.16.1.

```sh
pnpm install --frozen-lockfile
pnpm verify
```

1. Open an issue for a new preset, rule, or dependency policy so maintainers can discuss its consumer impact with you.
2. Submit a focused pull request. Explain which presets or consumers are affected and update the examples and changelog when behavior changes.
3. Run `pnpm verify` and include the result in the PR. The packed-consumer test checks runtime exports, plugin resolution, and strict TypeScript declarations.

The [security policy](SECURITY.md) describes private reporting.

## Release checklist

1. Preview the README banner on GitHub and merge the reviewed package version and changelog to protected `main`. In [Stage npm release](https://github.com/servrox/code-quality/actions/workflows/publish-release.yml), run `verify` with the exact version in `package.json`. Review the uploaded tarball and its `SHA256SUMS`.
2. Use `trusted-stage` on `main` for subsequent releases. Before the first such release, configure `servrox/code-quality`, `publish-release.yml`, and the `npm-release` environment as a stage-only trusted publisher in npm. Configure the GitHub environment to accept deployments from `main`. Complete the first trusted release within two days of creating the binding. Delete and recreate it if it expires.
3. Open npm's **Staged Packages** tab. Match the version and stage ID to the workflow summary, and confirm that the SHA-256 of the downloaded staged tarball matches the summary. Approve with 2FA. If the submission result is unclear, check the staged list before rerunning. Reject a bad stage before approval and publish a new version for fixes after approval.
4. Confirm that `npm view @servrox/code-quality dist-tags.latest` matches the released version. Check `npm view @servrox/code-quality@VERSION dist.integrity` with that version in place of `VERSION`. Check the banner on the npm package page and repeat the README quickstart in a fresh project. Create `vVERSION` and the matching GitHub release at the verified commit with the changelog entry as release notes.

### First release

For `0.1.0`, use `bootstrap-stage` in step 2. Restrict the `npm-bootstrap` environment to `main`. Set `NPM_BOOTSTRAP_TOKEN` there using a short-lived granular npm token with **Read and write (stage only)** package access and 2FA bypass disabled. Use the smallest scope npm offers that permits creating `@servrox/code-quality`.

npm can expose `0.0.0-stage` as a placeholder until the first stage is approved. After approving `0.1.0`, remove `NPM_BOOTSTRAP_TOKEN` from GitHub and revoke it in npm. Set up Trusted Publishing when the next release is ready.
