import { Stack } from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { Listener, ListenerProtocol, StateMachineDestination } from '../../src';

/**
 * L2 re-authoring of `examples/packet-counter-sfn`: a UDP listener delivering to an EXPRESS Step
 * Functions state machine. The explicit `stateMachineType` narrows the IAM grant to
 * `states:DescribeStateMachine` + `states:StartSyncExecution` (matching the example role).
 */
export class L2PacketCounterSfnStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const sm = stepfunctions.StateMachine.fromStateMachineArn(
      this,
      'PacketCounterStateMachine',
      'arn:aws:states:us-east-1:111122223333:stateMachine:packet-counter',
    );

    this.listener = new Listener(this, 'UdpListener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new StateMachineDestination({
          stateMachine: sm,
          stateMachineType: stepfunctions.StateMachineType.EXPRESS,
          description:
            'Delivers to the packet counter state machine, which returns a single response to each distinct client IP address.',
          batching: { count: 1000, timeoutInSeconds: 1 },
        }),
      ],
    });
  }
}
