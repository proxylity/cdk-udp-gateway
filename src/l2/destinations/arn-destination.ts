import { Construct } from 'constructs';
import { DestinationArguments, DestinationArnMap } from '../../cfn-listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';
import { validateRegionMapKey } from '../../private/l2-validation';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter } from '../enums';
import { Listener } from '../listener';

/**
 * Region→ARN map for {@link ArnDestination}. Maps 1:1 onto the L1 {@link DestinationArnMap}
 * (`default` → the `"*"` key, `byRegion` → region keys). An empty map serializes to
 * `DestinationArn: {}` (the global multi-region case).
 */
export interface RegionArnMap {
  /** Fallback ARN used when no region-specific entry matches (serialized as the `"*"` key). */
  readonly default?: string;
  /** Region-keyed ARNs, e.g. `{ 'us-east-1': 'arn:aws:...', 'eu-west-1': 'arn:aws:...' }`. */
  readonly byRegion?: { [region: string]: string };
}

/**
 * Properties for {@link ArnDestination}. Provide exactly one of {@link arn} (single ARN) or
 * {@link arnMap} (region-map form).
 */
export interface ArnDestinationProps extends CommonDestinationProps {
  /** A single destination ARN. Mutually exclusive with {@link arnMap}. */
  readonly arn?: string;
  /** The region-map form. Mutually exclusive with {@link arn}. */
  readonly arnMap?: RegionArnMap;
  /** Service-specific Arguments passthrough (the L1 camelCase {@link DestinationArguments} shape). */
  readonly arguments?: DestinationArguments;
}

/**
 * A generic escape-hatch destination for any service without a specialization (or for the
 * multi-region empty-map pattern). It takes a literal ARN or a region-map and passes Arguments
 * through unchanged.
 *
 * When no {@link CommonDestinationProps.role} is supplied, L2 creates a role trusting the Proxylity
 * ServiceRole with NO service grants — because the actions cannot be inferred from an opaque ARN, the
 * caller MUST attach the required grants to that role (or bring their own role). This is intentional.
 */
export class ArnDestination extends DestinationBase {
  constructor(private readonly props: ArnDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    const hasArn = this.props.arn !== undefined;
    const hasMap = this.props.arnMap !== undefined;
    if (hasArn && hasMap) {
      throw new Error("ArnDestination sets both 'arn' and 'arnMap'; they are mutually exclusive.");
    }

    let destinationArnMap: DestinationArnMap | undefined;
    if (hasMap) {
      const map = this.props.arnMap!;
      if (map.byRegion) {
        for (const key of Object.keys(map.byRegion)) {
          validateRegionMapKey(key);
        }
      }
      destinationArnMap = { default: map.default, byRegion: map.byRegion };
    }

    // Auto-create a role trusting the Proxylity ServiceRole with NO service grants (actions cannot
    // be inferred from an opaque ARN). bring-your-own role is used as-is.
    const { role, dependencies } = this._resolveRole(scope, 'ArnDestinationRole', listener, () => {
      // Intentionally no grants.
    });

    return {
      destinationArn: hasArn ? this.props.arn : undefined,
      destinationArnMap,
      role,
      formatter: this.props.formatter ?? Formatter.BASE64,
      destinationName: this.props.destinationName,
      description: this.props.description,
      batching: this.props.batching,
      filterExpression: this.props.filterExpression,
      metricsEnabled: this.props.metricsEnabled,
      logGroupName: this.props.logGroupName,
      roleSessionDuration: toDotNetTimeSpan(this.props.roleSessionDuration),
      arguments: this.props.arguments,
      dependencies,
    };
  }
}
