import * as fs from 'fs';
import * as path from 'path';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PacketCounterStack } from './packet-counter';

/**
 * Golden synth test. Synthesizes the L1-authored packet-counter stack and diffs the emitted
 * `Custom::ProxylityUdpGatewayListener` resource (and the `Mappings.ProxylityConfig` transform)
 * against the hand-written example template. Synth-only; makes no AWS calls.
 *
 * The example also defines a Serverless Lambda and an IAM role with CDK-independent logical ids.
 * This test asserts the Proxylity listener wire bag and the ProxylityConfig mapping match the
 * example's intent exactly, after normalizing the two Fn::GetAtt ARN references (the L1 stack uses
 * the same logical names `PacketCounterLambda` / `DestinationRole` as the example, so the GetAtt
 * tuples compare equal with no normalization required).
 */

// Vendored snapshot of examples/packet-counter/packet-counter.template.json so this test is
// self-contained in CI, where the examples repo is not checked out. See test/fixtures/README.md.
const EXAMPLE_PATH = path.resolve(
  __dirname,
  '../fixtures/packet-counter.template.json',
);

function readExample(): any {
  return JSON.parse(fs.readFileSync(EXAMPLE_PATH, 'utf8'));
}

function findListener(resources: Record<string, any>): any {
  const entry = Object.values(resources).find(
    (r: any) => r.Type === 'Custom::ProxylityUdpGatewayListener',
  );
  if (!entry) {
    throw new Error('No Custom::ProxylityUdpGatewayListener resource found');
  }
  return entry;
}

describe('packet-counter golden synth', () => {
  const synthesized = (() => {
    const app = new App();
    const stack = new PacketCounterStack(app, 'PacketCounter');
    return Template.fromStack(stack).toJSON();
  })();

  const example = readExample();

  test('Mappings.ProxylityConfig matches the example transform exactly', () => {
    expect(synthesized.Mappings.ProxylityConfig).toEqual(example.Mappings.ProxylityConfig);
  });

  test('listener Type matches', () => {
    const synthListener = findListener(synthesized.Resources);
    const exampleListener = findListener(example.Resources);
    expect(synthListener.Type).toBe(exampleListener.Type);
    expect(synthListener.Type).toBe('Custom::ProxylityUdpGatewayListener');
  });

  test('listener Properties wire bag matches the example', () => {
    const synthProps = findListener(synthesized.Resources).Properties;
    const exampleProps = findListener(example.Resources).Properties;

    // ServiceToken / ApiKey — identical Fn::FindInMap intrinsics.
    expect(synthProps.ServiceToken).toEqual(exampleProps.ServiceToken);
    expect(synthProps.ApiKey).toEqual(exampleProps.ApiKey);

    // Protocols
    expect(synthProps.Protocols).toEqual(exampleProps.Protocols);
    expect(synthProps.Protocols).toEqual(['udp']);

    // ClientRestrictions.Networks — array with the Ref to the CIDR parameter.
    expect(synthProps.ClientRestrictions).toEqual(exampleProps.ClientRestrictions);

    // Single inline destination with Role.Arn (Fn::GetAtt), Batching, MetricsEnabled, DestinationArn.
    expect(synthProps.Destinations).toHaveLength(1);
    expect(exampleProps.Destinations).toHaveLength(1);

    const s = synthProps.Destinations[0];
    const e = exampleProps.Destinations[0];

    expect(s.Description).toEqual(e.Description);
    expect(s.Role).toEqual(e.Role);
    expect(s.Role).toEqual({ Arn: { 'Fn::GetAtt': ['DestinationRole', 'Arn'] } });
    expect(s.Batching).toEqual(e.Batching);
    expect(s.Batching).toEqual({ Count: 1000, TimeoutInSeconds: 1 });
    expect(s.MetricsEnabled).toEqual(e.MetricsEnabled);
    expect(s.MetricsEnabled).toBe(true);
    expect(s.DestinationArn).toEqual(e.DestinationArn);
    expect(s.DestinationArn).toEqual({ 'Fn::GetAtt': ['PacketCounterLambda', 'Arn'] });
  });

  test('whole listener Properties block deep-equals the example (intentional set of keys)', () => {
    const synthProps = findListener(synthesized.Resources).Properties;
    const exampleProps = findListener(example.Resources).Properties;
    // The example sets exactly these keys; L1 emits the same set with no extras.
    expect(new Set(Object.keys(synthProps))).toEqual(new Set(Object.keys(exampleProps)));
    expect(synthProps).toEqual(exampleProps);
  });
});
