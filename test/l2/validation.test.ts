import { App, Stack } from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import {
  ArnDestination,
  IListenerDestination,
  LambdaDestination,
  Listener,
  ListenerProtocol,
  LocationTrackerDestination,
  SqsDestination,
} from '../../src';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { LocationTimeUnit } from '../../src';

const VALID_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * Build a UDP listener with a single destination so a destination's synth-time validation (thrown in
 * `bind()` during the `Listener` constructor) fires. `factory` receives the stack so the destination
 * can import its typed resource there.
 */
function buildWithDestination(factory: (stack: Stack) => IListenerDestination): void {
  const app = new App();
  const stack = new Stack(app, 'S');
  new Listener(stack, 'Listener', {
    protocol: ListenerProtocol.udp(),
    clientRestrictions: { networks: ['0.0.0.0/0'] },
    destinations: [factory(stack)],
  });
}

describe('L2 synth-time validation (design §8) — one negative test per rule', () => {
  // §8.3 — WebRTC requires cookies.
  test('WebRTC with requireCookies=false throws', () => {
    expect(() => ListenerProtocol.webRtc({ requireCookies: false })).toThrow(
      'WebRTC requires cookies; RequireCookies cannot be false.',
    );
  });

  // §8.4 — serverSecret must be base64 32-byte (dtls/webrtc).
  test('dtls serverSecret that is not base64 32-byte throws', () => {
    expect(() => ListenerProtocol.dtls({ serverSecret: 'not-base64' })).toThrow(
      /serverSecret must be a base64-encoded 32-byte value/,
    );
  });

  // §8.4 — unknownPeerPreSharedKey must be base64 32-byte.
  test('WireGuard unknownPeerPreSharedKey that is not base64 throws', () => {
    expect(() =>
      ListenerProtocol.wireGuard({
        allowUnknownPeers: true,
        unknownPeerPreSharedKey: 'nope',
      }),
    ).toThrow(/unknownPeerPreSharedKey must be a base64-encoded 32-byte value/);
  });

  // §8.4 — WireGuard peer publicKey must be base64 32-byte.
  test('WireGuard peer publicKey that is not base64 throws', () => {
    expect(() =>
      ListenerProtocol.wireGuard({ peers: [{ publicKey: 'bad-key' }] }),
    ).toThrow(/WireGuard peer publicKey must be a base64-encoded 32-byte value/);
  });

  // §8.5 — unknownPeerPreSharedKey only with allowUnknownPeers=true.
  test('WireGuard unknownPeerPreSharedKey without allowUnknownPeers throws', () => {
    expect(() => ListenerProtocol.wireGuard({ unknownPeerPreSharedKey: VALID_KEY })).toThrow(
      'unknownPeerPreSharedKey is only valid when allowUnknownPeers is true.',
    );
  });

  // §8.6 — earlyDataWindowSeconds in 1..604800.
  test('dtls earlyDataWindowSeconds out of range throws', () => {
    expect(() => ListenerProtocol.dtls({ earlyDataWindowSeconds: 0 })).toThrow(
      /earlyDataWindowSeconds must be an integer between 1 and 604800/,
    );
    expect(() => ListenerProtocol.dtls({ earlyDataWindowSeconds: 604801 })).toThrow(
      /earlyDataWindowSeconds must be an integer between 1 and 604800/,
    );
  });

  // §8.10 — Lambda useResponseStreaming XOR useAsyncInvoke.
  test('Lambda useResponseStreaming + useAsyncInvoke both true throws', () => {
    expect(() =>
      buildWithDestination(
        (s) =>
          new LambdaDestination({
            fn: lambda.Function.fromFunctionArn(
              s,
              'Fn',
              'arn:aws:lambda:us-east-1:111122223333:function:f',
            ),
            useResponseStreaming: true,
            useAsyncInvoke: true,
          }),
      ),
    ).toThrow('UseResponseStreaming and UseAsyncInvoke cannot both be true.');
  });

  // §8.9 — SQS FIFO requires messageGroupIdExpression.
  test('SQS FIFO queue without messageGroupIdExpression throws', () => {
    expect(() =>
      buildWithDestination(
        (s) =>
          new SqsDestination({
            queue: sqs.Queue.fromQueueArn(
              s,
              'Q',
              'arn:aws:sqs:us-east-1:111122223333:q.fifo',
            ),
          }),
      ),
    ).toThrow('MessageGroupIdExpression is required for FIFO SQS queues.');
  });

  // §8.11 — Location requires device/lat/long expressions.
  test('Location without the required expressions throws', () => {
    expect(() =>
      buildWithDestination(
        () =>
          new LocationTrackerDestination({
            trackerArn: 'arn:aws:geo:us-east-1:111122223333:tracker/t',
            deviceIdExpression: '',
            latitudeExpression: '',
            longitudeExpression: '',
          }),
      ),
    ).toThrow(
      'DeviceIdExpression, LatitudeExpression and LongitudeExpression are required for AWS Location Tracker destinations.',
    );
  });

  // §8.11 — Location positionPropertyExpressions ≤ 3.
  test('Location with more than 3 positionPropertyExpressions throws', () => {
    expect(() =>
      buildWithDestination(
        () =>
          new LocationTrackerDestination({
            trackerArn: 'arn:aws:geo:us-east-1:111122223333:tracker/t',
            deviceIdExpression: '[0:2]',
            latitudeExpression: '[2:4]',
            longitudeExpression: '[4:6]',
            positionPropertyExpressions: {
              a: '[6:8]',
              b: '[8:10]',
              c: '[10:12]',
              d: '[12:14]',
            },
          }),
      ),
    ).toThrow(/PositionPropertyExpressions supports at most 3 entries/);
  });

  // §8.11 — Location timeUnit domain.
  test('Location with an invalid timeUnit throws', () => {
    expect(() =>
      buildWithDestination(
        () =>
          new LocationTrackerDestination({
            trackerArn: 'arn:aws:geo:us-east-1:111122223333:tracker/t',
            deviceIdExpression: '[0:2]',
            latitudeExpression: '[2:4]',
            longitudeExpression: '[4:6]',
            timeUnit: 'minutes' as unknown as LocationTimeUnit,
          }),
      ),
    ).toThrow("When present, TimestampTimeUnit must be one of 'seconds' or 'milliseconds.'");
  });

  // §8.15 — ArnDestination arn vs arnMap mutual exclusion.
  test('ArnDestination with both arn and arnMap throws', () => {
    expect(() =>
      buildWithDestination(
        () =>
          new ArnDestination({
            arn: 'arn:aws:lambda:us-east-1:111122223333:function:f',
            arnMap: { default: 'arn:aws:lambda:us-east-1:111122223333:function:g' },
          }),
      ),
    ).toThrow("ArnDestination sets both 'arn' and 'arnMap'; they are mutually exclusive.");
  });

  // §8.14 — ArnDestination region-map key validity.
  test('ArnDestination region-map with an invalid key throws', () => {
    expect(() =>
      buildWithDestination(
        () =>
          new ArnDestination({
            arnMap: {
              byRegion: { 'not-a-region!': 'arn:aws:lambda:us-east-1:111122223333:function:f' },
            },
          }),
      ),
    ).toThrow(/Region-map key 'not-a-region!' is invalid/);
  });
});
