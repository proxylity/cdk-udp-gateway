import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2PacketCounterSfnStack } from './l2-packet-counter-sfn';

/** Golden / wire-shape parity test for `examples/packet-counter-sfn` (Step Functions Express). */
describe('L2 packet-counter-sfn golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2PacketCounterSfnStack(app, 'L2PacketCounterSfn');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('packet-counter-sfn.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });
});
