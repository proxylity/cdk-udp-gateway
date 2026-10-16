# Review — L1 `@proxylity/cdk-udp-gateway` construct library

The L1 layer wraps the four `Custom::ProxylityUdpGateway*` custom resources as thin jsii/TypeScript
constructs plus a `ProxylityConfig` helper. Each construct emits exactly one custom resource with the
PascalCase wire keys the C# control-plane Lambda reads, maps idiomatic camelCase props to those keys
through a single internal mapper, surfaces outputs via `Fn::GetAtt`, and invents no defaults, IAM, or
enums. I checked every wire key, nested shape, and output name against the normative C# helpers
(`ListenerRequestValidator`, `ListenerCreateHelper`, `ListenerHelperExtensions`,
`DestinationArn*`, `PacketSource*`, `CloudFormationResponse`) and against the packet-counter template.
Build wiring mirrors the proxylity-control batch-graph house style with a secret-free publish stub.

Watch for: nothing blocking. One cosmetic doc-grouping nit in `CfnListenerProps` (WebRTC signaling
members sit under a `// DTLS` comment banner) — confirmed, non-blocking, wire mapping is correct.

**Verdict**: APPROVED

## High-level view

The four constructs are faithful 1:1 mirrors. `CfnListener` carries the full flat property bag — core
props, WireGuard, DTLS, WebRTC, inline destinations, and all `Arguments` — and every member maps to
the exact PascalCase key the validator/create-helper reads (`Role.Arn`, `ClientRestrictions.Networks`,
`Batching.{Count,TimeoutInSeconds,SizeInMB}`, `Peers[].{PublicKey,SharedSecret,AllowedIPs}`,
`SnsTopicSource.{TopicArn,Role}`). `CfnDestinationArn` and `CfnPacketSource` are smaller and equally
exact. `CfnDestination` is correctly omitted because its control-plane handler throws.

Output attributes are surfaced via `Fn::GetAtt` using the exact `response.Data` keys from the C#
helpers — `Id`, `Port`, `Domain`, `DestinationNames` (as a string-list token), and the protocol-
specific WireGuard/DTLS/WebRTC set — with no fabricated `IPv4s`. Scalars are string tokens, which is
correct for `Fn::GetAtt`.

L1 adds no opinions. It does not enforce the cross-field rules (region==ARN-region, same-service,
role-required-with-metrics, single-protocol), passes `ServerSecret` through unchanged for both DTLS
and WebRTC despite the DTLS discard asymmetry, and passes `Enabled` through on packet sources even
though the resource ignores it. Each divergence is documented in JSDoc with its D-xx reference. The
one client-side check — `destinationArn` XOR `destinationArnMap` — exists only because both collapse
to a single wire key.

The `ProxylityConfig` helper emits the `AWS::Include` transform under `Mappings.ProxylityConfig` via a
minimal `CfnElement` (because `CfnMapping` cannot hold a transform-valued entry), singleton per stack,
and its `Fn::FindInMap` accessors match the packet-counter template exactly, including the literal
`Account` key for `apiKey()`.

All five jsii targets are configured and `aws-cdk-lib`/`constructs` are peer+dev only. The synth-diff
golden test genuinely deep-equals the synthesized listener Properties and the ProxylityConfig mapping
against the packet-counter template, including an exact key-set assertion.

<details>
<summary>Issues (1)</summary>

1. **WebRTC signaling members under a DTLS comment banner** (confirmed, non-blocking) — in
   `CfnListenerProps`, `webRtcSignalingMode` and `webRtcSignalingRefreshToken` are declared under the
   `// --- DTLS (dtls) ... ---` comment group. The wire mapping and JSDoc are correct; only the source
   comment grouping is misleading. Move them under a WebRTC banner in a future touch.

</details>

<details>
<summary>Details</summary>

### Resource types and wire-key fidelity

Each construct sets the correct `Type` constant: `Custom::ProxylityUdpGatewayListener`,
`Custom::ProxylityUdpGatewayDestinationArn`, `Custom::ProxylityUdpGatewayPacketSource`. The single
`toWire`/`wireObject` mapper is the only camelCase→PascalCase translation point and drops `undefined`
entries while preserving meaningful empty values (the explicit `DestinationArn: {}` default).

