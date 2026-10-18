import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { IListenerDestination, Listener, ListenerProtocol } from '../../src';

/**
 * Build a single-destination UDP {@link Listener} in a fresh stack and return its {@link Template}.
 * Shared by the per-destination IAM assertion tests.
 */
export function synthWithDestination(
  factory: (stack: Stack) => IListenerDestination,
): Template {
  const app = new App();
  const stack = new Stack(app, 'IamStack');
  new Listener(stack, 'Listener', {
    protocol: ListenerProtocol.udp(),
    clientRestrictions: { networks: ['0.0.0.0/0'] },
    destinations: [factory(stack)],
  });
  return Template.fromStack(stack);
}

/**
 * The `AssumeRolePolicyDocument` every derived L2 role must carry: trust the Proxylity ServiceRole
 * (`Fn::FindInMap[ProxylityConfig, <AWS::Region>, ServiceRole]`) with `sts:AssumeRole`.
 */
export const PROXYLITY_TRUST = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Action: 'sts:AssumeRole',
      Principal: {
        AWS: {
          'Fn::FindInMap': ['ProxylityConfig', { Ref: 'AWS::Region' }, 'ServiceRole'],
        },
      },
    },
  ],
};

/** Assert exactly one derived role exists with the Proxylity-ServiceRole trust policy. */
export function expectProxylityTrust(template: Template): void {
  template.hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: PROXYLITY_TRUST,
  });
}

/**
 * Assert the derived role's inline (default) policy grants EXACTLY the given statements — no more, no
 * fewer. `statements` must be the complete, ordered list of `{ Action, Resource }` the destination
 * attaches (the `addToPrincipalPolicy` default policy preserves attach order).
 */
export function expectPolicyStatements(
  template: Template,
  statements: Array<{ Action: unknown; Resource: unknown }>,
): void {
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Version: '2012-10-17',
      Statement: statements.map((s) => ({
        Effect: 'Allow',
        Action: s.Action,
        Resource: s.Resource,
      })),
    },
  });
}

/**
 * Assert the listener custom resource has a `DependsOn` edge to the destination's inline policy
 * (design §6.3 ordering invariant). The policy logical id is matched by prefix since CDK suffixes a
 * hash.
 */
export function expectListenerDependsOnPolicy(template: Template): void {
  const json = template.toJSON();
  const listenerId = Object.keys(json.Resources).find(
    (k) => json.Resources[k].Type === 'Custom::ProxylityUdpGatewayListener',
  )!;
  const policyId = Object.keys(json.Resources).find(
    (k) => json.Resources[k].Type === 'AWS::IAM::Policy',
  )!;
  const dependsOn = json.Resources[listenerId].DependsOn as string[] | undefined;
  expect(dependsOn).toBeDefined();
  expect(dependsOn).toContain(policyId);
}

export { Match };
