import { App, Fn, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ProxylityConfig } from '../src';

describe('ProxylityConfig', () => {
  test('emits the Mappings.ProxylityConfig AWS::Include transform exactly once', () => {
    const app = new App();
    const stack = new Stack(app, 'Stack');

    // Call forStack twice; the mapping must be emitted exactly once (singleton).
    ProxylityConfig.forStack(stack);
    ProxylityConfig.forStack(stack);

    const template = Template.fromStack(stack);
    const json = template.toJSON();

    expect(json.Mappings).toEqual({
      ProxylityConfig: {
        'Fn::Transform': {
          Name: 'AWS::Include',
          Parameters: {
            Location: {
              'Fn::Sub': 's3://proxylity-config-${AWS::Region}/${AWS::AccountId}/customer-config.json',
            },
          },
        },
      },
    });
  });

  test('forStack is idempotent and returns the same instance', () => {
    const stack = new Stack(new App(), 'Stack');
    const a = ProxylityConfig.forStack(stack);
    const b = ProxylityConfig.forStack(stack);
    expect(a).toBe(b);
  });

  test('serviceToken resolves Fn::FindInMap with AWS::Region by default', () => {
    const stack = new Stack(new App(), 'Stack');
    const config = ProxylityConfig.forStack(stack);
    const resolved = stack.resolve(config.serviceToken());
    expect(resolved).toEqual({
      'Fn::FindInMap': ['ProxylityConfig', { Ref: 'AWS::Region' }, 'ServiceToken'],
    });
  });

  test('serviceRole resolves Fn::FindInMap with AWS::Region by default', () => {
    const stack = new Stack(new App(), 'Stack');
    const config = ProxylityConfig.forStack(stack);
    const resolved = stack.resolve(config.serviceRole());
    expect(resolved).toEqual({
      'Fn::FindInMap': ['ProxylityConfig', { Ref: 'AWS::Region' }, 'ServiceRole'],
    });
  });

  test('apiKey resolves Fn::FindInMap with the literal Account key', () => {
    const stack = new Stack(new App(), 'Stack');
    const config = ProxylityConfig.forStack(stack);
    const resolved = stack.resolve(config.apiKey());
    expect(resolved).toEqual({
      'Fn::FindInMap': ['ProxylityConfig', 'Account', 'ApiKey'],
    });
  });

  test('serviceToken honors an explicit region', () => {
    const stack = new Stack(new App(), 'Stack');
    const config = ProxylityConfig.forStack(stack);
    const resolved = stack.resolve(config.serviceToken('eu-west-1'));
    expect(resolved).toEqual({
      'Fn::FindInMap': ['ProxylityConfig', 'eu-west-1', 'ServiceToken'],
    });
  });

  test('two stacks each get their own mapping', () => {
    const app = new App();
    const stackA = new Stack(app, 'StackA');
    const stackB = new Stack(app, 'StackB');
    ProxylityConfig.forStack(stackA);
    ProxylityConfig.forStack(stackB);

    const hasTransform = (s: Stack) => {
      const m = Template.fromStack(s).toJSON().Mappings?.ProxylityConfig;
      return m && m['Fn::Transform']?.Name === 'AWS::Include';
    };
    expect(hasTransform(stackA)).toBe(true);
    expect(hasTransform(stackB)).toBe(true);
  });

  test('Fn.sub location is unresolved tokens-free literal string', () => {
    // Guards against accidental double-substitution of the location.
    const stack = new Stack(new App(), 'Stack');
    ProxylityConfig.forStack(stack);
    const loc = Template.fromStack(stack).toJSON().Mappings.ProxylityConfig['Fn::Transform'].Parameters
      .Location['Fn::Sub'];
    expect(loc).toBe('s3://proxylity-config-${AWS::Region}/${AWS::AccountId}/customer-config.json');
    // Fn is imported to keep the intent explicit even though not directly asserted here.
    expect(typeof Fn.sub).toBe('function');
  });
});
