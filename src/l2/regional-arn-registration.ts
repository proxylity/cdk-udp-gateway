import { Aws } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnDestinationArn } from '../cfn-destination-arn';
import { ProxylityConfig } from '../proxylity-config';

/** Properties for {@link RegionalArnRegistration}. */
export interface RegionalArnRegistrationProps {
  /**
   * The destination name to register an ARN for (the global stack's `DestinationNames[0]` output).
   * Maps to L1 `CfnDestinationArn.destination`.
   */
  readonly destinationName: string;
  /** This region's concrete ARN. Maps to L1 `CfnDestinationArn.arn`. */
  readonly arn: string;
  /**
   * The ingress region key to register under, or `"*"` for a FALLBACK ARN. Maps to L1
   * `CfnDestinationArn.ingressRegionKey`. Defaults to `Aws.REGION` (`{ Ref: "AWS::Region" }`).
   */
  readonly ingressRegionKey?: string;
  /** Explicit {@link ProxylityConfig}; defaults to `ProxylityConfig.forStack(this)`. */
  readonly proxylityConfig?: ProxylityConfig;
}

/**
 * An ergonomic L2 helper for the multi-region registration flow: a *regional* stack registers one
 * concrete ARN for a destination that was defined (as an empty `DestinationArn: {}`) on a *global*
 * stack. It is a thin wrapper over the L1 {@link CfnDestinationArn} — the L2 counterpart to the
 * global-stack `ArnDestination` with an empty `arnMap`.
 *
 * This is intentionally a focused registration helper rather than a general destination: the only
 * real use of the standalone `DestinationArn` resource is this cross-stack, name-keyed flow.
 */
export class RegionalArnRegistration extends Construct {
  private readonly cfn: CfnDestinationArn;

  constructor(scope: Construct, id: string, props: RegionalArnRegistrationProps) {
    super(scope, id);

    const proxylityConfig = props.proxylityConfig ?? ProxylityConfig.forStack(this);

    this.cfn = new CfnDestinationArn(this, 'Resource', {
      serviceToken: proxylityConfig.serviceToken(),
      apiKey: proxylityConfig.apiKey(),
      destination: props.destinationName,
      ingressRegionKey: props.ingressRegionKey ?? Aws.REGION,
      arn: props.arn,
    });
  }

  /** Escape hatch: the underlying L1 {@link CfnDestinationArn}. Use for `addPropertyOverride`, etc. */
  public get cfnDestinationArn(): CfnDestinationArn {
    return this.cfn;
  }

  /** `Fn::GetAtt(..., 'Destination')` — the echoed destination name. */
  public get destinationName(): string {
    return this.cfn.attrDestination;
  }
}
