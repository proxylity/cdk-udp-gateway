# Design Review — `@proxylity/cdk-udp-gateway` L1 construct library (revision 2)

Reviewer: design-review subagent (fresh read, no authoring context).
Scope: `design.md` for the L1 layer, cross-checked against the normative C# Lambda in
`proxylity-control/src/listener-resource-lambda` and the hand-written example templates under
`examples/`. The JSON schema `listener-schema.json` was treated as cruft and ignored, per the brief.

This design is a revision answering the prior `design-review.md`/`.json` (2 MEDIUM + 4 NIT). I
re-verified each prior finding against the source and all are correctly addressed. This pass is a
fresh end-to-end verification, not just a re-check of the previous findings.

## Verdict basis

Count of blocking findings below: **0 HIGH, 0 MEDIUM**. Two NITs. Per the mechanical rule
(HIGH+MEDIUM == 0 ⇒ APPROVED), the verdict is **APPROVED**.

---

## Findings

### 1. NIT — `FilterExpression` create/update divergence not recorded in DIVERGENCES
Location: `design.md` inline-destination `ListenerDestination.filterExpression`; `DIVERGENCES.md`.

The design models `filterExpression` as a **per-destination** inline property. That is the correct
modeling: it matches `ListenerRequestValidator` (validated inside `destination_definitions.All(d =>
d.Get("FilterExpression") …)`), `ListenerUpdateHelper` (reads `d.Value!["FilterExpression"]` per
destination), and the `DynamoDbHelper` round-trip (`filter_expression` per destination item).

However, `ListenerCreateHelper.cs` reads it at the **listener level**, not per destination:
```csharp
{ "filter_expression", new() { S = request.ResourceProperties?.Get("FilterExpression")?.GetValue<string>() ?? string.Empty } },
```
This is inside the per-destination `Put` loop but reads the top-level request bag, so on **create**
an inline destination's `FilterExpression` is dropped and every destination gets the (usually empty)
listener-level value. This is a genuine control-plane create-vs-update inconsistency. The design's
own stated contract is that `DIVERGENCES.md` logs "every place … the example templates disagree with
the normative C#" and that the C# wins; this one is a divergence *within* the C# (create vs update)
that the hand-off list should carry. It does not change the L1 wire shape (per-destination is right
for the validator and update path, and no example template uses `FilterExpression`, so there is no
golden-test impact).

CONCRETE FIX: add a divergence entry (e.g. D-14) noting that `ListenerCreateHelper` reads
`FilterExpression` from the listener-level request bag while `ListenerUpdateHelper`/validator read it
per inline destination; L1 keeps `filterExpression` on the inline destination (correct per validator
+ update), and the create-path mismatch is a control-plane bug to fix in follow-up. Optionally note
it in the `filterExpression` JSDoc.

### 2. NIT — `attrDestinationNames` as a CloudFormation list attribute should state the `GetAtt` caveat
Location: `design.md` `CfnListener` output attributes, "Getter return types" paragraph.

The design specifies `attrDestinationNames` returns `Fn.getAtt(logicalId, 'DestinationNames').toStringList()`
and cites `event-bridge`/`coap-demo`/`blink` consuming it with `Fn::Select`. That is verified correct
against `ListenerCreateHelper` (`response.Data["DestinationNames"] = new JsonArray([...])`) and the
example templates. The one unstated subtlety worth an implementation note: a custom-resource
`Fn::GetAtt` of a list attribute is only usable as a list when consumed through list-aware intrinsics
(`Fn::Select`, `Fn::Join`) — `toStringList()` yields a CDK token that resolves to the `Fn::GetAtt`
and must not be used in a scalar/`Fn::Sub` string context (unlike `attrPort`, which the examples do
embed in `Fn::Sub`). The `terraform-aws-udp-gateway` module wraps it in `Fn::Join` for exactly this
reason.

CONCRETE FIX: add a sentence to the `attrDestinationNames` note: "This is a list token; consume it
with `Fn.select`/`Fn.join`, not inside an `Fn.sub` string interpolation." No API change.

---

## Verified Assumptions (checked against the C# source and/or example templates)

Property-key fidelity (PascalCase wire keys, nested shapes):
- **`Role.Arn` (not `RoleArn`), `Role.Duration`**: `ListenerCreateHelper` reads
  `a.destination!["Role"]?["Arn"]` and `["Role"]?["Duration"]` (and listener-level
  `request…Get("Role")?.Get("Arn")` / `["Duration"]`), `TimeSpan.Parse(... ?? "1:00:00")`. Design's
  `ListenerRole { arn, duration? }` with the 1-hour TimeSpan default (D-01) is correct. `packet-counter`
  confirms the nested `Role: { Arn: {...} }` object shape.
