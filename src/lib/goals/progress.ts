export interface GoalProgress {
  currentAmount: number; // cents — how much has been saved/paid off
  progressPct: number; // 0–100, capped at 100
  requiredMonthly: number | null; // null if no target date or already complete
}

function fractionalMonths(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const years = to.getFullYear() - from.getFullYear();
  const months = to.getMonth() - from.getMonth();
  const days = to.getDate() - from.getDate();
  return years * 12 + months + days / 30;
}

export function calculateGoalProgress(
  goal: {
    kind: string;
    targetAmount: number;
    targetDate: string | null;
    initialBalance: number | null;
  },
  linkedAccountBalances: number[],
  today: string,
): GoalProgress {
  const balanceSum = linkedAccountBalances.reduce((s, b) => s + b, 0);

  let currentAmount: number;
  if (goal.kind === "debt_payoff") {
    // Liability balances stored positive (schema convention); progress = debt reduced.
    currentAmount = Math.max(0, (goal.initialBalance ?? 0) - balanceSum);
  } else {
    currentAmount = balanceSum;
  }

  const progressPct =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((currentAmount / goal.targetAmount) * 100))
      : 0;

  let requiredMonthly: number | null = null;
  if (goal.targetDate !== null && progressPct < 100) {
    const rawMonths = fractionalMonths(today, goal.targetDate);
    if (rawMonths > 0) {
      const monthsLeft = Math.max(1, rawMonths);
      const remaining = goal.targetAmount - currentAmount;
      if (remaining > 0) {
        requiredMonthly = Math.ceil(remaining / monthsLeft);
      }
    }
  }

  return { currentAmount, progressPct, requiredMonthly };
}
