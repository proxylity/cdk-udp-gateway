import { CfnResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { wireObject } from './private/to-wire';

/**
 * Client-access restrictions for a listener (`ClientRestrictions`). Omitting restrictions admits no
 * traffic (a server-side semantic enforced by the service).
 */
export interface ClientRestrictions {
  /**
   * CloudFormation `ClientRestrictions.Networks` — array of allowed outer-client CIDR strings.
   * A WireGuard inner address is not the client's public source address.
   */
  readonly networks?: string[];
  /** CloudFormation `ClientRestrictions.Domains` — array of allowed domain strings. */
  readonly domains?: string[];
}

/**
 * IAM role an assumed by the Proxylity ServiceRole, used for the listener-level `Role` and for an
 * inline destination's `Role`.
 */
export interface ListenerRole {
  /** CloudFormation `Role.Arn` — IAM role ARN the Proxylity ServiceRole assumes. */
  readonly arn: string;
  /**
   * CloudFormation `Role.Duration` — assumed-session duration as a duration string in
   * `"[d.]hh:mm:ss"` form (e.g. `"1:00:00"` = one hour, `"0:30:00"` = 30 minutes). Defaults to
   * `"1:00:00"` (one hour) when omitted. This is NOT minutes or seconds.
   *
   * @default - "1:00:00" (one hour; the service default)
   */
  readonly duration?: string;
}

/** A WireGuard peer entry (`Peers[]`). Only valid when `protocols` is `['wg']`. */
export interface WireGuardPeer {
  /** `Peers[].PublicKey` — base64 32-byte peer public key (required). */
  readonly publicKey: string;
  /** `Peers[].SharedSecret` — optional base64 32-byte preshared key. */
  readonly sharedSecret?: string;
  /**
   * `Peers[].AllowedIPs` — optional array of CIDR strings. The resource defaults to
   * `0.0.0.0/0, ::/0` when omitted.
   */
  readonly allowedIPs?: string[];
}

/** Batching settings for an inline destination (`Destinations[].Batching`). */
export interface Batching {
  /**
   * `Batching.Count` — maximum messages per batch (integer). Resource default 100.
   * @default - 100 (service default)
   */
  readonly count?: number;
  /**
   * `Batching.TimeoutInSeconds` — maximum wait in fractional seconds. Resource default 0.25.
   * @default - 0.25 (service default)
   */
  readonly timeoutInSeconds?: number;
  /**
   * `Batching.SizeInMB` — advisory maximum batch size in fractional megabytes. Resource default 1.0.
   * @default - 1.0 (service default)
   */
  readonly sizeInMB?: number;
}

/**
 * Region→ARN map form of an inline destination's `DestinationArn`.
 */
export interface DestinationArnMap {
  /**
   * Fallback ARN used when no region-specific entry matches. Serialized as the `"*"` key.
   */
  readonly default?: string;
  /**
   * Region-keyed ARNs, e.g.
   * `{ "us-east-1": "arn:aws:lambda:us-east-1:...", "eu-west-1": "arn:aws:lambda:eu-west-1:..." }`.
   */
  readonly byRegion?: { [region: string]: string };
}

/**
 * Service-specific settings for an inline destination (`Destinations[].Arguments`). L1 exposes the
 * full set of accepted argument properties; the service enforces which apply to which destination
 * service ARN. `Formatter` enums (`base64`/`hex`/`ascii`/`utf8`) are documented in
 * JSDoc but typed as `string` — L1 invents no enums.
 */
export interface DestinationArguments {
  // --- IoT Data ---
  /** `Arguments.DynamicTopicSuffix`. */
  readonly dynamicTopicSuffix?: boolean;
  /** `Arguments.TopicSuffixExpression` — BREX expression. */
  readonly topicSuffixExpression?: string;
  /** `Arguments.TopicSuffixFormatter` — one of `base64`/`hex`/`ascii`/`utf8`. */
  readonly topicSuffixFormatter?: string;

  // --- Lambda ---
  /** `Arguments.TenantId` — static tenant identifier (tenant-isolation feature). */
  readonly tenantId?: string;
  /** `Arguments.TenantIdExpression` — BREX expression yielding the tenant id. */
  readonly tenantIdExpression?: string;
  /** `Arguments.TenantIdFormatter` — one of `base64`/`hex`/`ascii`/`utf8`. */
  readonly tenantIdFormatter?: string;
  /** `Arguments.UseResponseStreaming` — mutually exclusive with `useAsyncInvoke`. */
  readonly useResponseStreaming?: boolean;
  /** `Arguments.UseAsyncInvoke` — mutually exclusive with `useResponseStreaming`. */
  readonly useAsyncInvoke?: boolean;

  // --- SQS ---
  /** `Arguments.SendRaw`. */
  readonly sendRaw?: boolean;
  /** `Arguments.UseMessageAttributes`. */
  readonly useMessageAttributes?: boolean;
  /** `Arguments.MessageGroupIdExpression` — required for FIFO queues (server-enforced). */
  readonly messageGroupIdExpression?: string;
  /** `Arguments.MessageGroupIdFormatter` — one of `base64`/`hex`/`ascii`/`utf8`. */
  readonly messageGroupIdFormatter?: string;
  /** `Arguments.MessageDeduplicationIdExpression`. */
  readonly messageDeduplicationIdExpression?: string;
  /** `Arguments.MessageDeduplicationIdFormatter` — one of `base64`/`hex`/`ascii`/`utf8`. */
  readonly messageDeduplicationIdFormatter?: string;

  // --- Kinesis ---
  /** `Arguments.PartitionKeyExpression`. */
  readonly partitionKeyExpression?: string;
  /** `Arguments.PartitionKeyExpressionFormatter` — one of `base64`/`hex`/`ascii`/`utf8`. */
  readonly partitionKeyExpressionFormatter?: string;

  // --- Location tracker ---
  /** `Arguments.DeviceIdExpression`. */
  readonly deviceIdExpression?: string;
  /** `Arguments.LatitudeExpression`. */
  readonly latitudeExpression?: string;
  /** `Arguments.LongitudeExpression`. */
  readonly longitudeExpression?: string;
  /** `Arguments.ScaleFactor`. */
  readonly scaleFactor?: number;
  /** `Arguments.AccuracyExpression`. */
  readonly accuracyExpression?: string;
  /** `Arguments.PositionPropertyExpressions` — map of property name → BREX expression. */
  readonly positionPropertyExpressions?: { [name: string]: string };
  /** `Arguments.TimestampExpression`. */
  readonly timestampExpression?: string;
  /** `Arguments.TimeUnit` — `seconds` or `milliseconds`. */
  readonly timeUnit?: string;
}

/**
 * An inline destination (`Destinations[]` object). A destination may also be referenced by name as
 * a plain string entry in `CfnListenerProps.destinations`.
 */
export interface ListenerDestination {
  /**
   * `Destinations[].Name` — unique within the listener. Resource generates
   * `"dstn-<stack>-<logicalId>-<index>"` if omitted.
   */
  readonly name?: string;
  /** `Destinations[].Description`. */
  readonly description?: string;
  /** `Destinations[].Role` — `{ Arn, Duration? }`. `Duration` default `"1:00:00"` (one hour). */
  readonly role?: ListenerRole;
  /**
   * `Destinations[].DestinationArn` — a single ARN string. Mutually exclusive with
   * `destinationArnMap`; setting both throws at synth. Omitting both emits an empty object `{}`.
   */
  readonly destinationArn?: string;
  /**
   * `Destinations[].DestinationArn` region-map form. Mutually exclusive with `destinationArn`;
   * setting both throws at synth. See {@link DestinationArnMap}.
   */
  readonly destinationArnMap?: DestinationArnMap;
  /** `Destinations[].Batching` — `{ Count?, TimeoutInSeconds?, SizeInMB? }`. */
  readonly batching?: Batching;
  /**
   * `Destinations[].Formatter` — one of `base64`/`hex`/`ascii`/`utf8`/`coap`. Resource default is
   * `utf8` for logs ARNs and `base64` otherwise.
   */
  readonly formatter?: string;
  /** `Destinations[].FilterExpression` — BREX filter string. */
  readonly filterExpression?: string;
  /** `Destinations[].MetricsEnabled`. */
  readonly metricsEnabled?: boolean;
  /** `Destinations[].LogGroupName` — 1–512 chars, pattern `[a-zA-Z0-9_\-/.#]`. */
  readonly logGroupName?: string;
  /** `Destinations[].Arguments` — service-specific settings; see {@link DestinationArguments}. */
  readonly arguments?: DestinationArguments;
}

/**
 * Properties for {@link CfnListener}. A flat property bag mirroring the shape the service accepts;
 * protocol-specific members are optional on this single interface rather than split
 * into subtypes (that is an L2 concern). The resource rejects invalid cross-protocol combinations.
 */
export interface CfnListenerProps {
  /** CloudFormation `ServiceToken`. Typically `ProxylityConfig.serviceToken()`. */
  readonly serviceToken: string;
  /**
   * CloudFormation `ApiKey`. Typically `ProxylityConfig.apiKey()`. Verified against AWS Marketplace
   * before any operation.
   */
  readonly apiKey: string;
  /**
   * CloudFormation `Protocols` — array containing EXACTLY ONE of `udp` | `wg` | `dtls` | `webrtc`.
   * The service rejects more than one. L1 does not enforce the cardinality.
   */
  readonly protocols: string[];

  /**
   * CloudFormation `Name`. If omitted, the resource generates a name. The service accepts names
   * matching the (unanchored) pattern `[a-zA-Z][a-zA-Z0-9 _\-]+`. L1 does not validate `Name`
   * client-side.
   */
  readonly name?: string;
  /** CloudFormation `Description` — free text; resource generates one if omitted. */
  readonly description?: string;
  /** CloudFormation `ClientRestrictions`. Omitting restrictions admits no traffic (server-side). */
  readonly clientRestrictions?: ClientRestrictions;
  /**
   * CloudFormation `Destinations` — each entry is an inline destination object
   * ({@link ListenerDestination}) or a `string` reference to an existing destination name.
   */
  readonly destinations?: Array<ListenerDestination | string>;
  /** CloudFormation `MetricsEnabled` (listener-level) — enable listener metrics. */
  readonly metricsEnabled?: boolean;
  /**
   * CloudFormation `LogGroupName` (listener-level), 1–512 chars, pattern `[a-zA-Z0-9_\-/.#]`.
   */
  readonly logGroupName?: string;
  /**
   * CloudFormation `Role` (listener-level) — IAM role used for metrics and log delivery.
   */
  readonly role?: ListenerRole;

  // --- WireGuard (wg) — only valid when protocols === ['wg'] ---
  /**
   * `DecapsulatedDelivery` (wg). The effective default is `false` when the property is omitted. L1
   * does not set a default; it omits the property when the caller omits it, so the resource applies
   * its own `false` behavior.
   *
   * @default - resource applies `false`
   */
  readonly decapsulatedDelivery?: boolean;
  /** `AllowUnknownPeers` (wg). Default `false`. */
  readonly allowUnknownPeers?: boolean;
  /**
   * `UnknownPeerPreSharedKey` (wg) — base64 32-byte (`^[A-Za-z0-9+/]{43}=$`). Only valid when
   * `allowUnknownPeers` is true.
   */
  readonly unknownPeerPreSharedKey?: string;
  /** `Peers` (wg). */
  readonly peers?: WireGuardPeer[];
  /**
   * `KeyRefreshToken` (wg) — rotation marker. Changing its value regenerates the server key pair on
   * stack update.
   */
  readonly keyRefreshToken?: string;

  // --- DTLS (dtls) — only valid when protocols === ['dtls'] ---
  /** `Psks` (dtls) — map of PSK name → non-empty string value. */
  readonly psks?: { [name: string]: string };
  /** `AllowEarlyData` (dtls). Default `false`. */
  readonly allowEarlyData?: boolean;
  /** `EarlyDataWindowSeconds` (dtls) — integer 1–604800; resource default 3600. */
  readonly earlyDataWindowSeconds?: number;
  /** `WebRtcSignalingMode` (webrtc) — `'none'` (default) or `'public'`. */
  readonly webRtcSignalingMode?: string;
  /**
   * `WebRtcSignalingRefreshToken` (webrtc) — rotation marker. Changing its value rotates the
   * signaling token on stack update.
   */
  readonly webRtcSignalingRefreshToken?: string;

  // --- shared between dtls and webrtc ---
  /**
   * `ServerSecret` (dtls/webrtc) — base64 32-byte secret used as the cookie HMAC key. A
   * caller-supplied value is honored for both `dtls` and `webrtc`; one is generated only when
   * omitted. Must be base64 when present.
   */
  readonly serverSecret?: string;
  /**
   * `RequireCookies` (dtls/webrtc) — require a cookie exchange. DTLS default `false`; WebRTC always
   * requires cookies.
   */
  readonly requireCookies?: boolean;
  /**
   * `CertRefreshToken` (dtls/webrtc) — rotation marker. Changing its value rotates the server
   * certificate on stack update.
   */
  readonly certRefreshToken?: string;
}

const RESOURCE_TYPE = 'Custom::ProxylityUdpGatewayListener';

/**
 * L1 construct for `Custom::ProxylityUdpGatewayListener`.
 *
 * A faithful 1:1 wrapper of the Proxylity UDP Gateway Listener custom resource. It emits exactly the
 * PascalCase wire keys the service reads and adds no derived IAM, invented enums, or
 * defaults beyond what the resource itself applies.
 */
export class CfnListener extends Construct {
  /** The underlying `AWS::CloudFormation::CustomResource`-style resource. */
  public readonly resource: CfnResource;

  constructor(scope: Construct, id: string, props: CfnListenerProps) {
    super(scope, id);

    this.resource = new CfnResource(this, 'Resource', {
      type: RESOURCE_TYPE,
      properties: CfnListener.toWire(props),
    });
  }

  /** `Fn::GetAtt(..., 'Id')` — the listener name. Always available. */
  public get attrId(): string {
    return this.getAttString('Id');
  }

  /**
   * `Fn::GetAtt(..., 'Port')` — the allocated port, as a string token. Always available.
   * (Numeric in the resource response but `Fn::GetAtt` resolves to a string; wrap with
   * `Token.asNumber(Fn.getAtt(..., 'Port'))` if a number is required.)
   */
  public get attrPort(): string {
    return this.getAttString('Port');
  }

  /** `Fn::GetAtt(..., 'Domain')` — subdomain; the full host is `${Domain}.proxylity.com`. Always available. */
  public get attrDomain(): string {
    return this.getAttString('Domain');
  }

  /**
   * `Fn::GetAtt(..., 'DestinationNames')` — the destination names, as a string-LIST token. Always
   * available. Index it with `Fn.select(0, listener.attrDestinationNames)`.
   *
   * This is a CloudFormation list token (an `Fn::GetAtt` of a list attribute); consume it only with
   * list-aware intrinsics such as `Fn.select` / `Fn.join`, and never embed it in a scalar string
   * context like `Fn.sub`/`${...}` interpolation (unlike `attrPort`, which is scalar).
   */
  public get attrDestinationNames(): string[] {
    return this.resource.getAtt('DestinationNames').toStringList();
  }

  /** `Fn::GetAtt(..., 'WireGuardPublicKey')` — base64 server public key. `wg` listeners only. */
  public get attrWireGuardPublicKey(): string {
    return this.getAttString('WireGuardPublicKey');
  }

  /** `Fn::GetAtt(..., 'DtlsServerCertificate')` — PEM certificate. `dtls`/`webrtc` listeners only. */
  public get attrDtlsServerCertificate(): string {
    return this.getAttString('DtlsServerCertificate');
  }

  /** `Fn::GetAtt(..., 'WebRtcFingerprint')` — SHA-256 cert fingerprint (colon-hex). `webrtc` only. */
  public get attrWebRtcFingerprint(): string {
    return this.getAttString('WebRtcFingerprint');
  }

  /** `Fn::GetAtt(..., 'WebRtcSctpPort')` — `5000`, as a string token. `webrtc` only. */
  public get attrWebRtcSctpPort(): string {
    return this.getAttString('WebRtcSctpPort');
  }

  /** `Fn::GetAtt(..., 'WebRtcChannelId')` — `0`, as a string token. `webrtc` only. */
  public get attrWebRtcChannelId(): string {
    return this.getAttString('WebRtcChannelId');
  }

  /** `Fn::GetAtt(..., 'WebRtcSignalingMode')` — `none`/`public`. `webrtc` only. */
  public get attrWebRtcSignalingMode(): string {
    return this.getAttString('WebRtcSignalingMode');
  }

  /** `Fn::GetAtt(..., 'WebRtcSignalingToken')` — bearer token (sensitive). `webrtc` + `public` only. */
  public get attrWebRtcSignalingToken(): string {
    return this.getAttString('WebRtcSignalingToken');
  }

  /** `Fn::GetAtt(..., 'WebRtcSignalingUrl')` — signaling URL. `webrtc` + `public` only. */
  public get attrWebRtcSignalingUrl(): string {
    return this.getAttString('WebRtcSignalingUrl');
  }

  private getAttString(attr: string): string {
    return this.resource.getAtt(attr).toString();
  }

  /** @internal — the single camelCase→PascalCase wire mapping for the listener. */
  private static toWire(props: CfnListenerProps): { [key: string]: unknown } {
    return wireObject([
      ['ServiceToken', props.serviceToken],
      ['ApiKey', props.apiKey],
      ['Protocols', props.protocols],
      ['Name', props.name],
      ['Description', props.description],
      ['ClientRestrictions', clientRestrictionsToWire(props.clientRestrictions)],
      ['Destinations', destinationsToWire(props.destinations)],
      ['MetricsEnabled', props.metricsEnabled],
      ['LogGroupName', props.logGroupName],
      ['Role', roleToWire(props.role)],
      // WireGuard
      ['DecapsulatedDelivery', props.decapsulatedDelivery],
      ['AllowUnknownPeers', props.allowUnknownPeers],
      ['UnknownPeerPreSharedKey', props.unknownPeerPreSharedKey],
      ['Peers', peersToWire(props.peers)],
      ['KeyRefreshToken', props.keyRefreshToken],
      // DTLS
      ['Psks', props.psks],
      ['AllowEarlyData', props.allowEarlyData],
      ['EarlyDataWindowSeconds', props.earlyDataWindowSeconds],
      // WebRTC
      ['WebRtcSignalingMode', props.webRtcSignalingMode],
      ['WebRtcSignalingRefreshToken', props.webRtcSignalingRefreshToken],
      // shared dtls/webrtc
      ['ServerSecret', props.serverSecret],
      ['RequireCookies', props.requireCookies],
      ['CertRefreshToken', props.certRefreshToken],
    ]);
  }
}

function clientRestrictionsToWire(cr?: ClientRestrictions): { [key: string]: unknown } | undefined {
  if (!cr) {
    return undefined;
  }
  return wireObject([
    ['Networks', cr.networks],
    ['Domains', cr.domains],
  ]);
}

function roleToWire(role?: ListenerRole): { [key: string]: unknown } | undefined {
  if (!role) {
    return undefined;
  }
  return wireObject([
    ['Arn', role.arn],
    ['Duration', role.duration],
  ]);
}

function batchingToWire(b?: Batching): { [key: string]: unknown } | undefined {
  if (!b) {
    return undefined;
  }
  return wireObject([
    ['Count', b.count],
    ['TimeoutInSeconds', b.timeoutInSeconds],
    ['SizeInMB', b.sizeInMB],
  ]);
}

function peersToWire(peers?: WireGuardPeer[]): Array<{ [key: string]: unknown }> | undefined {
  if (!peers) {
    return undefined;
  }
  return peers.map((p) =>
    wireObject([
      ['PublicKey', p.publicKey],
      ['SharedSecret', p.sharedSecret],
      ['AllowedIPs', p.allowedIPs],
    ]),
  );
}

function argumentsToWire(a?: DestinationArguments): { [key: string]: unknown } | undefined {
  if (!a) {
    return undefined;
  }
  return wireObject([
    // IoT Data
    ['DynamicTopicSuffix', a.dynamicTopicSuffix],
    ['TopicSuffixExpression', a.topicSuffixExpression],
    ['TopicSuffixFormatter', a.topicSuffixFormatter],
    // Lambda
    ['TenantId', a.tenantId],
    ['TenantIdExpression', a.tenantIdExpression],
    ['TenantIdFormatter', a.tenantIdFormatter],
    ['UseResponseStreaming', a.useResponseStreaming],
    ['UseAsyncInvoke', a.useAsyncInvoke],
    // SQS
    ['SendRaw', a.sendRaw],
    ['UseMessageAttributes', a.useMessageAttributes],
    ['MessageGroupIdExpression', a.messageGroupIdExpression],
    ['MessageGroupIdFormatter', a.messageGroupIdFormatter],
    ['MessageDeduplicationIdExpression', a.messageDeduplicationIdExpression],
    ['MessageDeduplicationIdFormatter', a.messageDeduplicationIdFormatter],
    // Kinesis
    ['PartitionKeyExpression', a.partitionKeyExpression],
    ['PartitionKeyExpressionFormatter', a.partitionKeyExpressionFormatter],
    // Location tracker
    ['DeviceIdExpression', a.deviceIdExpression],
    ['LatitudeExpression', a.latitudeExpression],
    ['LongitudeExpression', a.longitudeExpression],
    ['ScaleFactor', a.scaleFactor],
    ['AccuracyExpression', a.accuracyExpression],
    ['PositionPropertyExpressions', a.positionPropertyExpressions],
    ['TimestampExpression', a.timestampExpression],
    ['TimeUnit', a.timeUnit],
  ]);
}

/**
 * Serialize an inline destination's `DestinationArn` wire value. The map form serializes to
 * `{ "*": default, "<region>": arn, ... }` (omitting `*` when `default` is absent, and an empty
 * object `{}` when neither form is set, matching `udp-to-http`'s `"DestinationArn": {}`).
 */
function destinationArnToWire(d: ListenerDestination): unknown {
  if (d.destinationArn !== undefined && d.destinationArnMap !== undefined) {
    throw new Error(
      `Inline destination '${d.name ?? '(unnamed)'}' sets both 'destinationArn' and ` +
        "'destinationArnMap'; they are mutually exclusive (both map to the single 'DestinationArn' " +
        'wire key). Set exactly one.',
    );
  }
  if (d.destinationArn !== undefined) {
    return d.destinationArn;
  }
  if (d.destinationArnMap !== undefined) {
    const map: { [key: string]: string } = {};
    if (d.destinationArnMap.default !== undefined) {
      map['*'] = d.destinationArnMap.default;
    }
    if (d.destinationArnMap.byRegion) {
      for (const [region, arn] of Object.entries(d.destinationArnMap.byRegion)) {
        map[region] = arn;
      }
    }
    return map;
  }
  // Neither set: emit an explicit empty object, matching the service default.
  return {};
}

function destinationsToWire(
  destinations?: Array<ListenerDestination | string>,
): Array<unknown> | undefined {
  if (!destinations) {
    return undefined;
  }
  return destinations.map((d) => {
    if (typeof d === 'string') {
      return d;
    }
    return wireObject([
      ['Name', d.name],
      ['Description', d.description],
      ['Role', roleToWire(d.role)],
      ['DestinationArn', destinationArnToWire(d)],
      ['Batching', batchingToWire(d.batching)],
      ['Formatter', d.formatter],
      ['FilterExpression', d.filterExpression],
      ['MetricsEnabled', d.metricsEnabled],
      ['LogGroupName', d.logGroupName],
      ['Arguments', argumentsToWire(d.arguments)],
    ]);
  });
}