- **`Batching { Count, TimeoutInSeconds, SizeInMB }`**: `ListenerCreateHelper` reads all three with
  defaults `"100"`, `"0.25"` (×1000 → ms), `"1.0"` (×1024² → bytes). `packet-counter` sets
  `Count: 1000, TimeoutInSeconds: 1` as JSON numbers. Design (D-02, native-number pass-through) correct.
- **`ClientRestrictions.Networks` / `.Domains` as string ARRAYS**: validator requires each to be an
  array of strings. `packet-counter` sets `Networks: [ {Ref} ]`. Design's `string[]` typing correct.
- **`DestinationArn` string-or-region-map**: validator accepts a `JsonValue` string or a `JsonObject`
  map; map rules verified verbatim —
  `m.All(p => p.Key == "*" || (Arn.TryParse(…, out marn) && marn.Region == p.Key))` and
  `m.DistinctBy(…Service).Count() < 2`. `null` defaults to `{}`. Design's `DestinationArnMap`
  (`default` → `"*"`, `byRegion` with key==ARN-region + same-service rules, D-13) and the
  `destinationArn` XOR `destinationArnMap` jsii-safe split are correct.
- **`Protocols` single-element array, one of `udp|wg|dtls|webrtc`**: validator rejects `Count > 1`
  and `default:` rejects anything else. Correct.
- **`Name` regex** `[a-zA-Z][a-zA-Z0-9 _\-]+` unanchored via `IsMatch`: confirmed
  (`ListenerNameValidatorRegex`). Design quotes it verbatim and does not client-validate. Correct.
- **WireGuard**: `DecapsulatedDelivery` correct spelling read by `WithWireGuardSpecificAttributes`;
  validator's `DecapulatedDelivery` type-check branch is dead (typo). Effective default `false`
  (`bool.TryParse(...) && dd`). `AllowUnknownPeers` default false; `UnknownPeerPreSharedKey` only
  valid when `AllowUnknownPeers` true and base64-43+`=`; `Peers[].{PublicKey (req), SharedSecret?,
  AllowedIPs?}`. All verified (D-03, D-04). Examples use the correct spelling.
- **DTLS**: `Psks` map of non-empty strings; `RequireCookies` default false; `AllowEarlyData`
  default false; `EarlyDataWindowSeconds` 1–604800, default 3600; `ServerSecret` base64, **always
  regenerated on create, caller value discarded** (`WithDtlsSpecificAttributes` dtls case). Verified
  (D-12). The prior MEDIUM finding is correctly addressed.
- **WebRTC**: `ServerSecret` **honored if supplied** else generated (webrtc case uses
  `request?["ServerSecret"] ?? generated`); `RequireCookies` forced true (`require_cookies = true`,
  validator rejects `false`); `WebRtcSignalingMode` `none|public`; signaling/refresh-token handling
  and the reject-list for `Psk`/`EarlyData`/`Ticket`/`KeyRefreshToken`/`Ice*` properties — all
  verified in `ListenerRequestValidator` and `ListenerHelperExtensions`. The DTLS↔WebRTC `ServerSecret`
  asymmetry (D-12) is documented correctly.
- **`DestinationArguments`**: the design's enumerated set exactly equals the validator's
  `known_properties` HashSet (IoT, Lambda, SQS, Kinesis, Location). `UseResponseStreaming` xor
  `UseAsyncInvoke`, FIFO requires `MessageGroupIdExpression`, location requires
  `DeviceIdExpression`/`LatitudeExpression`/`LongitudeExpression`, `TimeUnit` ∈ {seconds,
  milliseconds}, formatter sets — all match. Modeling all as optional + `string` formatters (no
  invented enums) matches the brief and the validator's reject-unknown behavior.

Four-resource coverage:
- **Listener**: implemented; full surface covered.
- **Destination**: `DestinationCreateHelper.Create` is `throw new NotImplementedException();` and
  `DestinationRequestValidator` is an empty class. Design omits a usable `CfnDestination` (D-05).
  Correct — matches the user's steer that Destination is optional and only created inline.
- **DestinationArn**: implemented; required `Destination`, `IngressRegionKey`, `Arn`; standalone
  validator (`ValidateRequest`) takes a single ARN + region key (no key==region check — only the
  inline map path enforces that; the standalone `ValidateArnMap` is a different, unused-on-create
  path). Create-helper state machine (set-single / upgrade-string-to-map rejecting `*` /
  update-map rejecting duplicate key / same-service) verified. Design (D-13 note) is accurate.
