import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/** Properties for {@link EventBridgeDestination}. */
export interface EventBridgeDestinationProps extends CommonDestinationProps {
  /** The event bus packets are delivered to (as events). */
  readonly eventBus: events.IEventBus;
}

/**
 * Deliver packets to an Amazon EventBridge event bus. The derived role trusts the Proxylity
 * ServiceRole and grants `events:PutEvents` on the event bus ARN.
 */
export class EventBridgeDestination extends DestinationBase {
  constructor(private readonly props: EventBridgeDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const eventBus = this.props.eventBus;
    const { role, dependencies } = this._resolveRole(
      scope,
      'EventBridgeDestinationRole',
      listener,
      (r) => {
        r.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['events:PutEvents'],
            resources: [eventBus.eventBusArn],
          }),
        );
      },
    );

    return {
      destinationArn: eventBus.eventBusArn,
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
