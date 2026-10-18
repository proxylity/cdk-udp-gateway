import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2MavlinkStack } from './l2-mavlink';

/**
 * Golden / wire-shape parity test for the L2 re-authoring of `examples/mavlink` (Location + FIFO SQS
 * + Firehose composite destinations). The Location destination carries a stale `EnableLogging` key
 * in the example that L2 omits by design.
 */
describe('L2 mavlink golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2MavlinkStack(app, 'L2Mavlink');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('mavlink.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });
});
