import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {
  Types,
  findResource,
  normalizeDestinationArnProps,
  normalizeListenerProps,
  readFixture,
  synthListenerProps,
} from './golden-util';
import { L2MultiRegionGlobalStack, L2MultiRegionRegionalStack } from './l2-packet-counter-multi-region';

/**
 * Golden / wire-shape parity test for `examples/packet-counter-multi-region`. The GLOBAL stack's
 * `ArnDestination` with an empty region map must serialize to `DestinationArn: {}`; the REGIONAL
 * stack's `RegionalArnRegistration` must emit a `Custom::ProxylityUdpGatewayDestinationArn`.
 */
describe('L2 packet-counter-multi-region golden synth', () => {
  const fixture = readFixture('packet-counter-multi-region.template.json');

  const globalSynth = (() => {
    const app = new App();
    const stack = new L2MultiRegionGlobalStack(app, 'L2MultiRegionGlobal');
    return Template.fromStack(stack).toJSON();
  })();

  const regionalSynth = (() => {
    const app = new App();
    const stack = new L2MultiRegionRegionalStack(app, 'L2MultiRegionRegional');
    return Template.fromStack(stack).toJSON();
  })();

  test('global Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(globalSynth.Mappings.ProxylityConfig).toEqual(fixture.Mappings.ProxylityConfig);
  });

  test('global listener Properties wire bag matches the example (empty DestinationArn map)', () => {
    expect(synthListenerProps(globalSynth)).toEqual(normalizeListenerProps(fixture.GlobalListener));
  });

  test('global listener emits an empty DestinationArn object', () => {
    const props = findResource(globalSynth.Resources, Types.listener).Properties;
    expect(props.Destinations[0].DestinationArn).toEqual({});
  });

  test('regional DestinationArn Properties wire bag matches the example (normalized)', () => {
    const synthDestinationArn = findResource(regionalSynth.Resources, Types.destinationArn)
      .Properties;
    expect(normalizeDestinationArnProps(synthDestinationArn)).toEqual(
      normalizeDestinationArnProps(fixture.RegionDestinationArn),
    );
  });
});
