import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CfnDestinationArn } from '../src';

describe('CfnDestinationArn', () => {
  test('emits Custom::ProxylityUdpGatewayDestinationArn with all required props', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnDestinationArn(stack, 'DA', {
      serviceToken: 'token',
      apiKey: 'key',
      destination: 'my-destination',
      ingressRegionKey: 'us-east-1',
      arn: 'arn:aws:lambda:us-east-1:111122223333:function:f',
    });

    Template.fromStack(stack).hasResourceProperties('Custom::ProxylityUdpGatewayDestinationArn', {
      ServiceToken: 'token',
      ApiKey: 'key',
      Destination: 'my-destination',
      IngressRegionKey: 'us-east-1',
      Arn: 'arn:aws:lambda:us-east-1:111122223333:function:f',
    });
  });

  test('attr getters produce the exact Fn::GetAtt tuples', () => {
    const stack = new Stack(new App(), 'Stack');
    const da = new CfnDestinationArn(stack, 'DA', {
      serviceToken: 'token',
      apiKey: 'key',
      destination: 'd',
      ingressRegionKey: '*',
      arn: 'arn:aws:lambda:us-east-1:111122223333:function:f',
    });
    const logicalId = stack.resolve((da.resource as any).logicalId);

    expect(stack.resolve(da.attrDestination)).toEqual({ 'Fn::GetAtt': [logicalId, 'Destination'] });
    expect(stack.resolve(da.attrIngressRegionKey)).toEqual({
      'Fn::GetAtt': [logicalId, 'IngressRegionKey'],
    });
    expect(stack.resolve(da.attrArn)).toEqual({ 'Fn::GetAtt': [logicalId, 'Arn'] });
  });
});
