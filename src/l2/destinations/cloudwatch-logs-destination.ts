import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/** Properties for {@link CloudWatchLogsDestination}. */
export interface CloudWatchLogsDestinationProps extends CommonDestinationProps {
  /** The log group packets are written to (as log events). */
  readonly logGroup: logs.ILogGroup;
}

/**
 * Deliver packets to an Amazon CloudWatch Logs log group. The derived role trusts the Proxylity
 * ServiceRole and grants `logs:CreateLogStream` + `logs:PutLogEvents` on `<logGroupArn>:*`. It does
 * NOT grant `logs:CreateLogGroup` — the group must already exist. The default formatter is `utf8`
 * (not `base64`).
 */
export class CloudWatchLogsDestination extends DestinationBase {
  constructor(private readonly props: CloudWatchLogsDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const logGroup = this.props.logGroup;
    // `LogGroup.fromLogGroupArn()` returns an ARN that already ends in `:*`, whereas a constructed
    // group / `Fn::GetAtt` ARN does not. Strip a trailing `:*` before appending our own so the
    // granted resource is always exactly `<logGroupArn>:*` (never a malformed `...:*:*`).
    const logStreamResource = `${logGroup.logGroupArn.replace(/:\*$/, '')}:*`;
    const { role, dependencies } = this._resolveRole(
      scope,
      'CloudWatchLogsDestinationRole',
      listener,
      (r) => {
        r.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            resources: [logStreamResource],
          }),
        );
      },
    );

    return {
      destinationArn: logGroup.logGroupArn,
      role,
      formatter: this.props.formatter ?? Formatter.UTF8,
      destinationName: this.props.destinationName,
      description: this.props.description,
      batching: this.props.batching,
      filterExpression: this.props.filterExpression,
      metricsEnabled: this.props.metricsEnabled,
      logGroupName: this.props.logGroupName,
      roleSessionDuration: toDotNetTimeSpan(this.props.roleSessionDuration),
      dependencies,
    };
  }
}
