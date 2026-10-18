import { Stack } from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ArgumentFormatter, Formatter, Listener, ListenerProtocol, SqsDestination } from '../../src';

/**
 * L2 re-authoring of `examples/sqs`. A UDP listener with two SQS destinations: a standard queue
 * (default behavior) and a FIFO queue (raw UTF-8, message attributes, group/dedup id expressions).
 * Both destinations have metrics + a (destination) log group, matching the example's shared role.
 */
export class L2SqsStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const queue = sqs.Queue.fromQueueArn(
      this,
      'Queue',
      'arn:aws:sqs:us-east-1:111122223333:standard-queue',
    );
    const fifoQueue = sqs.Queue.fromQueueArn(
      this,
      'FifoQueue',
      'arn:aws:sqs:us-east-1:111122223333:fifo-queue.fifo',
    );

    // The example uses a single shared DestinationRole for both SQS destinations. Supply it as a
    // bring-your-own role so both destinations reference the same role (and so the two destinations
    // do not collide on the auto-created `SqsDestinationRole` construct id — a user with two
    // same-service destinations on one listener must bring/share a role today).
    const sharedRole = iam.Role.fromRoleArn(
      this,
      'DestinationRole',
      'arn:aws:iam::111122223333:role/sqs-destination',
    );

    this.listener = new Listener(this, 'UdpListener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new SqsDestination({
          queue,
          role: sharedRole,
          description:
            'Delivers to the standard queue with default delivery behavior (JSON payload, no attributes).',
          batching: { count: 10, timeoutInSeconds: 1 },
          metricsEnabled: true,
          logGroupName: '/proxylity/udp-listeners/sqs-standard-queue',
        }),
        new SqsDestination({
          queue: fifoQueue,
          role: sharedRole,
          description:
            'Delivers to the FIFO queue with raw payload delivery (UTF-8 format), messages attributes for metadata (source IP/port, domain, ingress port) and the MessageGroupId extracted from the payload (first payload byte as a hex string). MessageDeduplicationId is also extracted from the payload (all but the first byte, base64 encoded).',
          batching: { count: 10, timeoutInSeconds: 1 },
          formatter: Formatter.UTF8,
          metricsEnabled: true,
          logGroupName: '/proxylity/udp-listeners/sqs-fifo-queue',
          sendRaw: true,
          useMessageAttributes: true,
          messageGroupIdExpression: '[0:1]',
          messageGroupIdFormatter: ArgumentFormatter.HEX,
          messageDeduplicationIdExpression: '[1:]',
          messageDeduplicationIdFormatter: ArgumentFormatter.BASE64,
        }),
      ],
    });
  }
}
