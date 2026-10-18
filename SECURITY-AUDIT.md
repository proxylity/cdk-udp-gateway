# Security Audit — Dev-Dependency Hardening

Date: 2025-02-14
Toolchain: Node v24.20.0 / npm 11.19.0

## Posture

`@proxylity/cdk-udp-gateway` is an L1 (CloudFormation-faithful) jsii CDK construct library.

- The **published package has NO runtime dependencies.** The `files` allowlist ships only
  `lib/`, `.jsii`, and `README.md`. (This `SECURITY-AUDIT.md` is intentionally **not** in the
  allowlist and is not published.)
- `aws-cdk-lib` and `constructs` are **peer dependencies** supplied by the consumer at their own
  chosen version. They are also pinned as point devDependencies (`2.160.0` / `10.0.0`) only to
  exercise the lowest supported floor during build/test.
- Every remaining `npm audit` advisory is therefore a **build-time-only / peer-supplied** concern.
  None reaches a consumer through this package's shipped artifacts.

## Before → After

| Metric | Before | After (dev-dep hardening) | After (js-yaml@4 override) |
|---|---|---|---|
| Total advisories | 43 | 31 | 11 |
| Moderate | 7 | 22 | 2 |
| High | 36 | 9 | 9 |

The first pass (dev-dep hardening) dropped the total from 43 to 31; the moderate/high split shifted
because the regenerated lockfile collapsed the stale duplicated jsii-rosetta / jest trees into single
nodes and npm re-rated several `aws-cdk-lib`-floored advisories.

A second, targeted pass added a `js-yaml: ^4.0.0` override (see Overrides) that eliminated the entire
jest/istanbul coverage-config cluster rooted at `sprintf-js` (former residual S1), dropping the total
from 31 to **11 (2 moderate, 9 high)**. The remaining set is now cleanly attributable to just two
documented categories: the `aws-cdk-lib`-floor advisories (A1–A11) and the jsii 5.9 toolchain
`braces` chain (J1). All advisories that were clearable without raising the held `aws-cdk-lib` floor
or moving to jsii 6 / TypeScript 6.0 have been cleared.

## Dependencies changed (all devDependencies / build-time only)

| Package | Old | New | Cleared |
|---|---|---|---|
| `jest` | `^29.7.0` | `^30.5.2` | Entire jest 29 transitive cluster; stale duplicated jest tree |
| `@types/jest` | `^29.5.12` | `^30.0.0` | `@types/jest`→`expect` advisory; matches jest 30 |
| `ts-jest` | `^29.2.0` | `^29.4.15` | Stale ts-jest transitives (stays on 29; peer-supports jest 30) |
| `@types/node` | `^24.0.0` | `^24.19.2` | Floor refresh to current 24.x (no major move) |
| `eslint` | `^9.0.0` | `^10.13.0` | **Removes the "no longer supported" deprecation on eslint 9.x** + old eslint-chain transitives |
| `@eslint/js` | `^9.0.0` | `^10.0.1` | Matches eslint 10 (its own 10.x line) |
| `typescript-eslint` | `^8.0.0` | `^8.71.2` | Latest v8; peer-supports eslint 10 + TypeScript 5.9 |
| `globals` | `^15.0.0` | `^17.13.0` | Current major (pure data package) |

Unchanged by design: `typescript` (`~5.9.0`), `jsii` (`~5.9.0` → resolved 5.9.56),
`jsii-pacmak` (`~1.140.0`), `aws-cdk-lib` (`2.160.0` dev / `^2.160.0` peer),
`constructs` (`10.0.0` dev / `^10.0.0` peer).

### Overrides

A `package.json` `overrides` block forces two **purely-transitive dev packages** under the
jest / istanbul coverage chain (neither appears under `aws-cdk-lib`):

| Override | Reason |
|---|---|
| `test-exclude: ^8.0.0` | `babel-plugin-istanbul@8` pulled `test-exclude@7.0.2` → `glob@10.5.0`, which emitted a **deprecation warning** on install. `test-exclude@8` uses `glob@^13` / `minimatch@^10` (current), clearing the deprecation. |
| `js-yaml: ^4.0.0` | `@istanbuljs/load-nyc-config` depends on `js-yaml@^3`, which pulls `argparse@1 → sprintf-js` — the root of the entire jest/istanbul coverage cluster (former residual S1, GHSA-hp3w-g68c-fv3c). This repo does **not** use nyc/istanbul coverage config (no `.nycrc*`, no nyc config in `jest.config.js`/`package.json`), so the `load-nyc-config → js-yaml@3` path is dead weight here. Forcing `js-yaml@4.3.2` resolves cleanly, switches the subtree to `argparse@2`, and **drops the `sprintf-js` dependency entirely**. Verified `jest --coverage` still works, so istanbul instrumentation is unaffected. |

