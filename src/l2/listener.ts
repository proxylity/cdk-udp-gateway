import { Duration, Fn, Token } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import {
  CfnListener,
  ClientRestrictions,
  ListenerDestination,
  ListenerRole,
} from '../cfn-listener';
import { addLogsGrant, addMetricsGrant, createServiceRole, toDotNetTimeSpan } from '../private/l2-iam';
import { ProxylityConfig } from '../proxylity-config';
import { IListenerDestination } from './destination';
import { ListenerProtocol, ProtocolKind } from './listener-protocol';

/** Properties for {@link Listener}. */
export interface ListenerProps {
  /** Protocol configuration produced by a {@link ListenerProtocol} factory. Exactly one protocol. */
  readonly protocol: ListenerProtocol;
  /** Destinations to deliver packets to (inline). At least one is required for useful traffic. */
  readonly destinations: IListenerDestination[];
  /** Client-access restrictions. Omitting restrictions admits NO traffic (server-side semantic). */
  readonly clientRestrictions?: ClientRestrictions;
  /** `Name` — a human-friendly listener name. */
  readonly listenerName?: string;
  /** `Description` — free text. */
  readonly description?: string;
  /** Listener-level metrics. Auto-creates `role` when none is supplied. */
  readonly metricsEnabled?: boolean;
  /** Listener-level log group name. Auto-creates `role` when none is supplied. */
  readonly logGroupName?: string;
  /**
   * Listener-level IAM role for metrics/log delivery. If omitted AND metrics/logs are enabled, L2
   * auto-creates a role trusting the Proxylity ServiceRole with `cloudwatch:PutMetricData` and
   * `logs:CreateLogStream`/`logs:PutLogEvents`. If provided, it is used as-is.
   */
  readonly role?: iam.IRole;
  /** Explicit {@link ProxylityConfig}; defaults to `ProxylityConfig.forStack(this)`. */
  readonly proxylityConfig?: ProxylityConfig;
  /** Session duration for the listener role (`Role.Duration` as a `"[d.]hh:mm:ss"` string). Default 1h. */
  readonly roleSessionDuration?: Duration;
}

/**
 * An ergonomic L2 Listener. It composes an L1 {@link CfnListener} child: it assembles the protocol
 * wire props from the sealed {@link ListenerProtocol}, binds each destination (creating the derived
 * IAM roles/policies), folds the results into the L1 `Destinations[]` array, and reproduces the
 * example `DependsOn` ordering from the listener to each destination policy. It emits no raw custom
 * resource itself — the L1 child performs the only camelCase->PascalCase mapping.
 */
export class Listener extends Construct {
  /** The resolved {@link ProxylityConfig} for this listener (explicit or `forStack`). */
  public readonly resolvedProxylityConfig: ProxylityConfig;

  private readonly protocolKind: ProtocolKind;
  private readonly signalingMode?: string;
  private readonly cfn: CfnListener;

  constructor(scope: Construct, id: string, props: ListenerProps) {
    super(scope, id);

    this.resolvedProxylityConfig = props.proxylityConfig ?? ProxylityConfig.forStack(this);
    this.protocolKind = props.protocol._protocol;
    this.signalingMode = props.protocol._wire.webRtcSignalingMode;

    const observabilityEnabled =
      props.metricsEnabled === true || props.logGroupName !== undefined;

    // Resolve the listener-level role. Auto-create one trusting the Proxylity ServiceRole when
    // observability is enabled and the caller did not supply a role.
    let listenerRole: iam.IRole | undefined = props.role;
    const dependencies = [];
    if (!listenerRole && observabilityEnabled) {
      const role = createServiceRole(this, 'Role', this.resolvedProxylityConfig);
      if (props.metricsEnabled === true) {
        addMetricsGrant(role);
      }
      if (props.logGroupName !== undefined) {
        addLogsGrant(role);
      }
      listenerRole = role;
      dependencies.push(role);
      const defaultPolicy = (role as unknown as { defaultPolicy?: Construct }).defaultPolicy;
      if (defaultPolicy) {
        dependencies.push(defaultPolicy);
      }
    } else if (listenerRole) {
      dependencies.push(listenerRole);
    }

    const roleWire: ListenerRole | undefined = listenerRole
      ? { arn: listenerRole.roleArn, duration: toDotNetTimeSpan(props.roleSessionDuration) }
      : undefined;

    // Bind each destination and fold its config into one L1 inline destination entry.
    const l1Destinations: ListenerDestination[] = [];
    for (const destination of props.destinations) {
      const config = destination.bind(this, this);
      l1Destinations.push({
        name: config.destinationName,
        description: config.description,
        role: {
          arn: config.role.roleArn,
          duration: config.roleSessionDuration,
        },
        destinationArn: config.destinationArn,
        destinationArnMap: config.destinationArnMap,
        batching: config.batching,
        formatter: config.formatter,
        filterExpression: config.filterExpression,
        metricsEnabled: config.metricsEnabled,
        logGroupName: config.logGroupName,
        arguments: config.arguments,
      });
      for (const dep of config.dependencies ?? []) {
        dependencies.push(dep);
      }
    }

    const wire = props.protocol._wire;
    this.cfn = new CfnListener(this, 'Resource', {
      serviceToken: this.resolvedProxylityConfig.serviceToken(),
      apiKey: this.resolvedProxylityConfig.apiKey(),
      protocols: wire.protocols,
      name: props.listenerName,
      description: props.description,
      clientRestrictions: props.clientRestrictions,
      destinations: l1Destinations,
      metricsEnabled: props.metricsEnabled,
      logGroupName: props.logGroupName,
      role: roleWire,
      // WireGuard
      decapsulatedDelivery: wire.decapsulatedDelivery,
      allowUnknownPeers: wire.allowUnknownPeers,
      unknownPeerPreSharedKey: wire.unknownPeerPreSharedKey,
      peers: wire.peers,
      keyRefreshToken: wire.keyRefreshToken,
      // DTLS
      psks: wire.psks,
      allowEarlyData: wire.allowEarlyData,
      earlyDataWindowSeconds: wire.earlyDataWindowSeconds,
      // WebRTC
      webRtcSignalingMode: wire.webRtcSignalingMode,
      webRtcSignalingRefreshToken: wire.webRtcSignalingRefreshToken,
      // shared DTLS/WebRTC
      serverSecret: wire.serverSecret,
      requireCookies: wire.requireCookies,
      certRefreshToken: wire.certRefreshToken,
    });

    // Reproduce the example DependsOn ordering: the listener must not be created before each
    // destination's (or the listener's own) role AND inline policy exist.
    for (const dep of dependencies) {
      this.cfn.resource.node.addDependency(dep);
    }
  }

