/**
 * Internal wire-mapping helpers.
 *
 * These are NOT exported from the package's public API. They centralize the single L1 invariant:
 * convert idiomatic camelCase CDK props into the exact PascalCase CloudFormation wire keys the
 * Proxylity UDP Gateway service reads.
 *
 * Native `boolean`/`number` values are passed through unchanged. CloudFormation stringifies custom
 * resource property values on the wire and the service parses the stringified booleans/numbers
 * back, so no manual pre-stringify is required (and the example templates emit
 * `MetricsEnabled: true`, `Batching.Count: 1000` as native JSON).
 */

/**
 * Build a wire object from `[wireKey, value]` entries, dropping any entry whose value is
 * `undefined`. Null and empty-object/array values are preserved (they are meaningful on the wire,
 * e.g. an explicit empty `DestinationArn: {}`).
 */
export function wireObject(entries: Array<[string, unknown]>): { [key: string]: unknown } {
  const out: { [key: string]: unknown } = {};
  for (const [key, value] of entries) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}
