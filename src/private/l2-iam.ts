// Internal L2 IAM helpers. NOT exported from the package public API. They build the derived roles
// L2 destinations and listeners assume at runtime, reproducing the trust and grants the deployed
// example roles use.

import { Aws, Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ProxylityConfig } from '../proxylity-config';

/**
 * Format a {@link Duration} as a `"[d.]hh:mm:ss"` duration string for the wire `Role.Duration`
 * key. The service applies `"1:00:00"` (one hour) when the property is omitted, so callers pass
 * `undefined` through to omit the key.
 */
export function toDotNetTimeSpan(duration?: Duration): string | undefined {
  if (duration === undefined) {
    return undefined;
  }
  const totalSeconds = duration.toSeconds();
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hhmmss = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return days > 0 ? `${days}.${hhmmss}` : hhmmss;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Create an `iam.Role` trusting the Proxylity ServiceRole (`sts:AssumeRole` from the
 * `Fn::FindInMap[ProxylityConfig, <region>, ServiceRole]` principal). This exactly reproduces the
 * `AssumeRolePolicyDocument` of the deployed example destination roles. The role's session duration
 * is NOT an IAM-role property here: it is carried on the wire via `Role.Duration` (see
 * {@link toDotNetTimeSpan}), so callers format `roleSessionDuration` into the destination/listener
 * entry rather than passing it to this factory.
 */
export function createServiceRole(
  scope: Construct,
  id: string,
  proxylityConfig: ProxylityConfig,
): iam.Role {
  return new iam.Role(scope, id, {
    assumedBy: new iam.ArnPrincipal(proxylityConfig.serviceRole()),
  });
}

/** The only CloudWatch namespace Proxylity publishes metrics to. */
export const PROXYLITY_METRICS_NAMESPACE = 'Proxylity/UDP Gateway';

/**
 * Add the `cloudwatch:PutMetricData` grant used when metrics are enabled. `PutMetricData` doesn't
 * support resource-level permissions, so the resource is `*` and the `cloudwatch:namespace`
 * condition limits the role to the Proxylity namespace.
 */
export function addMetricsGrant(role: iam.IRole): void {
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: { StringEquals: { 'cloudwatch:namespace': PROXYLITY_METRICS_NAMESPACE } },
    }),
  );
}

/**
 * Add the log-delivery grant used when a log group name is set: `logs:CreateLogStream` +
 * `logs:PutLogEvents` on that group's streams in this account. The region is a wildcard because
 * Proxylity writes listener logs from the region of the gateway that handles the traffic, and
 * destination logs from the destination ARN's region.
 */
export function addLogsGrant(role: iam.IRole, logGroupName: string): void {
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [
        `arn:${Aws.PARTITION}:logs:*:${Aws.ACCOUNT_ID}:log-group:${logGroupName}:*`,
      ],
    }),
  );
}
