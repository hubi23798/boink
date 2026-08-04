/**
 * Pure heuristics for vendor Business Email Compromise (BEC) detection.
 *
 * All memo / description inputs are treated as untrusted data. Scans are
 * regex/keyword only — never interpreted as instructions (prompt-injection safe).
 */

/** First payment to a never-seen payee is anomalous above this absolute outflow (minor units). */
export const FIRST_PAYMENT_ANOMALY_THRESHOLD = 50_000; // £500 / €500 / $500

export interface AnomalyResult {
  flagged: boolean;
  /** |amount| / median, or null when no comparable history and below first-payment threshold. */
  ratio: number | null;
  median: number | null;
}

export interface UrgencyScanResult {
  flagged: boolean;
  matchedTerms: string[];
}

const URGENCY_PATTERNS: { term: string; re: RegExp }[] = [
  { term: "urgent", re: /\burgent\b/i },
  { term: "asap", re: /\basap\b/i },
  { term: "immediately", re: /\bimmediately\b/i },
  { term: "wire today", re: /\bwire\s+today\b/i },
  { term: "payment due now", re: /\bpayment\s+due\s+now\b/i },
  { term: "act now", re: /\bact\s+now\b/i },
  { term: "same day", re: /\bsame[\s-]?day\b/i },
  { term: "time sensitive", re: /\btime[\s-]?sensitive\b/i },
  { term: "do not delay", re: /\bdo\s+not\s+delay\b/i },
  { term: "account change", re: /\baccount\s+chang(?:e|ed|ing)\b/i },
  { term: "new bank details", re: /\bnew\s+bank\s+details\b/i },
  { term: "updated payment details", re: /\bupdated\s+payment\s+details\b/i },
];

/** Normalize a payee / description for history comparison. */
export function normalizePayee(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stable merchant key for history matching. Strips urgency phrases, address
 * candidates, and common prompt-injection boilerplate so memo noise does not
 * make a known payee look new.
 */
export function extractPayeeKey(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = raw;
  for (const { re } of URGENCY_PATTERNS) {
    text = text.replace(re, " ");
  }
  // Drop street-address candidates before normalizing.
  text = text.replace(
    /\b\d{1,5}\s+[a-z0-9][a-z0-9\s]{2,40}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|blvd|boulevard|court|ct)\b/gi,
    " ",
  );
  // Drop common injection / instruction boilerplate (data-only hygiene).
  text = text.replace(
    /\b(ignore\s+(all\s+)?(previous|prior|all)\s+(instructions?|rules?)|you\s+are\s+now\s+in\s+admin\s+mode|mark\s+(this\s+)?(transaction\s+)?safe|system\s*:\s*approve\s+all)\b/gi,
    " ",
  );
  return normalizePayee(text);
}

/**
 * True when this payee has never appeared in the tenant's prior history.
 * Empty / blank payee names are treated as unknown (not new) to avoid noise.
 * History entries may be raw descriptions — they are keyed via extractPayeeKey.
 * Prefix match tolerates leftover memo tokens after noise stripping.
 */
export function isNewPayee(payeeName: string, tenantHistory: string[]): boolean {
  const needle = extractPayeeKey(payeeName);
  if (!needle) return false;
  const seen = [...new Set(tenantHistory.map(extractPayeeKey).filter(Boolean))];
  return !seen.some(
    (h) => h === needle || needle.startsWith(`${h} `) || h.startsWith(`${needle} `),
  );
}

function medianAbs(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].map(Math.abs).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Amount anomaly vs prior payments to the same vendor.
 * - With history: flag when |amount| ≥ 2× median of prior |amounts|.
 * - Without history: flag first payments at/above FIRST_PAYMENT_ANOMALY_THRESHOLD.
 */
export function amountAnomaly(amount: number, vendorHistory: number[]): AnomalyResult {
  const absAmount = Math.abs(amount);
  if (vendorHistory.length === 0) {
    const flagged = absAmount >= FIRST_PAYMENT_ANOMALY_THRESHOLD;
    return {
      flagged,
      ratio: flagged ? null : null,
      median: null,
    };
  }
  const median = medianAbs(vendorHistory);
  if (median === null || median === 0) {
    return { flagged: false, ratio: null, median };
  }
  const ratio = absAmount / median;
  return { flagged: ratio >= 2, ratio, median };
}

/**
 * Keyword urgency scan. Memo is treated as opaque data — injection strings are
 * ignored unless they literally contain an urgency term.
 */
export function urgencyLanguageScan(memo: string): UrgencyScanResult {
  // Conceptual <user-data> boundary: we only regex-match; never eval / follow text.
  const matchedTerms: string[] = [];
  for (const { term, re } of URGENCY_PATTERNS) {
    if (re.test(memo)) matchedTerms.push(term);
  }
  return { flagged: matchedTerms.length > 0, matchedTerms };
}

/**
 * Crude address mismatch: when a known vendor address exists and the memo
 * contains a different street-number + street-name pattern.
 * Returns false when no known address is available (no false positives).
 */
export function addressMismatch(memoText: string, knownVendorAddress: string | null): boolean {
  if (!knownVendorAddress) return false;
  const known = normalizeAddress(knownVendorAddress);
  if (!known) return false;

  const memoAddrs = extractAddressCandidates(memoText);
  if (memoAddrs.length === 0) return false;

  // Mismatch if memo asserts an address and none match the known one.
  return !memoAddrs.some((a) => a === known || a.includes(known) || known.includes(a));
}

function normalizeAddress(raw: string): string {
  return raw.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
}

/** Pull simple "123 Main St" style candidates from free text. */
function extractAddressCandidates(text: string): string[] {
  const re =
    /\b(\d{1,5}\s+[a-z0-9][a-z0-9\s]{2,40}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|blvd|boulevard|court|ct))\b/gi;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    out.push(normalizeAddress(m[1] ?? ""));
  }
  return out.filter(Boolean);
}
