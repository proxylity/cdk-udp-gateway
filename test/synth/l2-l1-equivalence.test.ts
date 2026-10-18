import { App, Fn, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CfnListener, ProxylityConfig } from '../../src';
import { Types, findResource, normalizeListenerProps, synthListenerProps } from './golden-util';
import { L2PacketCounterStack } from './l2-packet-counter';
import { L2SqsStack } from './l2-sqs';

/**
 * L1-equivalence check (design §13). For a representative subset (packet-counter and sqs) build the
 * same listener once via the L2 API and once via the raw L1 {@link CfnListener}, and assert the two
 * emitted `Custom::ProxylityUdpGatewayListener` Properties bags are identical (modulo the generated
 * role ARN / imported destination ARN, which the shared normalization collapses). This isolates L2's
 * assembly logic from the already-tested L1 wire mapping: everything L2 adds on top of L1 — the
 * Destinations folding, the Formatter default, the protocol wiring — must reduce to the same wire
 * bag a careful L1 author would hand-write.
 */

function synthL2(StackClass: new (scope: App, id: string) => Stack, id: string): any {
  const app = new App();
  const stack = new StackClass(app, id);
  return synthListenerProps(Template.fromStack(stack).toJSON());
}

function synthL1(id: string, build: (stack: Stack, config: ProxylityConfig) => void): any {
  const app = new App();
  const stack = new Stack(app, id);
  const config = ProxylityConfig.forStack(stack);
  build(stack, config);
  const resources = Template.fromStack(stack).toJSON().Resources;
  return normalizeListenerProps(findResource(resources, Types.listener).Properties);
}

describe('L2 <-> L1 equivalence', () => {
  test('packet-counter: L2 and raw L1 produce identical listener Properties', () => {
    const l2 = synthL2(L2PacketCounterStack as any, 'EqPacketCounterL2');

    const l1 = synthL1('EqPacketCounterL1', (stack, config) => {
      const roleArn = Fn.getAtt('DestinationRole', 'Arn').toString();
      const lambdaArn = 'arn:aws:lambda:us-east-1:111122223333:function:packet-counter';
      new CfnListener(stack, 'UdpListener', {
        serviceToken: config.serviceToken(),
        apiKey: config.apiKey(),
        protocols: ['udp'],
        clientRestrictions: { networks: ['0.0.0.0/0'] },
        destinations: [
          {
            description:
              'Delivers to the packet counter lambda, which returns a single response to each distinct client IP address.',
            role: { arn: roleArn },
            formatter: 'base64',
            batching: { count: 1000, timeoutInSeconds: 1 },
            metricsEnabled: true,
            destinationArn: lambdaArn,
          },
        ],
      });
    });

    expect(l2).toEqual(l1);
  });

  test('sqs: L2 and raw L1 produce identical listener Properties', () => {
    const l2 = synthL2(L2SqsStack as any, 'EqSqsL2');

    const l1 = synthL1('EqSqsL1', (stack, config) => {
      const roleArn = Fn.getAtt('DestinationRole', 'Arn').toString();
      new CfnListener(stack, 'UdpListener', {
        serviceToken: config.serviceToken(),
        apiKey: config.apiKey(),
        protocols: ['udp'],
        clientRestrictions: { networks: ['0.0.0.0/0'] },
        destinations: [
          {
            description:
              'Delivers to the standard queue with default delivery behavior (JSON payload, no attributes).',
            role: { arn: roleArn },
            formatter: 'base64',
            batching: { count: 10, timeoutInSeconds: 1 },
            metricsEnabled: true,
            logGroupName: '/proxylity/udp-listeners/sqs-standard-queue',
            destinationArn: 'arn:aws:sqs:us-east-1:111122223333:standard-queue',
          },
          {
            description:
              'Delivers to the FIFO queue with raw payload delivery (UTF-8 format), messages attributes for metadata (source IP/port, domain, ingress port) and the MessageGroupId extracted from the payload (first payload byte as a hex string). MessageDeduplicationId is also extracted from the payload (all but the first byte, base64 encoded).',
            role: { arn: roleArn },
            formatter: 'utf8',
            batching: { count: 10, timeoutInSeconds: 1 },
            metricsEnabled: true,
            logGroupName: '/proxylity/udp-listeners/sqs-fifo-queue',
            destinationArn: 'arn:aws:sqs:us-east-1:111122223333:fifo-queue.fifo',
            arguments: {
              sendRaw: true,
              useMessageAttributes: true,
              messageGroupIdExpression: '[0:1]',
              messageGroupIdFormatter: 'hex',
              messageDeduplicationIdExpression: '[1:]',
              messageDeduplicationIdFormatter: 'base64',
            },
          },
        ],
      });
    });

    expect(l2).toEqual(l1);
  });
});
