import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/**
 * Properties for {@link ApiGatewayDestination}. The input is an `execute-api` ARN string (it encodes
 * the api-id, stage, method and optional path), rather than an alpha API Gateway construct interface.
 */
export interface ApiGatewayDestinationProps extends CommonDestinationProps {
  /**
   * The `execute-api` ARN to invoke, e.g.
   * `arn:aws:execute-api:<region>:<account>:<api-id>/<stage>/<METHOD>/<path>`.
   */
  readonly executeApiArn: string;
}

/**
 * Deliver packets to an Amazon API Gateway endpoint via a signed `execute-api` request. The derived
 * role trusts the Proxylity ServiceRole and grants `execute-api:Invoke` on the supplied ARN.
 */
export class ApiGatewayDestination extends DestinationBase {
  constructor(private readonly props: ApiGatewayDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const arn = this.props.executeApiArn;
    const { role, dependencies } = this._resolveRole(
      scope,
      'ApiGatewayDestinationRole',
      listener,
      (r) => {
        r.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['execute-api:Invoke'],
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
}
