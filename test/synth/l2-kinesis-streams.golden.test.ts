import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2KinesisStreamsStack } from './l2-kinesis-streams';

/** Golden / wire-shape parity test for the L2 re-authoring of `examples/kinesis-streams`. */
describe('L2 kinesis-streams golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2KinesisStreamsStack(app, 'L2Kinesis');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('kinesis-streams.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });
});
