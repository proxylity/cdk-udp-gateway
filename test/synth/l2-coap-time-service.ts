import { Stack } from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import {
  Formatter,
  Listener,
  ListenerProtocol,
  SnsPacketSource,
  StateMachineDestination,
} from '../../src';

/**
 * L2 re-authoring of `examples/coap-time-service`: a WireGuard listener with `DecapsulatedDelivery`
 * and a CoAP-formatted destination to an EXPRESS state machine, plus an SNS-backed packet source
 * (server-initiated push). The example's packet source carries a stale `Enabled: true` key that L2
 * omits by design; the golden diff drops it.
 */
export class L2CoapTimeServiceStack extends Stack {
  public readonly listener: Listener;
  public readonly packetSource: SnsPacketSource;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const sm = stepfunctions.StateMachine.fromStateMachineArn(
      this,
      'CoapTimeServiceStateMachine',
      'arn:aws:states:us-east-1:111122223333:stateMachine:coap-time-service',
    );
    const topic = sns.Topic.fromTopicArn(
      this,
      'ObserveNotifyTopic',
      'arn:aws:sns:us-east-1:111122223333:coap-observe',
    );

    this.listener = new Listener(this, 'CoAPListener', {
      protocol: ListenerProtocol.wireGuard({
        decapsulatedDelivery: true,
        peers: [
          {
            publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            allowedIPs: ['0.0.0.0/0', '::/0'],
          },
        ],
      }),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new StateMachineDestination({
          stateMachine: sm,
          stateMachineType: stepfunctions.StateMachineType.EXPRESS,
          description:
            'Decodes each inbound CoAP packet and delivers the parsed request to the time service state machine, which returns an ACK response for GET /time requests.',
          formatter: Formatter.COAP,
          batching: { count: 100, timeoutInSeconds: 0.5 },
        }),
      ],
    });

    this.packetSource = new SnsPacketSource(this, 'ObservePacketSource', {
      listener: this.listener,
      topic,
    });
  }
}
