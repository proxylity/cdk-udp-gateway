import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared helpers for the L2 golden / wire-shape parity tests. Each test synthesizes an L2 stack,
 * extracts the emitted `Custom::ProxylityUdpGateway*` resource `Properties`, and diffs them against a
 * byte-faithful fixture copied from the sibling `examples` repo at author time. The fixtures live in
 * `test/fixtures/*.template.json` so the tests are self-contained in CI (where `examples` is NOT
 * checked out); see `test/fixtures/README.md`.
 *
 * The diff is "modulo logical IDs, generated role ARNs, and the stale `Enabled`/`EnableLogging` keys
 * L2 omits by design" (design §13). We realize that by normalizing — in BOTH the synthesized bag and
 * the fixture — the handful of values that legitimately differ between an example (which references
 * sibling resources via `Fn::GetAtt`/`Ref` and carries stale keys) and an L2 synth (which references
 * imported ARNs and omits the stale keys):
 *
 * - every destination `Role` collapses to `{ Arn: '<ROLE>' }` (CDK-generated vs example logical id);
 * - every destination `DestinationArn` STRING/`Fn::GetAtt`/`Ref` collapses to `'<ARN>'`, while the
 *   region-MAP form keeps its key structure (ARN values normalized) and the empty `{}` is preserved;
 * - `LogGroupName` collapses to `'<LOG>'`;
 * - `ClientRestrictions.Networks` collapses to `['<CIDR>']` (example `Ref` vs L2 literal);
 * - `Peers[].PublicKey` collapses to `'<KEY>'` (example `Ref` vs L2 literal base64);
 * - the stale `Enabled` (packet source) and `EnableLogging` (destination) keys are dropped.
 *
 * Everything else — `Protocols`, `Batching`, `Formatter`, `Arguments`, `MetricsEnabled`,
 * `Description`, `FilterExpression`, `DecapsulatedDelivery`, `Peers[].AllowedIPs`,
 * `WebRtcSignalingMode`, `RequireCookies`, the `ServiceToken`/`ApiKey` `Fn::FindInMap` intrinsics,
 * and the KEY SET of the Properties bag — is compared verbatim, which is the actual correctness gate.
 */

const ROLE = '<ROLE>';
const ARN = '<ARN>';
const LOG = '<LOG>';
const CIDR = '<CIDR>';
const KEY = '<KEY>';

/** Read and parse a vendored fixture under `test/fixtures/`. */
export function readFixture(name: string): any {
  const p = path.resolve(__dirname, '../fixtures', name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Find the single resource of `type` in a synthesized template's `Resources`. */
export function findResource(resources: Record<string, any>, type: string): any {
  const entry = Object.values(resources).find((r: any) => r.Type === type);
  if (!entry) {
    throw new Error(`No ${type} resource found in synthesized template`);
  }
  return entry;
}

const LISTENER_TYPE = 'Custom::ProxylityUdpGatewayListener';
const PACKET_SOURCE_TYPE = 'Custom::ProxylityUdpGatewayPacketSource';
const DESTINATION_ARN_TYPE = 'Custom::ProxylityUdpGatewayDestinationArn';

export const Types = {
  listener: LISTENER_TYPE,
  packetSource: PACKET_SOURCE_TYPE,
  destinationArn: DESTINATION_ARN_TYPE,
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Is `v` a plain object (not an array)? */
function isObject(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Does `v` look like an empty region-map placeholder `{}` (the multi-region global case)? */
function isEmptyObject(v: unknown): boolean {
  return isObject(v) && Object.keys(v).length === 0;
}

/** Normalize a single destination's `DestinationArn` wire value. */
function normalizeDestinationArn(value: unknown): unknown {
  // Empty map `{}` — preserved exactly (global multi-region case).
  if (isEmptyObject(value)) {
    return {};
  }
  // Region-map form: keep the key structure, normalize each ARN value.
  if (isObject(value) && !('Fn::GetAtt' in value) && !('Ref' in value) && !('Fn::Sub' in value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      out[k] = ARN;
    }
    return out;
  }
  // Single ARN (string, Fn::GetAtt, Ref, Fn::Sub) — collapse to the sentinel.
  return ARN;
}

/**
 * Normalize a listener `Properties` bag so an L2 synth and an example fixture compare equal modulo
 * the generated/ref-vs-literal values noted in the file header.
 */
export function normalizeListenerProps(props: any): any {
  const p = clone(props);

  if (p.ClientRestrictions && Array.isArray(p.ClientRestrictions.Networks)) {
    p.ClientRestrictions.Networks = p.ClientRestrictions.Networks.map(() => CIDR);
  }

  if (Array.isArray(p.Peers)) {
    p.Peers = p.Peers.map((peer: any) => ({ ...peer, PublicKey: KEY }));
  }

  if (Array.isArray(p.Destinations)) {
    p.Destinations = p.Destinations.map((d: any) => {
      const nd = { ...d };
      if ('Role' in nd) {
        nd.Role = { Arn: ROLE };
      }
      if ('DestinationArn' in nd) {
        nd.DestinationArn = normalizeDestinationArn(nd.DestinationArn);
      }
      if ('LogGroupName' in nd) {
        nd.LogGroupName = LOG;
      }
      // Stale keys L2 omits by design.
      delete nd.EnableLogging;
      delete nd.Enabled;
      // An inert empty `Arguments: {}` object: L1's wire mapping emits it when an L2 destination
      // passes an all-undefined arguments bag (e.g. a Lambda destination with no tenant args), while
      // the hand-written examples omit it. It carries no keys, so it is behaviorally identical to
      // omitting the property; drop it on both sides so the diff compares the meaningful config.
      if (isEmptyObject(nd.Arguments)) {
        delete nd.Arguments;
      }
      return nd;
    });
  }

  return p;
}

/**
 * Extract the single listener `Properties` from a synthesized template JSON and normalize it for the
 * golden diff.
 */
export function synthListenerProps(templateJson: any): any {
  return normalizeListenerProps(findResource(templateJson.Resources, LISTENER_TYPE).Properties);
}

/** Normalize an SNS packet-source `Properties` bag (collapse the role ARN, drop stale `Enabled`). */
export function normalizePacketSourceProps(props: any): any {
  const p = clone(props);
  delete p.Enabled;
  if (p.ListenerName !== undefined) {
    p.ListenerName = '<LISTENER>';
  }
  if (p.SnsTopicSource) {
    if ('Role' in p.SnsTopicSource) {
      p.SnsTopicSource.Role = ROLE;
    }
    if ('TopicArn' in p.SnsTopicSource) {
      p.SnsTopicSource.TopicArn = ARN;
    }
  }
  return p;
}

/** Normalize a standalone DestinationArn `Properties` bag (collapse ARN + region + name values). */
export function normalizeDestinationArnProps(props: any): any {
  const p = clone(props);
  if ('Arn' in p) {
    p.Arn = ARN;
  }
  if ('Destination' in p) {
    p.Destination = '<DST>';
  }
  if ('IngressRegionKey' in p) {
    p.IngressRegionKey = '<REGION>';
  }
  return p;
}
