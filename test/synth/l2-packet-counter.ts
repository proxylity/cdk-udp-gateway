import { Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { LambdaDestination, Listener, ListenerProtocol } from '../../src';

/**
 * L2 re-authoring of `examples/packet-counter`. A UDP listener delivering to a Lambda function with
 * destination metrics enabled. The imported function ARN is a stand-in (its concrete value is
 * normalized away by the golden diff); only the listener wire shape is under test.
 */
export class L2PacketCounterStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const fn = lambda.Function.fromFunctionArn(
      this,
      'PacketCounterLambda',
      'arn:aws:lambda:us-east-1:111122223333:function:packet-counter',
    );

    this.listener = new Listener(this, 'UdpListener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new LambdaDestination({
          fn,
          description:
            'Delivers to the packet counter lambda, which returns a single response to each distinct client IP address.',
          batching: { count: 1000, timeoutInSeconds: 1 },
          metricsEnabled: true,
        }),
      ],
    });
  }
}
