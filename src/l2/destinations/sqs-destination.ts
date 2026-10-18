import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { ArgumentFormatter, Formatter } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';
import { isUnresolved } from '../../private/l2-validation';

/** Properties for {@link SqsDestination}. */
export interface SqsDestinationProps extends CommonDestinationProps {
  /** The queue packets are delivered to. */
  readonly queue: sqs.IQueue;
  /** `Arguments.SendRaw`. */
  readonly sendRaw?: boolean;
  /** `Arguments.UseMessageAttributes`. */
  readonly useMessageAttributes?: boolean;
  /** `Arguments.MessageGroupIdExpression` — required for FIFO queues. */
  readonly messageGroupIdExpression?: string;
  /** `Arguments.MessageGroupIdFormatter` — how the computed message-group id is encoded. */
  readonly messageGroupIdFormatter?: ArgumentFormatter;
  /** `Arguments.MessageDeduplicationIdExpression`. */
  readonly messageDeduplicationIdExpression?: string;
  /** `Arguments.MessageDeduplicationIdFormatter` — how the computed dedup id is encoded. */
  readonly messageDeduplicationIdFormatter?: ArgumentFormatter;
}

/**
 * Deliver packets to an Amazon SQS queue. The derived role trusts the Proxylity ServiceRole and
 * grants the superset `sqs:GetQueueUrl` + `sqs:SendMessage` + `sqs:SendMessageBatch` on the queue
 * ARN (delivery calls `GetQueueUrl` then `SendMessageBatch`). FIFO queues require a
 * {@link SqsDestinationProps.messageGroupIdExpression}.
 */
export class SqsDestination extends DestinationBase {
  constructor(private readonly props: SqsDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const queue = this.props.queue;

    // Detect FIFO: the IQueue.fifo flag, falling back to the `.fifo` ARN suffix for imported queues.
    const isFifo =
      queue.fifo === true ||
      (!isUnresolved(queue.queueArn) && queue.queueArn.endsWith('.fifo'));
    if (isFifo && this.props.messageGroupIdExpression === undefined) {
      throw new Error('MessageGroupIdExpression is required for FIFO SQS queues.');
    }

    const { role, dependencies } = this._resolveRole(scope, 'SqsDestinationRole', listener, (r) => {
      r.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['sqs:GetQueueUrl', 'sqs:SendMessage', 'sqs:SendMessageBatch'],
          resources: [queue.queueArn],
        }),
      );
    });

    return {
      destinationArn: queue.queueArn,
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
        sendRaw: this.props.sendRaw,
        useMessageAttributes: this.props.useMessageAttributes,
        messageGroupIdExpression: this.props.messageGroupIdExpression,
        messageGroupIdFormatter: this.props.messageGroupIdFormatter,
        messageDeduplicationIdExpression: this.props.messageDeduplicationIdExpression,
        messageDeduplicationIdFormatter: this.props.messageDeduplicationIdFormatter,
      },
      dependencies,
    };
  }
}
