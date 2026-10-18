import { ApiGatewayDestination } from '../../../src';
import {
  expectListenerDependsOnPolicy,
  expectPolicyStatements,
  expectProxylityTrust,
  synthWithDestination,
} from '../iam-util';

const EXECUTE_API_ARN = 'arn:aws:execute-api:us-east-1:111122223333:abc123/prod/POST/ingest';

describe('ApiGatewayDestination IAM', () => {
  test('grants execute-api:Invoke on the supplied execute-api ARN', () => {
    const template = synthWithDestination(
      () => new ApiGatewayDestination({ executeApiArn: EXECUTE_API_ARN }),
    );

    expectProxylityTrust(template);
    expectPolicyStatements(template, [
      { Action: 'execute-api:Invoke', Resource: EXECUTE_API_ARN },
    ]);
    expectListenerDependsOnPolicy(template);
  });
});
