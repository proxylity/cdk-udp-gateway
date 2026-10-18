// Internal L2 IAM helpers. NOT exported from the package public API. They build the derived roles
// L2 destinations and listeners assume at runtime, reproducing the trust and grants the deployed
// example roles use.

import { Duration } from 'aws-cdk-lib';
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

/** Add the `cloudwatch:PutMetricData` grant (on `*`) used when metrics are enabled. */
export function addMetricsGrant(role: iam.IRole): void {
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }),
  );
}

/**
 * Add the log-delivery grant used when a log group name is set: `logs:CreateLogStream` +
 * `logs:PutLogEvents`, scoped to `logGroupArn + ':*'` when a concrete ARN is available, else `*`.
 */
export function addLogsGrant(role: iam.IRole, logGroupArn?: string): void {
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [logGroupArn !== undefined ? `${logGroupArn}:*` : '*'],
    }),
  );
}
