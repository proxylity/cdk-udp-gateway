# DIVERGENCES — cdk-udp-gateway L1

Running log of every place the JSON schema, docs, or example templates disagree with the
normative C# implementation in `proxylity-control/src/listener-resource-lambda`. The C#
implementation wins. **Do not fix the control-plane repo from this task** — this file is the
hand-off list for a follow-up.

Normative sources read:
- `helpers/Listeners/ListenerRequestValidator.cs`, `ListenerCreateHelper.cs`, `ListenerHelperExtensions.cs`, `ListenerUpdateHelper.cs`
- `helpers/Destinations/DestinationCreateHelper.cs`, `DestinationRequestValidator.cs`
- `helpers/DestinationArns/DestinationArnCreateHelper.cs`, `DestinationArnRequestValidator.cs`
- `helpers/PacketSources/PacketSourceCreateHelper.cs`, `PacketSourceRequestValidator.cs`
- `CloudFormationRequest.cs`, `CloudFormationResponse.cs`, `Function.cs`

---

## D-01 — Destination role duration key is `Duration`, not `DurationInMinutes`
- **Where:** task brief and some prose docs refer to `Role { Arn, DurationInMinutes }`.
- **Normative (C#):** `ListenerCreateHelper.cs` reads `a.destination["Role"]?["Duration"]` and
  `request...Get("Role")?["Duration"]`, parsed with `TimeSpan.Parse(...)` defaulting to `"1:00:00"`
  (one hour). The value is a **.NET TimeSpan string** (e.g. `"1:00:00"`, `"0:30:00"`), not minutes
  and not seconds.
- **L1 decision:** expose the wire key exactly as `Duration` (string). Do **not** invent
  `DurationInMinutes`. JSDoc documents the TimeSpan `[d.]hh:mm:ss` format and the 1-hour default.

## D-02 — Batching keys: `Count`, `TimeoutInSeconds`, `SizeInMB`
- **Where:** schema (`listener-schema.json`, cruft) and examples.
- **Normative (C#):** `ListenerCreateHelper.cs` reads `Batching.Count` (default `"100"`),
  `Batching.SizeInMB` (default `"1.0"`, multiplied by 1024*1024 to bytes), and
  `Batching.TimeoutInSeconds` (default `"0.25"`, multiplied by 1000 to ms). All three are read as
  strings and parsed. Examples only ever set `Count` and `TimeoutInSeconds`; `SizeInMB` appears in
  the schema but in no example template.
- **L1 decision:** expose all three (`Count`, `TimeoutInSeconds`, `SizeInMB`) as optional numbers.
  `TimeoutInSeconds` and `SizeInMB` are fractional (seconds / megabytes), `Count` is an integer.

## D-03 — WireGuard `DecapsulatedDelivery` is read, but the validator checks a typo'd key
- **Normative (C#):** `ListenerHelperExtensions.WithWireGuardSpecificAttributes` reads
  `request?["DecapsulatedDelivery"]` (correct spelling). The validator
  (`ListenerRequestValidator.cs`) lists the WireGuard-specific property as `DecapsulatedDelivery`
  in its guard array **but** separately validates `request.ResourceProperties?["DecapulatedDelivery"]`
  (missing the second `s`). So the validator's type-check branch is dead code; the effective
  behavior reads `DecapsulatedDelivery`. Examples (`coap-time-service`, `syslog`, `radius`) all use
  the correctly spelled `DecapsulatedDelivery`.
- **L1 decision:** expose `DecapsulatedDelivery` (correct spelling) only. Record the control-plane
  typo for follow-up. Boolean, optional, default `false` (the extension defaults to `false` when
  absent, though prose docs claim a `true` default — see D-04).

## D-04 — WireGuard `DecapsulatedDelivery` default: prose says `true`, code yields `false`
- **Where:** validator comment says "boolean (optional, default true)".
- **Normative (C#):** `WithWireGuardSpecificAttributes` stores
  `BOOL = bool.TryParse(request?["DecapsulatedDelivery"]?.GetValue<string>(), out var dd) && dd`,
  i.e. **absent/unparseable => `false`**.
- **L1 decision:** L1 does not set a default; it omits the property when the caller omits it, so the
  resource applies its own (effective `false`) behavior. JSDoc notes the discrepancy and that L1
  does not override it.

## D-05 — `Custom::ProxylityUdpGatewayDestination` is NOT implemented
- **Normative (C#):** `Function.cs` dispatches `Custom::ProxylityUdpGatewayDestination` to
  `DestinationCreateHelper/Update/Delete`, but `DestinationCreateHelper.Create` is literally
  `throw new NotImplementedException();` and `DestinationRequestValidator` is an empty class. There
  is no working top-level Destination resource; destinations are created only inline inside a
  Listener's `Destinations` array.
- **L1 decision:** do **not** ship a usable `CfnDestination` construct in the first L1 release. The
  design documents the type as reserved/not-yet-supported. Inline destinations live in
  `CfnListener.destinations`. (The user explicitly flagged Destination as optional and only created
  as part of a listener.)

## D-06 — `listener-schema.json` is cruft and disagrees with the resource in several places
- The schema is explicitly out of scope / normatively superseded by the C# implementation.
  Observed disagreements: it documents `SizeInMB` with a `minimum` of `0.05` (code applies no such
  bound), documents WebRTC/DTLS fields with constraints the C# validator does not enforce
  identically, and omits several `Arguments` properties the validator accepts (location-tracker set,
  `UseAsyncInvoke`, etc.). L1 is built from the C# surface, not the schema.

## D-07 — PacketSource `Enabled` property appears in examples but is not read by the handler
- **Where:** `blink/.../regional.template.json` and `coap-demo/.../region.template.json` set
  `"Enabled": true` on `Custom::ProxylityUdpGatewayPacketSource`.
- **Normative (C#):** `PacketSourceRequestValidator.Validate` reads only `Description`,
  `ListenerName`, and `SnsTopicSource { TopicArn, Role }`. `Enabled` is never read.
- **L1 decision:** expose `Enabled` as an optional pass-through property (so faithfully-copied
  example templates round-trip) but document in JSDoc that the current resource ignores it. Record
  for follow-up — either the resource should honor it or the examples should drop it.

## D-08 — PacketSource source role lives under `SnsTopicSource.Role`, not a top-level `Role`
- **Normative (C#):** `PacketSourceRequestValidator` reads the IAM role ARN from
  `SnsTopicSource.Role` (a string ARN) and the topic from `SnsTopicSource.TopicArn`. This differs
  from the Listener/Destination `Role { Arn, Duration }` object shape.
- **L1 decision:** model `SnsTopicSource` as `{ TopicArn: string, Role: string }` exactly. Do not
  reuse the Listener role object shape here.

## D-09 — Listener-level `Role` is required only when `MetricsEnabled`/`LogGroupName` is set
- **Normative (C#):** `ListenerRequestValidator` requires a listener-level `Role { Arn }` when
  `MetricsEnabled` is true or `LogGroupName` is present; otherwise it is optional. The listener-level
  `Role` also honors `Role.Duration` (TimeSpan, default `"1:00:00"`).
- **L1 decision:** L1 does not enforce this cross-field rule (L1 is un-opinionated and lets the
  resource reject invalid combinations). Documented in JSDoc as a server-side requirement.

## D-10 — `RequireCookies` boolean is a string for DTLS but a real boolean for WebRTC
- **Normative (C#):** `ListenerRequestValidator` validates `RequireCookies` differently by protocol:
  for `webrtc` it uses `bool.TryParse(require_cookies.ToString())` (accepts a JSON boolean), for
  `dtls` it requires a JSON **string** that parses as bool. CloudFormation custom resources coerce
  all property values to strings on the wire regardless, so in practice both arrive as strings.
- **L1 decision:** expose `RequireCookies` as a TS `boolean`; jsii/CDK serialize it and the resource
  coerces. Note the per-protocol validator asymmetry for follow-up.

## D-11 — Refresh-token rotation markers are update-only and otherwise inert
- **Normative (C#):** `KeyRefreshToken` (wg), `CertRefreshToken` (dtls/webrtc), and
  `WebRtcSignalingRefreshToken` (webrtc) are read only by `ListenerUpdateHelper` to decide whether to
  regenerate keys/certs/signaling tokens on update. They are not read on create.
- **L1 decision:** expose all three as optional strings on `CfnListener` so callers can trigger
  rotation by changing them. JSDoc explains they are rotation markers with effect only on stack
  update.

## D-12 — DTLS create ignores a supplied `ServerSecret`; only WebRTC honors it
- **Where:** `ServerSecret` is documented (brief and prior design) as "resource generates one if
  omitted" uniformly across DTLS and WebRTC.
- **Normative (C#):** `ListenerHelperExtensions.WithDtlsSpecificAttributes` switches on protocol:
  - `webrtc`: `item["server_secret"] = request?["ServerSecret"] ?? Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))`
    — a caller-supplied value **is honored**, otherwise a fresh 32-byte secret is generated.
  - `dtls`: `item["server_secret"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))`
    — **always regenerated; any caller-supplied `ServerSecret` is silently discarded on create.**
  The validator (`ListenerRequestValidator`) still rejects a non-base64 `ServerSecret` for either
  protocol if present (`ServerSecret must be a base64 string when present`), so a bad value is
  rejected even though a valid DTLS value is then ignored.
  On **update** (`ListenerUpdateHelper`) the asymmetry persists: `server_secret` is regenerated when
  missing/empty or when the cert refresh token changed, and only `protocol == "webrtc"` with a
  supplied `ServerSecret` overrides it (`if (protocol == "webrtc" && request...["ServerSecret"] is {} s) server_secret = s`).
- **L1 decision:** `serverSecret` is one shared optional member on `CfnListenerProps` (flat bag), and
  L1 **passes it through unchanged** for both protocols — L1 does not strip it for DTLS, because the
  resource is authoritative. JSDoc documents the asymmetry explicitly: for WebRTC the value is
  honored (generated if omitted); for DTLS the control-plane create path **ignores** it and always
  generates a fresh secret (a non-base64 value is still rejected by the validator). Record for
  follow-up: either DTLS create should honor a supplied `ServerSecret` or the property should be
  rejected for DTLS to avoid the silent discard.

## D-13 — Inline `Destinations[].DestinationArn` region map: keys must match the ARN's own region
- **Where:** the brief/prior design model the region map as a free-form `{ "<region>": arn, "*": arn }`
  with an un-opinionated stance and no key constraint surfaced on the type.
- **Normative (C#):** `ListenerRequestValidator` validates each inline destination's `DestinationArn`
  with (for the `JsonObject` map case):
  ```csharp
  JsonObject m =>
         m.All(p => p.Value?.GetValueKind() == JsonValueKind.String)
      && m.All(p => p.Key == "*" || (Amazon.Arn.TryParse(p.Value!.GetValue<string>(), out var marn) && marn.Region == p.Key))
      && m.DistinctBy(p => Amazon.Arn.Parse(p.Value!.GetValue<string>()).Service).Count() < 2
  ```
  i.e. every value must be an ARN string; every non-`*` key must **equal the AWS region embedded in
  its ARN value** (`arn:partition:service:<region>:...`); and all ARNs in the map must be for the
  **same service**. A `null`/absent `DestinationArn` defaults to an empty object `{}`. The reject
  message is: "DestinationArn must be a string value, or an object (map) where: all property values
  are arn strings, each arn region matches the property key, and all arns are for the same service".
  (Note: the *standalone* `Custom::ProxylityUdpGatewayDestinationArn` resource uses a different code
  path — `DestinationArnRequestValidator.ValidateArnMap` checks only that each key is a valid region
  name or `*`, not that the key matches the ARN's region. The strict key==ARN-region rule applies to
  the **inline** `Destinations[].DestinationArn` map, which is where the CDK region-map type is used.)
- **L1 decision:** L1 does not enforce the rule (un-opinionated), but the constraint is documented on
  the `DestinationArnMap.byRegion` type, the inline `destinationArn`/`destinationArnMap` field, and
  the standalone `CfnDestinationArn` section, so JSDoc carries it and authors learn it at author-time
  rather than only as a deploy-time stack failure.

---

## Implementation confirmation (2026-10-16)

L1 implementation complete and verified (see `VERIFICATION.md`). No NEW schema/docs-vs-C#
divergences were discovered while implementing the four constructs, the `ProxylityConfig` helper,
and the packet-counter golden synth test. D-01 … D-13 remain the complete set, and each is reflected
in JSDoc on the relevant construct member:
- D-01 (`Role.Duration` TimeSpan) — `ListenerRole.duration`.
- D-02 (`Batching` units) — `Batching.{count,timeoutInSeconds,sizeInMB}`.
- D-03/D-04 (`DecapsulatedDelivery` spelling + effective `false` default) — `CfnListenerProps.decapsulatedDelivery`.
- D-05 (`CfnDestination` omitted) — `src/index.ts` comment + README; no export exists.
- D-06 (schema is cruft) — ignored; L1 built from the C# surface.
- D-07 (`Enabled` ignored) — `CfnPacketSourceProps.enabled`.
- D-08 (`SnsTopicSource.Role` is a bare string) — `SnsTopicSource.role`.
- D-09 (listener `Role` required with metrics/logs) — `CfnListenerProps.{role,metricsEnabled,logGroupName}`.
- D-10 (`RequireCookies` per-protocol) — `CfnListenerProps.requireCookies`.
- D-11 (refresh tokens update-only) — `keyRefreshToken` / `certRefreshToken` / `webRtcSignalingRefreshToken`.
- D-12 (DTLS discards `ServerSecret`, WebRTC honors it) — `CfnListenerProps.serverSecret`.
- D-13 (inline region-map key==ARN-region) — `DestinationArnMap` + `CfnDestinationArn.ingressRegionKey`.

Note (not a schema divergence, recorded for the follow-up): the task brief listed a speculative
`IPv4s` listener output attribute. `CloudFormationResponse` / `ListenerCreateHelper` set only `Id`,
`Port`, `Domain`, `DestinationNames`, and the protocol-specific outputs — there is no `IPv4s`
`response.Data` key — so L1 does NOT fabricate an `attrIpv4s` getter.
