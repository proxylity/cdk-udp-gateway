import { WireGuardPeer } from '../cfn-listener';
import { validateBase64Key, validateEarlyDataWindow } from '../private/l2-validation';
import { WebRtcSignalingMode } from './enums';

/** The four single-protocol selections a {@link ListenerProtocol} can represent. */
export type ProtocolKind = 'udp' | 'wg' | 'dtls' | 'webrtc';

/** WireGuard protocol options. Only the WireGuard-specific inputs are exposed. */
export interface WireGuardProtocolOptions {
  /** `Peers` — the configured WireGuard peers. */
  readonly peers?: WireGuardPeer[];
  /** `AllowUnknownPeers` — accept handshakes from peers not in `peers`. Default `false`. */
  readonly allowUnknownPeers?: boolean;
  /**
   * `UnknownPeerPreSharedKey` — base64 32-byte preshared key for unknown peers. Only valid when
   * `allowUnknownPeers` is `true`.
   */
  readonly unknownPeerPreSharedKey?: string;
  /** `DecapsulatedDelivery` — deliver decapsulated inner packets. Default `false`. */
  readonly decapsulatedDelivery?: boolean;
  /** `KeyRefreshToken` — rotation marker; changing it regenerates the server key pair on update. */
  readonly keyRefreshToken?: string;
}

/** DTLS protocol options. Only the DTLS-specific inputs are exposed. */
export interface DtlsProtocolOptions {
  /** `Psks` — map of PSK name to non-empty string value. */
  readonly psks?: { [name: string]: string };
  /** `RequireCookies` — require a cookie exchange. Default `false`. */
  readonly requireCookies?: boolean;
  /** `AllowEarlyData` — accept DTLS 1.3 early data. Default `false`. */
  readonly allowEarlyData?: boolean;
  /** `EarlyDataWindowSeconds` — integer 1..604800; resource default 3600. */
  readonly earlyDataWindowSeconds?: number;
  /** `ServerSecret` — base64 32-byte cookie HMAC key; generated when omitted. */
  readonly serverSecret?: string;
  /** `CertRefreshToken` — rotation marker; changing it rotates the server certificate on update. */
  readonly certRefreshToken?: string;
}

/** WebRTC protocol options. Only the WebRTC-specific inputs are exposed. */
export interface WebRtcProtocolOptions {
  /**
   * `RequireCookies` — WebRTC always requires cookies, so this may only be `true` (or omitted).
   * Setting it to `false` throws at synth.
   */
  readonly requireCookies?: boolean;
  /** `ServerSecret` — base64 32-byte cookie HMAC key; generated when omitted. */
  readonly serverSecret?: string;
  /** `CertRefreshToken` — rotation marker; changing it rotates the server certificate on update. */
  readonly certRefreshToken?: string;
  /** `WebRtcSignalingMode` — `none` (default) or `public`. */
  readonly signalingMode?: WebRtcSignalingMode;
  /**
   * `WebRtcSignalingRefreshToken` — rotation marker; changing it rotates the signaling token on
   * update.
   */
  readonly signalingRefreshToken?: string;
}

/**
 * The per-protocol wire fields a {@link ListenerProtocol} carries. The {@link import('./listener').Listener}
 * reads these to populate the L1 `CfnListenerProps`. Internal to L2.
 */
export interface ProtocolWireProps {
  readonly protocols: string[];
  // WireGuard
  readonly peers?: WireGuardPeer[];
  readonly allowUnknownPeers?: boolean;
  readonly unknownPeerPreSharedKey?: string;
  readonly decapsulatedDelivery?: boolean;
  readonly keyRefreshToken?: string;
  // DTLS
  readonly psks?: { [name: string]: string };
  readonly allowEarlyData?: boolean;
  readonly earlyDataWindowSeconds?: number;
  // WebRTC signaling
  readonly webRtcSignalingMode?: string;
  readonly webRtcSignalingRefreshToken?: string;
  // shared DTLS/WebRTC
  readonly serverSecret?: string;
  readonly requireCookies?: boolean;
  readonly certRefreshToken?: string;
}

/**
 * Sealed protocol selection for a {@link Listener}. Produced only by the static factory methods, so a
 * caller can never express more than one protocol — this structurally guarantees the "exactly one
 * protocol" invariant. Each factory takes only that protocol's inputs and validates them at synth.
 */
export class ListenerProtocol {
  /** UDP — no protocol-specific inputs. */
  public static udp(): ListenerProtocol {
    return new ListenerProtocol('udp', { protocols: ['udp'] });
  }

  /** WireGuard with the given options. */
  public static wireGuard(options: WireGuardProtocolOptions = {}): ListenerProtocol {
    if (options.unknownPeerPreSharedKey !== undefined) {
      if (options.allowUnknownPeers !== true) {
        throw new Error(
          'unknownPeerPreSharedKey is only valid when allowUnknownPeers is true.',
        );
      }
      validateBase64Key(options.unknownPeerPreSharedKey, 'unknownPeerPreSharedKey');
    }
    for (const peer of options.peers ?? []) {
      validateBase64Key(peer.publicKey, 'WireGuard peer publicKey');
      if (peer.sharedSecret !== undefined) {
        validateBase64Key(peer.sharedSecret, 'WireGuard peer sharedSecret');
      }
    }
    return new ListenerProtocol('wg', {
      protocols: ['wg'],
      peers: options.peers,
      allowUnknownPeers: options.allowUnknownPeers,
      unknownPeerPreSharedKey: options.unknownPeerPreSharedKey,
      decapsulatedDelivery: options.decapsulatedDelivery,
      keyRefreshToken: options.keyRefreshToken,
    });
  }

  /** DTLS with the given options. */
  public static dtls(options: DtlsProtocolOptions = {}): ListenerProtocol {
    if (options.serverSecret !== undefined) {
      validateBase64Key(options.serverSecret, 'serverSecret');
    }
    if (options.earlyDataWindowSeconds !== undefined) {
      validateEarlyDataWindow(options.earlyDataWindowSeconds, 'earlyDataWindowSeconds');
    }
    return new ListenerProtocol('dtls', {
      protocols: ['dtls'],
      psks: options.psks,
      requireCookies: options.requireCookies,
      allowEarlyData: options.allowEarlyData,
      earlyDataWindowSeconds: options.earlyDataWindowSeconds,
      serverSecret: options.serverSecret,
      certRefreshToken: options.certRefreshToken,
    });
  }

  /** WebRTC with the given options. */
  public static webRtc(options: WebRtcProtocolOptions = {}): ListenerProtocol {
    if (options.requireCookies === false) {
      throw new Error('WebRTC requires cookies; RequireCookies cannot be false.');
    }
    if (options.serverSecret !== undefined) {
      validateBase64Key(options.serverSecret, 'serverSecret');
    }
    return new ListenerProtocol('webrtc', {
      protocols: ['webrtc'],
      // WebRTC always requires cookies; pass the caller's value through (the resource applies the
      // always-on behavior when omitted).
      requireCookies: options.requireCookies,
      serverSecret: options.serverSecret,
      certRefreshToken: options.certRefreshToken,
      webRtcSignalingMode: options.signalingMode,
      webRtcSignalingRefreshToken: options.signalingRefreshToken,
    });
  }

  /** @internal The single-protocol selection this instance represents. */
  public readonly _protocol: ProtocolKind;
  /** @internal The per-protocol wire fields this instance carries. */
  public readonly _wire: ProtocolWireProps;

  private constructor(protocol: ProtocolKind, wire: ProtocolWireProps) {
    this._protocol = protocol;
    this._wire = wire;
  }
}
