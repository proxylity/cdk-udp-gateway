# Design — `@proxylity/cdk-udp-gateway` L1 construct library

## Overview

This document specifies the L1 (CloudFormation-faithful) layer of the Proxylity UDP Gateway CDK
construct library. L1 is a thin, un-opinionated, 1:1 mirror of the four Proxylity UDP Gateway
CloudFormation custom resources implemented in `proxylity-control/src/listener-resource-lambda`.
Each L1 construct emits exactly one `Custom::ProxylityUdpGateway*` resource with the property keys
the C# Lambda reads, in the PascalCase shape the Lambda expects on the wire. L1 adds **no** derived
IAM, **no** invented enums, and **no** defaults beyond what the resource itself defaults. Where the
hand-written example templates and the resource implementation diverge, the C# implementation is
authoritative; every divergence is logged in `DIVERGENCES.md`.

The design is derived from the C# handler and per-resource helpers (the only normative contract) and
cross-checked against the deployed example templates (`packet-counter`, `wireguard-echo`,
`coap-time-service`, `coap-demo`, `mavlink`, `kinesis-streams`, `sqs`, `syslog`, `event-bridge`,
`location-service`, `udp-to-http`, `packet-counter-multi-region`, `blink`, `radius`) which confirm
the wire shape in practice. The JSON schema at
`proxylity-control/.../listener-schema.json` is cruft and was ignored (see DIVERGENCES D-06).

The four resource types dispatched by `Function.cs` on `ResourceType`:

| L1 construct      | CloudFormation type                           | Status in control plane |
|-------------------|-----------------------------------------------|-------------------------|
| `CfnListener`     | `Custom::ProxylityUdpGatewayListener`         | Implemented             |
| `CfnDestination`  | `Custom::ProxylityUdpGatewayDestination`      | **Not implemented** (throws) — reserved; see D-05 |
| `CfnDestinationArn` | `Custom::ProxylityUdpGatewayDestinationArn` | Implemented             |
| `CfnPacketSource` | `Custom::ProxylityUdpGatewayPacketSource`     | Implemented             |

Plus one non-resource helper, `ProxylityConfig`, that materializes the account/region configuration
mapping and provides typed accessors for `ServiceToken`, `ServiceRole`, and `ApiKey`.

## Technology stack (locked on approval)

- **Language / build:** TypeScript authored, compiled and packaged with **jsii** (`jsii` +
  `jsii-pacmak`), project scaffolded with **projen**'s `awscdk-construct` project type to keep the
  jsii config, tsconfig, eslint, and packaging consistent. (projen is a build-time dev dependency,
  not a runtime dependency; if the team prefers plain jsii config over projen, that is a
  build-tooling choice that does not change the public API — projen is chosen because it is the de
  facto standard for CDK jsii libraries and minimizes hand-maintained config drift.)
- **CDK major version:** aws-cdk-lib **v2**. `aws-cdk-lib` and `constructs` are declared in both
  `peerDependencies` and `devDependencies` and **never** in regular `dependencies` (jsii requirement
  so consumers deduplicate on their own CDK copy).
  - Baseline: `aws-cdk-lib@^2.160.0` (a current, widely-available v2 line) with
    `constructs@^10.0.0`. The caret peer range lets consumers use any compatible newer v2. Dev pin
    tracks the same baseline. (If a newer baseline is current at implementation time, bump the single
    baseline constant; the API does not depend on the exact minor.)
- **Runtime deps:** none beyond the peers. L1 only composes `CfnResource` / `Fn.*` from
  `aws-cdk-lib`, so there is no third-party runtime dependency surface.
- **Node baseline for building:** Node 18+ (jsii-supported LTS).

### jsii / package identity (all five targets from the start)

| Target | Identity |
|--------|----------|
| npm    | `@proxylity/cdk-udp-gateway` |
| PyPI   | dist `proxylity-cdk-udp-gateway`, module `proxylity_cdk_udp_gateway` |
| NuGet  | package/namespace `Proxylity.CDK.UdpGateway` |
| Maven  | group `com.proxylity`, artifact `cdk-udp-gateway`, package `com.proxylity.cdk.udpgateway` |
| Go     | module `github.com/proxylity/cdk-udp-gateway` |

`jsii.targets` in `package.json` is configured for python, dotnet, java, and go simultaneously; npm
is the native output. All public types must be jsii-compliant: no TS unions-of-primitives in public
APIs (model as a single scalar plus validation, or a dedicated type), no structural generics, every
public interface prefixed `I` only for behavioral interfaces (data shapes are plain `interface`
structs ending in `Props`/`Options`).

## Naming strategy

CloudFormation property keys are passed to the Lambda **verbatim in PascalCase** — the Lambda reads
`request.ResourceProperties["Protocols"]`, `["ClientRestrictions"]`, `["Destinations"]`, etc. The
construct therefore builds its `CfnResource` properties object with those exact PascalCase keys.

The jsii/TS **public surface** uses idiomatic camelCase member names (jsii enforces camelCase for
properties), and the construct maps camelCase props to the PascalCase wire keys internally. For
nested objects the mapping is explicit and 1:1 (e.g. TS `clientRestrictions.networks` →
`ClientRestrictions.Networks`). JSDoc on every property names the normative C# property and notes
units/defaults. No wire key is renamed, dropped, or invented.

Protocol-specific properties are **not** split into subtypes in L1 (that is an L2 concern). They are
all optional members on the single `CfnListenerProps`, mirroring the flat property bag the Lambda
accepts; the resource itself rejects invalid cross-protocol combinations. The `Protocols` property is
an array that must contain **exactly one** of `udp` / `wg` / `dtls` / `webrtc` (the validator rejects
more than one).

