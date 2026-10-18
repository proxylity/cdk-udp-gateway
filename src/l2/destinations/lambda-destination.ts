import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { ArgumentFormatter, Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/** Properties for {@link LambdaDestination}. */
export interface LambdaDestinationProps extends CommonDestinationProps {
  /** The function packets are delivered to. */
  readonly fn: lambda.IFunction;
  /**
   * Use Lambda response streaming (`InvokeWithResponseStream`). Mutually exclusive with
   * {@link useAsyncInvoke}.
   */
  readonly useResponseStreaming?: boolean;
  /**
   * Invoke the function asynchronously (`InvokeAsync` — event invocation). Mutually exclusive with
   * {@link useResponseStreaming}; adds the `lambda:InvokeAsync` grant.
   */
  readonly useAsyncInvoke?: boolean;
  /** `Arguments.TenantId` — a static tenant identifier for tenant isolation. */
  readonly tenantId?: string;
  /** `Arguments.TenantIdExpression` — a BREX expression yielding the tenant id. */
  readonly tenantIdExpression?: string;
  /** `Arguments.TenantIdFormatter` — how the computed tenant id is encoded. */
  readonly tenantIdFormatter?: ArgumentFormatter;
}

/**
 * Deliver packets to an AWS Lambda function. The derived role trusts the Proxylity ServiceRole and
 * grants `lambda:InvokeFunction` (always) plus `lambda:InvokeAsync` only when {@link
 * LambdaDestinationProps.useAsyncInvoke} is set, scoped to the function ARN and its aliases/versions
 * (`<functionArn>:*`).
 */
export class LambdaDestination extends DestinationBase {
  constructor(private readonly props: LambdaDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    if (this.props.useResponseStreaming === true && this.props.useAsyncInvoke === true) {
      throw new Error('UseResponseStreaming and UseAsyncInvoke cannot both be true.');
    }

    const fn = this.props.fn;
    const { role, dependencies } = this._resolveRole(scope, 'LambdaDestinationRole', listener, (r) => {
      const actions = ['lambda:InvokeFunction'];
      if (this.props.useAsyncInvoke === true) {
        actions.push('lambda:InvokeAsync');
      }
      r.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions,
          resources: [fn.functionArn, `${fn.functionArn}:*`],
        }),
      );
    });

    return {
      destinationArn: fn.functionArn,
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
        tenantId: this.props.tenantId,
        tenantIdExpression: this.props.tenantIdExpression,
        tenantIdFormatter: this.props.tenantIdFormatter,
        useResponseStreaming: this.props.useResponseStreaming,
        useAsyncInvoke: this.props.useAsyncInvoke,
      },
      dependencies,
    };
  }
}
