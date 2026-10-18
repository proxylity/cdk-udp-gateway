import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Listener, ListenerProtocol, SnsPacketSource } from '../../src';
import { PROXYLITY_TRUST } from './iam-util';

const TOPIC_ARN = 'arn:aws:sns:us-east-1:111122223333:observe';

function synth(): { template: Template; json: any } {
  const app = new App();
  const stack = new Stack(app, 'S');
  const listener = new Listener(stack, 'Listener', {
    protocol: ListenerProtocol.udp(),
    clientRestrictions: { networks: ['0.0.0.0/0'] },
    destinations: [],
  });
  const topic = sns.Topic.fromTopicArn(stack, 'Topic', TOPIC_ARN);
  new SnsPacketSource(stack, 'PacketSource', { listener, topic });
  const template = Template.fromStack(stack);
  return { template, json: template.toJSON() };
}

describe('SnsPacketSource IAM', () => {
  test('derives a subscribe role trusting the Proxylity ServiceRole', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: PROXYLITY_TRUST,
    });
  });

  test('grants exactly sns:Subscribe + sns:Unsubscribe + sns:ListSubscriptionsByTopic on the topic', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['sns:Subscribe', 'sns:Unsubscribe', 'sns:ListSubscriptionsByTopic'],
            Resource: TOPIC_ARN,
          },
        ],
      },
    });
  });

  test('the packet source depends on the subscribe policy (coap-time-service DependsOn)', () => {
    const { json } = synth();
    const psId = Object.keys(json.Resources).find(
      (k) => json.Resources[k].Type === 'Custom::ProxylityUdpGatewayPacketSource',
    )!;
    const policyId = Object.keys(json.Resources).find(
      (k) => json.Resources[k].Type === 'AWS::IAM::Policy',
    )!;
    expect(json.Resources[psId].DependsOn).toContain(policyId);
  });

  test('emits no Enabled property', () => {
    const { json } = synth();
    const psId = Object.keys(json.Resources).find(
      (k) => json.Resources[k].Type === 'Custom::ProxylityUdpGatewayPacketSource',
    )!;
    expect(json.Resources[psId].Properties.Enabled).toBeUndefined();
  });
});