The former `sprintf-js: ^1.1.3` override was **removed** — with `js-yaml@4` forced, no path in the
tree pulls `sprintf-js` at all (`npm ls sprintf-js` reports nothing), so the override is dead.

All overrides were verified end-to-end: `npm ci` in sync, lint/compile/test/package all pass,
`jest --coverage` passes (27/27, istanbul instrumentation intact), the golden synth test unchanged,
and the shipped package / public API unchanged. No override touches anything under `aws-cdk-lib`.

## Intentional decisions

- **A1 — `aws-cdk-lib` / `constructs` floor held at `2.160.0` / `10.0.0`.** This is the deliberate
  lowest-supported-version floor. Consumers bring their own `aws-cdk-lib` as a peer; raising the dev
  pin would penalize every consumer's minimum for no benefit here. Every `aws-cdk-lib` advisory names
  a construct this L1 library **does not use** (it emits only `Custom::ProxylityUdpGateway*` via
  `CfnResource`), so none is applicable to its output. See residuals A-*.
- **J1 — `jsii` / `jsii-pacmak` pinned to the 5.9 / 1.14x line (NOT jsii 6.0).** jsii's major tracks
  TypeScript's major: jsii 6 == TypeScript 6.0, a deliberately deferred transition. Staying on
  jsii 5.9.56 keeps `typescript` at `~5.9` as required. The jsii-rosetta → fast-glob → micromatch →
  braces chain this pulls is an accepted toolchain residual (residual J-*).
- **E1 — eslint 10, not 9.** No non-deprecated eslint 9.x exists: `npm view eslint dist-tags` shows
  `maintenance: 9.39.5`, `latest: 10.13.0`, and every 9.x (including 9.39.5) reports "no longer
  supported". The task bar is "nothing we control is deprecated", so eslint 10.13.0 (current, not
  deprecated) is the only way to satisfy it. The repo already uses flat config (`eslint.config.mjs`),
  so eslint 10's main breaking change (eslintrc removal) does not apply; `typescript-eslint@8.71.2`
  peers accept eslint 10 and TypeScript 5.9. No new eslint 10 `recommended` rule flagged `src`/`test`.

## Cleared: the jest/istanbul `sprintf-js` cluster (former residual S1)

The earlier pass left the jest/istanbul coverage chain as residual S1 (`sprintf-js`,
GHSA-hp3w-g68c-fv3c), reached via
`ts-jest > @jest/transform > babel-plugin-istanbul > @istanbuljs/load-nyc-config > js-yaml@3 > argparse@1 > sprintf-js`,
and conservatively declined to override `js-yaml@4` out of caution it might break coverage runs. That
caution was unnecessary here: this repo loads **no** nyc config (empirically confirmed — no `.nycrc*`
in the repo, and `jest.config.js` is plain ts-jest with no coverage thresholds), so the
`load-nyc-config → js-yaml@3` path never executes. Forcing `js-yaml@4.3.2` (which uses `argparse@2`
and has no `sprintf-js` dependency) resolves cleanly and removes the whole cluster from the tree. The
former S1 advisory, plus the `@jest/*`, `jest-*`, `babel-jest`, `babel-plugin-istanbul`,
`@istanbuljs/load-nyc-config`, `js-yaml`, `argparse`, and `ts-jest` advisories that were flagged only
as the **path** to `sprintf-js`, are now gone from `npm audit`. `jest --coverage` was verified to
still pass (27/27), confirming istanbul instrumentation is intact.

## Residual advisories (after cleanup)

All residuals are build-time-only. Categories:
`aws-cdk-lib-floor-unused-construct` (peer floor, construct unused),
`jsii-toolchain-transitive` (pinned by jsii 5.9 line).

