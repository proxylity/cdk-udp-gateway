import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Stack } from 'aws-cdk-lib';
import { LambdaDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const FN_ARN = 'arn:aws:lambda:us-east-1:111122223333:function:f';

function fn(stack: Stack): lambda.IFunction {
  return lambda.Function.fromFunctionArn(stack, 'Fn', FN_ARN);
}

describe('LambdaDestination IAM', () => {
  test('derives a Proxylity-ServiceRole role granting lambda:InvokeFunction on the function ARN + :*', () => {
    const template = synthWithDestination((s) => new LambdaDestination({ fn: fn(s) }));

    expectProxylityTrust(template);
    expectPolicyStatements(template, [
      { Action: 'lambda:InvokeFunction', Resource: [FN_ARN, `${FN_ARN}:*`] },
    ]);
    expectListenerDependsOnPolicy(template);
  });

  test('adds lambda:InvokeAsync only when useAsyncInvoke is set', () => {
    const template = synthWithDestination(
      (s) => new LambdaDestination({ fn: fn(s), useAsyncInvoke: true }),
    );

    expectPolicyStatements(template, [
      {
        Action: ['lambda:InvokeFunction', 'lambda:InvokeAsync'],
        Resource: [FN_ARN, `${FN_ARN}:*`],
      },
    ]);
  });

  test('adds the metrics grant when destination metricsEnabled is set', () => {
    const template = synthWithDestination(
      (s) => new LambdaDestination({ fn: fn(s), metricsEnabled: true }),
    );

    expectPolicyStatements(template, [
      { Action: 'lambda:InvokeFunction', Resource: [FN_ARN, `${FN_ARN}:*`] },
      { Action: 'cloudwatch:PutMetricData', Resource: '*' },
    ]);
  });
});
