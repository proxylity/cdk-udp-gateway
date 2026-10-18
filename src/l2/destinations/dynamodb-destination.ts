import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/**
 * Properties for {@link DynamoDbDestination}.
 *
 * Custom partition/sort key templates are not currently configurable; a DynamoDB destination uses
 * the service's default key handling. Support for custom key templates may be added in a future
 * release.
 */
export interface DynamoDbDestinationProps extends CommonDestinationProps {
  /** The table packets are written to. */
  readonly table: dynamodb.ITable;
}

/**
 * Deliver packets to an Amazon DynamoDB table. The derived role trusts the Proxylity ServiceRole and
 * grants `dynamodb:DescribeTable` + `dynamodb:BatchWriteItem` on the table ARN.
 */
export class DynamoDbDestination extends DestinationBase {
  constructor(private readonly props: DynamoDbDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const table = this.props.table;
    const { role, dependencies } = this._resolveRole(
      scope,
      'DynamoDbDestinationRole',
      listener,
      (r) => {
        r.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['dynamodb:DescribeTable', 'dynamodb:BatchWriteItem'],
            resources: [table.tableArn],
          }),
        );
      },
    );

    return {
      destinationArn: table.tableArn,
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
