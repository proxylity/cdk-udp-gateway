# Implementation Plan — `@proxylity/cdk-udp-gateway` L1 construct library

Scope: **L1 only.** Faithful 1:1 CDK wrappers of the four `Custom::ProxylityUdpGateway*` CloudFormation
custom resources, authored in TypeScript and packaged with jsii for all five target languages. No L2,
no L3, no git push/PR. A local commit checkpoint is acceptable.

Normative source (wins over schema/docs): `c:\Users\leeha\source\proxylity\proxylity-control`
(C# `src/listener-resource-lambda`). Approved design:
`c:\Users\leeha\source\proxylity\cdk\.agents\tasks\cdk-udp-gateway-l1\design.md`. Divergence log (keep
current): `...\cdk-udp-gateway-l1\DIVERGENCES.md`.

Repo root for all new source: `c:\Users\leeha\source\proxylity\cdk` (do NOT rename the folder; the npm
package is `@proxylity/cdk-udp-gateway`). The repo is effectively greenfield (only `.agents` + `.git`).

House build style to mirror: `proxylity-control\buildspec.yml` (top-level `batch.build-graph` of
identifiers, each pointing at a nested `build/<id>.yml`, each of which runs `scripts/<name>.sh`),
`proxylity-control\build\checks.yml`, `proxylity-control\scripts\checks.sh`,
`proxylity-control\scripts\deploy-global.sh` (`set -ex`, bash, `CODEBUILD_*`/parameter-store env).

Design decisions already locked by the approved design (do not re-decide): projen `awscdk-construct`
project type to generate jsii config; `aws-cdk-lib@^2.160.0` + `constructs@^10.0.0` as **peerDependencies
+ devDependencies only** (never `dependencies`); flat prop bags (no protocol subtypes in L1); `toWire`
mapper per resource is the single camelCase→PascalCase mapping point; `CfnDestination` omitted this
release (D-05); `ProxylityConfig` emits the `AWS::Include` transform via `Stack.addOverride` (not
`CfnMapping`), singleton-per-stack.

Build order rationale: scaffolding first (nothing compiles without it), then the shared mapper + base,
then the config helper (constructs depend on it in tests), then the four constructs, then unit tests,
then the golden synth test, then CodeBuild wiring, then README/DIVERGENCES. Each item leaves the repo
buildable (`npx projen build` green) and is verified with the project's real commands, never grep.

Verification commands (established by scaffolding in item 1; use these verbatim thereafter):
- Build + compile + lint + test in one shot: `npx projen build`
- jsii compile only: `npx jsii` (or `npx projen compile`)
- Tests only: `npx projen test` (jest via `aws-cdk-lib/assertions`)
- Multi-language packaging: `npx jsii-pacmak` (or `npx projen package`) → artifacts in `dist/`

> IMPLEMENTATION NOTE (2026-10-16): the implementer chose hand-rolled jsii config over projen (the
> plan/design explicitly permit this as a build-tooling choice that does not change the public API,
> targets, or dependency placement). The equivalent npm scripts are: `npm run lint`, `npm run compile`
> (= `jsii`), `npm test` (= `jest`), `npm run package` (= `jsii-pacmak`). All five `jsii.targets` and
> the peer-only `aws-cdk-lib`/`constructs` placement are configured in `package.json` exactly as item
> 1 requires. Full verification evidence is in `VERIFICATION.md` alongside this plan.

---

- [ ] 1. Scaffold the jsii/projen project at the repo root with all five language targets configured
      exactly per the design, so `npx projen build` runs end to end on an empty source tree.
      Use projen's `awscdk-construct` project type. Create `.projenrc.ts` as the source of truth and
      run `npx projen` to generate `package.json`, `tsconfig*.json`, `.jsii` wiring, `.eslintrc`, jest
      config, and `.gitignore`. Configure in `.projenrc.ts`: `name: '@proxylity/cdk-udp-gateway'`,
      `author`/`repositoryUrl` for the proxylity org, `defaultReleaseBranch: 'main'`,
      `cdkVersion: '2.160.0'`, `constructsVersion: '10.0.0'` (both land in peer+dev deps, not runtime
      deps), `jsiiVersion` on a current 5.x line, and `publishToPypi` / `publishToNuget` /
      `publishToMaven` / `publishToGo` set to the exact identities below. Set `release: false` and
      `github: false` (CodeBuild drives publishing; no GitHub Actions). Keep runtime `deps: []`.
      Package identities (must match exactly):
        - npm: `@proxylity/cdk-udp-gateway`
        - PyPI: `publishToPypi.distName = 'proxylity-cdk-udp-gateway'`, `module = 'proxylity_cdk_udp_gateway'`
        - NuGet: `publishToNuget.packageId = 'Proxylity.CDK.UdpGateway'` (dotNetNamespace `Proxylity.CDK.UdpGateway`)
        - Maven: `publishToMaven.mavenGroupId = 'com.proxylity'`, `mavenArtifactId = 'cdk-udp-gateway'`,
          `javaPackage = 'com.proxylity.cdk.udpgateway'`
        - Go: `publishToGo.moduleName = 'github.com/proxylity/cdk-udp-gateway'`
      Add a trivial placeholder export in `src/index.ts` (e.g. a VERSION const) so compile has input;
      it is replaced in later items.
      Files: `c:\Users\leeha\source\proxylity\cdk\.projenrc.ts`, generated `package.json`,
      `tsconfig.json`, `tsconfig.dev.json`, `.jsii` (generated on compile), `.eslintrc.json`,
      `.gitignore`, `.npmignore`, `src/index.ts`.
      Verify: `npx projen build` exits 0 (lint + compile + test with zero tests + no package errors);
      then confirm `package.json` `jsii.targets` contains `python`, `dotnet`, `java`, and `go` blocks
      with the exact identities above and that `aws-cdk-lib`/`constructs` appear only under
      `peerDependencies` and `devDependencies`, not `dependencies`.

- [ ] 2. Create the shared wire-mapping utilities and construct base plumbing used by every resource.
      Add `src/private/to-wire.ts` with a small helper that drops `undefined` members and maps a
      camelCase props bag to a PascalCase wire object, plus typed sub-mappers for the nested shapes
      (`ClientRestrictions`, `Role {Arn,Duration}`, `Batching {Count,TimeoutInSeconds,SizeInMB}`,
      `Arguments`, `Peers[]`, `SnsTopicSource {TopicArn,Role}`, and the `DestinationArn` string-or-map
      serialization that emits `{ "*": default, "<region>": arn }` / `{}` and throws when both the
      string and map forms are set on one inline destination — the one client-side check in the design).
      Pass native `boolean`/`number` through unchanged (no pre-stringify; see design "Construct base").
      Do not re-export from `index.ts` (internal). This item has no public API yet.
      Files: `src/private/to-wire.ts`.
      Verify: `npx projen compile` exits 0 (the util compiles under jsii's TS settings). Full test run
      happens in item 7 once units exist.

- [ ] 3. Implement the `ProxylityConfig` helper construct exactly as designed.
      Create `src/proxylity-config.ts` exporting `class ProxylityConfig extends Construct` with static
      `forStack(scope)` (idempotent singleton keyed on `Stack.of(scope)` via a stable child id), and
      accessors `serviceToken(region?)`, `serviceRole(region?)`, `apiKey()`. `forStack` writes the
      mapping once with
      `Stack.of(scope).addOverride('Mappings.ProxylityConfig', { 'Fn::Transform': { Name: 'AWS::Include', Parameters: { Location: Fn.sub('s3://proxylity-config-${AWS::Region}/${AWS::AccountId}/customer-config.json') } } })`.
      Accessors return `Fn.findInMap('ProxylityConfig', region ?? Aws.REGION, '<key>')`; `apiKey()` uses
      the literal second key `'Account'`. Export from `src/index.ts`.
      Files: `src/proxylity-config.ts`, `src/index.ts`.
      Verify: `npx projen compile` exits 0. (Behavioral assertions land in item 7.)

- [ ] 4. Implement `CfnListener` (`Custom::ProxylityUdpGatewayListener`) — the richest construct — with
      all core, protocol-specific (wg/dtls/webrtc), inline-destination, and output-attribute surface
      from the design, honoring DIVERGENCES D-01…D-04, D-09…D-13.
      Create `src/cfn-listener.ts` with `CfnListenerProps` (flat bag: required `serviceToken`, `apiKey`,
      `protocols`; optional `name`, `description`, `clientRestrictions`, `destinations`,
      `metricsEnabled`, `logGroupName`, `role`; wg/dtls/webrtc members incl. the shared `serverSecret`,
      `requireCookies`, `certRefreshToken`) and the supporting structs (`ClientRestrictions`,
      `ListenerRole`, `WireGuardPeer`, `ListenerDestination`, `Batching`, `DestinationArnMap`,
      `DestinationArguments`). Model inline `destinations` as `Array<ListenerDestination | string>`
      where a string is a name-reference; model the inline `DestinationArn` as mutually-exclusive
      `destinationArn?: string` and `destinationArnMap?: DestinationArnMap` (jsii-safe; design "modeling
      note"). The construct extends/wraps `CfnResource` with `type: 'Custom::ProxylityUdpGatewayListener'`
      and `properties` built by the item-2 mapper. Expose readonly getters returning string tokens via
      `Fn.getAtt(ref,'<Attr>').toString()` for `attrId`, `attrPort`, `attrDomain`, protocol-specific
      `attrWireGuardPublicKey` / `attrDtlsServerCertificate` / `attrWebRtcFingerprint` /
      `attrWebRtcSctpPort` / `attrWebRtcChannelId` / `attrWebRtcSignalingMode` / `attrWebRtcSignalingToken`
      / `attrWebRtcSignalingUrl`; and `attrDestinationNames` as a string-list token via
      `Fn.getAtt(ref,'DestinationNames').toStringList()`. Do NOT fabricate `attrIpv4s` (design note).
      Put the normative C# property name, units, defaults, and the relevant D-xx note in JSDoc on each
      member (notably D-01 Duration TimeSpan, D-02 Batching units, D-03/D-04 DecapsulatedDelivery, D-12
      ServerSecret asymmetry, D-13 region-map rules). Export from `src/index.ts`.
      Files: `src/cfn-listener.ts`, `src/index.ts`.
      Verify: `npx projen compile` exits 0 and jsii accepts the public API (no union-of-primitives, no
      structural generics). Behavioral assertions land in item 7.

- [ ] 5. Implement `CfnDestinationArn` and `CfnPacketSource` (same pattern, smaller surface).
      `src/cfn-destination-arn.ts`: `type: 'Custom::ProxylityUdpGatewayDestinationArn'`, required props
      `serviceToken`, `apiKey`, `destination`, `ingressRegionKey`, `arn`; getters `attrDestination`,
      `attrIngressRegionKey`, `attrArn` (string tokens). JSDoc the fallback/`*` and same-service rules
      (D-13 cross-reference) as server-enforced, un-enforced by L1.
      `src/cfn-packet-source.ts`: `type: 'Custom::ProxylityUdpGatewayPacketSource'`, required
      `serviceToken`, `apiKey`, `listenerName`, `snsTopicSource` (struct `{ topicArn: string; role: string }`
      — note D-08: `Role` is a bare string ARN, not a `{Arn}` object); optional `description`, `enabled`
      (pass-through, JSDoc that the resource currently ignores it — D-07). No `attr*` getters; expose
      `ref` only. Export both from `src/index.ts`.
      Files: `src/cfn-destination-arn.ts`, `src/cfn-packet-source.ts`, `src/index.ts`.
      Verify: `npx projen compile` exits 0. Behavioral assertions land in item 7.

- [ ] 6. Confirm `CfnDestination` is intentionally omitted and document it.
      Do NOT create a `CfnDestination` construct (D-05: control-plane handler throws
      `NotImplementedException`). Add a short JSDoc/README-targeted note (the README section is item 9)
      and ensure `src/index.ts` does not export one. This item is a verification/guard step: nothing to
      compile beyond confirming no stray export exists.
      Files: `src/index.ts` (confirm no `CfnDestination` export).
      Verify: `npx projen compile` exits 0; the public `.jsii` assembly contains no `CfnDestination`
      type (inspect the generated `.jsii` types list, or `npx jsii` succeeds with the four intended
      constructs + `ProxylityConfig` only).

- [ ] 7. Write jest + `aws-cdk-lib/assertions` unit tests asserting each construct synthesizes the
      correct `Custom::ProxylityUdpGateway*` `Type` and exact `Properties` wire bag, and that
      `ProxylityConfig` emits the exact mapping/intrinsics.
      One spec per construct under `test/`: synthesize a one-resource `Stack`, use `Template.fromStack`
      and `hasResourceProperties` / `templateMatches` to assert PascalCase keys and nested shapes
      (`ClientRestrictions`, `Role {Arn,Duration}`, `Batching`, `Arguments`, `Peers`, `SnsTopicSource`,
      both `DestinationArn` forms incl. `{}` empty and `{ "*": ..., "<region>": ... }`). Assert the
      `destinationArn` XOR `destinationArnMap` mapper throws. Assert `attr*` getters produce the exact
      `Fn::GetAtt` tuples and `attrDestinationNames` is a list token. Assert `ProxylityConfig` yields
      `Mappings.ProxylityConfig` equal to the `Fn::Transform` object and that accessors produce the
      exact `Fn::FindInMap` intrinsics.
      Files: `test/proxylity-config.test.ts`, `test/cfn-listener.test.ts`,
      `test/cfn-destination-arn.test.ts`, `test/cfn-packet-source.test.ts`.
      Verify: `npx projen test` exits 0 with all new tests passing.

- [ ] 8. Add the golden synth test that re-authors the packet-counter stack with the L1 constructs +
      `ProxylityConfig`, synthesizes it, and diffs the emitted `Custom::ProxylityUdpGatewayListener`
      against the hand-written example. Synth-only, NO live AWS calls.
      Create a small test CDK app (`test/synth/packet-counter.ts` building the stack, consumed by a
      jest spec `test/synth/packet-counter.golden.test.ts`) that reproduces
      `examples/packet-counter/packet-counter.template.json`: `ProxylityConfig.forStack`, a
      `CfnListener` with `protocols:['udp']`, `clientRestrictions.networks` from a CIDR param, and one
      inline destination (`role.arn`, `batching {count:1000, timeoutInSeconds:1}`, `metricsEnabled:true`,
      `destinationArn` = the lambda ARN). The spec synthesizes via `Template.fromStack`, extracts the
      single `Custom::ProxylityUdpGatewayListener` resource's `Properties`, and deep-equals it against
      the `Properties` block read from
      `c:\Users\leeha\source\proxylity\examples\packet-counter\packet-counter.template.json`, after
      normalizing CloudFormation logical ids / generated names and ignoring sibling resources the
      example also defines (lambda, role) — assert the Proxylity listener wire bag matches exactly
      (`ServiceToken`/`ApiKey` `Fn::FindInMap`, `Protocols:["udp"]`, `ClientRestrictions.Networks`,
      `Destinations[0]` shape). Also assert `Mappings.ProxylityConfig` matches the example's transform.
      Files: `test/synth/packet-counter.ts`, `test/synth/packet-counter.golden.test.ts`.
      Verify: `npx projen test` exits 0; the golden spec passes (synthesized listener Properties ==
      normalized example Properties). No network access occurs (jest offline).

- [ ] 9. Add the CodeBuild wiring mirroring the `proxylity-control` house style: top-level
      `buildspec.yml` batch build-graph referencing nested `build/*.yml`, each invoking a
      `scripts/*.sh` (bash, `set -ex`, `CODEBUILD_*` env). No hardcoded secrets.
      Create a top-level `buildspec.yml` with `batch.build-graph` identifiers `checks` → `package`
      (depend-on checks) → `publish` (depend-on package). Nested specs under `build/`:
      `build/checks.yml` (install deps + run `scripts/checks.sh`), `build/package.yml` (depend-on
      checks, run `scripts/package.sh`), `build/publish.yml` (depend-on package, run
      `scripts/publish.sh`). Shell scripts under `scripts/` (all `#!/usr/bin/env bash`, `set -ex`):
        - `scripts/checks.sh`: `npm ci` then `npx projen build` (lint + jsii compile + jest, incl. the
          synth-diff golden test from item 8).
        - `scripts/package.sh`: `npx jsii-pacmak` (or `npx projen package`) producing all five language
          artifacts into `dist/` (npm tgz, PyPI wheel/sdist, NuGet, Maven, Go).
        - `scripts/publish.sh`: a scripted **stub** — echo the artifacts it would publish and exit 0;
          reference publish credentials only via `secrets-manager`/`parameter-store` placeholders in
          `build/publish.yml` env (as `deploy-regions.yml` does), with NO literal secrets.
      Mirror the install/runtime-version and env-wiring conventions from `proxylity-control\build\*.yml`
      (e.g. `shell: bash`, `runtime-versions.nodejs` for the Node baseline, parameter-store/secrets
      blocks for publish only).
      Files: `c:\Users\leeha\source\proxylity\cdk\buildspec.yml`,
      `c:\Users\leeha\source\proxylity\cdk\build\checks.yml`,
      `c:\Users\leeha\source\proxylity\cdk\build\package.yml`,
      `c:\Users\leeha\source\proxylity\cdk\build\publish.yml`,
      `c:\Users\leeha\source\proxylity\cdk\scripts\checks.sh`,
      `c:\Users\leeha\source\proxylity\cdk\scripts\package.sh`,
      `c:\Users\leeha\source\proxylity\cdk\scripts\publish.sh`.
      Verify: run the checks script locally end to end — `bash scripts/checks.sh` exits 0 (proving the
      buildspec's inner command set is correct); then `bash scripts/package.sh` produces artifacts under
      `dist/` for all five languages (confirm the five language subfolders/files exist under `dist/`).
      `publish.sh` is a stub: `bash scripts/publish.sh` exits 0 without contacting any registry.

- [ ] 10. Write the README L1-usage section and bring `DIVERGENCES.md` current.
      Create/extend `c:\Users\leeha\source\proxylity\cdk\README.md` with: package identity + install
      snippets for all five languages, an L1 usage example reproducing the packet-counter stack with
      `ProxylityConfig` + `CfnListener` (TypeScript), a table of the four resource types and their
      `Custom::ProxylityUdpGateway*` mappings (noting `CfnDestination` is reserved/omitted — D-05), and
      a short "faithful to the control plane; see DIVERGENCES.md" note. Review
      `...\cdk-udp-gateway-l1\DIVERGENCES.md` and append any new divergence discovered during
      implementation (e.g. anything found while writing the golden test); if none, add a dated line
      confirming D-01…D-13 remain the complete set as implemented.
      Files: `c:\Users\leeha\source\proxylity\cdk\README.md`,
      `c:\Users\leeha\source\proxylity\cdk\.agents\tasks\cdk-udp-gateway-l1\DIVERGENCES.md`.
      Verify: `npx projen build` exits 0 (projen validates README is not required to compile, but
      confirms the repo still builds clean after doc/config touches); manually confirm the README L1
      example uses only exported L1 symbols (`ProxylityConfig`, `CfnListener`, `CfnDestinationArn`,
      `CfnPacketSource`) and the five install identities match `package.json`.

- [ ] 11. Final integration pass and local commit checkpoint.
      Run the full build + packaging once more to confirm the whole library is green and all five
      language artifacts are produced from a clean state. Then make a single local commit on the current
      branch (no push, no PR).
      Files: none (verification + commit only).
      Verify: `npx projen build` exits 0 AND `npx jsii-pacmak` populates `dist/` with js/python/dotnet/
      java/go artifacts; then `git add` the new source/config/build files (not `.agents` task scratch
      unless desired) and `git commit` locally. Confirm `git status` shows a clean tree afterward.

---

## Gaps / assumptions

- **Verification commands assume projen.** The design locks projen's `awscdk-construct` type, which
  provides `npx projen build/compile/test/package`. If the implementer chooses hand-rolled jsii config
  instead (design permits it as a build-tooling choice that does not change the public API), substitute
  the equivalent `jsii` / `jest` / `jsii-pacmak` npm scripts — the API, targets, and dependency
  placement in item 1 are unchanged.
- **Golden-diff normalization.** The example template defines sibling resources (lambda, IAM role) that
  the L1 golden stack reproduces structurally but with CDK-generated logical ids. Item 8 asserts the
  Proxylity listener `Properties` wire bag and the `Mappings.ProxylityConfig` transform match exactly;
  it does not require byte-identical whole-template equality (CDK logical-id and metadata differences
  are expected and normalized away).
- **Node baseline.** Design says Node 18+. Item 9's `build/*.yml` should pin a jsii-supported LTS
  (Node 18 or 20) in `runtime-versions.nodejs`; pick the version current in the CodeBuild image at
  implementation time.
- **No L2/L3, no publish execution.** Publishing is a stub by mandate; the real CodeBuild project (IAM,
  source hookup, credentials) is provisioned outside this repo.
