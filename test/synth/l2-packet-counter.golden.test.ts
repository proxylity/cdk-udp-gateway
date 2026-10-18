import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2PacketCounterStack } from './l2-packet-counter';

/**
 * Golden / wire-shape parity test for the L2 re-authoring of `examples/packet-counter` (Lambda/udp).
 * Synthesizes the L2 stack and diffs the emitted `Custom::ProxylityUdpGatewayListener` Properties
 * against the vendored fixture, modulo the generated role ARN / imported destination ARN / stale
 * keys (see golden-util). L2 emits an explicit `Formatter: "base64"` (the service default)
 * which the hand-written example omits; the fixture records it since both are behaviorally identical.
 */
describe('L2 packet-counter golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2PacketCounterStack(app, 'L2PacketCounter');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('packet-counter.l2.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });
});
