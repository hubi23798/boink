import { describe, it, expect } from "vitest";
import { calculateGoalProgress } from "@/lib/goals/progress";

const TODAY = "2026-05-21";

describe("calculateGoalProgress", () => {
  it("cash_target: sums linked account balances for currentAmount", () => {
    const result = calculateGoalProgress(
      { kind: "cash_target", targetAmount: 1_000_000, targetDate: null, initialBalance: null },
      [300_000, 200_000],
      TODAY,
    );
    expect(result.currentAmount).toBe(500_000);
    expect(result.progressPct).toBe(50);
    expect(result.requiredMonthly).toBeNull();
  });

  it("debt_payoff: progress equals initialBalance minus current liability balance", () => {
    const result = calculateGoalProgress(
      { kind: "debt_payoff", targetAmount: 500_000, targetDate: null, initialBalance: 500_000 },
      [300_000], // current liability balance (stored positive per schema convention)
      TODAY,
    );
    expect(result.currentAmount).toBe(200_000); // 200k paid off
    expect(result.progressPct).toBe(40);
  });

  it("progressPct is capped at 100 when account balance exceeds target", () => {
    const result = calculateGoalProgress(
      { kind: "cash_target", targetAmount: 100_000, targetDate: null, initialBalance: null },
      [150_000],
      TODAY,
    );
    expect(result.progressPct).toBe(100);
  });

  it("requiredMonthly is computed when targetDate is set and goal not complete", () => {
    // TODAY = 2026-05-21, targetDate = 2026-11-21 => ~6 months
    const result = calculateGoalProgress(
      {
        kind: "cash_target",
        targetAmount: 600_000,
        targetDate: "2026-11-21",
        initialBalance: null,
      },
      [0],
      TODAY,
    );
    expect(result.requiredMonthly).not.toBeNull();
    expect(result.requiredMonthly).toBe(100_000); // 600_000 / 6 months
  });

  it("requiredMonthly is null when no targetDate is set", () => {
    const result = calculateGoalProgress(
      { kind: "cash_target", targetAmount: 100_000, targetDate: null, initialBalance: null },
      [50_000],
      TODAY,
    );
    expect(result.requiredMonthly).toBeNull();
  });

  it("requiredMonthly is null when goal is already at 100%", () => {
    const result = calculateGoalProgress(
      {
        kind: "cash_target",
        targetAmount: 100_000,
        targetDate: "2026-12-01",
        initialBalance: null,
      },
      [100_000],
      TODAY,
    );
    expect(result.requiredMonthly).toBeNull();
  });
});
