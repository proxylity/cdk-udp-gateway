import { FirehoseDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const STREAM_ARN = 'arn:aws:firehose:us-east-1:111122223333:deliverystream/d';

describe('FirehoseDestination IAM', () => {
  test('grants firehose:PutRecord + firehose:PutRecordBatch on the stream ARN', () => {
    const template = synthWithDestination(
      () => new FirehoseDestination({ deliveryStreamArn: STREAM_ARN }),
    );

    expectProxylityTrust(template);
    expectPolicyStatements(template, [
      { Action: ['firehose:PutRecord', 'firehose:PutRecordBatch'], Resource: STREAM_ARN },
    ]);
    expectListenerDependsOnPolicy(template);
  });
});
