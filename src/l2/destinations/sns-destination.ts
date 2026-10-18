import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/** Properties for {@link SnsDestination}. */
export interface SnsDestinationProps extends CommonDestinationProps {
  /** The topic packets are published to. */
  readonly topic: sns.ITopic;
}

/**
 * Deliver packets to an Amazon SNS topic. The derived role trusts the Proxylity ServiceRole and
 * grants `sns:PublishBatch` ONLY (delivery uses `PublishBatch`; `sns:Publish` does not
 * authorize `sns:PublishBatch`).
 */
export class SnsDestination extends DestinationBase {
  constructor(private readonly props: SnsDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const topic = this.props.topic;
    const { role, dependencies } = this._resolveRole(scope, 'SnsDestinationRole', listener, (r) => {
      r.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['sns:PublishBatch'],
          resources: [topic.topicArn],
        }),
      );
    });

    return {
      destinationArn: topic.topicArn,
      role,
      formatter: this.props.formatter ?? Formatter.BASE64,
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
