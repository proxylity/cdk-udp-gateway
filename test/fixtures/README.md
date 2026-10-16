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
