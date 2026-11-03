import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2SyslogStack } from './l2-syslog';

/**
 * Golden / wire-shape parity test for the listener in `examples/syslog` (WireGuard decap -> archive
 * Firehose (base64), CloudWatch Logs (syslog) and analytics Firehose (syslog), with listener metrics
 * and error logs). The example is a CDK app built on these constructs, so the fixture records the
 * listener wire shape it synthesizes rather than a hand-written template.
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
