import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2WireguardEchoStack } from './l2-wireguard-echo';

/** Golden / wire-shape parity test for `examples/wireguard-echo` (WireGuard + two peers + Lambda). */
describe('L2 wireguard-echo golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2WireguardEchoStack(app, 'L2WireguardEcho');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('wireguard-echo.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });
});
