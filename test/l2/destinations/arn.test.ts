import { ArnDestination } from '../../../src';
import { expectProxylityTrust, synthWithDestination } from '../iam-util';

describe('ArnDestination IAM', () => {
  test('auto-creates a role trusting the Proxylity ServiceRole with NO service grants', () => {
    const template = synthWithDestination(
      () => new ArnDestination({ arn: 'arn:aws:lambda:us-east-1:111122223333:function:opaque' }),
    );

    // Trust is present...
    expectProxylityTrust(template);
    // ...but there is no inline policy (actions cannot be inferred from an opaque ARN; the caller
    // attaches grants or brings their own role).
    template.resourceCountIs('AWS::IAM::Policy', 0);
  });

  test('listener still orders after the role even without a policy', () => {
    const template = synthWithDestination(
      () => new ArnDestination({ arn: 'arn:aws:lambda:us-east-1:111122223333:function:opaque' }),
    );
    const json = template.toJSON();
    const listenerId = Object.keys(json.Resources).find(
      (k) => json.Resources[k].Type === 'Custom::ProxylityUdpGatewayListener',
    )!;
    const roleId = Object.keys(json.Resources).find(
      (k) => json.Resources[k].Type === 'AWS::IAM::Role',
    )!;
    expect(json.Resources[listenerId].DependsOn).toContain(roleId);
  });
});
