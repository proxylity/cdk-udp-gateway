import { Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { LambdaDestination, Listener, ListenerProtocol } from '../../src';

/**
 * L2 re-authoring of `examples/wireguard-echo`: a WireGuard listener with two peers delivering to an
 * echo Lambda. Peer public keys are base64 stand-ins (the example uses template Parameter Refs);
 * the golden diff normalizes them away.
 */
export class L2WireguardEchoStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const fn = lambda.Function.fromFunctionArn(
      this,
      'Lambda',
      'arn:aws:lambda:us-east-1:111122223333:function:wg-echo',
    );

    this.listener = new Listener(this, 'Listener', {
      protocol: ListenerProtocol.wireGuard({
        peers: [
          {
            publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            allowedIPs: ['0.0.0.0/0', '::/0'],
          },
          {
            publicKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
            allowedIPs: ['0.0.0.0/0', '::/0'],
          },
        ],
      }),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new LambdaDestination({
          fn,
          description:
            'Delivers to the wireguard echo lambda, which responds to ICMP pings and UDP.',
          batching: { count: 100, timeoutInSeconds: 0.1 },
        }),
      ],
    });
  }
}