- **PacketSource**: implemented; required `ListenerName`, `SnsTopicSource { TopicArn, Role(string) }`;
  optional `Description`, `Enabled`. Verified `Enabled` is **never read** by the validator (D-07) and
  `SnsTopicSource.Role` is a plain string ARN, not a `{Arn}` object (D-08). `ListenerName` immutable
  on update. Correct.

Output attributes (`Fn::GetAtt`, exact `response.Data` keys):
- Listener: `Id`, `Port`, `Domain`, `DestinationNames` always; `WireGuardPublicKey` (wg);
  `DtlsServerCertificate` (dtls/webrtc); `WebRtcFingerprint`, `WebRtcSctpPort` (=5000),
  `WebRtcChannelId` (=0), `WebRtcSignalingMode`, and (public) `WebRtcSignalingToken`,
  `WebRtcSignalingUrl` (webrtc). Verified in `ListenerCreateHelper` + `AddCertificateOutputs` +
  `AddSignalingOutputs`. `Port`/`WebRtcSctpPort`/`WebRtcChannelId` are numeric in `response.Data`;
  design's string-token modeling with `Token.asNumber` escape hatch is correct and consistent with
  `${UdpListener.Port}` in `Fn::Sub`. **No `IPv4s` attribute exists** — design correctly refuses to
  fabricate it.
- `DestinationNames` is a `JsonArray`; design's `.toStringList()` modeling matches `event-bridge`,
  `coap-demo`, `blink`, `radius`, `packet-counter-multi-region`, `udp-to-http`, `supabase-udp`
  consuming it via `Fn::Select`. Correct.
- DestinationArn: `Destination`, `IngressRegionKey`, `Arn`; random 20-char physical id. Verified.
- PacketSource: `response.Data = []`, random physical id, no `attr*` getters. Verified.

`ProxylityConfig` helper (mapping keys/accessors vs `packet-counter`):
- `Mappings.ProxylityConfig` = `Fn::Transform`/`AWS::Include` with
  `Location: Fn::Sub s3://proxylity-config-${AWS::Region}/${AWS::AccountId}/customer-config.json` —
  byte-for-byte match.
- `Fn::FindInMap` tuples: `[ProxylityConfig, {Ref: AWS::Region}, ServiceToken]`,
  `[ProxylityConfig, Account, ApiKey]`, `[ProxylityConfig, {Ref: AWS::Region}, ServiceRole]` — all
  present and used in `packet-counter`. The design's `CfnMapping`-can't-hold-`Fn::Transform` →
  `Stack.addOverride` mechanism and the per-stack singleton are sound.

jsii targets + peer-dependency model:
- All five targets specified: npm `@proxylity/cdk-udp-gateway`, PyPI `proxylity-cdk-udp-gateway`,
  NuGet `Proxylity.CDK.UdpGateway`, Maven `com.proxylity:cdk-udp-gateway`, Go
  `github.com/proxylity/cdk-udp-gateway`. `aws-cdk-lib`/`constructs` in `peerDependencies` +
  `devDependencies`, never `dependencies`; v2 baseline with caret peer range; no third-party runtime
  deps. This matches standard jsii practice and the user's "target all five" instruction.

Boolean/number wire handling: CDK/jsii emit native JSON booleans/numbers; CloudFormation stringifies
them for the custom-resource request; the C# validators `bool.TryParse`/`float.Parse` the strings.
Design's no-pre-stringify mapper is correct and consistent with the example templates.

## Unverified / Wrong Assumptions

- No wrong assumptions found. Every property key, nested shape, required/optional flag, output
  attribute, protocol gating rule, and the five-target/peer-dependency model stated in the design was
  grounded in the C# source or an example template and verified. The two NITs above are a missing
  DIVERGENCES entry (create/update `FilterExpression` asymmetry) and a documentation caveat on list
  tokens — neither contradicts the source.

## Summary

This revision is faithful to the normative C# implementation. The two prior MEDIUM findings (DTLS
`ServerSecret` discard; `DestinationArnMap` key==region rule) are correctly corrected and backed by
new divergence entries (D-12, D-13), and the four prior NITs are resolved. The remaining items are
two NITs: record the `FilterExpression` create-vs-update control-plane divergence on the hand-off
list, and note the list-token consumption caveat for `attrDestinationNames`. No HIGH or MEDIUM
findings and no feasibility blockers. Verdict: APPROVED.
