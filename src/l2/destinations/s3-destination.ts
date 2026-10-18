import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/** Properties for {@link S3Destination}. */
export interface S3DestinationProps extends CommonDestinationProps {
  /** The bucket packets are delivered to (as objects). */
  readonly bucket: s3.IBucket;
  /**
   * Object key prefix. The destination ARN and IAM resource scope are
   * `<bucket.bucketArn>/<keyPrefix>*`.
   *
   * @default - no prefix (objects written at the bucket root)
   */
  readonly keyPrefix?: string;
}

/**
 * Deliver packets to an Amazon S3 bucket. The destination ARN and the `s3:PutObject` grant are both
 * derived from `bucket.bucketArn` (so the partition stays correct for `aws-cn`/`aws-us-gov`), scoped
 * to `<bucketArn>/<keyPrefix>*`.
 */
export class S3Destination extends DestinationBase {
  constructor(private readonly props: S3DestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const scopeArn = `${this.props.bucket.bucketArn}/${this.props.keyPrefix ?? ''}*`;
    const { role, dependencies } = this._resolveRole(scope, 'S3DestinationRole', listener, (r) => {
      r.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['s3:PutObject'],
          resources: [scopeArn],
        }),
      );
    });

    return {
      destinationArn: scopeArn,
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