Listener core keys match `ListenerRequestValidator` / `ListenerCreateHelper` exactly:
`ServiceToken`, `ApiKey`, `Protocols` (array), `Name`, `Description`, `ClientRestrictions.{Networks,
Domains}` (CIDR/domain string arrays), `MetricsEnabled`, `LogGroupName`, and listener-level
`Role.{Arn,Duration}`. The create helper reads `a.destination["Role"]?["Arn"]` and
`Role?["Duration"]` parsed as a .NET `TimeSpan` defaulting to `"1:00:00"` — L1 models `duration` as
the raw string with D-01 called out in JSDoc, inventing no `DurationInMinutes`.

Inline destinations map `Name`, `Description`, `Role`, `DestinationArn`, `Batching`, `Formatter`,
`FilterExpression`, `MetricsEnabled`, `LogGroupName`, `Arguments` — the exact set the create helper
reads. `Batching` serializes `Count`/`TimeoutInSeconds`/`SizeInMB` (the three keys the helper parses,
with `SizeInMB`×1024² and `TimeoutInSeconds`×1000 happening server-side; L1 correctly stays in the
caller's units per D-02). The validator accepts each `Destinations` entry as an object or a string
name-reference; L1 models this as `Array<ListenerDestination | string>` and passes a string entry
through verbatim.

The protocol-specific keys match `ListenerHelperExtensions`:
WireGuard reads `AllowUnknownPeers`, `UnknownPeerPreSharedKey`, `DecapsulatedDelivery`, and
`Peers[].{PublicKey,SharedSecret,AllowedIPs}` — all present and correctly spelled (`DecapsulatedDelivery`,
not the validator's dead-key typo, D-03). DTLS reads `Psks`, `ServerSecret`, `RequireCookies`,
`AllowEarlyData`, `EarlyDataWindowSeconds`; WebRTC reads `ServerSecret`, `WebRtcSignalingMode`,
`WebRtcSignalingRefreshToken` and forces cookies on. All are present as optional members on the flat
bag, matching the resource's own flat shape. The shared `serverSecret` is passed through unchanged for
both protocols with the DTLS-discard asymmetry documented in JSDoc (D-12) rather than enforced — the
un-opinionated choice the brief requires.

`Arguments` exposes the complete known set the validator allows (IoT/Lambda/SQS/Kinesis/location-
tracker), each mapped to its PascalCase key. Unknown keys cannot be emitted from the typed surface,
which lines up with the validator's reject-unknown behavior.

### DestinationArn string-or-map modeling

jsii forbids a public `string | struct` union, so the inline destination exposes mutually-exclusive
`destinationArn?: string` and `destinationArnMap?: DestinationArnMap`, both collapsing to the single
`DestinationArn` wire key. The map serializes to `{ "*": default, "<region>": arn }`, omits `*` when
no default, and emits `{}` when neither form is set — matching the validator's `null → {}` default and
`udp-to-http`'s empty-object case. Setting both forms throws at synth; this is the only client-side
check and it exists purely because the wire key is singular. The region==ARN-region and same-service
rules (D-13) are documented on the type, not enforced — correct for L1.

### Output attributes

The listener getters match `response.Data` from `ListenerCreateHelper` /
`ListenerHelperExtensions.AddCertificateOutputs` / `AddSignalingOutputs` exactly: `Id`, `Port`,
`Domain`, `DestinationNames`, `WireGuardPublicKey`, `DtlsServerCertificate`, `WebRtcFingerprint`,
`WebRtcSctpPort`, `WebRtcChannelId`, `WebRtcSignalingMode`, `WebRtcSignalingToken`,
`WebRtcSignalingUrl`. There is no `IPv4s` key in the C# response and L1 fabricates none. Scalars are
returned as `Fn.getAtt(...).toString()` string tokens — the only correct form for `Fn::GetAtt`, even
for the numeric `Port`/`WebRtcSctpPort`/`WebRtcChannelId` — and `DestinationNames` is a string-list
token so consumers can `Fn.select` into it, matching the JSON-array shape the helper writes.

`CfnDestinationArn` outputs `Destination`/`IngressRegionKey`/`Arn`, matching `DestinationArnCreateHelper`'s
`response.Data` keys exactly. `CfnPacketSource` exposes only `ref`, correct because
`PacketSourceCreateHelper` returns no `Data` attributes.

### PacketSource role and Enabled fidelity

`PacketSourceRequestValidator` reads the role from `SnsTopicSource.Role` as a bare string ARN
(`srn.GetValue<string>()`), not a `{Arn,Duration}` object, and never reads `Enabled`. L1 models
`SnsTopicSource` as `{ topicArn: string; role: string }` (D-08) and exposes `enabled` as a documented
pass-through (D-07). Both match the C# precisely.

### ProxylityConfig mapping and accessors

`CfnMapping` cannot represent a transform-valued mapping entry, so the helper emits the raw
`Mappings.ProxylityConfig` node (`Fn::Transform` → `AWS::Include` with the
`s3://proxylity-config-${AWS::Region}/${AWS::AccountId}/customer-config.json` location) from a minimal
`CfnElement`, guarded as a per-stack singleton via `Stack.of(scope).node.tryFindChild`. This matches
the packet-counter template's mapping block. Accessors return
`Fn.findInMap('ProxylityConfig', region ?? Aws.REGION, '<key>')`; `apiKey()` uses the literal
`Account` key. These reproduce the exact `Fn::FindInMap` tuples the examples use.

### CfnDestination omission

`src/index.ts` exports only the four intended symbols and documents why `CfnDestination` is absent:
`DestinationCreateHelper.Create` throws `NotImplementedException` and `DestinationRequestValidator` is
empty (D-05), so a standalone construct would always fail at deploy. Correct to omit.

### jsii targets and dependency placement

`package.json` configures python, dotnet, java, and go targets (npm native) with the exact identities
from the design. `aws-cdk-lib@^2.160.0` and `constructs@^10.0.0` appear only under `peerDependencies`
and `devDependencies` (dev pins `constructs` to `10.0.0` to satisfy the jsii peer/dev-match check);
there is no `dependencies` block, so nothing leaks into runtime deps. This is the jsii-correct layout.

### Build wiring

`buildspec.yml` is a `batch.build-graph` of `checks → package → publish`, each pointing at a nested
`build/*.yml` that invokes a `scripts/*.sh` (`#!/usr/bin/env bash`, `set -ex`, `CODEBUILD_*` env),
and even carries proxylity-control's `echo "Ziggy was here."` build-phase sentinel — a faithful mirror
of the house style. `scripts/checks.sh` runs `npm ci` + lint + compile + test; `scripts/package.sh`
runs `jsii-pacmak` for all five targets; `scripts/publish.sh` is a stub that lists what it would push
and exits 0. Publish credentials appear only as `parameter-store`/`secrets-manager` placeholders in
`build/publish.yml`; no literal secrets anywhere.

### Golden synth test

`test/synth/packet-counter.golden.test.ts` re-authors the packet-counter stack with L1 constructs and
asserts: `Mappings.ProxylityConfig` deep-equals the example transform; the listener `Type` matches;
the inline destination's `Role`/`Batching`/`MetricsEnabled`/`DestinationArn` match; and — the real
teeth — `expect(new Set(Object.keys(synthProps))).toEqual(new Set(Object.keys(exampleProps)))` plus
`expect(synthProps).toEqual(exampleProps)`, a whole-Properties deep-equal with an exact key set. The
stand-in stack reuses the example's `PacketCounterLambda`/`DestinationRole` logical names so the
`Fn::GetAtt` ARN tuples compare equal without normalization. This is a genuine wire-shape comparison,
not a shallow spot-check.

### Verification evidence

The VERIFICATION.md and commit message record `npm install` OK, `jsii` compile zero errors, eslint
clean, jest 27/27 across 5 suites (including the golden diff), and `jsii-pacmak` producing npm/.NET/
Python artifacts locally with Java/Go deferred to the CodeBuild image that pins their toolchains. The
unit specs assert the exact PascalCase bags, both `DestinationArn` forms, the XOR throw, string
name-references, WireGuard peers, `Arguments` mapping, optional-omission, and the exact `Fn::GetAtt`
tuples. The evidence is specific and consistent with the source I read; no re-run was warranted.

</details>

<details>
<summary>File map</summary>

- `src/index.ts` — public exports; documents the intentional `CfnDestination` omission.
- `src/private/to-wire.ts` — internal `wireObject` camelCase→PascalCase mapper, drops `undefined`.
- `src/proxylity-config.ts` — `ProxylityConfig` helper; emits the `AWS::Include` mapping + FindInMap accessors.
- `src/cfn-listener.ts` — `CfnListener` + all nested structs and `attr*` getters.
- `src/cfn-destination-arn.ts` — `CfnDestinationArn` + three echo getters.
- `src/cfn-packet-source.ts` — `CfnPacketSource` + `SnsTopicSource` (bare-string role).
- `test/*.test.ts`, `test/synth/*` — unit specs + packet-counter golden diff.
- `package.json` — five jsii targets; peer+dev-only CDK deps.
- `buildspec.yml`, `build/*.yml`, `scripts/*.sh` — CodeBuild batch graph; secret-free publish stub.

Full change: `git show 9e0319e` in `c:\Users\leeha\source\proxylity\cdk`.

</details>
