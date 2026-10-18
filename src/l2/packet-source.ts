import { Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { CfnPacketSource } from '../cfn-packet-source';
import { createServiceRole } from '../private/l2-iam';
import { ProxylityConfig } from '../proxylity-config';
import { Listener } from './listener';

/** Properties for {@link SnsPacketSource}. */
export interface SnsPacketSourceProps {
  /** The {@link Listener} to push packets into. */
  readonly listener: Listener;
  /** The SNS topic that sources packets (server-initiated push). */
  readonly topic: sns.ITopic;
  /** `Description` — the resource generates one if omitted. */
  readonly description?: string;
  /**
   * Bring-your-own IAM role for the subscribe role (`SnsTopicSource.Role`). If omitted, L2
   * auto-creates a role trusting the Proxylity ServiceRole granting `sns:Subscribe`,
   * `sns:Unsubscribe`, and `sns:ListSubscriptionsByTopic` on the topic. If provided, it is used
   * as-is and L2 adds NO trust or grants.
   */
  readonly role?: iam.IRole;
  /** Explicit {@link ProxylityConfig}; defaults to the listener's resolved config. */
  readonly proxylityConfig?: ProxylityConfig;
  /**
   * Session duration for the derived role. Reserved for parity with the destination model; the
   * packet-source wire shape has no `Role.Duration` key, so this is accepted but not emitted.
   */
  readonly roleSessionDuration?: Duration;
}

/**
 * An ergonomic L2 SNS packet source. It subscribes a {@link Listener} to an SNS topic for
 * server-initiated push by composing an L1 {@link CfnPacketSource} child. There is no per-service
 * specialization: SNS-backed server push has a single shape.
 *
 * When no {@link SnsPacketSourceProps.role} is supplied, L2 creates a role trusting the Proxylity
 * ServiceRole granting exactly `sns:Subscribe`, `sns:Unsubscribe`, and
 * `sns:ListSubscriptionsByTopic` on the topic ARN, and orders the packet source after that role's
 * inline policy. It emits no `Enabled` property: the service no longer reads it, so L1 does not
 * emit it.
 */
export class SnsPacketSource extends Construct {
  private readonly cfn: CfnPacketSource;

  constructor(scope: Construct, id: string, props: SnsPacketSourceProps) {
    super(scope, id);

    const proxylityConfig = props.proxylityConfig ?? props.listener.resolvedProxylityConfig;
    const topic = props.topic;

    // Resolve the subscribe role. Auto-create one trusting the Proxylity ServiceRole granting the
    // subscribe actions, unless the caller brought their own role (used as-is).
    let role: iam.IRole;
    const dependencies = [];
    if (props.role) {
      role = props.role;
      dependencies.push(props.role);
    } else {
      const derived = createServiceRole(this, 'SubscribeRole', proxylityConfig);
      derived.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['sns:Subscribe', 'sns:Unsubscribe', 'sns:ListSubscriptionsByTopic'],
          resources: [topic.topicArn],
        }),
      );
      role = derived;
      dependencies.push(derived);
      // The default policy (created by addToPrincipalPolicy) carries the subscribe grants; depend on
      // it so the packet source is not created before the policy exists (coap-time-service uses
      // DependsOn: [ProxylitySubscribeToTopicPolicy]).
      const defaultPolicy = (derived as unknown as { defaultPolicy?: Construct }).defaultPolicy;
      if (defaultPolicy) {
        dependencies.push(defaultPolicy);
      }
    }

    this.cfn = new CfnPacketSource(this, 'Resource', {
      serviceToken: proxylityConfig.serviceToken(),
      apiKey: proxylityConfig.apiKey(),
      listenerName: props.listener.listenerName,
      snsTopicSource: {
        topicArn: topic.topicArn,
        role: role.roleArn,
      },
      description: props.description,
    });

    // Reproduce the example DependsOn ordering: the packet source must not be created before the
    // subscribe role AND its inline policy exist.
    for (const dep of dependencies) {
      this.cfn.resource.node.addDependency(dep);
    }
  }

  /** Escape hatch: the underlying L1 {@link CfnPacketSource}. Use for `addPropertyOverride`, etc. */
  public get cfnPacketSource(): CfnPacketSource {
    return this.cfn;
  }

  /** The physical resource id of the packet source (no `Fn::GetAtt` attributes are available). */
  public get ref(): string {
    return this.cfn.ref;
  }
}
