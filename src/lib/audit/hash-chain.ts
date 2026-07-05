import { createHash } from "node:crypto";

const HASH_BYTES = 32;
const DOMAIN_SEPARATOR = "truffe.audit.v1\n";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };

function assertHash(buf: Buffer, label: string): void {
  if (buf.length !== HASH_BYTES) {
    throw new Error(`${label} must be ${HASH_BYTES} bytes (got ${buf.length})`);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalize: non-finite numbers are not permitted");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "undefined") {
    throw new Error("canonicalize: undefined is not permitted");
  }
  if (typeof value === "bigint") {
    throw new Error("canonicalize: bigint is not permitted");
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (!isPlainObject(value)) {
    throw new Error(
      "canonicalize: only plain objects are permitted (no Date/Map/Set/class instances)",
    );
  }
  const entries = Object.entries(value);
  for (const [, v] of entries) {
    if (typeof v === "undefined") {
      throw new Error("canonicalize: undefined object values are not permitted");
    }
  }
  // RFC 8785 (JCS): sort by UTF-16 code units, NOT locale-aware.
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

export function computeHash(prevHash: Buffer, payload: unknown): Buffer {
  assertHash(prevHash, "prevHash");
  const h = createHash("sha256");
  h.update(DOMAIN_SEPARATOR);
  h.update(prevHash);
  h.update(canonicalize(payload));
  return h.digest();
}

export interface ChainRow {
  prevHash: Buffer;
  thisHash: Buffer;
  payload: unknown;
}

export const GENESIS_HASH: Buffer = Buffer.alloc(HASH_BYTES, 0);

export type VerifyResult = { valid: true; brokenAt: null } | { valid: false; brokenAt: number };

export function verifyChain(rows: ChainRow[], genesis: Buffer = GENESIS_HASH): VerifyResult {
  assertHash(genesis, "genesis");
  for (const [i, row] of rows.entries()) {
    assertHash(row.prevHash, `rows[${i}].prevHash`);
    assertHash(row.thisHash, `rows[${i}].thisHash`);
    const expectedPrev = i === 0 ? genesis : rows[i - 1]!.thisHash;
    if (!row.prevHash.equals(expectedPrev)) return { valid: false, brokenAt: i };
    const expectedThis = computeHash(row.prevHash, row.payload);
    if (!expectedThis.equals(row.thisHash)) return { valid: false, brokenAt: i };
  }
  return { valid: true, brokenAt: null };
}
