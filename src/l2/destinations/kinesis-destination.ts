import * as iam from 'aws-cdk-lib/aws-iam';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { ArgumentFormatter, Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/** Properties for {@link KinesisStreamDestination}. */
export interface KinesisStreamDestinationProps extends CommonDestinationProps {
  /** The data stream packets are delivered to. */
  readonly stream: kinesis.IStream;
  /** `Arguments.PartitionKeyExpression` — a BREX expression yielding the record partition key. */
  readonly partitionKeyExpression?: string;
  /** `Arguments.PartitionKeyExpressionFormatter` — how the computed partition key is encoded. */
  readonly partitionKeyExpressionFormatter?: ArgumentFormatter;
}

/**
 * Deliver packets to an Amazon Kinesis Data Stream. The derived role trusts the Proxylity
 * ServiceRole and grants `kinesis:PutRecords` on the stream ARN.
 */
export class KinesisStreamDestination extends DestinationBase {
  constructor(private readonly props: KinesisStreamDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const stream = this.props.stream;
    const { role, dependencies } = this._resolveRole(
      scope,
      'KinesisStreamDestinationRole',
      listener,
      (r) => {
        r.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['kinesis:PutRecords'],
            resources: [stream.streamArn],
          }),
        );
      },
    );

    return {
      destinationArn: stream.streamArn,
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
        partitionKeyExpression: this.props.partitionKeyExpression,
        partitionKeyExpressionFormatter: this.props.partitionKeyExpressionFormatter,
      },
      dependencies,
    };
  }
}
