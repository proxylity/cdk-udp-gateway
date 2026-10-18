import * as iam from 'aws-cdk-lib/aws-iam';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/**
 * Properties for {@link FirehoseDestination}. Provide exactly one of {@link deliveryStream} (the L1
 * {@link firehose.CfnDeliveryStream}) or {@link deliveryStreamArn}. The alpha `IDeliveryStream`
 * interface is intentionally not used — it is not jsii-stable.
 */
export interface FirehoseDestinationProps extends CommonDestinationProps {
  /** The delivery stream (L1 resource) packets are delivered to. Mutually exclusive with the ARN. */
  readonly deliveryStream?: firehose.CfnDeliveryStream;
  /** The delivery stream ARN. Mutually exclusive with {@link deliveryStream}. */
  readonly deliveryStreamArn?: string;
}

/**
 * Deliver packets to an Amazon Data Firehose delivery stream. The derived role trusts the Proxylity
 * ServiceRole and grants `firehose:PutRecord` + `firehose:PutRecordBatch` on the stream ARN.
 */
export class FirehoseDestination extends DestinationBase {
  constructor(private readonly props: FirehoseDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const arn = this.resolveArn();
    const { role, dependencies } = this._resolveRole(
      scope,
      'FirehoseDestinationRole',
      listener,
      (r) => {
        r.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
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
      dependencies,
    };
  }

  private resolveArn(): string {
    const hasStream = this.props.deliveryStream !== undefined;
    const hasArn = this.props.deliveryStreamArn !== undefined;
    if (hasStream === hasArn) {
      throw new Error(
        "FirehoseDestination requires exactly one of 'deliveryStream' or 'deliveryStreamArn'.",
      );
    }
    return hasStream ? this.props.deliveryStream!.attrArn : this.props.deliveryStreamArn!;
  }
}
