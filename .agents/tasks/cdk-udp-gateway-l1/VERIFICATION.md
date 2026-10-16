# Verification evidence — cdk-udp-gateway L1

This note records exactly what was run and the results, so the reviewer can read the evidence
WITHOUT re-running the suites. All runs were local, synth-only, and made NO live AWS calls.

Environment: Windows, Node v24.20.0, npm 11.19.0 (official MSI install at `C:\Program Files\nodejs`).
jsii 5.5.x, jsii-pacmak 1.103.x, aws-cdk-lib 2.160.0, constructs 10.0.0, jest 29, ts-jest 29.

Note on the shell: this machine's PowerShell echoes commands character-by-character and returns a
spurious exit code of `-1` even on success, so each command's stdout/stderr was redirected to a log
file and the log read back. Success was judged by the real output content (compiler result, test
counts, artifact listings, and the bash `set -e` exit code), not by the shell's reported code.

## 1. Dependency install — PASS

`npm install` (and `npm install --package-lock-only` to produce `package-lock.json`).
Result: `added ... packages ... in 16s`, exit 0. A deprecation warning for eslint@8 (transitive,
harmless). `node_modules/` and `package-lock.json` present.

## 2. jsii compile (`npx jsii --silence-warnings=reserved-word`) — PASS, ZERO errors

- First run surfaced three real errors, all fixed:
  - `Stack.addOverride` does not exist → replaced the ProxylityConfig mapping emission with a minimal
    internal `CfnElement` subclass whose `_toCloudFormation()` returns the raw
    `Mappings.ProxylityConfig` `Fn::Transform` node.
  - `CfnMapping.addOverride` / `addDeletionOverride` do not exist → same fix (dropped the CfnMapping
    approach entirely).
  - JSII6 peer/dev mismatch warning → pinned `constructs` devDependency to `10.0.0` to match the
    `^10.0.0` peer.
  - JSII3 "no README.md" warning → added `README.md`.
- Final clean run (artifacts removed first): no `error TS...` lines; `.jsii` assembly produced and
  `lib/index.js` + per-construct `lib/*.js` emitted. The only stderr was the jsii EOS/untested-Node
  banner (informational; silenced via `JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1`).
- Confirmed: `.jsii=True libindex=True cfnlistener=True`.

## 3. ESLint (`npm run lint`) — PASS

`eslint --ext .ts src test` → exit 0, no findings.

## 4. Unit + golden synth tests (`npx jest --ci`) — PASS, 27/27

```
Test Suites: 5 passed, 5 total
Tests:       27 passed, 27 total
```

Suites:
- `test/proxylity-config.test.ts` — asserts `Mappings.ProxylityConfig` equals the exact `AWS::Include`
  `Fn::Transform` block (emitted exactly once; idempotent `forStack`), and that `serviceToken`,
  `serviceRole`, `apiKey` produce the exact `Fn::FindInMap` intrinsics (incl. the literal `Account`
  key and explicit-region form).
- `test/cfn-listener.test.ts` — asserts `Custom::ProxylityUdpGatewayListener` Type and PascalCase
  wire bag: core props, `ClientRestrictions.Networks`, inline destination `Role {Arn,Duration}`,
  `Batching {Count,TimeoutInSeconds,SizeInMB}`, `MetricsEnabled`, string `DestinationArn`, the
  `destinationArnMap` → `{ "*": default, "<region>": arn }` serialization, the empty-object `{}`
  default, the `destinationArn` XOR `destinationArnMap` throw, string name-reference destinations,
  WireGuard `Peers`/flags, `Arguments` PascalCase mapping, omission of undefined optionals, and the
  exact `Fn::GetAtt` tuples for every `attr*` getter (incl. the `attrDestinationNames` string-list
  via `Fn.select`).
- `test/cfn-destination-arn.test.ts` — Type + required props + `attr*` GetAtt tuples.
- `test/cfn-packet-source.test.ts` — Type + `SnsTopicSource {TopicArn, Role(string)}` (D-08: Role is
  a bare string), `Enabled` pass-through, omission of optionals.
- `test/synth/packet-counter.golden.test.ts` — the golden diff (below).

### First jest run (before fix)
2 failures, both test-authoring bugs: `(resource as any).logicalId` returned an unresolved token;
fixed by comparing against `stack.resolve(resource.logicalId)`. Re-run: 27/27 PASS.

