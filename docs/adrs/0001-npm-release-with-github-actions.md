# ADR 0001. Stage npm releases from GitHub Actions

Status: Superseded by [ADR 0002](0002-automate-npm-release-staging.md)

## Context

The public project distributes its package through Git-SHA pins and is preparing its first npm release. A release needs an auditable link between reviewed source, the tested tarball, and the version consumers install.

## Decision

Use a manually dispatched GitHub Actions workflow on protected `main` to verify and stage a single tarball. An npm maintainer approves the stage with 2FA. Bootstrap the first version using a short-lived stage-only npm token without 2FA bypass. Subsequent releases use a stage-only npm Trusted Publisher via GitHub OIDC.

## Consequences

Maintainers can inspect the exact archive before publication. The first release needs a temporary credential because npm configures a trusted publisher on an existing package. Later stages use short-lived OIDC credentials. Release approval remains an interactive maintainer action.
