import { Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { IDependable } from 'constructs';
import { Construct } from 'constructs';
import { Batching, DestinationArguments, DestinationArnMap } from '../cfn-listener';
import { addLogsGrant, addMetricsGrant, createServiceRole } from '../private/l2-iam';
import { Formatter } from './enums';
import { Listener } from './listener';

/**
 * A destination that can be bound to a {@link Listener}. Implementations are small objects (not
 * resource-emitting constructs); their {@link bind} method creates the IAM role/policy they need as
 * CDK constructs and returns the config the Listener folds into one L1 `Destinations[]` entry.
 */
export interface IListenerDestination {
  /**
   * Called once by the {@link Listener} during its own construction, for each destination.
   * Implementations MUST create any IAM role/policy they need (as CDK constructs under `scope`) and
   * return the {@link ListenerDestinationConfig} the Listener translates into one inline L1
   * destination entry.
   */
  bind(scope: Construct, listener: Listener): ListenerDestinationConfig;
}

/**
 * The result of {@link IListenerDestination.bind}. It is intentionally the L1 camelCase
 * `ListenerDestination` shape minus the pieces the {@link Listener} owns, so the Listener can build
 * the L1 `Destinations[]` array by a near-mechanical copy.
 */
export interface ListenerDestinationConfig {
  /** `Destinations[].DestinationArn` (single ARN form). Mutually exclusive with `destinationArnMap`. */
  readonly destinationArn?: string;
  /** `Destinations[].DestinationArn` (region-map form). Mutually exclusive with `destinationArn`. */
  readonly destinationArnMap?: DestinationArnMap;
  /** `Destinations[].Role` — the IAM role this destination created (or was given). */
  readonly role: iam.IRole;
  /** `Destinations[].Formatter`. */
  readonly formatter?: Formatter;
  /** `Destinations[].Arguments` — already in the L1 camelCase shape. */
  readonly arguments?: DestinationArguments;
  /** `Destinations[].Name`. */
  readonly destinationName?: string;
  /** `Destinations[].Description`. */
  readonly description?: string;
  /** `Destinations[].Batching`. */
  readonly batching?: Batching;
  /** `Destinations[].FilterExpression`. */
  readonly filterExpression?: string;
  /** `Destinations[].MetricsEnabled`. */
  readonly metricsEnabled?: boolean;
  /** `Destinations[].LogGroupName`. */
  readonly logGroupName?: string;
  /**
   * `Role.Duration` as a `"[d.]hh:mm:ss"` duration string; omitted => the service applies
   * `"1:00:00"` (one hour). Produced from `roleSessionDuration` by {@link DestinationBase}.
   */
  readonly roleSessionDuration?: string;
  /**
   * CDK dependables the Listener must `node.addDependency` on so the listener custom resource is not
   * created before this destination's role AND its inline policy exist. Normally the role's attached
   * default policy. See design §6.3.
   */
  readonly dependencies?: IDependable[];
}

/**
 * Options common to every destination's `*Props`. A bring-your-own `role` disables L2 auto-IAM; the
 * `formatter` default is service-specific and applied by each destination when omitted.
 */
export interface CommonDestinationProps {
  /** `Destinations[].Name` — unique within the listener; generated if omitted. */
  readonly destinationName?: string;
  /** `Destinations[].Description`. */
  readonly description?: string;
  /** `Destinations[].Batching`. */
  readonly batching?: Batching;
  /** `Destinations[].FilterExpression` — a BREX filter string. */
  readonly filterExpression?: string;
  /** `Destinations[].MetricsEnabled` — requires an IAM role (auto-created when omitted). */
  readonly metricsEnabled?: boolean;
  /** `Destinations[].LogGroupName` — requires an IAM role (auto-created when omitted). */
  readonly logGroupName?: string;
  /** `Destinations[].Formatter` — the service default is applied when omitted. */
  readonly formatter?: Formatter;
  /** Bring-your-own IAM role. If set, L2 uses it as-is and adds NO trust or grants. */
  readonly role?: iam.IRole;
  /** Session duration for the derived role (`Role.Duration` as a `"[d.]hh:mm:ss"` string). Default 1h. */
  readonly roleSessionDuration?: Duration;
}

/**
 * Internal result of {@link DestinationBase.resolveRole}: the role to carry on the destination entry
 * plus the dependables the Listener must order after.
 */
interface ResolvedRole {
  readonly role: iam.IRole;
  readonly dependencies: IDependable[];
}

/**
 * Shared base for L2 destinations. Centralizes role resolution (bring-your-own vs auto-create a role
 * trusting the Proxylity ServiceRole), the metrics/logs add-on grants, and the
 * `roleSessionDuration -> duration-string` mapping. Not re-exported from the package root; it exists
 * for the per-service destination subclasses to extend.
 */
export abstract class DestinationBase implements IListenerDestination {
  constructor(protected readonly commonProps: CommonDestinationProps) {}

  public abstract bind(scope: Construct, listener: Listener): ListenerDestinationConfig;

  /**
   * Resolve the IAM role for this destination. When the caller brought their own role it is used
   * as-is (the caller owns trust/grants) and only an ordering dependency is added. Otherwise a role
   * trusting the Proxylity ServiceRole is created, `grant(role)` attaches the per-service statements,
   * and the metrics/logs add-ons are applied per {@link CommonDestinationProps}.
   *
   * @param scope the construct scope the Listener passed to `bind` (the auto-created role is a child).
   * @param id a stable id for the auto-created role (unique within `scope`).
   * @param listener the binding Listener (source of the resolved ProxylityConfig).
   * @param grant callback that attaches the per-service IAM statements to the auto-created role.
   * @internal
   */
  protected _resolveRole(
    scope: Construct,
    id: string,
    listener: Listener,
    grant: (role: iam.Role) => void,
  ): ResolvedRole {
    if (this.commonProps.role) {
      // Bring-your-own: use as-is, do not mutate trust or grants, but still order after it.
      return { role: this.commonProps.role, dependencies: [this.commonProps.role] };
    }

    const role = createServiceRole(scope, id, listener.resolvedProxylityConfig);
    grant(role);
    if (this.commonProps.metricsEnabled) {
      addMetricsGrant(role);
    }
    if (this.commonProps.logGroupName !== undefined) {
      addLogsGrant(role);
    }

    const dependencies: IDependable[] = [role];
    // The default policy (created by addToPrincipalPolicy) carries the grants; depend on it so the
    // listener is not created before the policy exists. It may be undefined if no statements were
    // attached (e.g. ArnDestination with no auto-grants).
    const defaultPolicy = (role as unknown as { defaultPolicy?: IDependable }).defaultPolicy;
    if (defaultPolicy) {
      dependencies.push(defaultPolicy);
    }
    return { role, dependencies };
  }
}
