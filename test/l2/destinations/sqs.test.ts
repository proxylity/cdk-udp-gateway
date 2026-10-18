import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Stack } from 'aws-cdk-lib';
import { SqsDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const QUEUE_ARN = 'arn:aws:sqs:us-east-1:111122223333:q';

function queue(stack: Stack): sqs.IQueue {
  return sqs.Queue.fromQueueArn(stack, 'Q', QUEUE_ARN);
}

describe('SqsDestination IAM', () => {
  test('grants the GetQueueUrl + SendMessage + SendMessageBatch superset on the queue ARN', () => {
    const template = synthWithDestination((s) => new SqsDestination({ queue: queue(s) }));

    expectProxylityTrust(template);
    expectPolicyStatements(template, [
      {
        Action: ['sqs:GetQueueUrl', 'sqs:SendMessage', 'sqs:SendMessageBatch'],
        Resource: QUEUE_ARN,
      },
    ]);
    expectListenerDependsOnPolicy(template);
  });
});
