import { Annotations } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/** Properties for {@link StateMachineDestination}. */
export interface StateMachineDestinationProps extends CommonDestinationProps {
  /** The state machine packets are delivered to. */
  readonly stateMachine: stepfunctions.IStateMachine;
  /**
   * The state machine type. Authoritative when supplied. If omitted, L2 reads the type from a
   * concrete {@link stepfunctions.StateMachine}; for an imported machine (type unavailable) it grants
   * both execution actions and emits a warning.
   *
   * @default - inferred from a concrete StateMachine, else both execution actions are granted
   */
  readonly stateMachineType?: stepfunctions.StateMachineType;
}

/**
 * Deliver packets to an AWS Step Functions state machine. The derived role trusts the Proxylity
 * ServiceRole and always grants `states:DescribeStateMachine`; the execution grant is
 * `states:StartSyncExecution` for Express, `states:StartExecution` for Standard, or both when the
 * type cannot be determined (an imported machine), in which case a warning recommends setting
 * {@link StateMachineDestinationProps.stateMachineType}.
 */
export class StateMachineDestination extends DestinationBase {
  constructor(private readonly props: StateMachineDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const sm = this.props.stateMachine;
    const { role, dependencies } = this._resolveRole(
      scope,
      'StateMachineDestinationRole',
      listener,
      (r) => {
        const actions = ['states:DescribeStateMachine'];
        const type = this.resolveType();
        if (type === stepfunctions.StateMachineType.EXPRESS) {
          actions.push('states:StartSyncExecution');
        } else if (type === stepfunctions.StateMachineType.STANDARD) {
          actions.push('states:StartExecution');
        } else {
          actions.push('states:StartSyncExecution', 'states:StartExecution');
          Annotations.of(scope).addWarning(
            `StateMachineDestination for '${sm.stateMachineArn}' cannot determine the state ` +
              'machine type (imported machine); granting both states:StartSyncExecution and ' +
              'states:StartExecution. Set stateMachineType to narrow the grant.',
          );
        }
        r.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions,
            resources: [sm.stateMachineArn],
          }),
        );
      },
    );

    return {
      destinationArn: sm.stateMachineArn,
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

  /**
   * Resolve the state machine type: the explicit prop first (authoritative), then a concrete
   * {@link stepfunctions.StateMachine} instance, else `undefined` (type unavailable => superset).
   */
  private resolveType(): stepfunctions.StateMachineType | undefined {
    if (this.props.stateMachineType !== undefined) {
      return this.props.stateMachineType;
    }
    if (this.props.stateMachine instanceof stepfunctions.StateMachine) {
      return this.props.stateMachine.stateMachineType;
    }
    return undefined;
  }
}
