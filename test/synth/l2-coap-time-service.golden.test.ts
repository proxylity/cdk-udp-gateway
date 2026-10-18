import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {
  Types,
  findResource,
  normalizeListenerProps,
  normalizePacketSourceProps,
  readFixture,
  synthListenerProps,
} from './golden-util';
import { L2CoapTimeServiceStack } from './l2-coap-time-service';

/**
 * Golden / wire-shape parity test for `examples/coap-time-service` (WireGuard decap + CoAP ->
 * Express state machine, plus an SNS packet source). The example's packet source carries a stale
 * `Enabled: true` key that L2 omits by design; the diff drops it.
 */
describe('L2 coap-time-service golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2CoapTimeServiceStack(app, 'L2CoapTime');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('coap-time-service.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });

  test('packet source Properties wire bag matches the example (normalized, no Enabled)', () => {
    const synthPacketSource = findResource(synthesized.Resources, Types.packetSource).Properties;
    expect(normalizePacketSourceProps(synthPacketSource)).toEqual(
      normalizePacketSourceProps(fixture.PacketSource),
    );
  });

  test('synthesized packet source emits no Enabled key', () => {
    const synthPacketSource = findResource(synthesized.Resources, Types.packetSource).Properties;
    expect(synthPacketSource.Enabled).toBeUndefined();
  });
});
