const SECRET_KEYS = new Set([
  "access_token",
  "refresh_token",
  "password",
  "service_role_key",
  "anon_key",
  "api_key",
]);
const DIGIT_RUN = /^\d{8,}$/;
const REDACTED = "[redacted]" as const;
const CIRCULAR = "[circular]" as const;

export interface RedactOptions {
  amountThresholdCents?: number;
}

function normalizeKey(k: string): string {
  // camelCase / PascalCase -> snake_case: insert '_' at lower->upper boundaries
  // then lowercase and convert '-' / whitespace to '_'.
  return k
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[-\s]/g, "_");
}

function walk(input: unknown, opts: RedactOptions, seen: WeakSet<object>): unknown {
  if (input === null || typeof input !== "object") return input;
  if (seen.has(input as object)) return CIRCULAR;
  seen.add(input as object);
  if (Array.isArray(input)) return input.map((x) => walk(x, opts, seen));
  const threshold = opts.amountThresholdCents;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const nk = normalizeKey(k);
    if (SECRET_KEYS.has(nk)) {
      out[k] = REDACTED;
      continue;
    }
    if (typeof v === "string" && DIGIT_RUN.test(v)) {
      out[k] = REDACTED;
      continue;
    }
    if (nk === "amount" && typeof v === "number" && threshold !== undefined && v >= threshold) {
      out[k] = REDACTED;
      continue;
    }
    out[k] = walk(v, opts, seen);
  }
  return out;
}

export function redact(input: unknown, opts: RedactOptions = {}): unknown {
  return walk(input, opts, new WeakSet<object>());
}
