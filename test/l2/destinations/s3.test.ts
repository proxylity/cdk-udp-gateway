import * as s3 from 'aws-cdk-lib/aws-s3';
import { Stack } from 'aws-cdk-lib';
import { S3Destination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const BUCKET_ARN = 'arn:aws:s3:::my-bucket';

function bucket(stack: Stack): s3.IBucket {
  return s3.Bucket.fromBucketArn(stack, 'B', BUCKET_ARN);
}

describe('S3Destination IAM', () => {
  test('grants s3:PutObject scoped to bucketArn/<keyPrefix>* (partition from bucketArn, not hardcoded)', () => {
    const template = synthWithDestination(
      (s) => new S3Destination({ bucket: bucket(s), keyPrefix: 'logs/' }),
    );

    expectProxylityTrust(template);
    expectPolicyStatements(template, [
      { Action: 's3:PutObject', Resource: `${BUCKET_ARN}/logs/*` },
    ]);
    expectListenerDependsOnPolicy(template);
  });

  test('defaults the key prefix to empty (bucketArn/*)', () => {
    const template = synthWithDestination((s) => new S3Destination({ bucket: bucket(s) }));
    expectPolicyStatements(template, [{ Action: 's3:PutObject', Resource: `${BUCKET_ARN}/*` }]);
  });
});
