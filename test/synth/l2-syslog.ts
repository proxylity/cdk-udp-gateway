import { Stack } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import {
  CloudWatchLogsDestination,
  FirehoseDestination,
  Formatter,
  Listener,
  ListenerProtocol,
} from '../../src';

/**
 * L2 re-authoring of `examples/syslog` (syslog-cw-s3). A WireGuard listener with
 * `DecapsulatedDelivery` and one peer, delivering to a Firehose delivery stream (UTF-8, archived to
 * S3 behind the stream) and to a CloudWatch Logs group.
 */
export class L2SyslogStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const logGroup = logs.LogGroup.fromLogGroupArn(
      this,
      'Logs',
      'arn:aws:logs:us-east-1:111122223333:log-group:/proxylity-examples/syslog-cw',
    );

    this.listener = new Listener(this, 'SyslogListener', {
      protocol: ListenerProtocol.wireGuard({
        decapsulatedDelivery: true,
        peers: [
          {
            // A base64 32-byte public key stand-in (example uses a template Parameter Ref).
            publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            allowedIPs: ['0.0.0.0/0', '::/0'],
          },
        ],
      }),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new FirehoseDestination({
          deliveryStreamArn: 'arn:aws:firehose:us-east-1:111122223333:deliverystream/syslog',
          destinationName: 'SyslogFirehose',
          description: 'This destination sends SYSLOG messages to S3 via Firehose for archival.',
          formatter: Formatter.UTF8,
          batching: { count: 1000, timeoutInSeconds: 30 },
          logGroupName: '/proxylity-examples/syslog-destination-errors',
        }),
        new CloudWatchLogsDestination({
          logGroup,
          destinationName: 'SyslogLogs',
          description: 'This destination sends SYSLOG messages to CloudWatch.',
          batching: { count: 10, timeoutInSeconds: 10 },
          logGroupName: '/proxylity-examples/syslog-destination-errors',
        }),
      ],
    });
  }
}
