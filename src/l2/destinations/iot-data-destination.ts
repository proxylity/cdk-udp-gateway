import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { ArgumentFormatter, Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/**
 * Properties for {@link IotDataDestination}. The input is an IoT topic ARN string
 * (`arn:aws:iot:...:topic/...`), rather than an alpha IoT construct interface.
 */
export interface IotDataDestinationProps extends CommonDestinationProps {
  /** The IoT topic ARN to publish to, e.g. `arn:aws:iot:<region>:<account>:topic/<topic>`. */
  readonly topicArn: string;
  /** `Arguments.DynamicTopicSuffix` — append a computed suffix to the topic. */
  readonly dynamicTopicSuffix?: boolean;
  /** `Arguments.TopicSuffixExpression` — a BREX expression yielding the topic suffix. */
  readonly topicSuffixExpression?: string;
  /** `Arguments.TopicSuffixFormatter` — how the computed suffix is encoded. */
  readonly topicSuffixFormatter?: ArgumentFormatter;
}

/**
 * Deliver packets to AWS IoT Core via `iot:Publish`. The derived role trusts the Proxylity
 * ServiceRole and grants `iot:Publish` on the supplied topic ARN.
 */
export class IotDataDestination extends DestinationBase {
  constructor(private readonly props: IotDataDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const arn = this.props.topicArn;
    const { role, dependencies } = this._resolveRole(
      scope,
      'IotDataDestinationRole',
      listener,
      (r) => {
        r.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['iot:Publish'],
            resources: [arn],
          }),
        );
      },
    );

    return {
      destinationArn: arn,
      role,
      formatter: this.props.formatter ?? Formatter.BASE64,
      destinationName: this.props.destinationName,
      description: this.props.description,
      batching: this.props.batching,
      filterExpression: this.props.filterExpression,
      metricsEnabled: this.props.metricsEnabled,
      logGroupName: this.props.logGroupName,
      roleSessionDuration: toDotNetTimeSpan(this.props.roleSessionDuration),
      arguments: {
        dynamicTopicSuffix: this.props.dynamicTopicSuffix,
        topicSuffixExpression: this.props.topicSuffixExpression,
        topicSuffixFormatter: this.props.topicSuffixFormatter,
      },
      dependencies,
    };
  }
}
