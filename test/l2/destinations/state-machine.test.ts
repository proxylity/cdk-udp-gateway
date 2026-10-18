import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { Stack } from 'aws-cdk-lib';
import { StateMachineDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const SM_ARN = 'arn:aws:states:us-east-1:111122223333:stateMachine:m';

function sm(stack: Stack): stepfunctions.IStateMachine {
  return stepfunctions.StateMachine.fromStateMachineArn(stack, 'M', SM_ARN);
}

describe('StateMachineDestination IAM', () => {
  test('EXPRESS: grants DescribeStateMachine + StartSyncExecution', () => {
    const template = synthWithDestination(
      (s) =>
        new StateMachineDestination({
          stateMachine: sm(s),
          stateMachineType: stepfunctions.StateMachineType.EXPRESS,
        }),
    );

    expectProxylityTrust(template);
    expectPolicyStatements(template, [
      {
        Action: ['states:DescribeStateMachine', 'states:StartSyncExecution'],
        Resource: SM_ARN,
      },
    ]);
    expectListenerDependsOnPolicy(template);
  });

  test('STANDARD: grants DescribeStateMachine + StartExecution', () => {
    const template = synthWithDestination(
      (s) =>
        new StateMachineDestination({
          stateMachine: sm(s),
          stateMachineType: stepfunctions.StateMachineType.STANDARD,
        }),
    );

    expectPolicyStatements(template, [
      {
        Action: ['states:DescribeStateMachine', 'states:StartExecution'],
        Resource: SM_ARN,
      },
    ]);
  });

  test('imported machine with unknown type: grants the superset (both execution actions)', () => {
    const template = synthWithDestination(
      (s) => new StateMachineDestination({ stateMachine: sm(s) }),
    );

    expectPolicyStatements(template, [
      {
        Action: [
          'states:DescribeStateMachine',
          'states:StartSyncExecution',
          'states:StartExecution',
        ],
        Resource: SM_ARN,
      },
    ]);
  });
});
