import { Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
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
 * L2 shape of the listener in `examples/syslog` (now itself a CDK app built on these constructs). A
 * WireGuard listener with `DecapsulatedDelivery`, per-site `AllowedIPs`, listener metrics and error
 * logs, and three destinations: the original bytes (base64) to the archive Firehose stream, parsed
 * syslog JSON to CloudWatch Logs, and parsed syslog JSON to the analytics (Parquet) Firehose stream.
 * Like the example, it brings its own roles, so the listener entry carries no derived roles.
 */
export class L2SyslogStack extends Stack {
  public readonly listener: Listener;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const errors = '/proxylity-examples/syslog/syslog-us-east-1/errors';
    const destinationRole = iam.Role.fromRoleArn(this, 'DestinationRole', 'arn:aws:iam::111122223333:role/syslog-destination');
    const listenerRole = iam.Role.fromRoleArn(this, 'ListenerRole', 'arn:aws:iam::111122223333:role/syslog-listener');
    const logsGroup = logs.LogGroup.fromLogGroupArn(
      this,
      'Logs',
      'arn:aws:logs:us-east-1:111122223333:log-group:/proxylity-examples/syslog/syslog-us-east-1/logs',
    );
    const common = { role: destinationRole, metricsEnabled: true, logGroupName: errors };

    this.listener = new Listener(this, 'Listener', {
      listenerName: 'syslog-us-east-1',
      protocol: ListenerProtocol.wireGuard({
        decapsulatedDelivery: true,
        peers: [
          { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', allowedIPs: ['10.1.0.0/16'] },
          { publicKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=', allowedIPs: ['10.2.0.0/16'] },
        ],
      }),
      clientRestrictions: { networks: ['198.51.100.0/24'] },
      metricsEnabled: true,
      logGroupName: errors,
      role: listenerRole,
      destinations: [
        new FirehoseDestination({
          ...common,
          destinationName: 'syslog-us-east-1-archive',
          description: 'Original message bytes (base64) to the Object Lock archive through Firehose.',
          deliveryStreamArn: 'arn:aws:firehose:us-east-1:111122223333:deliverystream/syslog-us-east-1-archive',
          formatter: Formatter.BASE64,
          batching: { count: 500, timeoutInSeconds: 10, sizeInMB: 0.5 },
        }),
        new CloudWatchLogsDestination({
          ...common,
          destinationName: 'syslog-us-east-1-logs',
          description: 'Parsed messages (syslog formatter) as JSON events in CloudWatch Logs.',
          logGroup: logsGroup,
          formatter: Formatter.SYSLOG,
          batching: { count: 200, timeoutInSeconds: 5, sizeInMB: 0.5 },
        }),
        new FirehoseDestination({
          ...common,
          destinationName: 'syslog-us-east-1-analytics',
          description: 'Parsed messages (syslog formatter) to Firehose for Parquet conversion.',
          deliveryStreamArn: 'arn:aws:firehose:us-east-1:111122223333:deliverystream/syslog-us-east-1-analytics',
          formatter: Formatter.SYSLOG,
          batching: { count: 500, timeoutInSeconds: 10, sizeInMB: 0.5 },
        }),
      ],
    });
  }
}
