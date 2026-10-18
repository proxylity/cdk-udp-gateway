import { Aws, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ArnDestination, Listener, ListenerProtocol, RegionalArnRegistration } from '../../src';

/**
 * L2 re-authoring of the `examples/packet-counter-multi-region` GLOBAL stack: a UDP listener whose
 * single destination is an {@link ArnDestination} with an empty region map, which serializes to
 * `DestinationArn: {}` (the concrete per-region ARNs are registered by the regional stacks).
 */
export class L2MultiRegionGlobalStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.listener = new Listener(this, 'UdpListener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new ArnDestination({
          arnMap: {},
          description:
            'Delivers to the packet counter lambda using region-specific ARNs. All ARNs are mapped in the regional stacks (see packet-counter-regional.template.json).',
          batching: { count: 10, timeoutInSeconds: 1 },
          metricsEnabled: true,
        }),
      ],
    });
  }
}

/**
 * L2 re-authoring of the `examples/packet-counter-multi-region` REGIONAL stack: a
 * {@link RegionalArnRegistration} binding this region's concrete Lambda ARN to the global
 * destination id, keyed on `AWS::Region`.
 */
export class L2MultiRegionRegionalStack extends Stack {
  public readonly registration: RegionalArnRegistration;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.registration = new RegionalArnRegistration(this, 'DestinationArn', {
      destinationName: 'dstn-example',
      ingressRegionKey: Aws.REGION,
      arn: 'arn:aws:lambda:us-east-1:111122223333:function:packet-counter',
    });
  }
}
