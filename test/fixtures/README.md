# Test fixtures

## `packet-counter.template.json`

A byte-faithful snapshot of `examples/packet-counter/packet-counter.template.json` from the
Proxylity `examples` repository, vendored here so the golden synth test
(`test/synth/packet-counter.golden.test.ts`) is self-contained.

The golden test synthesizes the L1-authored packet-counter stack and diffs the emitted
`Custom::ProxylityUdpGatewayListener` wire bag (and the `Mappings.ProxylityConfig` transform)
against this known-good hand-written template. It must NOT depend on the `examples` repo being
checked out as a sibling directory — in CI (CodeBuild) only this repo is cloned, so a cross-repo
relative path fails with `ENOENT`.

If the canonical example template in the `examples` repo changes in a way that affects the listener
wire shape, update this snapshot to match and re-run the golden test.

## L2 wire-shape fixtures

The following fixtures are vendored for the **L2** golden / wire-shape parity tests
(`test/synth/l2-*.golden.test.ts`). Unlike `packet-counter.template.json` (a full L1 template), each
is a focused bag holding just `Mappings.ProxylityConfig` plus the `Custom::ProxylityUdpGateway*`
resource `Properties` copied byte-faithfully from the corresponding `examples` template **at author
time** (the tests never read `../examples` at runtime — CI clones only this repo). The top-level keys
are `Listener` (and, where the example has them, `PacketSource` / `GlobalListener` /
`RegionDestinationArn`).

- `packet-counter.l2.template.json` — L2 Lambda/udp (the L2 counterpart to the L1
  `packet-counter.template.json`).
- `sqs.template.json` — standard + FIFO SQS.
- `kinesis-streams.template.json` — Kinesis Data Stream.
- `syslog.template.json` — WireGuard decap -> Firehose + CloudWatch Logs.
- `location-service.template.json` — Location tracker (example carries a stale `EnableLogging` key).
- `mavlink.template.json` — composite Location + FIFO SQS + Firehose.
- `packet-counter-sfn.template.json` — Step Functions Express.
- `coap-time-service.template.json` — Listener (wg/coap + Express SM) + SNS `PacketSource` (example
  carries a stale `Enabled: true`).
- `packet-counter-multi-region.template.json` — `GlobalListener` (empty `DestinationArn: {}`) +
  `RegionDestinationArn`.
- `wireguard-echo.template.json` — WireGuard + two peers + Lambda.
- `webrtc.template.json` — WebRTC public signaling + Lambda echo.

### Deliberate deviations the golden diff accounts for

The L2 golden tests normalize a small set of values before comparing (see
`test/synth/golden-util.ts`), because an L2 synth and a hand-written example legitimately differ in:

- generated role ARNs and imported destination ARNs (collapsed to sentinels);
- `Peers[].PublicKey` and `ClientRestrictions.Networks` (example `Ref` vs L2 literal);
- the stale `Enabled` (packet source) / `EnableLogging` (destination) keys, which L2 omits by design;
- an inert empty `Arguments: {}` object L1's wire mapping emits for destinations with no service args.

Two fixtures additionally record a `Formatter` value the hand-written example omits
(`location-service`/`kinesis`/`packet-counter`/`webrtc`/etc. -> `base64`, the CloudWatch Logs
destination in `syslog` -> `utf8`): L2 always emits the service's default formatter explicitly,
which is behaviorally identical to the example relying on the server default. The fixtures record the
explicit value so the diff stays a clean deep-equal.
