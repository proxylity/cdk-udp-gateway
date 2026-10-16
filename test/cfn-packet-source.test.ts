import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CfnPacketSource } from '../src';

describe('CfnPacketSource', () => {
  test('emits Custom::ProxylityUdpGatewayPacketSource with SnsTopicSource {TopicArn, Role}', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnPacketSource(stack, 'PS', {
      serviceToken: 'token',
      apiKey: 'key',
      listenerName: 'my-listener',
      snsTopicSource: {
        topicArn: 'arn:aws:sns:us-east-1:111122223333:topic',
        role: 'arn:aws:iam::111122223333:role/r',
      },
      description: 'desc',
    });

    Template.fromStack(stack).hasResourceProperties('Custom::ProxylityUdpGatewayPacketSource', {
      ServiceToken: 'token',
      ApiKey: 'key',
      ListenerName: 'my-listener',
      SnsTopicSource: {
        // Role is a bare string ARN, NOT a { Arn } object (D-08).
        TopicArn: 'arn:aws:sns:us-east-1:111122223333:topic',
        Role: 'arn:aws:iam::111122223333:role/r',
      },
      Description: 'desc',
    });
  });

  test('Role in SnsTopicSource is a bare string, not a { Arn } object', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnPacketSource(stack, 'PS', {
      serviceToken: 'token',
      apiKey: 'key',
      listenerName: 'l',
      snsTopicSource: {
        topicArn: 'arn:aws:sns:us-east-1:111122223333:topic',
        role: 'arn:aws:iam::111122223333:role/r',
      },
    });
    const ps = Object.values(Template.fromStack(stack).toJSON().Resources).find(
      (r: any) => r.Type === 'Custom::ProxylityUdpGatewayPacketSource',
    ) as any;
    expect(typeof ps.Properties.SnsTopicSource.Role).toBe('string');
  });

  test('optional props are omitted when not set', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnPacketSource(stack, 'PS', {
      serviceToken: 'token',
      apiKey: 'key',
      listenerName: 'l',
      snsTopicSource: {
        topicArn: 'arn:aws:sns:us-east-1:111122223333:topic',
        role: 'arn:aws:iam::111122223333:role/r',
      },
    });
    const ps = Object.values(Template.fromStack(stack).toJSON().Resources).find(
      (r: any) => r.Type === 'Custom::ProxylityUdpGatewayPacketSource',
    ) as any;
    expect(ps.Properties).not.toHaveProperty('Description');
  });
});
