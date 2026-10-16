import { Aws, CfnElement, Fn, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';

const PROXYLITY_CONFIG_ID = 'ProxylityConfig';
const MAPPING_NAME = 'ProxylityConfig';

/**
 * Internal CfnElement that emits the raw `Mappings.ProxylityConfig` entry whose value is an
 * `Fn::Transform` (AWS::Include) node. A `CfnMapping` cannot represent a transform-valued mapping,
 * and neither `Stack` nor `CfnMapping` expose a raw template-override API, so we emit the fragment
 * directly from a minimal `CfnElement`. CloudFormation collects `_toCloudFormation()` output into the
 * synthesized template, so returning a `{ Mappings: { ... } }` object places it under the top-level
 * `Mappings` section.
 */
class ProxylityConfigMapping extends CfnElement {
  /** @internal */
  public _toCloudFormation(): object {
    return {
      Mappings: {
        [MAPPING_NAME]: {
          'Fn::Transform': {
            Name: 'AWS::Include',
            Parameters: {
              Location: Fn.sub(
                's3://proxylity-config-${AWS::Region}/${AWS::AccountId}/customer-config.json',
              ),
            },
          },
        },
      },
    };
  }
}

/**
 * Materializes the account/region Proxylity configuration mapping and provides typed accessors for
 * the three values every Proxylity UDP Gateway stack resolves via `Fn::FindInMap`.
 *
 * It injects, once per `Stack`, the `Mappings.ProxylityConfig` block populated by an `AWS::Include`
 * transform of `s3://proxylity-config-${AWS::Region}/${AWS::AccountId}/customer-config.json`
 * (the exact block every example template begins with), then exposes `serviceToken`, `serviceRole`,
 * and `apiKey` so callers never hand-write the `Fn::FindInMap` tuples.
 *
 * Because a `CfnMapping` cannot represent a value that is an `Fn::Transform` rather than a literal
 * map, the mapping is emitted directly from a minimal internal `CfnElement` into the synthesized
 * `Mappings.ProxylityConfig`. The singleton guard ensures it is written exactly once per stack.
 *
 * @example
 * const config = ProxylityConfig.forStack(this);
 * new CfnListener(this, 'UdpListener', {
 *   serviceToken: config.serviceToken(),
 *   apiKey: config.apiKey(),
 *   protocols: ['udp'],
 * });
 */
export class ProxylityConfig extends Construct {
  /**
   * Finds (or creates) the single `ProxylityConfig` mapping+transform for the stack enclosing
   * `scope`. Idempotent: repeated calls within the same stack return the same instance and the
   * `Mappings.ProxylityConfig` transform block is emitted exactly once.
   *
   * A nested stack is a distinct `Stack`, so it gets its own mapping — correct, because
   * `AWS::Region`/`AWS::AccountId` resolve per deployed stack.
   */
  public static forStack(scope: Construct): ProxylityConfig {
    const stack = Stack.of(scope);
    const existing = stack.node.tryFindChild(PROXYLITY_CONFIG_ID);
    if (existing) {
      return existing as ProxylityConfig;
    }
    return new ProxylityConfig(stack, PROXYLITY_CONFIG_ID);
  }

  private constructor(scope: Construct, id: string) {
    super(scope, id);

    // Emit `Mappings.ProxylityConfig` with an `Fn::Transform` (AWS::Include) value, once per stack.
    new ProxylityConfigMapping(this, 'Mapping');
  }

  /**
   * `Fn::FindInMap(["ProxylityConfig", <region or AWS::Region>, "ServiceToken"])` as a token string.
   * Pass an explicit `region` for multi-region/global stacks; defaults to `AWS::Region`.
   */
  public serviceToken(region?: string): string {
    return Fn.findInMap(MAPPING_NAME, region ?? Aws.REGION, 'ServiceToken');
  }

  /**
   * `Fn::FindInMap(["ProxylityConfig", <region or AWS::Region>, "ServiceRole"])` as a token string.
   * This is the Proxylity service principal that destination roles trust (`sts:AssumeRole`).
   * Defaults to `AWS::Region`.
   */
  public serviceRole(region?: string): string {
    return Fn.findInMap(MAPPING_NAME, region ?? Aws.REGION, 'ServiceRole');
  }

  /**
   * `Fn::FindInMap(["ProxylityConfig", "Account", "ApiKey"])` as a token string. The second key is
   * the literal `"Account"` (the API key is account-wide, not per-region).
   */
  public apiKey(): string {
    return Fn.findInMap(MAPPING_NAME, 'Account', 'ApiKey');
  }
}
