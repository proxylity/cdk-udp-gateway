import * as logs from 'aws-cdk-lib/aws-logs';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CloudWatchLogsDestination, Formatter, Listener, ListenerProtocol } from '../../../src';
import { PROXYLITY_TRUST } from '../iam-util';

/**
 * Build a listener delivering to a CloudWatch Logs destination backed by a REAL (constructed) log
 * group, so `logGroup.logGroupArn` is a clean `Fn::GetAtt` ARN (no synthetic `:*` suffix that
 * `LogGroup.fromLogGroupArn` would otherwise add) and the grant reads `<logGroupArn>:*` exactly once.
 */
function synth(): Template {
  const app = new App();
  const stack = new Stack(app, 'S');
  const logGroup = new logs.LogGroup(stack, 'LG');
  new Listener(stack, 'Listener', {
    protocol: ListenerProtocol.udp(),
    clientRestrictions: { networks: ['0.0.0.0/0'] },
    destinations: [new CloudWatchLogsDestination({ logGroup })],
  });
  return Template.fromStack(stack);
}

describe('CloudWatchLogsDestination IAM', () => {
  test('derives a role trusting the Proxylity ServiceRole', () => {
    synth().hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: PROXYLITY_TRUST,
    });
  });

  test('grants logs:CreateLogStream + logs:PutLogEvents on <logGroupArn>:* (no CreateLogGroup)', () => {
    synth().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: {
              'Fn::Join': ['', [{ 'Fn::GetAtt': [Match.stringLikeRegexp('^LG'), 'Arn'] }, ':*']],
            },
          },
        ],
      },
    });
  });

  test('the derived policy does NOT grant logs:CreateLogGroup', () => {
    const json = synth().toJSON();
    const policy = Object.values(json.Resources).find(
      (r: any) => r.Type === 'AWS::IAM::Policy',
    ) as any;
    const actions = policy.Properties.PolicyDocument.Statement.flatMap((s: any) =>
      Array.isArray(s.Action) ? s.Action : [s.Action],
    );
    expect(actions).not.toContain('logs:CreateLogGroup');
  });

  test('the listener depends on the destination policy', () => {
    const json = synth().toJSON();
    const listenerId = Object.keys(json.Resources).find(
      (k) => json.Resources[k].Type === 'Custom::ProxylityUdpGatewayListener',
    )!;
    const policyId = Object.keys(json.Resources).find(
      (k) => json.Resources[k].Type === 'AWS::IAM::Policy',
    )!;
    expect(json.Resources[listenerId].DependsOn).toContain(policyId);
  });

  test('defaults the destination Formatter to utf8 (not base64)', () => {
    synth().hasResourceProperties('Custom::ProxylityUdpGatewayListener', {
      Destinations: [Match.objectLike({ Formatter: Formatter.UTF8 })],
    });
  });

  test('a log group imported via fromLogGroupArn does not produce a double :* suffix', () => {
    const app = new App();
    const stack = new Stack(app, 'S');
    // fromLogGroupArn returns a logGroupArn that already ends in ":*". The destination must strip
    // it before appending its own ":*", so the granted resource is a single-suffixed ARN.
    const logGroup = logs.LogGroup.fromLogGroupArn(
      stack,
      'Imported',
      'arn:aws:logs:us-east-1:123456789012:log-group:/proxylity/ingest',
    );
    new Listener(stack, 'Listener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [new CloudWatchLogsDestination({ logGroup })],
    });
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: 'arn:aws:logs:us-east-1:123456789012:log-group:/proxylity/ingest:*',
          },
        ],
      },
    });
  });
});
