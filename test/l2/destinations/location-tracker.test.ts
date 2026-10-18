import { LocationTrackerDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const TRACKER_ARN = 'arn:aws:geo:us-east-1:111122223333:tracker/t';

describe('LocationTrackerDestination IAM', () => {
  test('grants geo:BatchUpdateDevicePosition on the tracker ARN', () => {
    const template = synthWithDestination(
      () =>
        new LocationTrackerDestination({
          trackerArn: TRACKER_ARN,
          deviceIdExpression: '[0:2]',
          latitudeExpression: '[2:4]',
          longitudeExpression: '[4:6]',
        }),
    );

    expectProxylityTrust(template);
    expectPolicyStatements(template, [
      { Action: 'geo:BatchUpdateDevicePosition', Resource: TRACKER_ARN },
    ]);
    expectListenerDependsOnPolicy(template);
  });
});
