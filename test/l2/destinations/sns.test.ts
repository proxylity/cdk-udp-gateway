import * as sns from 'aws-cdk-lib/aws-sns';
import { Stack } from 'aws-cdk-lib';
import { SnsDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const TOPIC_ARN = 'arn:aws:sns:us-east-1:111122223333:t';

function topic(stack: Stack): sns.ITopic {
  return sns.Topic.fromTopicArn(stack, 'T', TOPIC_ARN);
}

describe('SnsDestination IAM', () => {
  test('grants sns:PublishBatch ONLY (not sns:Publish) on the topic ARN', () => {
    const template = synthWithDestination((s) => new SnsDestination({ topic: topic(s) }));

    expectProxylityTrust(template);
    expectPolicyStatements(template, [{ Action: 'sns:PublishBatch', Resource: TOPIC_ARN }]);
    expectListenerDependsOnPolicy(template);
  });
});
