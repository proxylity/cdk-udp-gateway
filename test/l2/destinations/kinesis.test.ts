import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import { Stack } from 'aws-cdk-lib';
import { KinesisStreamDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const STREAM_ARN = 'arn:aws:kinesis:us-east-1:111122223333:stream/s';

function stream(stack: Stack): kinesis.IStream {
  return kinesis.Stream.fromStreamArn(stack, 'K', STREAM_ARN);
}

describe('KinesisStreamDestination IAM', () => {
  test('grants kinesis:PutRecords on the stream ARN', () => {
    const template = synthWithDestination(
      (s) => new KinesisStreamDestination({ stream: stream(s) }),
    );

    expectProxylityTrust(template);
    expectPolicyStatements(template, [{ Action: 'kinesis:PutRecords', Resource: STREAM_ARN }]);
    expectListenerDependsOnPolicy(template);
  });
});
