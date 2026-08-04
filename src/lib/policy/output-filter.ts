import {
  WELFARE_CRISIS_LINE,
  detectRefusalMarker,
  stripRefusalMarkers,
  type RefusalCategory,
} from "./refusals";

export const DISCLAIMER =
  "\n\n---\n*Educational information only — not regulated financial advice. Numbers were computed by the app's deterministic engines.*";

const SAFE_CAPS = new Set([
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
  "AUD",
  "CAD",
  "NZD",
  "ETA",
  "GDP",
  "API",
  "MTD",
  "YTD",
  "ROI",
  "APR",
  "APY",
  "ISA",
  "ETF",
  "LTV",
  "AUM",
  "NAV",
  "FX",
  "ESG",
  "CEO",
  "CFO",
  "CTO",
  "COO",
  "CPO",
  "IMF",
  "ECB",
  "Fed",
  "OECD",
  "WEF",
  "IRS",
  "UK",
  "US",
  "IE",
  "EU",
  "UAE",
  "OK",
  "ID",
  "AI",
  "HR",
  "PR",
  "IT",
  "QA",
]);

const TICKER_RE = /\b[A-Z]{2,5}\b/g;
const TOKEN_LIMIT = 4000;
const ECHO_BACK_MIN_CHARS = 200;

export interface OutputFilterOptions {
  /** Raw user message for echo-back detection. */
  userMessage?: string;
  /** Extra untrusted snippets (e.g. tool payloads / memos). */
  untrustedSnippets?: string[];
}

export interface FilterResult {
  ok: boolean;
  flaggedTicker?: string;
  echoBack?: boolean;
  refusalCategory?: RefusalCategory;
  text?: string;
}

/**
 * Post-LLM output filter:
 * - token length cap
 * - ticker / securities scrub
 * - echo-back protection (>200 chars of untrusted input quoted verbatim)
 * - refusal marker detection + strip
 * - welfare crisis line ensure
 * - disclaimer append
 */
export function applyOutputFilter(text: string, options: OutputFilterOptions = {}): FilterResult {
  const approxTokens = Math.ceil(text.length / 4);
  if (approxTokens > TOKEN_LIMIT) {
    return { ok: false };
  }

  const matches = text.match(TICKER_RE) ?? [];
  for (const match of matches) {
    if (!SAFE_CAPS.has(match)) {
      return { ok: false, flaggedTicker: match };
    }
  }

  const untrusted = [options.userMessage, ...(options.untrustedSnippets ?? [])].filter(
    (s): s is string => typeof s === "string" && s.length >= ECHO_BACK_MIN_CHARS,
  );
  if (detectEchoBack(text, untrusted)) {
    return { ok: false, echoBack: true };
  }

  const refusalCategory = detectRefusalMarker(text);
  let cleaned = stripRefusalMarkers(text);

  if (refusalCategory === "welfare" && !cleaned.includes("116 123")) {
    cleaned = `${cleaned}\n\n${WELFARE_CRISIS_LINE}`;
  }

  return {
    ok: true,
    refusalCategory: refusalCategory ?? undefined,
    text: cleaned + DISCLAIMER,
  };
}

/** True when `response` contains a contiguous ≥200-char substring from any untrusted source. */
export function detectEchoBack(response: string, untrustedSources: string[]): boolean {
  const hay = response.toLowerCase();
  for (const src of untrustedSources) {
    const needle = src.toLowerCase();
    if (needle.length < ECHO_BACK_MIN_CHARS) continue;
    // Sliding window over the source; step by 50 to keep it cheap.
    for (let i = 0; i <= needle.length - ECHO_BACK_MIN_CHARS; i += 50) {
      const slice = needle.slice(i, i + ECHO_BACK_MIN_CHARS);
      if (hay.includes(slice)) return true;
    }
    // Also check the tail window in case step skipped it.
    const tail = needle.slice(-ECHO_BACK_MIN_CHARS);
    if (hay.includes(tail)) return true;
  }
  return false;
}

/**
 * Extract raw text from <user-data>…</user-data> blocks for echo-back checks.
 * Break-out attempts (extra closing tags) are treated as data, not structure.
 */
export function extractUserDataSnippets(text: string): string[] {
  const out: string[] = [];
  const re = /<user-data\b[^>]*>([\s\S]*?)<\/user-data>/gi;
  for (const m of text.matchAll(re)) {
    const inner = (m[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    if (inner) out.push(inner);
  }
  return out;
}
