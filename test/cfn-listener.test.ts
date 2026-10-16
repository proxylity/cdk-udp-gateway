import { App, Fn, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CfnListener } from '../src';

function synth(fn: (stack: Stack) => void): Template {
  const stack = new Stack(new App(), 'Stack');
  fn(stack);
  return Template.fromStack(stack);
}

describe('CfnListener', () => {
  test('emits Custom::ProxylityUdpGatewayListener with core PascalCase props', () => {
    const template = synth((stack) => {
      new CfnListener(stack, 'L', {
        serviceToken: 'token',
        apiKey: 'key',
        protocols: ['udp'],
        clientRestrictions: { networks: ['10.0.0.0/8'] },
      });
    });

    template.hasResourceProperties('Custom::ProxylityUdpGatewayListener', {
      ServiceToken: 'token',
      ApiKey: 'key',
      Protocols: ['udp'],
      ClientRestrictions: { Networks: ['10.0.0.0/8'] },
    });
  });

  test('inline destination maps Role.Arn, Batching, MetricsEnabled and string DestinationArn', () => {
    const template = synth((stack) => {
      new CfnListener(stack, 'L', {
        serviceToken: 'token',
        apiKey: 'key',
        protocols: ['udp'],
        destinations: [
          {
            description: 'd',
            role: { arn: 'arn:aws:iam::111122223333:role/r', duration: '0:30:00' },
            batching: { count: 1000, timeoutInSeconds: 1, sizeInMB: 2 },
            metricsEnabled: true,
            destinationArn: 'arn:aws:lambda:us-east-1:111122223333:function:f',
          },
        ],
      });
    });

    template.hasResourceProperties('Custom::ProxylityUdpGatewayListener', {
      Destinations: [
        {
          Description: 'd',
          Role: { Arn: 'arn:aws:iam::111122223333:role/r', Duration: '0:30:00' },
          Batching: { Count: 1000, TimeoutInSeconds: 1, SizeInMB: 2 },
          MetricsEnabled: true,
          DestinationArn: 'arn:aws:lambda:us-east-1:111122223333:function:f',
        },
      ],
    });
  });

  test('destinationArnMap serializes to { "*": default, "<region>": arn }', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnListener(stack, 'L', {
      serviceToken: 'token',
      apiKey: 'key',
      protocols: ['udp'],
      destinations: [
        {
          name: 'd',
          destinationArnMap: {
            default: 'arn:aws:lambda:us-east-1:111122223333:function:f',
            byRegion: { 'eu-west-1': 'arn:aws:lambda:eu-west-1:111122223333:function:f' },
          },
        },
      ],
    });
    const props = Template.fromStack(stack).toJSON().Resources;
    const listener = Object.values(props).find(
      (r: any) => r.Type === 'Custom::ProxylityUdpGatewayListener',
    ) as any;
    expect(listener.Properties.Destinations[0].DestinationArn).toEqual({
      '*': 'arn:aws:lambda:us-east-1:111122223333:function:f',
      'eu-west-1': 'arn:aws:lambda:eu-west-1:111122223333:function:f',
    });
  });

  test('inline destination with neither arn form emits an empty object {}', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnListener(stack, 'L', {
      serviceToken: 'token',
      apiKey: 'key',
      protocols: ['udp'],
      destinations: [{ name: 'd' }],
    });
    const listener = Object.values(Template.fromStack(stack).toJSON().Resources).find(
      (r: any) => r.Type === 'Custom::ProxylityUdpGatewayListener',
    ) as any;
    expect(listener.Properties.Destinations[0].DestinationArn).toEqual({});
  });

  test('setting both destinationArn and destinationArnMap throws at synth', () => {
    const stack = new Stack(new App(), 'Stack');
    expect(() => {
      new CfnListener(stack, 'L', {
        serviceToken: 'token',
        apiKey: 'key',
        protocols: ['udp'],
        destinations: [
          {
            name: 'bad',
            destinationArn: 'arn:aws:lambda:us-east-1:111122223333:function:f',
            destinationArnMap: { default: 'arn:aws:lambda:us-east-1:111122223333:function:g' },
          },
        ],
      });
    }).toThrow(/mutually exclusive/);
  });

  test('string destination entry passes through as a name reference', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnListener(stack, 'L', {
      serviceToken: 'token',
      apiKey: 'key',
      protocols: ['udp'],
      destinations: ['existing-destination-name'],
    });
    const listener = Object.values(Template.fromStack(stack).toJSON().Resources).find(
      (r: any) => r.Type === 'Custom::ProxylityUdpGatewayListener',
    ) as any;
    expect(listener.Properties.Destinations).toEqual(['existing-destination-name']);
  });

  test('WireGuard peers and flags map to PascalCase wire keys', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnListener(stack, 'L', {
      serviceToken: 'token',
      apiKey: 'key',
      protocols: ['wg'],
      decapsulatedDelivery: true,
      allowUnknownPeers: false,
      peers: [{ publicKey: 'pk', sharedSecret: 'ss', allowedIPs: ['0.0.0.0/0'] }],
    });
    const listener = Object.values(Template.fromStack(stack).toJSON().Resources).find(
      (r: any) => r.Type === 'Custom::ProxylityUdpGatewayListener',
    ) as any;
    expect(listener.Properties.DecapsulatedDelivery).toBe(true);
    expect(listener.Properties.AllowUnknownPeers).toBe(false);
    expect(listener.Properties.Peers).toEqual([
      { PublicKey: 'pk', SharedSecret: 'ss', AllowedIPs: ['0.0.0.0/0'] },
    ]);
  });

  test('DestinationArguments map to PascalCase keys under Arguments', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnListener(stack, 'L', {
      serviceToken: 'token',
      apiKey: 'key',
      protocols: ['udp'],
      destinations: [
        {
          name: 'd',
          destinationArn: 'arn:aws:sqs:us-east-1:111122223333:q.fifo',
          arguments: {
            sendRaw: true,
            messageGroupIdExpression: '$.id',
            useAsyncInvoke: false,
          },
        },
      ],
    });
    const listener = Object.values(Template.fromStack(stack).toJSON().Resources).find(
      (r: any) => r.Type === 'Custom::ProxylityUdpGatewayListener',
    ) as any;
    expect(listener.Properties.Destinations[0].Arguments).toEqual({
      SendRaw: true,
      MessageGroupIdExpression: '$.id',
      UseAsyncInvoke: false,
    });
  });

  test('undefined optional props are not emitted', () => {
    const stack = new Stack(new App(), 'Stack');
    new CfnListener(stack, 'L', {
      serviceToken: 'token',
      apiKey: 'key',
      protocols: ['udp'],
    });
    const listener = Object.values(Template.fromStack(stack).toJSON().Resources).find(
      (r: any) => r.Type === 'Custom::ProxylityUdpGatewayListener',
    ) as any;
    expect(listener.Properties).not.toHaveProperty('Name');
    expect(listener.Properties).not.toHaveProperty('Destinations');
    expect(listener.Properties).not.toHaveProperty('Role');
    expect(listener.Properties).not.toHaveProperty('ServerSecret');
  });

  test('attr getters produce the exact Fn::GetAtt tuples', () => {
    const stack = new Stack(new App(), 'Stack');
    const listener = new CfnListener(stack, 'L', {
      serviceToken: 'token',
      apiKey: 'key',
      protocols: ['udp'],
    });
    const logicalId = stack.resolve((listener.resource as any).logicalId);

    expect(stack.resolve(listener.attrId)).toEqual({ 'Fn::GetAtt': [logicalId, 'Id'] });
    expect(stack.resolve(listener.attrPort)).toEqual({ 'Fn::GetAtt': [logicalId, 'Port'] });
    expect(stack.resolve(listener.attrDomain)).toEqual({ 'Fn::GetAtt': [logicalId, 'Domain'] });
    expect(stack.resolve(Fn.select(0, listener.attrDestinationNames))).toEqual({
      'Fn::Select': [0, { 'Fn::GetAtt': [logicalId, 'DestinationNames'] }],
    });
    expect(stack.resolve(listener.attrWireGuardPublicKey)).toEqual({
      'Fn::GetAtt': [logicalId, 'WireGuardPublicKey'],
    });
    expect(stack.resolve(listener.attrWebRtcSignalingUrl)).toEqual({
      'Fn::GetAtt': [logicalId, 'WebRtcSignalingUrl'],
    });
  });
});