  /** Escape hatch: the underlying L1 {@link CfnListener}. Use for `addPropertyOverride`, etc. */
  public get cfnListener(): CfnListener {
    return this.cfn;
  }

  /** The listener name (`Id`). Always available. */
  public get listenerName(): string {
    return this.cfn.attrId;
  }

  /** The allocated port as a string token (`Port`). Always available. */
  public get port(): string {
    return this.cfn.attrPort;
  }

  /** The allocated port as a number token. Always available. */
  public get portAsNumber(): number {
    return Token.asNumber(this.cfn.attrPort);
  }

  /** The listener subdomain (`Domain`); the full host is `${domain}.proxylity.com`. Always available. */
  public get domain(): string {
    return this.cfn.attrDomain;
  }

  /** Convenience endpoint `${domain}.proxylity.com:${port}`. Always available. */
  public get endpoint(): string {
    return Fn.sub('${Domain}.proxylity.com:${Port}', {
      Domain: this.cfn.attrDomain,
      Port: this.cfn.attrPort,
    });
  }

  /**
   * The destination names (`DestinationNames`) as a string-LIST token. Always available. Consume it
   * only with list-aware intrinsics such as `Fn.select`.
   */
  public get destinationNames(): string[] {
    return this.cfn.attrDestinationNames;
  }

  /** The WireGuard server public key (`WireGuardPublicKey`). WireGuard listeners only. */
  public get wireGuardPublicKey(): string {
    this.requireProtocol('wireGuardPublicKey', ['wg']);
    return this.cfn.attrWireGuardPublicKey;
  }

  /** The DTLS server certificate (`DtlsServerCertificate`). DTLS and WebRTC listeners only. */
  public get dtlsServerCertificate(): string {
    this.requireProtocol('dtlsServerCertificate', ['dtls', 'webrtc']);
    return this.cfn.attrDtlsServerCertificate;
  }

  /** The WebRTC DTLS fingerprint (`WebRtcFingerprint`). WebRTC listeners only. */
  public get webRtcFingerprint(): string {
    this.requireProtocol('webRtcFingerprint', ['webrtc']);
    return this.cfn.attrWebRtcFingerprint;
  }

  /** The WebRTC SCTP port (`WebRtcSctpPort`) as a string token. WebRTC listeners only. */
  public get webRtcSctpPort(): string {
    this.requireProtocol('webRtcSctpPort', ['webrtc']);
    return this.cfn.attrWebRtcSctpPort;
  }

  /** The WebRTC data channel id (`WebRtcChannelId`) as a string token. WebRTC listeners only. */
  public get webRtcChannelId(): string {
    this.requireProtocol('webRtcChannelId', ['webrtc']);
    return this.cfn.attrWebRtcChannelId;
  }

  /** The WebRTC signaling mode (`WebRtcSignalingMode`). WebRTC listeners only. */
  public get webRtcSignalingMode(): string {
    this.requireProtocol('webRtcSignalingMode', ['webrtc']);
    return this.cfn.attrWebRtcSignalingMode;
  }

  /**
   * The WebRTC signaling bearer token (`WebRtcSignalingToken`). WebRTC listeners with
   * `signalingMode = public` only.
   */
  public get webRtcSignalingToken(): string {
    this.requirePublicSignaling('webRtcSignalingToken');
    return this.cfn.attrWebRtcSignalingToken;
  }

  /**
   * The WebRTC signaling URL (`WebRtcSignalingUrl`). WebRTC listeners with `signalingMode = public`
   * only.
   */
  public get webRtcSignalingUrl(): string {
    this.requirePublicSignaling('webRtcSignalingUrl');
    return this.cfn.attrWebRtcSignalingUrl;
  }

  private requireProtocol(attr: string, allowed: ProtocolKind[]): void {
    if (!allowed.includes(this.protocolKind)) {
      throw new Error(
        `'${attr}' is only available on ${allowed.join('/')} listeners, but this listener is ` +
          `'${this.protocolKind}'.`,
      );
    }
  }

  private requirePublicSignaling(attr: string): void {
    this.requireProtocol(attr, ['webrtc']);
    if (this.signalingMode !== 'public') {
      throw new Error(
        `'${attr}' is only available when the WebRTC listener uses signalingMode 'public'.`,
      );
    }
  }
}
