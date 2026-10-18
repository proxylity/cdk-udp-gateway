import { Stack } from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import {
  ArgumentFormatter,
  FirehoseDestination,
  Formatter,
  Listener,
  ListenerProtocol,
  LocationTrackerDestination,
  SqsDestination,
} from '../../src';

/**
 * L2 re-authoring of `examples/mavlink`: a UDP listener with three composite destinations — a
 * Location tracker (filtered to GPS_RAW_INT), a FIFO SQS queue (raw hex with per-drone group id),
 * and a Firehose delivery stream (hex archival). The Location destination carries a stale
 * `EnableLogging: true` in the example that L2 omits by design.
 */
export class L2MavlinkStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const fifoQueue = sqs.Queue.fromQueueArn(
      this,
      'FifoQueue',
      'arn:aws:sqs:us-east-1:111122223333:mavlink.fifo',
    );

    this.listener = new Listener(this, 'UdpListener', {
      protocol: ListenerProtocol.udp(),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new LocationTrackerDestination({
          trackerArn: 'arn:aws:geo:us-east-1:111122223333:tracker/mavlink',
          description:
            'Extracts GPS position and telemetry from MAVLink v2 GPS_RAW_INT packets and writes to the Location Service tracker. FilterExpression ensures only GPS_RAW_INT (msg 24) packets are delivered -- other message types are silently dropped.',
          filterExpression: '[0] == 0xFD && [7] == 0x18 && [8] == 0x00 && [9] == 0x00 ?? 0x00',
          batching: { count: 10, timeoutInSeconds: 0.5 },
          logGroupName: '/proxylity/mavlink-example',
          deviceIdExpression: '[5:7]',
          latitudeExpression: 'i32le[18:22]',
          longitudeExpression: 'i32le[22:26]',
          scaleFactor: 0.0000001,
          positionPropertyExpressions: {
            alt_mm: 'i32le[26:30]',
            vel_cms: 'u16le[34:36]',
            satellites: 'u8[39]',
          },
        }),
        new SqsDestination({
          queue: fifoQueue,
          description:
            'Delivers raw MAVLink packets to the FIFO queue with per-drone ordering. A Lambda function consumes the queue, decodes GPS_RAW_INT payloads, and publishes position events to AppSync Events for real-time browser display.',
          formatter: Formatter.HEX,
          batching: { count: 10, timeoutInSeconds: 1.0 },
          metricsEnabled: true,
          logGroupName: '/proxylity/mavlink-example',
          sendRaw: true,
          useMessageAttributes: true,
          messageGroupIdExpression: '[0] == 0xFE ? [3:5] : ([0] == 0xFD ? [5:7] : 0xFFFF)',
          messageGroupIdFormatter: ArgumentFormatter.HEX,
        }),
        new FirehoseDestination({
          deliveryStreamArn: 'arn:aws:firehose:us-east-1:111122223333:deliverystream/mavlink',
          description:
            'Archives all raw MAVLink packets to S3 via Firehose for durable storage and batch processing.',
          formatter: Formatter.HEX,
          batching: { count: 100, timeoutInSeconds: 1.0 },
          metricsEnabled: true,
          logGroupName: '/proxylity/mavlink-example',
        }),
      ],
    });
  }
}
