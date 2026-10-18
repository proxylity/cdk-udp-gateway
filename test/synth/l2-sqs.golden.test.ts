import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2SqsStack } from './l2-sqs';

/**
 * Golden / wire-shape parity test for the L2 re-authoring of `examples/sqs` (standard + FIFO SQS).
 */
describe('L2 sqs golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2SqsStack(app, 'L2Sqs');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('sqs.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });
});
