import { IotDataDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const TOPIC_ARN = 'arn:aws:iot:us-east-1:111122223333:topic/devices/telemetry';

describe('IotDataDestination IAM', () => {
  test('grants iot:Publish on the supplied topic ARN', () => {
    const template = synthWithDestination(
      () => new IotDataDestination({ topicArn: TOPIC_ARN }),
    );

    expectProxylityTrust(template);
    expectPolicyStatements(template, [{ Action: 'iot:Publish', Resource: TOPIC_ARN }]);
    expectListenerDependsOnPolicy(template);
  });
});
