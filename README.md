# @proxylity/cdk-udp-gateway

L1 (CloudFormation-faithful) AWS CDK construct library for the [Proxylity UDP Gateway](https://proxylity.com)
custom resources. Build event-driven UDP/WireGuard/DTLS/WebRTC datagram services on AWS without
operating listener servers.

This is the **L1** layer: thin, un-opinionated, 1:1 wrappers of the Proxylity UDP Gateway
CloudFormation custom resources. Each construct emits exactly one `Custom::ProxylityUdpGateway*`
resource with the property keys the control plane reads, in the PascalCase shape it expects on the
wire. L1 adds no derived IAM, no invented enums, and no defaults beyond what the resource itself
applies. Where the hand-written example templates or docs diverge from the control-plane
implementation, the implementation is authoritative; divergences are tracked in
`.agents/tasks/cdk-udp-gateway-l1/DIVERGENCES.md`.

> You must be subscribed to Proxylity UDP Gateway in AWS Marketplace to deploy stacks that use these
> constructs.

## Install

| Language   | Package |
|------------|---------|
| TypeScript / JavaScript | `npm install @proxylity/cdk-udp-gateway` |
| Python     | `pip install proxylity-cdk-udp-gateway` (module `proxylity_cdk_udp_gateway`) |
| .NET       | `dotnet add package Proxylity.CDK.UdpGateway` |
| Java       | Maven `com.proxylity:cdk-udp-gateway` (package `com.proxylity.cdk.udpgateway`) |
| Go         | `go get github.com/proxylity/cdk-udp-gateway` |

Peer dependencies: `aws-cdk-lib@^2.160.0` and `constructs@^10.0.0`.

## Resources

| Construct           | CloudFormation type                           | Notes |
|---------------------|-----------------------------------------------|-------|
| `CfnListener`       | `Custom::ProxylityUdpGatewayListener`         | The main resource. Inline destinations live in `destinations`. |
| `CfnDestinationArn` | `Custom::ProxylityUdpGatewayDestinationArn`   | Registers one ARN for one destination in one ingress region. |
| `CfnPacketSource`   | `Custom::ProxylityUdpGatewayPacketSource`     | Subscribes a listener to an SNS topic for server-initiated push. |
| `ProxylityConfig`   | (helper, not a resource)                      | Injects the account/region config mapping and resolves `ServiceToken`/`ServiceRole`/`ApiKey`. |

> `Custom::ProxylityUdpGatewayDestination` is **reserved / not shipped**: the control-plane handler
> currently throws `NotImplementedException` (DIVERGENCES D-05). Create destinations inline via
> `CfnListener.destinations`.

## Usage

Every Proxylity stack begins by materializing the account/region configuration mapping with
`ProxylityConfig`, then uses its accessors to resolve the `ServiceToken` and `ApiKey` for each
resource. `ProxylityConfig.forStack` is idempotent — the `Mappings.ProxylityConfig` block is emitted
exactly once per stack.

The example below reproduces the `packet-counter` example stack: a `udp` listener restricted to a
caller-supplied CIDR, with one inline Lambda destination.

```ts
import { App, CfnParameter, CfnOutput, Fn, Stack, StackProps } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ProxylityConfig, CfnListener } from '@proxylity/cdk-udp-gateway';

class PacketCounterStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const clientCidr = new CfnParameter(this, 'ClientCidrToAllow', {
      type: 'String',
      default: '0.0.0.0/0',
    });

    const config = ProxylityConfig.forStack(this);

    const fn = new lambda.Function(this, 'PacketCounterLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async (e) => ({ Replies: [] });'),
    });

    // The destination role trusts the Proxylity ServiceRole (not lambda.amazonaws.com).
    const role = new iam.Role(this, 'DestinationRole', {
      assumedBy: new iam.ArnPrincipal(config.serviceRole()),
    });
    fn.grantInvoke(role);

    const listener = new CfnListener(this, 'UdpListener', {
      serviceToken: config.serviceToken(),
      apiKey: config.apiKey(),
      protocols: ['udp'],
      clientRestrictions: { networks: [clientCidr.valueAsString] },
      destinations: [
        {
          description: 'Delivers to the packet counter lambda.',
          role: { arn: role.roleArn },
          batching: { count: 1000, timeoutInSeconds: 1 },
          metricsEnabled: true,
          destinationArn: fn.functionArn,
        },
      ],
    });

    new CfnOutput(this, 'Endpoint', {
      value: Fn.sub('${Domain}.proxylity.com:${Port}', {
        Domain: listener.attrDomain,
        Port: listener.attrPort,
      }),
    });
  }
}

const app = new App();
new PacketCounterStack(app, 'PacketCounter');
```

### Outputs

`CfnListener` exposes listener outputs as `Fn::GetAtt` tokens: `attrId`, `attrPort`, `attrDomain`,
and the string-list `attrDestinationNames`, plus protocol-specific getters
(`attrWireGuardPublicKey`; `attrDtlsServerCertificate`; `attrWebRtcFingerprint`, `attrWebRtcSctpPort`,
`attrWebRtcChannelId`, `attrWebRtcSignalingMode`, `attrWebRtcSignalingToken`, `attrWebRtcSignalingUrl`).
Numeric values (`attrPort`, `attrWebRtcSctpPort`, `attrWebRtcChannelId`) are returned as string
tokens; wrap with `Token.asNumber(...)` if you need a number.

### Protocols

`protocols` must contain exactly one of `udp`, `wg`, `dtls`, or `webrtc`. Protocol-specific
properties are optional members on `CfnListenerProps`; the control plane rejects invalid
cross-protocol combinations. See the JSDoc on each property for the normative control-plane behavior
and the relevant DIVERGENCES note.

## Fidelity

L1 is faithful to the control plane: if the resource accepts an input, L1 emits it; if the resource
rejects it, the stack event explains why. L1 performs only one client-side check — an inline
destination may not set both `destinationArn` and `destinationArnMap` (both map to the single
`DestinationArn` wire key). Everything else (CIDR/ARN/base64 formats, name regex, enum membership,
numeric ranges, cross-field requirements) is left to the resource. Known schema/docs-vs-implementation
divergences are catalogued in `.agents/tasks/cdk-udp-gateway-l1/DIVERGENCES.md` (D-01 … D-13).
