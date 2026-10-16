import { CfnResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { wireObject } from './private/to-wire';

/**
 * The SNS topic source for a packet source (`SnsTopicSource`).
 *
 * NOTE: the IAM role here is a bare string ARN under `Role`, NOT a `{ Arn, Duration }` object like
 * the Listener/Destination role shape (DIVERGENCES D-08).
 */
export interface SnsTopicSource {
  /** `SnsTopicSource.TopicArn` — SNS topic ARN; must be in the same region as the stack. */
  readonly topicArn: string;
  /** `SnsTopicSource.Role` — IAM role ARN as a bare string (NOT a `{ Arn }` object — D-08). */
  readonly role: string;
}

/** Properties for {@link CfnPacketSource}. */
export interface CfnPacketSourceProps {
  /** CloudFormation `ServiceToken`. Typically `ProxylityConfig.serviceToken()`. */
  readonly serviceToken: string;
  /** CloudFormation `ApiKey`. Typically `ProxylityConfig.apiKey()`. */
  readonly apiKey: string;
  /**
   * CloudFormation `ListenerName` — target listener name (e.g. `CfnListener.attrId`). The resource
   * rejects changing it on update.
   */
  readonly listenerName: string;
  /** CloudFormation `SnsTopicSource` — `{ TopicArn, Role }`. */
  readonly snsTopicSource: SnsTopicSource;
  /** CloudFormation `Description` — resource generates one if omitted. */
  readonly description?: string;
  /**
   * CloudFormation `Enabled` — PASS-THROUGH ONLY. The current control-plane resource does NOT read
   * this property (DIVERGENCES D-07). Exposed so faithfully-copied example templates round-trip.
   */
  readonly enabled?: boolean;
}

const RESOURCE_TYPE = 'Custom::ProxylityUdpGatewayPacketSource';

/**
 * L1 construct for `Custom::ProxylityUdpGatewayPacketSource`.
 *
 * Subscribes a listener to an SNS topic for server-initiated push. The resource returns no
 * `Fn::GetAtt` outputs, so only `ref` (the physical resource id) is exposed.
 */
export class CfnPacketSource extends Construct {
  /** The underlying custom resource. */
  public readonly resource: CfnResource;

  constructor(scope: Construct, id: string, props: CfnPacketSourceProps) {
    super(scope, id);

    this.resource = new CfnResource(this, 'Resource', {
      type: RESOURCE_TYPE,
      properties: wireObject([
        ['ServiceToken', props.serviceToken],
        ['ApiKey', props.apiKey],
        ['ListenerName', props.listenerName],
        ['SnsTopicSource', snsTopicSourceToWire(props.snsTopicSource)],
        ['Description', props.description],
        ['Enabled', props.enabled],
      ]),
    });
  }

  /** The physical resource id of the packet source (no `Fn::GetAtt` attributes are available). */
  public get ref(): string {
    return this.resource.ref;
  }
}

function snsTopicSourceToWire(s: SnsTopicSource): { [key: string]: unknown } {
  return wireObject([
    ['TopicArn', s.topicArn],
    ['Role', s.role],
  ]);
}