## `ProxylityConfig` helper

Every example template begins with the same `Mappings.ProxylityConfig` block populated by an
`AWS::Include` transform, and resolves three values via `Fn::FindInMap`. L1 provides a construct that
injects this mapping once per stack and exposes typed accessors so callers never hand-write the
`Fn::FindInMap` tuples.

Wire shape to reproduce exactly (confirmed against `packet-counter.template.json` and every other
example):

```json
"Mappings": {
  "ProxylityConfig": {
    "Fn::Transform": {
      "Name": "AWS::Include",
      "Parameters": {
        "Location": { "Fn::Sub": "s3://proxylity-config-${AWS::Region}/${AWS::AccountId}/customer-config.json" }
      }
    }
  }
}
```

Confirmed `Fn::FindInMap` keys (exact):
- Service token: `Fn::FindInMap(["ProxylityConfig", { Ref: "AWS::Region" }, "ServiceToken"])`
- Service role (destination trust principal): `Fn::FindInMap(["ProxylityConfig", { Ref: "AWS::Region" }, "ServiceRole"])`
- API key: `Fn::FindInMap(["ProxylityConfig", "Account", "ApiKey"])`

Design:

```ts
export class ProxylityConfig extends Construct {
  /** Finds (or creates) the single ProxylityConfig mapping+transform for the given stack. */
  public static forStack(scope: Construct): ProxylityConfig;

  /** Fn::FindInMap(["ProxylityConfig", <region or AWS::Region>, "ServiceToken"]) as a token string. */
  public serviceToken(region?: string): string;
  /** Fn::FindInMap(["ProxylityConfig", <region or AWS::Region>, "ServiceRole"]) as a token string. */
  public serviceRole(region?: string): string;
  /** Fn::FindInMap(["ProxylityConfig", "Account", "ApiKey"]) as a token string. */
  public apiKey(): string;
}
```

Implementation notes:
- `forStack` is idempotent: it looks up a singleton keyed on the enclosing `Stack` (via a stable
  construct id in the stack scope, e.g. `Stack.of(scope).node.tryFindChild('ProxylityConfig')`), so
  multiple resources share one mapping and the transform block is emitted once.
- **Emitting the mapping:** `CfnMapping` cannot represent a value that is an `Fn::Transform` rather
  than a literal map, so L1 does not use it. The chosen mechanism is
  `Stack.of(scope).addOverride('Mappings.ProxylityConfig', { 'Fn::Transform': { Name: 'AWS::Include', Parameters: { Location: Fn.sub('s3://proxylity-config-${AWS::Region}/${AWS::AccountId}/customer-config.json') } } })`.
  `Stack.addOverride` is public API and writes the raw node directly into the synthesized template,
  which is the reliable way to place an `Fn::Transform` inside `Mappings`. The singleton guard
  ensures the override is written exactly once per stack.
- Accessors return `Fn.findInMap('ProxylityConfig', region ?? Aws.REGION, '<key>')`. For the API key
  the second key is the literal `'Account'`.
- Default `region` is `Aws.REGION` (`{ Ref: "AWS::Region" }`), matching every example. Callers in
  multi-region/global stacks (e.g. `coap-demo` global) pass an explicit region string.

**Edge case:** two different stacks in one app each get their own `ProxylityConfig` singleton (keyed
by `Stack.of`). A nested stack is a distinct `Stack`, so it gets its own mapping — correct, because
`AWS::Region`/`AWS::AccountId` resolve per deployed stack.

**Testability:** unit-testable by synthesizing a stack and asserting
`template.toJSON().Mappings.ProxylityConfig` equals the expected `Fn::Transform` object, and that
accessors produce the exact `Fn::FindInMap` intrinsic. No AWS calls.

---

## 1. `CfnListener` — `Custom::ProxylityUdpGatewayListener`

The richest resource. Properties below are the exact set the C# `ListenerRequestValidator` /
`ListenerCreateHelper` / `ListenerHelperExtensions` / `ListenerUpdateHelper` read. Every entry lists
the wire key, type, required/optional, and notes.

### Core properties

| Wire key (PascalCase) | TS prop | Type | Req? | Notes |
|---|---|---|---|---|
| `ServiceToken` | `serviceToken` | `string` | **required** | From `ProxylityConfig.serviceToken()`. |
| `ApiKey` | `apiKey` | `string` | **required** | From `ProxylityConfig.apiKey()`. Verified against Marketplace before any op. |
| `Protocols` | `protocols` | `string[]` | **required** | Array with **exactly one** of `udp`\|`wg`\|`dtls`\|`webrtc`. Validator rejects >1. |
| `Name` | `name` | `string` | optional | C# validator regex is `[a-zA-Z][a-zA-Z0-9 _\-]+` (unanchored — no `^`/`$` — matched with `Regex.IsMatch`, so it matches if the pattern occurs anywhere). L1 does not validate `Name` client-side; JSDoc quotes the regex verbatim rather than an anchored overstatement. If omitted, resource generates a name. |
| `Description` | `description` | `string` | optional | Free text; resource generates one if omitted. |
| `ClientRestrictions` | `clientRestrictions` | `ClientRestrictions` | optional | `{ Networks?: string[]; Domains?: string[] }`. Both arrays of strings. Omitting restrictions admits no traffic (server-side semantic). |
| `Destinations` | `destinations` | `Array<ListenerDestination \| string>` | optional | Each entry is an inline destination **object** or a **string** reference to an existing destination name. Modeled as `IResolvable`/union-free — see "Destinations modeling" below. |
| `MetricsEnabled` | `metricsEnabled` | `boolean` | optional | Listener-level metrics. Requires `Role` server-side (D-09). |
| `LogGroupName` | `logGroupName` | `string` | optional | 1–512 chars, pattern `[a-zA-Z0-9_\-/.#]`. Requires `Role` server-side (D-09). |
| `Role` | `role` | `ListenerRole` | optional | `{ Arn: string; Duration?: string }`. `Duration` is a .NET TimeSpan string (`"1:00:00"` default = 1h). See D-01. Required server-side when metrics/logs set. |

