import * as events from 'aws-cdk-lib/aws-events';
import { Stack } from 'aws-cdk-lib';
import { EventBridgeDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const BUS_ARN = 'arn:aws:events:us-east-1:111122223333:event-bus/b';

function bus(stack: Stack): events.IEventBus {
  return events.EventBus.fromEventBusArn(stack, 'B', BUS_ARN);
}

describe('EventBridgeDestination IAM', () => {
  test('grants events:PutEvents on the event bus ARN', () => {
    const template = synthWithDestination(
      (s) => new EventBridgeDestination({ eventBus: bus(s) }),
    );

    expectProxylityTrust(template);
    expectPolicyStatements(template, [{ Action: 'events:PutEvents', Resource: BUS_ARN }]);
    expectListenerDependsOnPolicy(template);
  });
});
