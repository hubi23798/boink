/**
 * Pure heuristics for subscription-trap detection:
 * price hikes, post-trial conversion spikes, and cross-account double billing.
 */

export interface RecurringEntry {
  amountNative: number;
  startedAt: Date;
  accountId?: string;
  transactionId?: string;
}

export interface PriceHikeResult {
  flagged: boolean;
  from: number | null;
  to: number | null;
  percentIncrease: number | null;
}

export interface PostTrialResult {
  flagged: boolean;
  trialAmount: number | null;
  firstFullAmount: number | null;
  gapDays: number | null;
}

export interface DoubleBillingResult {
  flagged: boolean;
  txAId: string | null;
  txBId: string | null;
  accountA: string | null;
  accountB: string | null;
}

const DAY_MS = 86_400_000;

function medianAbs(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].map(Math.abs).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / DAY_MS;
}

/**
 * Fire if latest amount > 1.15× median of prior charges in the last 6 months.
 * `history` should be chronological; the last entry is the candidate charge.
 */
export function priceHikeDetect(history: RecurringEntry[]): PriceHikeResult {
  if (history.length < 2) {
    return { flagged: false, from: null, to: null, percentIncrease: null };
  }
  const sorted = [...history].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const latest = sorted[sorted.length - 1]!;
  const windowStart = new Date(latest.startedAt.getTime() - 183 * DAY_MS);
  const prior = sorted
    .slice(0, -1)
    .filter((e) => e.startedAt.getTime() >= windowStart.getTime());
  if (prior.length === 0) {
    return { flagged: false, from: null, to: null, percentIncrease: null };
  }
  const from = medianAbs(prior.map((e) => e.amountNative));
  const to = Math.abs(latest.amountNative);
  if (from === null || from === 0) {
    return { flagged: false, from, to, percentIncrease: null };
  }
  const ratio = to / from;
  const percentIncrease = (ratio - 1) * 100;
  return {
    flagged: ratio > 1.15,
    from,
    to,
    percentIncrease,
  };
}

/**
 * Fire if first charge ≥ 3× preceding charge AND gap ≤ 35 days
 * (classic free/cheap trial → full price conversion).
 */
export function postTrialConversion(history: RecurringEntry[]): PostTrialResult {
  if (history.length < 2) {
    return { flagged: false, trialAmount: null, firstFullAmount: null, gapDays: null };
  }
  const sorted = [...history].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  // Look at the most recent pair.
  const prev = sorted[sorted.length - 2]!;
  const latest = sorted[sorted.length - 1]!;
  const trialAmount = Math.abs(prev.amountNative);
  const firstFullAmount = Math.abs(latest.amountNative);
  const gapDays = daysBetween(prev.startedAt, latest.startedAt);
  if (trialAmount === 0) {
    return { flagged: false, trialAmount, firstFullAmount, gapDays };
  }
  const flagged = firstFullAmount >= 3 * trialAmount && gapDays <= 35;
  return { flagged, trialAmount, firstFullAmount, gapDays };
}

/**
 * Fire if same merchant + same amount within 7 days across different accounts.
 * `txA` is the candidate; `candidates` are other tenant transactions with the
 * same normalized merchant description.
 */
export function doubleBilling(
  txA: {
    id: string;
    accountId: string;
    amountNative: number;
    startedAt: Date;
  },
  candidates: {
    id: string;
    accountId: string;
    amountNative: number;
    startedAt: Date;
  }[],
): DoubleBillingResult {
  const absA = Math.abs(txA.amountNative);
  for (const other of candidates) {
    if (other.id === txA.id) continue;
    if (other.accountId === txA.accountId) continue;
    if (Math.abs(other.amountNative) !== absA) continue;
    if (daysBetween(txA.startedAt, other.startedAt) > 7) continue;
    return {
      flagged: true,
      txAId: txA.id,
      txBId: other.id,
      accountA: txA.accountId,
      accountB: other.accountId,
    };
  }
  return {
    flagged: false,
    txAId: null,
    txBId: null,
    accountA: null,
    accountB: null,
  };
}
