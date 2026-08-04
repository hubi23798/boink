import { describe, expect, it } from "vitest";
import { evaluateSubscriptionTrap } from "@/lib/fraud/subscription-trap/detector";
import {
  doubleBilling,
  postTrialConversion,
  priceHikeDetect,
  type RecurringEntry,
} from "@/lib/fraud/subscription-trap/heuristics";

function daysAgo(n: number, base = new Date("2026-08-01T12:00:00Z")): Date {
  return new Date(base.getTime() - n * 86_400_000);
}

function entry(
  amount: number,
  startedAt: Date,
  extras: Partial<RecurringEntry> = {},
): RecurringEntry {
  return { amountNative: amount, startedAt, ...extras };
}

describe("priceHikeDetect", () => {
  it("flags when latest > 1.15× median of prior 6 months", () => {
    const history = [
      entry(-1000, daysAgo(150)),
      entry(-1000, daysAgo(120)),
      entry(-1000, daysAgo(90)),
      entry(-1000, daysAgo(60)),
      entry(-1000, daysAgo(30)),
      entry(-1300, daysAgo(0)),
    ];
    const r = priceHikeDetect(history);
    expect(r.flagged).toBe(true);
    expect(r.from).toBe(1000);
    expect(r.to).toBe(1300);
    expect(r.percentIncrease).toBeCloseTo(30, 5);
  });

  it("does not flag a modest increase under 15%", () => {
    const history = [
      entry(-1000, daysAgo(60)),
      entry(-1000, daysAgo(30)),
      entry(-1100, daysAgo(0)),
    ];
    expect(priceHikeDetect(history).flagged).toBe(false);
  });

  it("needs at least two charges", () => {
    expect(priceHikeDetect([entry(-1000, daysAgo(0))]).flagged).toBe(false);
  });
});

describe("postTrialConversion", () => {
  it("flags trial → full price within 35 days at ≥3×", () => {
    const r = postTrialConversion([entry(-100, daysAgo(20)), entry(-1500, daysAgo(0))]);
    expect(r.flagged).toBe(true);
    expect(r.trialAmount).toBe(100);
    expect(r.firstFullAmount).toBe(1500);
    expect(r.gapDays).toBeLessThanOrEqual(35);
  });

  it("does not flag when gap > 35 days", () => {
    expect(postTrialConversion([entry(-100, daysAgo(60)), entry(-1500, daysAgo(0))]).flagged).toBe(
      false,
    );
  });

  it("does not flag when increase is under 3×", () => {
    expect(postTrialConversion([entry(-1000, daysAgo(10)), entry(-2000, daysAgo(0))]).flagged).toBe(
      false,
    );
  });
});

describe("doubleBilling", () => {
  it("flags same amount within 7 days on different accounts", () => {
    const r = doubleBilling(
      {
        id: "a",
        accountId: "acct-1",
        amountNative: -1999,
        startedAt: daysAgo(1),
      },
      [
        {
          id: "b",
          accountId: "acct-2",
          amountNative: -1999,
          startedAt: daysAgo(3),
        },
      ],
    );
    expect(r.flagged).toBe(true);
    expect(r.txAId).toBe("a");
    expect(r.txBId).toBe("b");
  });

  it("does not flag same account", () => {
    expect(
      doubleBilling({ id: "a", accountId: "acct-1", amountNative: -1999, startedAt: daysAgo(1) }, [
        { id: "b", accountId: "acct-1", amountNative: -1999, startedAt: daysAgo(2) },
      ]).flagged,
    ).toBe(false);
  });

  it("does not flag outside 7-day window", () => {
    expect(
      doubleBilling({ id: "a", accountId: "acct-1", amountNative: -1999, startedAt: daysAgo(0) }, [
        { id: "b", accountId: "acct-2", amountNative: -1999, startedAt: daysAgo(10) },
      ]).flagged,
    ).toBe(false);
  });

  it("does not flag different amounts", () => {
    expect(
      doubleBilling({ id: "a", accountId: "acct-1", amountNative: -1999, startedAt: daysAgo(1) }, [
        { id: "b", accountId: "acct-2", amountNative: -2999, startedAt: daysAgo(2) },
      ]).flagged,
    ).toBe(false);
  });
});

