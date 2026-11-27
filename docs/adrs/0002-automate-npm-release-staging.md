# ADR 0002. Automate npm release staging

Status: Accepted

Supersedes [ADR 0001](0001-npm-release-with-github-actions.md).

## Context

The package is published on npm. The first release used a temporary token and a hand-entered version. Subsequent releases need one version decision and an auditable link between the reviewed commit, the tested archive, and the npm publication.

## Decision

Release Please prepares version and changelog updates in a release PR. Merging that PR on protected `main` triggers GitHub Actions to verify and stage the exact npm archive using a stage-only Trusted Publisher. An npm maintainer approves the staged archive with 2FA. The matching GitHub release records the verified commit after npm publication.

## Consequences

Reading `package.json` alone would remove the workflow input and leave version calculation to the maintainer. Direct npm publication would remove the separate approval step. The chosen flow automates the version and staging while retaining the maintainer's npm approval. Manual artifact verification remains available, and the first-release token can be retired.
