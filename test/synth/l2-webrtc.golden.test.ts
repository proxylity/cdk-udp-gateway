import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { normalizeListenerProps, readFixture, synthListenerProps } from './golden-util';
import { L2WebRtcStack } from './l2-webrtc';

/** Golden / wire-shape parity test for `examples/webrtc` (WebRTC public signaling + Lambda echo). */
describe('L2 webrtc golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new L2WebRtcStack(app, 'L2WebRtc');
    return Template.fromStack(stack).toJSON();
  })();
  const fixture = readFixture('webrtc.template.json');

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('listener Properties wire bag matches the example (normalized)', () => {
    expect(synthListenerProps(synthesized)).toEqual(normalizeListenerProps(fixture.Listener));
  });
});
