import { Stack } from 'aws-cdk-lib';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import { Construct } from 'constructs';
import { ArgumentFormatter, KinesisStreamDestination, Listener, ListenerProtocol } from '../../src';

/** L2 re-authoring of `examples/kinesis-streams`: a UDP listener delivering to a Kinesis stream. */
export class L2KinesisStreamsStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stream = kinesis.Stream.fromStreamArn(
      this,
      'KinesisStream',
      'arn:aws:kinesis:us-east-1:111122223333:stream/example',
    );

    this.listener = new Listener(this, 'UdpListener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new KinesisStreamDestination({
          stream,
          description:
            'Deliver UDP packets to Kinesis Data Streams with dynamic partition key extracted from payload.',
          batching: { count: 100, timeoutInSeconds: 1 },
          metricsEnabled: true,
          logGroupName: '/proxylity/udp-listeners/kinesis-streams',
          partitionKeyExpression: '[0:4]',
          partitionKeyExpressionFormatter: ArgumentFormatter.HEX,
        }),
      ],
    });
  }
}
