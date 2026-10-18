import { Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import {
  LambdaDestination,
  Listener,
  ListenerProtocol,
  WebRtcSignalingMode,
} from '../../src';

/**
 * L2 re-authoring of `examples/webrtc`: a WebRTC listener with public signaling and required
 * cookies, delivering to an echo Lambda with destination metrics enabled.
 */
export class L2WebRtcStack extends Stack {
  public readonly listener: Listener;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const fn = lambda.Function.fromFunctionArn(
      this,
      'EchoLambda',
      'arn:aws:lambda:us-east-1:111122223333:function:webrtc-echo',
    );

    this.listener = new Listener(this, 'WebRtcListener', {
      protocol: ListenerProtocol.webRtc({
        signalingMode: WebRtcSignalingMode.PUBLIC,
        requireCookies: true,
      }),
      clientRestrictions: { networks: ['0.0.0.0/0'] },
      destinations: [
        new LambdaDestination({
          fn,
          description: 'Echo each binary data-channel message to its originating session.',
          batching: { count: 1, timeoutInSeconds: 0.1 },
          metricsEnabled: true,
        }),
      ],
    });
  }
}
