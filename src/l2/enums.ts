// L2 enums. Every string value equals the exact literal the Proxylity UDP Gateway service accepts,
// so L2 never emits a value L1 could not have carried.

/**
 * Destination payload formatter (`Destinations[].Formatter`). Mirrors the service's `Formatter`
 * set. `coap` is valid only as a destination-level formatter, not for the `Arguments` sub-formatters
 * (`TenantIdFormatter`, `MessageGroupIdFormatter`, etc.) — use {@link ArgumentFormatter} for those.
 */
export enum Formatter {
  /** Base64-encode the payload. */
  BASE64 = 'base64',
  /** Hex-encode the payload. */
  HEX = 'hex',
  /** Decode the payload as ASCII text. */
  ASCII = 'ascii',
  /** Decode the payload as UTF-8 text. */
  UTF8 = 'utf8',
  /** Treat the payload as a CoAP message (destination-level only). */
  COAP = 'coap',
}

/**
 * Formatter set for `Arguments` sub-formatters (`TenantIdFormatter`, `MessageGroupIdFormatter`,
 * `MessageDeduplicationIdFormatter`, `PartitionKeyExpressionFormatter`, `TopicSuffixFormatter`).
 * The service restricts these to `base64`/`hex`/`ascii`/`utf8` — `coap` is NOT allowed here.
 */
export enum ArgumentFormatter {
  /** Base64-encode the computed value. */
  BASE64 = 'base64',
  /** Hex-encode the computed value. */
  HEX = 'hex',
  /** Decode the computed value as ASCII text. */
  ASCII = 'ascii',
  /** Decode the computed value as UTF-8 text. */
  UTF8 = 'utf8',
}

/** WebRTC signaling mode (`WebRtcSignalingMode`). */
export enum WebRtcSignalingMode {
  /** No managed signaling endpoint (the default). */
  NONE = 'none',
  /** A public managed signaling endpoint; emits `WebRtcSignalingToken`/`WebRtcSignalingUrl`. */
  PUBLIC = 'public',
}

/** Location tracker timestamp unit (`Arguments.TimeUnit`). */
export enum LocationTimeUnit {
  /** Timestamps are expressed in seconds. */
  SECONDS = 'seconds',
  /** Timestamps are expressed in milliseconds. */
  MILLISECONDS = 'milliseconds',
}
