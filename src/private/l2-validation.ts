// Internal L2 validators. NOT exported from the package public API. They enforce the value-domain
// invariants the service checks, and are skipped for unresolved CDK tokens (cross-stack imports,
// generated values) to avoid false failures — matching standard CDK practice.
//
// =============================================================================================
// Arguments intentionally NOT surfaced by L2
// =============================================================================================
// The DynamoDB key-template arguments are deliberately omitted from the L2 API so a config can
// never be rejected at deploy or silently do nothing:
//
// - DynamoDB custom partition/sort key templates: the service does not currently accept these as
//   listener arguments, so emitting them would be rejected. A DynamoDB destination therefore uses
//   the service's default key handling today. They can be surfaced if the service accepts them.
// =============================================================================================

import { Token } from 'aws-cdk-lib';

/** base64 32-byte key, e.g. a `ServerSecret` or WireGuard key (`Base64KeyValueMatchRegex`). */
const BASE64_KEY_REGEX = /^[A-Za-z0-9+/]{43}=$/;

/** A syntactically valid AWS region, or `*` for the fallback entry. */
const REGION_MAP_KEY_REGEX = /^[a-z]{2}-[a-z]+-\d$/;

/** Inclusive bounds for `EarlyDataWindowSeconds`. */
const EARLY_DATA_WINDOW_MIN = 1;
const EARLY_DATA_WINDOW_MAX = 604800;

/**
 * Whether a value is an unresolved CDK token. Thin wrapper over `Token.isUnresolved` so callers do
 * not import the core directly for the common "skip literal checks on tokens" guard.
 */
export function isUnresolved(value: unknown): boolean {
  return Token.isUnresolved(value);
}

/**
 * Validate that `value` is a base64-encoded 32-byte key (`^[A-Za-z0-9+/]{43}=$`). Skipped when the
 * value is an unresolved token. `label` is used verbatim in the thrown error for a clear message.
 */
export function validateBase64Key(value: string, label: string): void {
  if (isUnresolved(value)) {
    return;
  }
  if (!BASE64_KEY_REGEX.test(value)) {
    throw new Error(
      `${label} must be a base64-encoded 32-byte value matching ^[A-Za-z0-9+/]{43}=$ ` +
        `(got '${value}').`,
    );
  }
}

/**
 * Validate a region-map key: either `*` (fallback) or a syntactically valid AWS region
 * (`^[a-z]{2}-[a-z]+-\d$`). Does NOT check that the key equals the ARN's region — the service does
 * not require them to match. Skipped when the key is an unresolved token.
 */
export function validateRegionMapKey(key: string): void {
  if (isUnresolved(key)) {
    return;
  }
  if (key !== '*' && !REGION_MAP_KEY_REGEX.test(key)) {
    throw new Error(
      `Region-map key '${key}' is invalid; it must be '*' or a valid AWS region ` +
        'matching ^[a-z]{2}-[a-z]+-\\d$.',
    );
  }
}

/**
 * Validate that `EarlyDataWindowSeconds` is an integer in 1..604800. Skipped when the value is an
 * unresolved token. `label` is used verbatim in the thrown error for a clear message.
 */
export function validateEarlyDataWindow(value: number, label: string): void {
  if (isUnresolved(value)) {
    return;
  }
  if (!Number.isInteger(value) || value < EARLY_DATA_WINDOW_MIN || value > EARLY_DATA_WINDOW_MAX) {
    throw new Error(
      `${label} must be an integer between ${EARLY_DATA_WINDOW_MIN} and ${EARLY_DATA_WINDOW_MAX} ` +
        `(got ${value}).`,
    );
  }
}
