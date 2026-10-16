import { CfnResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { wireObject } from './private/to-wire';

/** Properties for {@link CfnDestinationArn}. */
export interface CfnDestinationArnProps {
  /** CloudFormation `ServiceToken`. Typically `ProxylityConfig.serviceToken()`. */
  readonly serviceToken: string;
  /** CloudFormation `ApiKey`. Typically `ProxylityConfig.apiKey()`. */
  readonly apiKey: string;
  /**
   * CloudFormation `Destination` — name of an existing destination (typically a
   * `CfnListener.attrDestinationNames` entry or a known inline destination name).
   */
  readonly destination: string;
  /**
   * CloudFormation `IngressRegionKey` — the ingress region name, or `"*"` to register a FALLBACK
   * ARN.
   *
   * Control-plane rules (`DestinationArnCreateHelper`; L1 does NOT enforce them — the resource
   * rejects conflicts at deploy with a `FAILED` reason, cross-reference DIVERGENCES D-13):
   *  - `"*"` is rejected when a string/fallback ARN already exists for the destination.
   *  - A region key is rejected if that key is already present on the destination's ARN map.
   *  - All ARNs for one destination must share a service.
   * Examples pass `{ Ref: "AWS::Region" }`.
   */
  readonly ingressRegionKey: string;
  /** CloudFormation `Arn` — a single valid ARN for this region. */
  readonly arn: string;
}

const RESOURCE_TYPE = 'Custom::ProxylityUdpGatewayDestinationArn';

/**
 * L1 construct for `Custom::ProxylityUdpGatewayDestinationArn`.
 *
 * Registers one ARN for one destination in one ingress region. A faithful 1:1 wrapper that passes
 * the three strings through; the control plane enforces the fallback/duplicate-key/same-service
 * rules (D-13 cross-reference).
 */
export class CfnDestinationArn extends Construct {
  /** The underlying custom resource. */
  public readonly resource: CfnResource;

  constructor(scope: Construct, id: string, props: CfnDestinationArnProps) {
    super(scope, id);

    this.resource = new CfnResource(this, 'Resource', {
      type: RESOURCE_TYPE,
      properties: wireObject([
        ['ServiceToken', props.serviceToken],
        ['ApiKey', props.apiKey],
        ['Destination', props.destination],
        ['IngressRegionKey', props.ingressRegionKey],
        ['Arn', props.arn],
      ]),
    });
  }

  /** `Fn::GetAtt(..., 'Destination')` — echoed destination name. */
  public get attrDestination(): string {
    return this.resource.getAtt('Destination').toString();
  }

  /** `Fn::GetAtt(..., 'IngressRegionKey')` — echoed region key. */
  public get attrIngressRegionKey(): string {
    return this.resource.getAtt('IngressRegionKey').toString();
  }

  /** `Fn::GetAtt(..., 'Arn')` — echoed ARN. */
  public get attrArn(): string {
    return this.resource.getAtt('Arn').toString();
  }
}
