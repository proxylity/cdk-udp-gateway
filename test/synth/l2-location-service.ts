import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Listener, ListenerProtocol, LocationTrackerDestination } from '../../src';

/**
 * L2 re-authoring of `examples/location-service`: a UDP listener delivering device positions to an
 * AWS Location Service tracker. The example carries a stale `EnableLogging: true` key that L2 omits
 * by design (the golden diff drops it).
 */
export class L2LocationServiceStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.listener = new Listener(this, 'UdpListener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new LocationTrackerDestination({
          trackerArn: 'arn:aws:geo:us-east-1:111122223333:tracker/example',
          description: 'Delivers to the tracker; no response is generated.',
          batching: { count: 10, timeoutInSeconds: 0.1 },
          logGroupName: '/proxylity/location-service-example',
          deviceIdExpression: 'utf8[0:2]',
          latitudeExpression: 'i16le[2:4]',
          longitudeExpression: 'i16le[4:6]',
          positionPropertyExpressions: {
            foo: 'u16le[6:8]',
            bar: 'utf8[8:10]',
          },
        }),
      ],
    });
  }
}