| # | Package | Severity | Advisory | Dependency path | Category | Why it does not affect consumers |
|---|---|---|---|---|---|---|
| A1 | aws-cdk-lib | low | GHSA-v4mq-x674-ff73 (IAM OIDC custom resource) | `aws-cdk-lib` (dev/peer floor) | aws-cdk-lib-floor-unused-construct | Library never creates an IAM OIDC provider construct. |
| A2 | aws-cdk-lib | moderate | GHSA-qq4x-c6h6-rfxh (Cognito UserPoolClient log leak) | `aws-cdk-lib` | aws-cdk-lib-floor-unused-construct | Library never uses Cognito UserPoolClient. |
| A3 | aws-cdk-lib | low | GHSA-5pq3-h73f-66hr (CodePipeline trusted entities) | `aws-cdk-lib` | aws-cdk-lib-floor-unused-construct | Library never uses CodePipeline. |
| A4 | aws-cdk-lib | high | GHSA-999r-qq7v-r334 (NodejsFunction bundling cmd injection) | `aws-cdk-lib` | aws-cdk-lib-floor-unused-construct | Library never uses NodejsFunction. |
| A5 | aws-cdk-lib | high | GHSA-vcrf-j523-4mrf (NodejsFunction Docker bundling cmd injection) | `aws-cdk-lib` | aws-cdk-lib-floor-unused-construct | Library never uses NodejsFunction. |
| A6 | aws-cdk-lib | low | GHSA-464c-974j-9xm6 (CodeBuild S3 log encryption inversion) | `aws-cdk-lib` | aws-cdk-lib-floor-unused-construct | Library never uses CodeBuild. |
| A7 | ajv | moderate | GHSA-2g4f-4pwh-qvx6 (ReDoS via `$data`) | `aws-cdk-lib > ajv` | aws-cdk-lib-floor-unused-construct | Nested under the pinned aws-cdk-lib floor; not on this package's shipped surface. Raising the floor is decision A1. |
| A8 | brace-expansion | low–high (8 advisories: GHSA-v6h2-p8h4-qcjw, -f886-m6hf-6m8v, -3jxr-9vmj-r5cp, -mh99-v99m-4gvg, -rgw5-rvv9-x895, -q2hr-2g5m-vwhr, -qhr7-859c-m2p7, -6j4f-fj2g-mc7p) | DoS / ReDoS | `aws-cdk-lib > brace-expansion` | aws-cdk-lib-floor-unused-construct | Nested under aws-cdk-lib floor. Would be bumped by raising the floor; held per A1. |
| A9 | fast-uri | moderate–high (9 advisories: GHSA-v2hh-gcrm-f6hx, -7p8r-x3mc-p8w7, -q3j6-qgpj-74h6, -v39h-62p7-jpjc, -f65p-4m7j-42xc, -jqff-g426-hqxp, -4c8g-83qw-93j6, -qw65-cvwx-89v3, -hrr3-gc8f-f4qj) | host confusion / SSRF / traversal | `aws-cdk-lib > fast-uri` | aws-cdk-lib-floor-unused-construct | Nested under aws-cdk-lib floor; held per A1. |
| A10 | minimatch | high (GHSA-3ppc-4f35-3m26, -7r86-cg39-jmmj, -23c5-xmqv-rm74) | ReDoS | `aws-cdk-lib > minimatch` | aws-cdk-lib-floor-unused-construct | Nested under aws-cdk-lib floor; held per A1. |
| A11 | yaml | moderate | GHSA-48c2-rrv3-qjmp (stack overflow via nested collections) | `aws-cdk-lib > yaml` | aws-cdk-lib-floor-unused-construct | Nested under aws-cdk-lib floor; held per A1. |
| J1 | braces | high | GHSA-vfj7-8cjw-p6xm (stack-exhaustion DoS) | `jsii-pacmak > jsii-rosetta > fast-glob > micromatch > braces` | jsii-toolchain-transitive | Pulled only by the jsii 5.9 packaging toolchain. `braces@3.0.3` is the newest published and is still in-range (`<=3.0.3`) — upstream-unpatched. Fixing it would require jumping to jsii 6 (TypeScript 6.0), deferred per J1. `fast-glob` / `micromatch` appear in the audit summary only as the path to this single `braces` advisory. |

Post-override `npm audit` reports **11 advisories (2 moderate, 9 high)**: `aws-cdk-lib`, `ajv`,
`brace-expansion`, `fast-uri`, `minimatch`, and `yaml` (all under the `aws-cdk-lib@2.160.0` floor,
A1–A11), plus `jsii-pacmak`, `jsii-rosetta`, `fast-glob`, `micromatch`, and `braces` (the jsii 5.9
chain, J1). The flagged `minimatch@3.1.2` / `brace-expansion@1.1.11` resolve only under
`aws-cdk-lib`; the jest/eslint/typescript-eslint copies are the current patched `minimatch@10` /
`brace-expansion@5` and are not flagged.

### No acceptable alternative remains

Every advisory above is either (a) under the intentionally-held `aws-cdk-lib`/`constructs` floor and
names a construct this library does not use, or (b) pinned by the jsii 5.9 toolchain and upstream-
unpatched on that line. Nothing else survives: all jest 29, eslint 9, stale-lock, and jest/istanbul
`sprintf-js`-cluster residuals were cleared by the dependency bumps and the `js-yaml@4` override.

## Maintenance

Refresh this file whenever the dev toolchain is bumped. On each bump, re-run
`npm audit --json` and re-check whether:

- the jsii 5.9 line (or an eventual, deliberate jsii 6 / TypeScript 6.0 move) drops the
  `jsii-rosetta > fast-glob > braces` chain (residual J1);
- the `aws-cdk-lib` floor is ever intentionally raised (decision A1), which would clear A1–A11;
- `@istanbuljs/load-nyc-config` ever ships a release that depends on `js-yaml@4` natively, which
  would let the `js-yaml: ^4.0.0` override be dropped (it is currently needed to force v4 over the
  package's declared `js-yaml@^3`). The override is only safe because this repo loads no nyc config —
  if a `.nycrc*` is ever added, re-verify coverage still loads correctly under `js-yaml@4`.
