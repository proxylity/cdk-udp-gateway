# L1 doc/property fixes — verification evidence

Workflow: `wf_0024753c4c36048b` (first iteration — no `l1-doc-fixes-review.json` present).
Repo: `c:\Users\leeha\source\proxylity\cdk` (`@proxylity/cdk-udp-gateway`).

## Edits applied

Source (`src/`):
- **D-04** — `cfn-listener.ts` `CfnListenerProps.decapsulatedDelivery`: JSDoc corrected to state the
  effective default is `false` and that L1 omits the property (resource applies its own `false`).
  Internal C# reasoning kept out of the JSDoc.
- **D-01** — scrubbed stray `DurationInMinutes`. Whole-repo search found NO occurrence in L1 code,
  JSDoc, or README; the only mentions are in `DIVERGENCES.md` / `review.md` (describing the
  divergence) and the out-of-scope `proxylity-control/.../listener-schema.json` cruft. No code change
  needed. The TS member stays `duration` (emits `Duration`).
- **D-07** — `cfn-packet-source.ts`: removed the dead `enabled` member from `CfnPacketSourceProps`
  and its `['Enabled', props.enabled]` wire mapping. Removed the `enabled: true` input and the
  `Enabled: true` / `not.toHaveProperty('Enabled')` assertions from `test/cfn-packet-source.test.ts`.
  No `enabled`/`Enabled` reference remains in the construct or its test.
- **D-13** — `cfn-listener.ts` (`DestinationArnMap` type, inline `destinationArnMap` field) and
  `cfn-destination-arn.ts` (`CfnDestinationArn`, `ingressRegionKey`): removed the "key must equal the
  ARN's region" / fallback/duplicate-key/same-service callouts. Neutral descriptions retained (a
  region→ARN map with a `*` default; a per-region ingress key). No synth-time validation added.
- **NIT-2** — `cfn-listener.ts` `attrDestinationNames`: added one sentence noting it is a
  CloudFormation list token consumable only with list-aware intrinsics (`Fn.select` / `Fn.join`),
  not in a scalar `Fn.sub`/`${...}` context.
- **Internal-callout scrub** — removed user-facing control-plane-internal callouts while keeping
  type/unit/default info:
  - D-02 (`Batching`): kept units; removed the "C# reads strings and multiplies by …" / DIVERGENCES
    cross-references.
  - D-06: no schema/cruft mention exists in user JSDoc (confirmed).
  - D-08 (`SnsTopicSource.role`): kept "role ARN string"; removed the `Role {Arn}` object-shape
    comparison.
  - D-09 (listener `role`/`metricsEnabled`/`logGroupName`): removed the cross-field "Role required"
    framing; kept a neutral note that the role is used for metrics/log delivery.
  - D-10 (`requireCookies`): kept `boolean` + short description; removed the per-protocol
    validator-asymmetry internals.
  - D-11 (refresh tokens): kept the concise user-facing rotation note on all three; trimmed the
    "read only by ListenerUpdateHelper / inert on create" internals.
  - D-12 (`serverSecret`): NOT in the instructed edit set; JSDoc left unchanged (documents today's
    asymmetry). The control-plane symmetric fix is pending a separate workflow's commit; DIVERGENCES
    D-12 records the resolution and that the JSDoc should simplify once that lands.

Docs:
- `.agents/tasks/cdk-udp-gateway-l1/DIVERGENCES.md`: appended resolution notes to D-01, D-03, D-04,
  D-07, D-13, and D-12, plus internal-callout notes to D-02, D-06, D-08, D-09, D-10, D-11; added new
  entry **D-14** (FilterExpression create-vs-update); updated the member-mapping summary and
  "D-01 … D-13" → "D-01 … D-14". Historical descriptions preserved (append-only audit log).
- `README.md`: "(D-01 … D-13)" → "(D-01 … D-14)".

## Verification gate (actually run)

Environment note: this PowerShell echoes commands and returns a spurious exit code of `-1` on
success; results below are judged by actual stdout CONTENT, not exit code.

1. **jsii compile** — `npx.cmd jsii --silence-warnings=reserved-word`
   - Result: ZERO errors / zero warnings (empty output). `lib/*.js` (cfn-destination-arn, cfn-listener,
     cfn-packet-source, index, proxylity-config) and `.jsii` regenerated with fresh timestamps,
     confirming a clean compile.
2. **jest** — `npx.cmd jest`
   - Result: **Test Suites: 5 passed, 5 total; Tests: 27 passed, 27 total.** The golden synth diff
     (`test/synth/packet-counter.golden.test.ts`) PASSED unchanged — the listener wire shape is
     unaffected by these edits. The updated `test/cfn-packet-source.test.ts` (enabled removed) passes.
3. **eslint** — `npx.cmd eslint --ext .ts src test`
   - Result: clean (no errors, no warnings; empty output).

Did NOT run `jsii-pacmak` / multi-language packaging (not required by the gate). No live AWS calls.

## Commit

Single local commit in the `cdk` repo (no push, no PR). Staged only the changed files:
`src/cfn-destination-arn.ts`, `src/cfn-listener.ts`, `src/cfn-packet-source.ts`,
`test/cfn-packet-source.test.ts`, `README.md`,
`.agents/tasks/cdk-udp-gateway-l1/DIVERGENCES.md`, and this verification file.

Commit: branch `master`, local only — not pushed. This verification file is part of that same
commit, which is the current `HEAD`. Message:
`L1 doc/property fixes: D-01, D-04, D-07(prop), D-13(doc), NIT-2, internal-callout scrub; record D-14`.

(The commit was reshaped with `git commit --amend` to fold this verification file in, so the HEAD
hash is whatever `git -C <cdk> rev-parse HEAD` reports after the final amend; a hash cannot name the
commit that contains it, so none is hard-coded here.)
