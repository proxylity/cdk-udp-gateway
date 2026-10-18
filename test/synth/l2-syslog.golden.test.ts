import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2SyslogStack } from './l2-syslog';

/**
 * Golden / wire-shape parity test for the L2 re-authoring of `examples/syslog` (WireGuard decap ->
 * Firehose + CloudWatch Logs). L2 emits an explicit `Formatter: "utf8"` on the CloudWatch Logs
 * destination (the service default for logs ARNs) which the hand-written example omits; the
 * fixture records it since the two are behaviorally identical.
 */
describe('L2 syslog golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2SyslogStack(app, 'L2Syslog');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('syslog.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });
});