### `ClientRestrictions`

```ts
export interface ClientRestrictions {
  /** CloudFormation ClientRestrictions.Networks — array of allowed outer-client CIDR strings. */
  readonly networks?: string[];
  /** CloudFormation ClientRestrictions.Domains — array of allowed domain strings. */
  readonly domains?: string[];
}
```

### `ListenerRole` (and inline destination `Role`)

```ts
export interface ListenerRole {
  /** CloudFormation Role.Arn — IAM role ARN the Proxylity ServiceRole assumes. */
  readonly arn: string;
  /** CloudFormation Role.Duration — assumed-session TimeSpan string "[d.]hh:mm:ss"; default "1:00:00". See DIVERGENCES D-01. */
  readonly duration?: string;
}
```

### WireGuard (`wg`) properties — only valid when `protocols === ['wg']`

| Wire key | TS prop | Type | Req? | Notes |
|---|---|---|---|---|
| `DecapsulatedDelivery` | `decapsulatedDelivery` | `boolean` | optional | Effective default `false` (D-04). Correct spelling; validator has a typo'd dead branch (D-03). |
| `AllowUnknownPeers` | `allowUnknownPeers` | `boolean` | optional | Default `false`. |
| `UnknownPeerPreSharedKey` | `unknownPeerPreSharedKey` | `string` | optional | base64 32-byte (`^[A-Za-z0-9+/]{43}=$`). Only valid when `AllowUnknownPeers` is true. |
| `Peers` | `peers` | `WireGuardPeer[]` | optional | See below. |
| `KeyRefreshToken` | `keyRefreshToken` | `string` | optional | Update-only rotation marker; changing it regenerates the server key pair on update (D-11). |

```ts
export interface WireGuardPeer {
  /** Peers[].PublicKey — base64 32-byte peer public key (required). */
  readonly publicKey: string;
  /** Peers[].SharedSecret — optional base64 32-byte preshared key. */
  readonly sharedSecret?: string;
  /** Peers[].AllowedIPs — optional array of CIDR strings; resource defaults to 0.0.0.0/0, ::/0. */
  readonly allowedIPs?: string[];
}
```

### DTLS (`dtls`) properties — only valid when `protocols === ['dtls']`

| Wire key | TS prop | Type | Req? | Notes |
|---|---|---|---|---|
| `Psks` | `psks` | `{ [name: string]: string }` | optional | Map of PSK name → non-empty string value. |
| `ServerSecret` | `serverSecret` | `string` | optional | base64 32-byte. **DTLS create ignores a supplied value and always generates a fresh secret** (the validator still rejects a non-base64 value if present). L1 passes it through unchanged. Never returned. See D-12. |
| `RequireCookies` | `requireCookies` | `boolean` | optional | Default `false` for DTLS (D-10). |
| `AllowEarlyData` | `allowEarlyData` | `boolean` | optional | Default `false`. |
| `EarlyDataWindowSeconds` | `earlyDataWindowSeconds` | `number` | optional | Integer 1–604800; resource default 3600. |
| `CertRefreshToken` | `certRefreshToken` | `string` | optional | Update-only cert rotation marker (D-11). |

### WebRTC (`webrtc`) properties — only valid when `protocols === ['webrtc']`

| Wire key | TS prop | Type | Req? | Notes |
|---|---|---|---|---|
| `ServerSecret` | `serverSecret` | `string` | optional | Shared member with DTLS modeling; base64 32-byte. **WebRTC honors a supplied value** (generated if omitted) — unlike DTLS, which discards it (see D-12). Never returned. |
| `RequireCookies` | `requireCookies` | `boolean` | optional | For WebRTC must be `true` if set; resource forces cookies on. (D-10) |
| `WebRtcSignalingMode` | `webRtcSignalingMode` | `string` | optional | `'none'` (default) or `'public'`. |
| `WebRtcSignalingRefreshToken` | `webRtcSignalingRefreshToken` | `string` | optional | Update-only signaling-token rotation marker (D-11). |
| `CertRefreshToken` | `certRefreshToken` | `string` | optional | Update-only cert rotation marker (D-11). |

Because the protocol-specific fields are optional members on one flat props interface, `serverSecret`,
`requireCookies`, and `certRefreshToken` are declared once and documented as DTLS **and** WebRTC. The
validator enforces which combination is legal for the chosen protocol; L1 does not pre-filter. One
behavioral asymmetry on the shared `serverSecret` member must be documented in its JSDoc (D-12):
**WebRTC honors a caller-supplied `serverSecret`** (generating one only when omitted), while **DTLS
create always regenerates and silently discards any supplied value** (the validator still rejects a
non-base64 value for either protocol). L1 passes `serverSecret` through unchanged for both; it does
not strip it for DTLS, because the resource is authoritative — it only warns in JSDoc. The
WebRTC validator additionally rejects any property containing `Psk`/`EarlyData`/`Ticket`,
`KeyRefreshToken`, or starting with `Ice` — L1 does not add such properties, so no special handling
is needed.

### Inline destination (`ListenerDestination`)

Read by `ListenerCreateHelper` from each object in `Destinations`:

