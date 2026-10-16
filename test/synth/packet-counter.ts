import { CfnOutput, CfnParameter, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnListener, ProxylityConfig } from '../../src';

/**
 * Re-authors the `examples/packet-counter/packet-counter.template.json` listener (and the
 * ProxylityConfig mapping) with the L1 constructs. The sibling Lambda/IAM resources from the
 * example are represented structurally with the same wire inputs (role ARN via Fn::GetAtt, lambda
 * ARN via Fn::GetAtt) using raw tokens so the golden diff can focus on the Proxylity listener wire
 * bag without pulling in aws-lambda/aws-iam synthesis noise.
 */
export class PacketCounterStack extends Stack {
  public readonly listener: CfnListener;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const clientCidr = new CfnParameter(this, 'ClientCidrToAllow', {
      description:
        'The CIDR describine which IP addresses should be allowed to use the listener. Default is open/everyone.',
      type: 'String',
      default: '0.0.0.0/0',
    });

    const config = ProxylityConfig.forStack(this);

    // Stand-ins for the example's PacketCounterLambda and DestinationRole. Using Fn::GetAtt tokens
    // against fixed logical names keeps the emitted listener wire shape identical to the example's
    // intent (Role.Arn and DestinationArn are both Fn::GetAtt ARNs) without synthesizing the
    // Serverless function / IAM role, which is out of scope for the L1 wire-shape golden check.
    const lambdaArn = Fn.getAtt('PacketCounterLambda', 'Arn').toString();
    const roleArn = Fn.getAtt('DestinationRole', 'Arn').toString();

    this.listener = new CfnListener(this, 'UdpListener', {
      serviceToken: config.serviceToken(),
      apiKey: config.apiKey(),
      protocols: ['udp'],
      clientRestrictions: {
        networks: [clientCidr.valueAsString],
      },
      destinations: [
        {
          description:
            'Delivers to the packet counter lambda, which returns a single response to each distinct client IP address.',
          role: { arn: roleArn },
          batching: { count: 1000, timeoutInSeconds: 1 },
          metricsEnabled: true,
          destinationArn: lambdaArn,
        },
      ],
    });

    new CfnOutput(this, 'Domain', {
      value: Fn.sub('${Domain}.proxylity.com', { Domain: this.listener.attrDomain }),
    });
    new CfnOutput(this, 'Port', { value: this.listener.attrPort });
    new CfnOutput(this, 'Endpoint', {
      value: Fn.sub('${Domain}.proxylity.com:${Port}', {
        Domain: this.listener.attrDomain,
        Port: this.listener.attrPort,
      }),
    });
  }
}
