import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2LocationServiceStack } from './l2-location-service';

/**
 * Golden / wire-shape parity test for the L2 re-authoring of `examples/location-service`. The
 * example carries a stale `EnableLogging: true` key that L2 omits by design (dropped by the diff).
 */
describe('L2 location-service golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2LocationServiceStack(app, 'L2Location');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('location-service.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });
});