```ts
export interface ListenerDestination {
  /** Destinations[].Name — unique within the listener. Resource generates "dstn-<stack>-<logicalId>-<index>" if omitted. */
  readonly name?: string;
  /** Destinations[].Description. */
  readonly description?: string;
  /** Destinations[].Role — { Arn, Duration? }. Duration default "1:00:00" (D-01). */
  readonly role?: ListenerRole;
  /**
   * Destinations[].DestinationArn — a single ARN string, OR a region map { "<region>": arn, "*": arn }.
   * In the map form each non-"*" key must equal the region embedded in its ARN and all ARNs must be
   * the same service; the control-plane rejects violations (D-13). See modeling note.
   */
  readonly destinationArn?: string | DestinationArnMap;
  /** Destinations[].Batching — { Count?, TimeoutInSeconds?, SizeInMB? }. */
  readonly batching?: Batching;
  /** Destinations[].Formatter — one of base64|hex|ascii|utf8|coap. Default utf8 for logs ARNs, base64 otherwise. */
  readonly formatter?: string;
  /** Destinations[].FilterExpression — BREX filter string. */
  readonly filterExpression?: string;
  /** Destinations[].MetricsEnabled. */
  readonly metricsEnabled?: boolean;
  /** Destinations[].LogGroupName — 1–512 chars, pattern [a-zA-Z0-9_\-/.#]. */
  readonly logGroupName?: string;
  /** Destinations[].Arguments — service-specific settings; see DestinationArguments. */
  readonly arguments?: DestinationArguments;
}
```

**`Batching`:**

```ts
export interface Batching {
  /** Batching.Count — max messages per batch. Resource default 100. */
  readonly count?: number;
  /** Batching.TimeoutInSeconds — max wait (fractional seconds). Resource default 0.25. */
  readonly timeoutInSeconds?: number;
  /** Batching.SizeInMB — advisory max batch size in MB (fractional). Resource default 1.0. See D-02. */
  readonly sizeInMB?: number;
}
```

**`DestinationArn` modeling.** The validator accepts either a single ARN **string** or an **object
map** where keys are AWS region names (or `"*"` for the default/fallback) and values are ARN strings.
The map carries two hard rules the validator enforces (D-13): every non-`"*"` key must **equal the
AWS region embedded in its ARN value** (`arn:partition:service:<region>:...`), and all ARNs must be
for the **same service**. L1 does not enforce either rule (un-opinionated); it documents them on the
type so the author sees them at author-time, and the resource returns a `FAILED` reason at deploy if
violated. jsii forbids a public `string | object` union, so L1 models the map as a dedicated type and
keeps the string form as the common case:

```ts
/**
 * Region→ARN map form of an inline destination's DestinationArn. Keys are region names or "*" (fallback).
 *
 * Control-plane rules (ListenerRequestValidator; L1 does not enforce them, the resource rejects
 * violations at deploy — see D-13):
 *  - Every value must be a valid ARN string.
 *  - Each non-"*" key MUST equal the AWS region embedded in its own ARN value
 *    (arn:partition:service:<region>:...). The "*"/default entry is the only key exempt from
 *    region-matching.
 *  - All ARNs in the map must be for the SAME service (all lambda, all sqs, etc.).
 */
export interface DestinationArnMap {
  /** Fallback ARN used when no region-specific entry matches. Serialized as the "*" key (exempt from region-matching). */
  readonly default?: string;
  /**
   * Region-keyed ARNs; e.g. { "us-east-1": "arn:aws:lambda:us-east-1:...", "eu-west-1": "arn:aws:lambda:eu-west-1:..." }.
   * Each key MUST match the region embedded in its ARN value, and all ARNs must be the same service;
   * the control-plane rejects maps that violate either rule (D-13). L1 does not validate this.
   */
  readonly byRegion?: { [region: string]: string };
}
```

