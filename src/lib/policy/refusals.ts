import { createHash } from "node:crypto";
import type { Db } from "@/lib/db/client";
import { policyEvent } from "@/lib/db/schema";

export const REFUSAL_CATEGORIES = [
  "securities",
  "tax_evasion",
  "aml",
  "insider",
  "legal",
  "welfare",
  "scam_enablement",
  "cross_tenant",
] as const;

export type RefusalCategory = (typeof REFUSAL_CATEGORIES)[number];

export const WELFARE_CRISIS_LINE =
  "If you are in crisis, please contact Samaritans UK: 116 123 · US: 988.";

/** Marker the model should emit when refusing (stripped before user sees it). */
export const REFUSAL_MARKER_RE =
  /\[REFUSAL:(securities|tax_evasion|aml|insider|legal|welfare|scam_enablement|cross_tenant)\]/i;

export function hashTriggerText(text: string): Buffer {
  return createHash("sha256").update(text, "utf8").digest();
}

export async function logPolicyEvent(
  db: Db,
  params: {
    tenantId: string;
    userId: string;
    conversationId?: string;
    category: RefusalCategory;
    triggerTextHash: Buffer;
    surfacedToObserver: boolean;
  },
): Promise<void> {
  await db.insert(policyEvent).values({
    tenantId: params.tenantId,
    userId: params.userId,
    conversationId: params.conversationId ?? null,
    category: params.category,
    triggerTextHash: params.triggerTextHash,
    surfacedToObserver: params.surfacedToObserver,
  });
}

/** Pull a refusal category from a model response marker, if present. */
export function detectRefusalMarker(text: string): RefusalCategory | null {
  const m = text.match(REFUSAL_MARKER_RE);
  if (!m?.[1]) return null;
  const cat = m[1].toLowerCase() as RefusalCategory;
  return REFUSAL_CATEGORIES.includes(cat) ? cat : null;
}

/** Strip refusal markers from text shown to the user. */
export function stripRefusalMarkers(text: string): string {
  return text
    .replace(new RegExp(REFUSAL_MARKER_RE.source, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Lightweight input-side welfare detector. Conservative — only clear crisis /
 * self-harm language. Owner-only; never surfaced to observers.
 */
export function detectWelfareInUserMessage(text: string): boolean {
  const patterns = [
    /\bkill\s+myself\b/i,
    /\bend\s+my\s+life\b/i,
    /\bsuicid(e|al)\b/i,
    /\bself[-\s]?harm\b/i,
    /\bwant\s+to\s+die\b/i,
    /\bhurt\s+myself\b/i,
  ];
  return patterns.some((re) => re.test(text));
}

/**
 * Heuristic category hints from user text for logging when the model refuses
 * without a marker (best-effort; marker is preferred).
 */
export function inferRefusalCategory(text: string): RefusalCategory | null {
  if (detectWelfareInUserMessage(text)) return "welfare";
  if (
    /\b(launder(?:ing)?|eva(?:de|sion)\s+sanctions?|sanctions?\s+eva(?:de|sion)\w*|structure\s+cash\s+offshore\s+illegally)\b/i.test(
      text,
    )
  ) {
    return "aml";
  }
  if (/\b(evade\s+tax|tax\s+evasion|hide\s+income\s+from\s+(the\s+)?irs|hmrc)\b/i.test(text)) {
    return "tax_evasion";
  }
  if (/\b(insider\s+trading|material\s+non[-\s]?public|mnpi)\b/i.test(text)) {
    return "insider";
  }
  if (/\b(draft\s+(my\s+)?(will|contract|lawsuit)|legal\s+advice\s+on\s+suing)\b/i.test(text)) {
    return "legal";
  }
  if (
    /\b(guaranteed\s+returns?|telegram\s+trader|pig\s+butcher|send\s+crypto\s+to\s+double)\b/i.test(
      text,
    )
  ) {
    return "scam_enablement";
  }
  if (/\b(other\s+tenant|another\s+customer'?s?\s+data|cross[-\s]?tenant)\b/i.test(text)) {
    return "cross_tenant";
  }
  if (/\b(buy|sell|ticker|stock)\s+[A-Z]{2,5}\b/.test(text) || /\bAAPL|TSLA|NVDA\b/.test(text)) {
    return "securities";
  }
  return null;
}

export function welfareResponse(): string {
  return [
    "I'm not able to help with crisis or self-harm topics.",
    WELFARE_CRISIS_LINE,
    "For financial questions unrelated to crisis, I'm here when you're ready.",
  ].join("\n\n");
}
