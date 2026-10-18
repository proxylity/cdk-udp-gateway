import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Stack } from 'aws-cdk-lib';
import { DynamoDbDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const TABLE_ARN = 'arn:aws:dynamodb:us-east-1:111122223333:table/t';

function table(stack: Stack): dynamodb.ITable {
  return dynamodb.Table.fromTableArn(stack, 'T', TABLE_ARN);
}

describe('DynamoDbDestination IAM', () => {
  test('grants dynamodb:DescribeTable + dynamodb:BatchWriteItem on the table ARN', () => {
    const template = synthWithDestination((s) => new DynamoDbDestination({ table: table(s) }));

    expectProxylityTrust(template);
    expectPolicyStatements(template, [
      {
        Action: ['dynamodb:DescribeTable', 'dynamodb:BatchWriteItem'],
        Resource: TABLE_ARN,
      },
    ]);
    expectListenerDependsOnPolicy(template);
  });
});