describe("evaluateSubscriptionTrap", () => {
  it("price hike alone → warn (under 50%)", () => {
    const draft = evaluateSubscriptionTrap(
      {
        id: "tx-new",
        accountId: "acct-1",
        amountNative: -1300,
        descriptionRaw: "NETFLIX.COM",
        startedAt: daysAgo(0),
      },
      [
        {
          id: "1",
          accountId: "acct-1",
          amountNative: -1000,
          startedAt: daysAgo(120),
          descriptionRaw: "NETFLIX.COM",
        },
        {
          id: "2",
          accountId: "acct-1",
          amountNative: -1000,
          startedAt: daysAgo(90),
          descriptionRaw: "NETFLIX.COM",
        },
        {
          id: "3",
          accountId: "acct-1",
          amountNative: -1000,
          startedAt: daysAgo(60),
          descriptionRaw: "NETFLIX.COM",
        },
        {
          id: "4",
          accountId: "acct-1",
          amountNative: -1000,
          startedAt: daysAgo(30),
          descriptionRaw: "NETFLIX.COM",
        },
      ],
    );
    expect(draft).not.toBeNull();
    expect(draft!.severity).toBe("warn");
    expect(draft!.evidence.priceHike).toMatchObject({ from: 1000, to: 1300 });
  });

  it("extreme price hike (≥50%) → high", () => {
    const draft = evaluateSubscriptionTrap(
      {
        id: "tx-new",
        accountId: "acct-1",
        amountNative: -2000,
        descriptionRaw: "SPOTIFY",
        startedAt: daysAgo(0),
      },
      [
        {
          id: "1",
          accountId: "acct-1",
          amountNative: -1000,
          startedAt: daysAgo(60),
          descriptionRaw: "SPOTIFY",
        },
        {
          id: "2",
          accountId: "acct-1",
          amountNative: -1000,
          startedAt: daysAgo(30),
          descriptionRaw: "SPOTIFY",
        },
      ],
    );
    expect(draft!.severity).toBe("high");
  });

  it("post-trial conversion → high", () => {
    const draft = evaluateSubscriptionTrap(
      {
        id: "tx-full",
        accountId: "acct-1",
        amountNative: -2999,
        descriptionRaw: "ADOBE TRIAL",
        startedAt: daysAgo(0),
      },
      [
        {
          id: "trial",
          accountId: "acct-1",
          amountNative: -100,
          startedAt: daysAgo(14),
          descriptionRaw: "ADOBE TRIAL",
        },
      ],
    );
    expect(draft!.severity).toBe("high");
    expect(draft!.evidence.postTrial).toMatchObject({
      trialAmount: 100,
      firstFullAmount: 2999,
    });
  });

  it("double billing alone → warn", () => {
    const draft = evaluateSubscriptionTrap(
      {
        id: "tx-a",
        accountId: "acct-1",
        amountNative: -1999,
        descriptionRaw: "ICLOUD+",
        startedAt: daysAgo(1),
      },
      [
        {
          id: "tx-b",
          accountId: "acct-2",
          amountNative: -1999,
          startedAt: daysAgo(2),
          descriptionRaw: "ICLOUD+",
        },
      ],
    );
    expect(draft).not.toBeNull();
    expect(draft!.severity).toBe("warn");
    expect(draft!.evidence.doubleBilling).toMatchObject({
      txAId: "tx-a",
      txBId: "tx-b",
    });
  });

  it("stable subscription → no signal", () => {
    const draft = evaluateSubscriptionTrap(
      {
        id: "tx-new",
        accountId: "acct-1",
        amountNative: -999,
        descriptionRaw: "GITHUB",
        startedAt: daysAgo(0),
      },
      [
        {
          id: "1",
          accountId: "acct-1",
          amountNative: -999,
          startedAt: daysAgo(90),
          descriptionRaw: "GITHUB",
        },
        {
          id: "2",
          accountId: "acct-1",
          amountNative: -999,
          startedAt: daysAgo(60),
          descriptionRaw: "GITHUB",
        },
        {
          id: "3",
          accountId: "acct-1",
          amountNative: -999,
          startedAt: daysAgo(30),
          descriptionRaw: "GITHUB",
        },
      ],
    );
    expect(draft).toBeNull();
  });

  it("ignores inflows", () => {
    expect(
      evaluateSubscriptionTrap(
        {
          id: "in",
          accountId: "acct-1",
          amountNative: 999,
          descriptionRaw: "REFUND",
          startedAt: daysAgo(0),
        },
        [],
      ),
    ).toBeNull();
  });
});
