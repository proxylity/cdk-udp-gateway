import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { FirehoseDestination, Listener, ListenerProtocol } from '../../src';

const ARCHIVE_ARN = 'arn:aws:firehose:us-east-1:111122223333:deliverystream/archive';
const ANALYTICS_ARN = 'arn:aws:firehose:us-east-1:111122223333:deliverystream/analytics';

function synth(build: (stack: Stack) => void): Template {
  const app = new App();
  const stack = new Stack(app, 'HardeningStack');
  build(stack);
  return Template.fromStack(stack);
}

/** All policy statements in the template, flattened. */
function allStatements(template: Template): any[] {
  return Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
    (p: any) => p.Properties.PolicyDocument.Statement,
  );
}

const logStreamsArn = (logGroupName: string) => ({
  'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':logs:*:', { Ref: 'AWS::AccountId' }, `:log-group:${logGroupName}:*`]],
});

describe('L2 derived-role hardening', () => {
  test('metrics grants are limited to the Proxylity/UDP Gateway namespace (listener and destination)', () => {
    const template = synth((stack) => new Listener(stack, 'Listener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['198.51.100.0/24'] },
      metricsEnabled: true,
      destinations: [new FirehoseDestination({ deliveryStreamArn: ARCHIVE_ARN, metricsEnabled: true })],
    }));

    const metrics = allStatements(template).filter((s) => s.Action === 'cloudwatch:PutMetricData');
    expect(metrics).toHaveLength(2);
    for (const s of metrics) {
      expect(s.Resource).toBe('*');
      expect(s.Condition).toEqual({ StringEquals: { 'cloudwatch:namespace': 'Proxylity/UDP Gateway' } });
    }
  });

  test('log grants are limited to the configured log group (listener and destination)', () => {
    const template = synth((stack) => new Listener(stack, 'Listener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['198.51.100.0/24'] },
      logGroupName: '/listener/errors',
      destinations: [new FirehoseDestination({ deliveryStreamArn: ARCHIVE_ARN, logGroupName: '/destination/errors' })],
    }));

    const logs = allStatements(template).filter((s) =>
      Array.isArray(s.Action) && s.Action.includes('logs:PutLogEvents'));
    expect(logs.map((s) => s.Resource)).toEqual(
      expect.arrayContaining([logStreamsArn('/listener/errors'), logStreamsArn('/destination/errors')]),
    );
    expect(logs.some((s) => s.Resource === '*')).toBe(false);
  });

  test('two destinations of the same type each get their own derived role', () => {
    const template = synth((stack) => new Listener(stack, 'Listener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['198.51.100.0/24'] },
      destinations: [
        new FirehoseDestination({ deliveryStreamArn: ARCHIVE_ARN }),
        new FirehoseDestination({ deliveryStreamArn: ANALYTICS_ARN }),
      ],
    }));

    const roles = template.findResources('AWS::IAM::Role');
    const ids = Object.keys(roles);
    expect(ids).toHaveLength(2);
    // The first keeps the original id, so existing stacks keep their logical IDs.
    expect(ids.some((id) => id.startsWith('ListenerFirehoseDestinationRole') && !id.startsWith('ListenerFirehoseDestinationRole2'))).toBe(true);
    expect(ids.some((id) => id.startsWith('ListenerFirehoseDestinationRole2'))).toBe(true);

    // Each role's policy grants only its own stream.
    const policies = Object.values(template.findResources('AWS::IAM::Policy')) as any[];
    const streamsPerPolicy = policies.map((p) => p.Properties.PolicyDocument.Statement.map((s: any) => s.Resource));
    expect(streamsPerPolicy).toEqual(expect.arrayContaining([[ARCHIVE_ARN], [ANALYTICS_ARN]]));

    // Each destination entry carries a different role.
    const listener = Object.values(template.findResources('Custom::ProxylityUdpGatewayListener'))[0] as any;
    const roleRefs = listener.Properties.Destinations.map((d: any) => JSON.stringify(d.Role.Arn));
    expect(new Set(roleRefs).size).toBe(2);
    // ...and the listener waits for both roles' policies.
    template.hasResource('Custom::ProxylityUdpGatewayListener', {
      DependsOn: Match.arrayWith([Match.stringLikeRegexp('^ListenerFirehoseDestinationRoleDefaultPolicy'),
        Match.stringLikeRegexp('^ListenerFirehoseDestinationRole2DefaultPolicy')]),
    });
  });
});
