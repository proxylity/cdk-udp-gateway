import { App, Stack, Token } from 'aws-cdk-lib';
import { Listener, ListenerProtocol, WebRtcSignalingMode } from '../../src';

function listener(protocol: ListenerProtocol): Listener {
  const app = new App();
  const stack = new Stack(app, 'S');
  return new Listener(stack, 'Listener', {
    protocol,
    clientRestrictions: { networks: ['0.0.0.0/0'] },
    destinations: [],
  });
}

describe('Listener protocol-gated outputs', () => {
  describe('always-available getters (any protocol)', () => {
    const l = listener(ListenerProtocol.udp());
    test('listenerName / port / domain / endpoint / destinationNames resolve to tokens', () => {
      expect(Token.isUnresolved(l.listenerName)).toBe(true);
      expect(Token.isUnresolved(l.port)).toBe(true);
      expect(Token.isUnresolved(l.domain)).toBe(true);
      expect(Token.isUnresolved(l.endpoint)).toBe(true);
      expect(Token.isUnresolved(l.portAsNumber)).toBe(true);
      expect(Token.isUnresolved(l.destinationNames)).toBe(true);
    });
  });

  describe('wireGuardPublicKey', () => {
    test('available on a WireGuard listener', () => {
      expect(Token.isUnresolved(listener(ListenerProtocol.wireGuard()).wireGuardPublicKey)).toBe(
        true,
      );
    });
    test('throws on a UDP listener', () => {
      expect(() => listener(ListenerProtocol.udp()).wireGuardPublicKey).toThrow(
        /only available on wg listeners/,
      );
    });
  });

  describe('dtlsServerCertificate', () => {
    test('available on a DTLS listener', () => {
      expect(
        Token.isUnresolved(listener(ListenerProtocol.dtls()).dtlsServerCertificate),
      ).toBe(true);
    });
    test('available on a WebRTC listener', () => {
      expect(
        Token.isUnresolved(listener(ListenerProtocol.webRtc()).dtlsServerCertificate),
      ).toBe(true);
    });
    test('throws on a UDP listener', () => {
      expect(() => listener(ListenerProtocol.udp()).dtlsServerCertificate).toThrow(
        /only available on dtls\/webrtc listeners/,
      );
    });
  });

  describe('WebRTC-only getters', () => {
    const wrtc = listener(ListenerProtocol.webRtc());
    test('webRtcFingerprint / sctpPort / channelId / signalingMode resolve for WebRTC', () => {
      expect(Token.isUnresolved(wrtc.webRtcFingerprint)).toBe(true);
      expect(Token.isUnresolved(wrtc.webRtcSctpPort)).toBe(true);
      expect(Token.isUnresolved(wrtc.webRtcChannelId)).toBe(true);
      expect(Token.isUnresolved(wrtc.webRtcSignalingMode)).toBe(true);
    });
    test('webRtcFingerprint throws on a DTLS listener', () => {
      expect(() => listener(ListenerProtocol.dtls()).webRtcFingerprint).toThrow(
        /only available on webrtc listeners/,
      );
    });
  });

  describe('WebRTC public-signaling-only getters', () => {
    test('available when signalingMode is public', () => {
      const l = listener(
        ListenerProtocol.webRtc({ signalingMode: WebRtcSignalingMode.PUBLIC }),
      );
      expect(Token.isUnresolved(l.webRtcSignalingToken)).toBe(true);
      expect(Token.isUnresolved(l.webRtcSignalingUrl)).toBe(true);
    });
    test('throws when signalingMode is not public (default none)', () => {
      const l = listener(ListenerProtocol.webRtc());
      expect(() => l.webRtcSignalingToken).toThrow(/signalingMode 'public'/);
      expect(() => l.webRtcSignalingUrl).toThrow(/signalingMode 'public'/);
    });
    test('throws on a non-WebRTC listener', () => {
      expect(() => listener(ListenerProtocol.udp()).webRtcSignalingToken).toThrow(
        /only available on webrtc listeners/,
      );
    });
  });
});