## 5. Golden synth diff vs the hand-written example — PASS

`test/synth/packet-counter.golden.test.ts` synthesizes the L1-authored `PacketCounterStack`
(`ProxylityConfig.forStack` + a single `udp` `CfnListener` with one inline Lambda destination) and
compares against `examples/packet-counter/packet-counter.template.json`:
- `Mappings.ProxylityConfig` deep-equals the example's `Fn::Transform` block.
- The listener `Type` is `Custom::ProxylityUdpGatewayListener`.
- The listener `Properties` wire bag deep-equals the example's, key-set and all:
  - `ServiceToken`/`ApiKey` identical `Fn::FindInMap` intrinsics.
  - `Protocols: ["udp"]`.
  - `ClientRestrictions.Networks` = `[{ Ref: "ClientCidrToAllow" }]`.
  - `Destinations[0]`: `Description`, `Role` = `{ Arn: { Fn::GetAtt: [DestinationRole, Arn] } }`,
    `Batching` = `{ Count: 1000, TimeoutInSeconds: 1 }`, `MetricsEnabled: true`,
    `DestinationArn` = `{ Fn::GetAtt: [PacketCounterLambda, Arn] }`.
  - The emitted key set equals the example's exactly — no extra keys.

No structural differences were required; the listener wire bag is byte-equivalent to the example's
intent. (The L1 golden stack represents the example's sibling Lambda/IAM role via the same logical
names `PacketCounterLambda` / `DestinationRole` so the `Fn::GetAtt` tuples compare equal without
normalization; it does not synthesize the Serverless function / IAM role bodies, which are out of
scope for the L1 wire-shape check.)

## 6. Multi-language packaging (`jsii-pacmak`) — PARTIAL locally; full in CodeBuild

- jsii compile already validated all five `jsii.targets` configs and the public API's cross-language
  jsii-compliance (no primitive unions, no structural generics, data structs end in `Props`/`Options`).
- `jsii-pacmak -t js -t dotnet -t python` produced artifacts under `dist/`:
  - `dist/js/cdk-udp-gateway@0.1.0.jsii.tgz` (npm)
  - `dist/dotnet/Proxylity.CDK.UdpGateway.0.1.0.nupkg` (NuGet)
  - `dist/python/proxylity_cdk_udp_gateway-0.1.0-py3-none-any.whl` + `...-0.1.0.tar.gz` (PyPI)
  - the Go module source was also fully generated under `dist/go/cdkudpgateway/` in an earlier
    full-target run.
- The Java (`mvn`) and Go (`go`) targets could not be *packaged* locally because Maven and the Go
  toolchain are not installed on this dev box (`'mvn' is not recognized`, `'go' is not recognized`).
  This is a toolchain-availability gap, not a library defect: the CodeBuild `package` stage pins
  `java: corretto21` and `golang: 1.21` (see `build/package.yml`) so all five targets build there.

## 7. CodeBuild wiring scripts — PASS (inner command sets exercised)

- `scripts/checks.sh` run end-to-end via git-bash with Node on PATH → `set -e` exit 0 (npm ci + lint
  + compile + jest all succeeded; the same commands are proven green individually above).
- `scripts/publish.sh` run via git-bash → exit 0, listed the four `dist/` artifacts it WOULD publish,
  pushed nothing (pure stub). No literal secrets anywhere; publish credentials are referenced only as
  parameter-store/secrets-manager placeholders in `build/publish.yml`.
- `scripts/package.sh` inner command (`npm run package` = `jsii-pacmak`) exercised in §6.

## Files produced

Source: `src/index.ts`, `src/proxylity-config.ts`, `src/cfn-listener.ts`, `src/cfn-destination-arn.ts`,
`src/cfn-packet-source.ts`, `src/private/to-wire.ts`.
Tests: `test/proxylity-config.test.ts`, `test/cfn-listener.test.ts`, `test/cfn-destination-arn.test.ts`,
`test/cfn-packet-source.test.ts`, `test/synth/packet-counter.ts`, `test/synth/packet-counter.golden.test.ts`.
Config: `package.json`, `tsconfig.dev.json`, `jest.config.js`, `.eslintrc.json`, `.gitignore`,
`.npmignore`, `README.md`, `package-lock.json`.
Build: `buildspec.yml`, `build/{checks,package,publish}.yml`, `scripts/{checks,package,publish}.sh`.