The inline `destinationArn` field is typed `string | DestinationArnMap`. **jsii note:** a
`string | <struct>` union is permitted by jsii only when both are reference-free; to stay safe and
language-portable, the implementation exposes `destinationArn?: string` and
`destinationArnMap?: DestinationArnMap` as two mutually-exclusive optional members, and the construct
emits whichever is set (erroring if both are set) into the single `DestinationArn` wire key. The map
serializes to `{ "*": default, "<region>": arn, ... }` (omitting `*` when `default` is absent, and an
empty object `{}` when neither is set, matching `udp-to-http`'s `"DestinationArn": {}`).

**`DestinationArguments`** — the complete known-property set the validator allows under `Arguments`,
gated by destination service. L1 exposes all of them as optional; the resource enforces which apply
to which service ARN:

```ts
export interface DestinationArguments {
  // IoT Data
  readonly dynamicTopicSuffix?: boolean;
  readonly topicSuffixExpression?: string;
  readonly topicSuffixFormatter?: string;      // base64|hex|ascii|utf8
  // Lambda
  readonly tenantId?: string;
  readonly tenantIdExpression?: string;
  readonly tenantIdFormatter?: string;         // base64|hex|ascii|utf8
  readonly useResponseStreaming?: boolean;      // mutually exclusive with useAsyncInvoke
  readonly useAsyncInvoke?: boolean;
  // SQS
  readonly sendRaw?: boolean;
  readonly useMessageAttributes?: boolean;
  readonly messageGroupIdExpression?: string;   // required for FIFO
  readonly messageGroupIdFormatter?: string;    // base64|hex|ascii|utf8
  readonly messageDeduplicationIdExpression?: string;
  readonly messageDeduplicationIdFormatter?: string; // base64|hex|ascii|utf8
  // Kinesis
  readonly partitionKeyExpression?: string;
  readonly partitionKeyExpressionFormatter?: string; // base64|hex|ascii|utf8
  // Location tracker
  readonly deviceIdExpression?: string;
  readonly latitudeExpression?: string;
  readonly longitudeExpression?: string;
  readonly scaleFactor?: number;
  readonly accuracyExpression?: string;
  readonly positionPropertyExpressions?: { [name: string]: string };
  readonly timestampExpression?: string;
  readonly timeUnit?: string;                    // seconds|milliseconds
}
```

The construct serializes each present member to its PascalCase wire key under `Arguments`. Unknown
keys are impossible to emit from the typed surface, which matches the validator's reject-unknown
behavior. `Formatter` enums (`base64`/`hex`/`ascii`/`utf8`/`coap`) are documented in JSDoc as the
accepted set but typed as `string` (L1 invents no enums per the brief; the resource validates).

### `CfnListener` output attributes (`Fn::GetAtt`)

From `ListenerCreateHelper` (`response.Data`) and `ListenerHelperExtensions`. Attribute names are
the exact `response.Data` keys. Exposed as readonly token getters:

| Attribute (GetAtt) | Getter | When | Source |
|---|---|---|---|
| `Id` | `attrId` | always | `response.Data["Id"]` (= listener name) |
| `Port` | `attrPort` | always | allocated port — numeric in `response.Data`, surfaced as a **string token** (see below) |
| `Domain` | `attrDomain` | always | subdomain; full host is `${Domain}.proxylity.com` |
| `DestinationNames` | `attrDestinationNames` | always | **string-list token** — `response.Data["DestinationNames"]` is a JSON array (see below) |
| `WireGuardPublicKey` | `attrWireGuardPublicKey` | `wg` only | base64 server public key |
| `DtlsServerCertificate` | `attrDtlsServerCertificate` | `dtls`/`webrtc` | PEM cert |
| `WebRtcFingerprint` | `attrWebRtcFingerprint` | `webrtc` | SHA-256 cert fingerprint (colon-hex) |
| `WebRtcSctpPort` | `attrWebRtcSctpPort` | `webrtc` | `5000` — numeric in `response.Data`, surfaced as a **string token** (see below) |
| `WebRtcChannelId` | `attrWebRtcChannelId` | `webrtc` | `0` — numeric in `response.Data`, surfaced as a **string token** (see below) |
| `WebRtcSignalingMode` | `attrWebRtcSignalingMode` | `webrtc` | `none`/`public` |
| `WebRtcSignalingToken` | `attrWebRtcSignalingToken` | `webrtc` + `public` | bearer token (sensitive) |
| `WebRtcSignalingUrl` | `attrWebRtcSignalingUrl` | `webrtc` + `public` | signaling URL |

There is **no** `IPv4s` attribute in `CloudFormationResponse`/`ListenerCreateHelper` output — the
brief lists it speculatively. L1 does **not** fabricate an `attrIpv4s`. (Noted here rather than in
DIVERGENCES because it is a brief-vs-code gap, not a schema/doc gap: the create helper's `Data` keys
are `Id`, `Port`, `Domain`, `DestinationNames`, plus the protocol-specific ones above.)

**Getter return types (string tokens, not resolved values).** Every scalar `attr*` getter returns a
**`string` token** via `Fn.getAtt(logicalId, '<Attr>').toString()`. This is true even for the three
attributes that are **numeric** in `response.Data` — `Port`, `WebRtcSctpPort`, and `WebRtcChannelId`
(the C# helper sets `response.Data["Port"] = port` as an int, etc.). jsii cannot return a resolved
number from a `Fn::GetAtt` token, and `Fn::GetAtt` resolves to a string in CloudFormation regardless,
so `attrPort` / `attrWebRtcSctpPort` / `attrWebRtcChannelId` are typed `string`. Callers who need a
numeric value wrap the token with `Token.asNumber(Fn.getAtt(logicalId, 'Port'))`. The `packet-counter`
example consumes `${UdpListener.Port}` inside an `Fn::Sub` (string context), confirming the
string-token form is the right default.

`attrDestinationNames` is a **string-list token** returned via
`Fn.getAtt(logicalId, 'DestinationNames').toStringList()` (a CDK `IResolvable` string list), because
`response.Data["DestinationNames"]` is a JSON **array**. This lets consumers index it with
`Fn.select` (as `event-bridge` does: `Fn::Select[0, Fn::GetAtt[UdpListener, DestinationNames]]`). It
is **not** a comma-joined string — the comma-joined form is only the internal DynamoDB `destinations`
attribute, which is not an output.

Each getter is otherwise emittable unconditionally as a token: CloudFormation resolves them at deploy,
and a getter for an attribute the resource did not return (e.g. `attrWireGuardPublicKey` on a `udp`
listener) will fail at deploy, which is the correct, un-opinionated behavior — L1 does not try to
prevent fetching a non-applicable attribute.

---

## 2. `CfnDestinationArn` — `Custom::ProxylityUdpGatewayDestinationArn`

Registers one ARN for one `Destination` in one ingress region. Read by
`DestinationArnRequestValidator.ValidateRequest`.

| Wire key | TS prop | Type | Req? | Notes |
|---|---|---|---|---|
| `ServiceToken` | `serviceToken` | `string` | **required** | From `ProxylityConfig`. |
| `ApiKey` | `apiKey` | `string` | **required** | From `ProxylityConfig`. |
| `Destination` | `destination` | `string` | **required** | Name of an existing destination (typically `CfnListener.attrDestinationNames` / a known inline name). |
| `IngressRegionKey` | `ingressRegionKey` | `string` | **required** | Ingress region name, or `"*"` to register a **fallback** ARN. Control-plane rules (create helper): `"*"` is rejected when a string/fallback ARN already exists for the destination; any region key is rejected if that key is already present on the destination's ARN map; and all ARNs for one destination must share a service. L1 does not enforce these. Examples pass `{ Ref: "AWS::Region" }`. |
| `Arn` | `arn` | `string` | **required** | A single valid ARN for this region. |

Behavior/edges (from `DestinationArnCreateHelper`): the resource maintains an ARN map on the named
destination keyed by ingress region. The first registration stores a single-key map (any key,
including `*`, is accepted). A later registration against a destination that holds a prior
string/fallback ARN **upgrades** it to a `{ "*": old, "<region>": new }` map and in that path `"*"`
is **rejected** (`'*' cannot be set when there is an existing 'fallback' ARN`). A registration
against a destination that already holds a map is **rejected if the region key is already present**
(`must have distinct ingress region keys`). Across all of these, **all ARNs for one destination must
be the same service** (lambda, sqs, …) or the resource fails. These mirror the inline
`Destinations[].DestinationArn` map rules (D-13), except the standalone resource takes a single `Arn`
string + `IngressRegionKey` rather than a caller-supplied map, so there is no author-time region==ARN
key check here — the key is whatever the caller passes. L1 does not enforce any of these rules
(un-opinionated); it passes the three strings through and the resource rejects conflicts with a
`FAILED` reason.

### Output attributes (`Fn::GetAtt`)

From `DestinationArnCreateHelper` `response.Data`:

| Attribute | Getter | Source |
|---|---|---|
| `Destination` | `attrDestination` | echoed destination name |
| `IngressRegionKey` | `attrIngressRegionKey` | echoed region key |
| `Arn` | `attrArn` | echoed ARN |

Physical resource id is a random 20-char id (so the region key can change without replacement).

---

## 3. `CfnPacketSource` — `Custom::ProxylityUdpGatewayPacketSource`

Subscribes a listener to an SNS topic for server-initiated push. Read by
`PacketSourceRequestValidator.Validate`.

| Wire key | TS prop | Type | Req? | Notes |
|---|---|---|---|---|
| `ServiceToken` | `serviceToken` | `string` | **required** | From `ProxylityConfig`. |
| `ApiKey` | `apiKey` | `string` | **required** | From `ProxylityConfig`. |
| `ListenerName` | `listenerName` | `string` | **required** | Target listener name (e.g. `CfnListener.attrId`). Cannot change on update (resource rejects). |
| `SnsTopicSource` | `snsTopicSource` | `SnsTopicSource` | **required** | `{ TopicArn, Role }`. See below. |
| `Description` | `description` | `string` | optional | Resource generates one if omitted. |
| `Enabled` | `enabled` | `boolean` | optional | **Pass-through only — the current resource ignores it** (D-07). Exposed so faithfully-copied example templates round-trip. |

```ts
export interface SnsTopicSource {
  /** SnsTopicSource.TopicArn — SNS topic ARN, must be in the same region as the stack. */
  readonly topicArn: string;
  /** SnsTopicSource.Role — IAM role ARN (string, NOT a { Arn } object — see DIVERGENCES D-08). */
  readonly role: string;
}
```

### Output attributes

`PacketSourceCreateHelper` sets `response.Data = []` (empty) and a random physical resource id. There
are **no** `Fn::GetAtt` output attributes. L1 exposes `ref` (physical id via `CfnResource.ref`) only;
no `attr*` getters. Documented explicitly so no attributes are fabricated.

---

## 4. `CfnDestination` — `Custom::ProxylityUdpGatewayDestination` (reserved, not shipped functional)

`Function.cs` dispatches this type, but `DestinationCreateHelper.Create` throws
`NotImplementedException` and `DestinationRequestValidator` is empty (D-05). There is no working
standalone Destination resource; destinations are created inline inside `CfnListener.destinations`.

**Decision:** the first L1 release does **not** export a usable `CfnDestination`. The construct is
either (a) omitted entirely, or (b) exported as `@internal`/experimental and documented as "not
supported by the control plane yet; use inline listener destinations." Chosen: **omit from the public
API** to avoid shipping a construct that always fails at deploy, and track re-introduction when the
control plane implements it. The inline `ListenerDestination` shape above already captures the full
destination property surface, so no information is lost.

---

## Construct base, props composition, and shared helpers

All four constructs extend `aws-cdk-lib.CfnResource` (or wrap one as a child and re-expose `ref`),
constructed with `type: 'Custom::ProxylityUdpGateway<X>'` and a `properties` object built by a small
internal mapper that converts the camelCase props struct to the PascalCase wire bag, dropping
`undefined` members (so absent props are not emitted and the resource applies its own defaults).

Boolean/number handling: CloudFormation custom-resource property values are strings on the wire and
the C# validator `bool.TryParse`/`float.Parse`-es them. CDK/jsii serializes TS `boolean`/`number`
to JSON booleans/numbers, which CloudFormation then stringifies into the custom-resource request —
so no manual `.toString()` is required and the resource's string-parsing paths accept them. The
mapper passes native types through; it does **not** pre-stringify (verified consistent with how the
example templates emit `MetricsEnabled: true`, `Batching.Count: 1000`, etc.).

A shared internal `toWire(props)` helper per resource centralizes the camelCase→PascalCase mapping
and nested-object mapping (`ClientRestrictions`, `Role`, `Batching`, `Arguments`, `Peers`,
`SnsTopicSource`, `DestinationArn` map). This is the single place to unit-test the wire shape.

## Error handling (per operation that can fail)

L1 is a template-authoring layer; its only "operations" are synth-time validation and template
emission. There are no network calls in L1.

- **Both `destinationArn` and `destinationArnMap` set on one inline destination** — synth-time error:
  the `toWire` mapper throws an `Error` with a message naming the destination; fatal to synth,
  non-recoverable (user must fix). Not logged (CDK surfaces the thrown error).
- **`ProxylityConfig.forStack` called in a construct not within a `Stack`** — `Stack.of` throws the
  standard CDK error; fatal to synth. L1 adds no handling (standard CDK behavior is clearer).
- **Fetching a protocol-specific attribute that the resource will not return** (e.g.
  `attrWireGuardPublicKey` on a `udp` listener) — L1 does **not** throw at synth (it cannot know the
  protocol reliably when `protocols` is a token). The `Fn::GetAtt` resolves at deploy and
  CloudFormation fails the stack if the attribute is absent. This is the intended un-opinionated
  behavior; JSDoc warns which getters apply to which protocol.
- **Required props missing** — jsii/TS makes `serviceToken`, `apiKey`, `protocols`, etc.
  non-optional, so omission is a compile-time error in TS and a required-arg error in other
  languages. No runtime check needed. Optional-but-conditionally-required server rules (D-09, FIFO
  `MessageGroupIdExpression`, etc.) are **not** enforced by L1; the resource returns a `FAILED`
  custom-resource response with a `Reason`, which CloudFormation surfaces as the stack event. This
  is deliberate: L1 must not reject templates the resource would accept, nor accept-then-mask a
  server rejection with a client guess.
- **Deploy-time resource failures** (invalid ARN, no ports available, duplicate destination name,
  subscription failure) are produced by the Lambda as `response.Status = "FAILED"` with a human
  `Reason`; CloudFormation rolls back. L1 has no part in this path beyond emitting the request.

## Validation rules for external inputs (L1 scope)

L1 performs **minimal** client-side validation, limited to things that cannot be expressed in the
type system and would otherwise emit a structurally-broken template:

- `destinationArn` XOR `destinationArnMap` per inline destination (see above). Required because both
  map to one wire key.
- Everything else — `Protocols` cardinality, CIDR/ARN/base64 formats, name regex, enum membership,
  numeric ranges, cross-field requirements — is **left to the resource** per the un-opinionated
  mandate. JSDoc documents each constraint with the normative rule so the author sees it, but L1 does
  not block. This keeps L1 faithful: if the resource accepts it, L1 emits it; if the resource
  rejects it, the stack event explains why.

Rationale for the one client-side check: it is the only case where a legal-looking TS input would
produce an ambiguous/invalid wire payload (two sources for one key) rather than a value the resource
can evaluate and reject with a clear reason.

## Invariant ownership

- **Property-key fidelity (PascalCase wire keys, nested shapes):** owned by L1's `toWire` mappers.
  This is the core L1 invariant and the thing most worth testing.
- **Semantic validity (protocol/arg/role/format rules):** owned by the control-plane Lambda. L1
  deliberately does not duplicate it (duplication would drift from the normative source — exactly the
  failure mode `DIVERGENCES.md` exists to track).
- **Config mapping singleton-per-stack:** owned by `ProxylityConfig.forStack`.

## Testability

- **Unit (jest + `aws-cdk-lib/assertions` Template):** synthesize a stack per construct and assert
  the emitted `Custom::ProxylityUdpGateway*` resource `Properties` exactly match the expected wire
  bag, including nested `ClientRestrictions`, `Role { Arn, Duration }`, `Batching`, `Arguments`,
  `Peers`, `SnsTopicSource`, and both `DestinationArn` forms. Assert `ProxylityConfig` emits the
  exact `Mappings.ProxylityConfig` transform and `Fn::FindInMap` intrinsics. Assert the XOR error
  throws. Assert `attr*` getters produce the exact `Fn::GetAtt` tuples. All offline, deterministic.
- **Golden/snapshot tests against the example templates:** re-author a representative subset
  (`packet-counter`, `wireguard-echo`, `coap-time-service` coap, `event-bridge` region-map,
  `packet-counter-multi-region` DestinationArn, `coap-demo`/`blink` PacketSource) in CDK and
  snapshot-compare the synthesized `Resources`/`Mappings`/`Outputs` subtree against the hand-written
  JSON (normalizing logical ids and generated names). This is the strongest guarantee that L1 "emits
  exactly the CloudFormation the example templates produce." These are integration-style but still
  offline (`cdk synth` only, no deploy).
- **No live-AWS tests are needed for L1** (no runtime behavior). Deploy-time behavior belongs to
  control-plane tests, not this library.
- A design that is hard to test would show up as "cannot assert exact Properties" — the single
  `toWire` mapper per resource keeps assertions direct, which is a signal the decomposition is right.

## Build / packaging (buildspecs + scripts live in this repo; CodeBuild project defined elsewhere)

- `projen` generates `package.json` with `jsii`/`jsii.targets` for all five languages,
  `peerDependencies` + `devDependencies` for `aws-cdk-lib`/`constructs`, and `jsii-pacmak` packaging
  scripts.
- A `buildspec.yml` (and any helper scripts under `scripts/`) run: install → `jsii` compile →
  jest tests → `jsii-pacmak` to produce npm/PyPI/NuGet/Maven/Go artifacts. The actual CodeBuild
  project (IAM, source hookup, publish credentials) is provisioned outside this repo per the user's
  usual pattern; this repo only carries the buildspec + scripts. (Detailed buildspec authoring is a
  follow-on step; this design fixes the package identity, targets, and dependency placement those
  files must honor.)

## Summary of the per-resource property surface

- **`CfnListener`** (`Custom::ProxylityUdpGatewayListener`): required `ServiceToken`, `ApiKey`,
  `Protocols` (single-element `udp|wg|dtls|webrtc`); optional `Name`, `Description`,
  `ClientRestrictions {Networks[], Domains[]}`, `Destinations[]` (inline object or string ref),
  listener-level `MetricsEnabled`, `LogGroupName`, `Role {Arn, Duration}`; protocol-specific —
  wg: `DecapsulatedDelivery`, `AllowUnknownPeers`, `UnknownPeerPreSharedKey`, `Peers[]`,
  `KeyRefreshToken`; dtls: `Psks`, `ServerSecret`, `RequireCookies`, `AllowEarlyData`,
  `EarlyDataWindowSeconds`, `CertRefreshToken`; webrtc: `ServerSecret`, `RequireCookies`,
  `WebRtcSignalingMode`, `WebRtcSignalingRefreshToken`, `CertRefreshToken`. Inline destination:
  `Name`, `Description`, `Role {Arn, Duration}`, `DestinationArn` (string | region map w/ `*`),
  `Batching {Count, TimeoutInSeconds, SizeInMB}`, `Formatter`, `FilterExpression`, `MetricsEnabled`,
  `LogGroupName`, `Arguments {…service-specific…}`. Outputs: `Id`, `Port`, `Domain`,
  `DestinationNames`, + protocol-specific (`WireGuardPublicKey`; `DtlsServerCertificate`;
  `WebRtcFingerprint`, `WebRtcSctpPort`, `WebRtcChannelId`, `WebRtcSignalingMode`,
  `WebRtcSignalingToken`, `WebRtcSignalingUrl`). No `IPv4s` attribute exists.
- **`CfnDestinationArn`** (`Custom::ProxylityUdpGatewayDestinationArn`): required `ServiceToken`,
  `ApiKey`, `Destination`, `IngressRegionKey`, `Arn`. Outputs: `Destination`, `IngressRegionKey`,
  `Arn`.
- **`CfnPacketSource`** (`Custom::ProxylityUdpGatewayPacketSource`): required `ServiceToken`,
  `ApiKey`, `ListenerName`, `SnsTopicSource {TopicArn, Role(string)}`; optional `Description`,
  `Enabled` (pass-through, currently ignored). No `Fn::GetAtt` outputs.
- **`CfnDestination`** (`Custom::ProxylityUdpGatewayDestination`): control-plane handler throws
  `NotImplementedException`; omitted from the public L1 API this release.
- **`ProxylityConfig`** helper: injects the `Mappings.ProxylityConfig` `AWS::Include` transform and
  resolves `ServiceToken`/`ServiceRole` (per region) and `ApiKey` (`Account`) via `Fn::FindInMap`.

Divergences from schema/docs are recorded in `DIVERGENCES.md` (D-01 … D-13).

---

## Responses to design-review findings

This design is a revision following `design-review.md` / `design-review.json`
(verdict: **CHANGES_REQUESTED**, 2 MEDIUM + 4 NIT, 0 HIGH). Every finding was verified directly
against the C# source and **addressed**; none backlogged or ignored.

- **Finding 1 (MEDIUM — DTLS `ServerSecret` not honored on create): ADDRESSED.** Verified
  `ListenerHelperExtensions.WithDtlsSpecificAttributes`: the `dtls` case does
  `item["server_secret"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))` unconditionally
  (caller value discarded), while the `webrtc` case uses `request?["ServerSecret"] ?? <generated>`
  (caller value honored); `ListenerUpdateHelper` only overrides with a supplied value for `webrtc`.
  The validator still rejects a non-base64 `ServerSecret` for either protocol. Corrected the DTLS and
  WebRTC `ServerSecret` rows, the shared-member paragraph, and added **DIVERGENCES D-12**. L1 passes
  the value through unchanged for both.
- **Finding 2 (MEDIUM — `DestinationArnMap.byRegion` region-key constraint under-specified):
  ADDRESSED.** Verified the inline-destination `DestinationArn` map branch in
  `ListenerRequestValidator`:
  `m.All(p => p.Key == "*" || (Arn.TryParse(..., out var marn) && marn.Region == p.Key))` and
  `m.DistinctBy(... .Service).Count() < 2`. Documented on `DestinationArnMap` (type + `byRegion` +
  `default`), on the inline `destinationArn` field, in the modeling paragraph, mirrored in the
  standalone `CfnDestinationArn` section, and added **DIVERGENCES D-13**.
- **Finding 3 (NIT — standalone `CfnDestinationArn` fallback-key rule only in prose): ADDRESSED.**
  Verified `DestinationArnCreateHelper` (`upgrade_arn_string_to_map` rejects `*` when a fallback
  exists; `update_arn_map` rejects a duplicate region key; service-match enforced throughout). Moved
  the concrete rule into the `ingressRegionKey` property note and tightened the behavior paragraph.
- **Finding 4 (NIT — numeric outputs must be documented as string tokens): ADDRESSED.** Added an
  explicit "Getter return types" paragraph stating all scalar `attr*` getters return `string` tokens
  via `Fn.getAtt(...).toString()`, including `attrPort` / `attrWebRtcSctpPort` / `attrWebRtcChannelId`
  (numeric in `response.Data`), with the `Token.asNumber(...)` escape hatch; annotated the three rows.
- **Finding 5 (NIT — `attrDestinationNames` modeling vague): ADDRESSED.** Specified it returns a
  string-list token via `.toStringList()` (consumable with `Fn.select`, as `event-bridge` does) and
  dropped the "joined" wording; the GetAtt output is a JSON array, not the internal comma-joined
  DynamoDB attribute.
- **Finding 6 (NIT — `Name` regex shown anchored): ADDRESSED.** Verified the generated regex
  `[a-zA-Z][a-zA-Z0-9 _\-]+` (unanchored, `IsMatch`); the `Name` note now quotes it verbatim and
  states L1 does not validate `Name` client-side.
