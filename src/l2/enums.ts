// L2 enums. Every string value equals the exact literal the Proxylity UDP Gateway service accepts,
// so L2 never emits a value L1 could not have carried.

/**
 * Destination payload formatter (`Destinations[].Formatter`). Mirrors the service's `Formatter`
 * set. `coap`, `coap+` and `syslog` are valid only as destination-level formatters, not for the
 * `Arguments` sub-formatters (`TenantIdFormatter`, `MessageGroupIdFormatter`, etc.) — use
 * {@link ArgumentFormatter} for those.
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
  /**
   * Decode each CoAP (RFC 7252) message into a JSON object; the payload stays base64 and
   * Content-Format is not interpreted (destination-level only).
   */
  COAP = 'coap',
  /**
   * Content-type aware CoAP: the `coap` shape plus a top-level `ContentFormat`, with JSON, CBOR,
   * SenML, link-format, text and XML payloads decoded into JSON values (destination-level only).
   */
  COAP_PLUS = 'coap+',
  /**
   * Parse each RFC 5424 / RFC 3164 syslog message into a JSON object of syslog fields
   * (destination-level only).
   */
  SYSLOG = 'syslog',
}

/**
 * Formatter set for `Arguments` sub-formatters (`TenantIdFormatter`, `MessageGroupIdFormatter`,
 * `MessageDeduplicationIdFormatter`, `PartitionKeyExpressionFormatter`, `TopicSuffixFormatter`).
 * The service restricts these to `base64`/`hex`/`ascii`/`utf8` — `coap`, `coap+` and `syslog` are NOT
 * allowed here.
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

/** Location tracker timestamp unit (`Arguments.TimestampTimeUnit`). */
export enum LocationTimeUnit {
  /** Timestamps are expressed in seconds. */
  SECONDS = 'seconds',
  /** Timestamps are expressed in milliseconds. */
  MILLISECONDS = 'milliseconds',
}
