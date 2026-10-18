# Publishing & Maintainer Setup

This repository publishes `@proxylity/cdk-udp-gateway` to npm, PyPI, and NuGet.org
using **keyless OIDC trusted publishing** from `.github/workflows/release.yml`. No
long-lived registry tokens or API keys are stored in the repository.

The items below are **account-side, human-only prerequisites**. They are performed in
the GitHub and registry web UIs, not in code. The release workflow will not publish to a
given registry until both (a) that registry's trusted-publishing policy is configured and
(b) the corresponding repository variable is set to `true`.

Perform these steps in order.

## 1. Create the `release` GitHub Actions environment

1. In the repository, go to **Settings → Environments → New environment** and name it
   exactly `release`.
2. Add at least one **required reviewer** so each publish run must be approved by a human.
3. Optionally restrict the environment's deployment branches to the default branch
   (`main`) so only releases built from `main` can publish.

Every publish job (`publish-npm`, `publish-pypi`, `publish-nuget`) runs with
`environment: release` and `id-token: write`, so this environment gates all publishing.

## 2. npm trusted publishing

1. Sign in to <https://www.npmjs.com> as an owner of the `@proxylity` scope.
2. For the `@proxylity/cdk-udp-gateway` package, configure **trusted publishing** to trust:
   - Repository: `proxylity/cdk-udp-gateway`
   - Workflow: `.github/workflows/release.yml`
   - Environment: `release`
3. **Bootstrap caveat:** npm trusted publishing can only be attached to a package name that
   already exists. For a brand-new package name, do one first manual/interactive
   `npm publish` (or pre-register the name) so the package exists, then attach the trusted
   publisher. Subsequent releases publish keylessly with provenance.

The npm job uses `npm publish --provenance --access public` with no `NODE_AUTH_TOKEN`.

> **The source repository MUST be public.** `--provenance` signs a public, verifiable link from
> the package to its source commit and build, so npm rejects it for a private repo with
> `422 ... Unsupported GitHub Actions source repository visibility: "private". Only public source
> repositories are supported when publishing with provenance.` Make the repository public before
> the first npm release. (If you must publish while private, drop `--provenance` from
> `release.yml` — but then there is no provenance attestation.)

## 3. PyPI trusted publishing

1. Sign in to <https://pypi.org>.
2. For a project that does not exist yet, add a **pending publisher** (Account → Publishing).
   A trusted publisher can only *create* a new project through a correctly-matched pending
   publisher. Configure it to trust:
   - PyPI **Project Name**: `proxylity-cdk-udp-gateway` — this MUST match the package's
     `distName` exactly (see `package.json` → `jsii.targets.python.distName`). PyPI normalizes
     case / `-` / `_`, so `proxylity_cdk_udp_gateway` in the built wheel filename is equivalent,
     but a different name here causes a `400 Non-user identities cannot create new projects`
     error (the OIDC auth succeeds, then project creation fails on the name mismatch).
   - Owner: `proxylity`
   - Repository: `cdk-udp-gateway`
   - Workflow: `release.yml` (filename only, not a path)
   - Environment: `release`
   If you hit the `400 Non-user identities cannot create new projects` error, the pending
   publisher's Project Name does not match — delete and recreate it with the exact name above.

The PyPI job uses `pypa/gh-action-pypi-publish` with no token.

## 4. NuGet.org trusted publishing

1. Sign in to <https://www.nuget.org>.
2. **Register/own the package id** `Proxylity.CDK.UdpGateway`. Note that the `Proxylity.`
   prefix is (or should be) a **reserved prefix** owned by the organization, so only the
   owning account can publish ids under it.
3. Create a **trusted publishing policy** for that package id trusting:
   - Repository: `proxylity/cdk-udp-gateway`
   - Workflow: `.github/workflows/release.yml`
   - Environment: `release`
4. Record the nuget.org **username** that owns the policy; it is supplied to the workflow via
   the `NUGET_USER` repository variable (step 5).

The NuGet job uses `NuGet/login` to exchange the GitHub OIDC token for a short-lived
(~1 hour) API key, then `dotnet nuget push`. No long-lived key is stored.

## 5. Repository variables

Set these under **Settings → Secrets and variables → Actions → Variables** (they are
non-secret repository *variables*, not secrets):

| Variable        | Value / purpose                                                        |
| --------------- | ---------------------------------------------------------------------- |
| `PUBLISH_NPM`   | `true` to enable the npm publish job (absent/anything else = disabled) |
| `PUBLISH_PYPI`  | `true` to enable the PyPI publish job                                  |
| `PUBLISH_NUGET` | `true` to enable the NuGet publish job                                 |
| `NUGET_USER`    | The nuget.org username owning the trusted-publishing policy            |

Enable each `PUBLISH_*` variable only after that registry's trusted-publishing policy
(steps 2–4) is in place. A missing variable leaves that publish job skipped.

## 6. Release process

1. Decide the new version as a **bare semver** `X.Y.Z` — **no `v` prefix** (e.g. `1.2.3`).
2. Create a **GitHub Release** whose tag is that bare semver. Publishing the release fires
   `release: types: [published]` and runs `.github/workflows/release.yml`.
3. The `build` job syncs `package.json` to the tag with
   `npm version X.Y.Z --no-git-tag-version --allow-same-version`, then compiles and runs
   `jsii-pacmak` once, uploading `dist/` as an artifact. Each enabled publish job downloads
   that same artifact so all languages publish identical versioned packages.
4. Approve the `release` environment when prompted (required reviewer) to allow the publish
   jobs to run.
