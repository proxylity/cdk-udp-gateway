# Verification — CodeBuild → GitHub Actions migration

Environment: Windows / PowerShell, Node v24.20.0, npm 11.19.0.
`JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1` set in the shell for all jsii/jest runs.
PowerShell wraps native stdout and sometimes reports it as `RemoteException`; results below
are judged by actual stdout content, not exit codes.

## 1. Lockfile regenerated after `@types/node ^24` + jsii-targets change

- `npm install` → `changed 2 packages, and audited 485 packages` (exit 0, no errors).
- `package-lock.json` resolves `@types/node` at **24.19.2**
  (`node_modules/@types/node` → `"version": "24.19.2"`), no v22.x entry remains.
- `npm ci` after regeneration → exit 0, lockfile in sync (no "can only install with lockfile"
  error).
- Note: `npm audit` reports pre-existing advisories (7 moderate / 36 high) in the
  jsii/jsii-pacmak dev toolchain; these predate this change and are unrelated to it.

## 2. Lint — clean

- `npm run lint` (`eslint src test`) → exit 0, no output (no warnings/errors).
  eslint 9 flat config (`eslint.config.mjs`) over the non-empty `src` and `test` trees.

## 3. Compile — zero TS errors

- `npm run compile` (`jsii --silence-warnings=reserved-word`) →
  `✨ Successful  Errors: 0 | Warnings: 0 (+2 silenced)`.
- `.jsii` and `lib/` emitted.

## 4. Tests — all pass, golden synth green

- `npm test` (jest):
  - `Test Suites: 5 passed, 5 total`
  - `Tests:       27 passed, 27 total`
  - `PASS test/synth/packet-counter.golden.test.ts` — the golden synth-diff is green and
    unchanged (no wire-shape change).
- The golden test reads the vendored fixture
  `test/fixtures/packet-counter.template.json` (confirmed in the test source,
  `EXAMPLE_PATH = ../fixtures/packet-counter.template.json`); no cross-repo `../examples`
  path.

## 5. Package — js/python/dotnet only, no go/java

- `dist/` cleared before packaging.
- `npm run package` (`jsii-pacmak`) → exit 0.
- `Get-ChildItem dist -Name` → `dotnet`, `js`, `python` only.
- `Test-Path dist/go` → **False**; `Test-Path dist/java` → **False**.
- Artifact files:
  - `dist/js/cdk-udp-gateway@0.1.0.jsii.tgz` (matched by `dist/js/*.tgz`)
  - `dist/python/proxylity_cdk_udp_gateway-0.1.0-py3-none-any.whl`
  - `dist/python/proxylity_cdk_udp_gateway-0.1.0.tar.gz`
  - `dist/dotnet/Proxylity.CDK.UdpGateway.0.1.0.nupkg`
  - `dist/dotnet/Proxylity.CDK.UdpGateway.0.1.0.snupkg` (symbols; `dotnet nuget push *.nupkg`
    handles the adjacent `.snupkg` automatically)

## 6. Workflow YAML validation

Parsed with `js-yaml` under Node (both files load without error):

- `.github/workflows/ci.yml` — top keys `name, on, permissions, env, jobs`; jobs: `build`.
  - `on` = `push` (branches `[main]`) + `pull_request`; `permissions` = `{contents: read}`.
  - Steps: `actions/checkout@v5`, `actions/setup-node@v5` (node 24), `npm ci`,
    `npm run lint`, `npm run compile`, `npm test`.
- `.github/workflows/release.yml` — top keys `name, on, permissions, env, jobs`; jobs:
  `build, publish-npm, publish-pypi, publish-nuget`.
  - Trigger: `release.types = ["published"]`.
  - Each publish job: `environment=release`, `permissions.id-token=write`, `needs=build`,
    gated by its `if`:
    - `publish-npm`  → `vars.PUBLISH_NPM == 'true'`
    - `publish-pypi` → `vars.PUBLISH_PYPI == 'true'`
    - `publish-nuget`→ `vars.PUBLISH_NUGET == 'true'`
  - Version sync: `npm version "${{ github.event.release.tag_name }}" --no-git-tag-version
    --allow-same-version`.
  - No publish secret/token referenced in any job (OIDC only).

### Pinned action versions (verified current, non-deprecated, no advisories)

- `actions/checkout@v5`, `actions/setup-node@v5`, `actions/setup-dotnet@v5`
  (Node24 runtime majors)
- `actions/upload-artifact@v4`, `actions/download-artifact@v4` (v3 retired)
- `pypa/gh-action-pypi-publish@v1.14.2` (current release line; includes the
  GHSA-vxmw-7h4f-hqxh fix from v1.13.0)
- `NuGet/login@v1` (current major; exposes `NUGET_API_KEY` step output)

## 7. No residual CodeBuild files / references

- `Test-Path buildspec.yml` → **False**; `build/` → **False**; `scripts/` → **False**.
- Deleted via `git rm`: `buildspec.yml`, `build/checks.yml`, `build/package.yml`,
  `build/publish.yml`, `scripts/checks.sh`, `scripts/package.sh`, `scripts/publish.sh`;
  empty `build/` and `scripts/` dirs removed.
- `.npmignore` no longer references `build`, `scripts`, or `buildspec`
  (grep returns nothing). `README.md` had no references (grep returns nothing).
- `npm pack --dry-run` ships 16 files: `.jsii`, `README.md`, `lib/**`, `package.json` only —
  no `src/`, `test/`, `build/`, `scripts/`, or `buildspec.yml`.
