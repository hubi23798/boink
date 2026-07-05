"use client";

import { useState, useMemo } from "react";
import { ForecastChart } from "./forecast-chart";
import { addMonths } from "@/lib/net-worth/forecast";
import type { ForecastPoint } from "@/lib/net-worth/forecast";

export interface GoalForForecast {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
}

interface Props {
  historicalPoints: ForecastPoint[];
  baseMonthlyDelta: number;
  currentNW: number;
  today: string;
  currency: string;
  goals: GoalForForecast[];
  snapshotCount: number;
  earliestDate: string | null;
}

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100);
}

function fmtMonthYear(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IE", { month: "short", year: "numeric" });
}

export function ForecastSection({
  historicalPoints,
  baseMonthlyDelta,
  currentNW,
  today,
  currency,
  goals,
  snapshotCount,
  earliestDate,
}: Props) {
  const [adjustmentEur, setAdjustmentEur] = useState(0);

  const effectiveDelta = baseMonthlyDelta + adjustmentEur * 100;

  const forecastPoints: ForecastPoint[] = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        date: addMonths(today, i + 1),
        netWorth: Math.round(currentNW + effectiveDelta * (i + 1)),
        isForecast: true,
      })),
    [currentNW, effectiveDelta, today],
  );

  const allPoints: ForecastPoint[] = [...historicalPoints, ...forecastPoints];
  const projected12m = forecastPoints[11]!.netWorth;

  const goalCrossings = useMemo(
    () =>
      goals.map((g) => {
        const remaining = g.targetAmount - g.currentAmount;
        if (remaining <= 0) return { ...g, reachDate: null, done: true };
        if (effectiveDelta <= 0) return { ...g, reachDate: null, done: false };
        const monthsLeft = Math.ceil(remaining / effectiveDelta);
        const reachDate = monthsLeft <= 120 ? addMonths(today, monthsLeft) : null;
        return { ...g, reachDate, done: false };
      }),
    [goals, effectiveDelta, today],
  );

  const sliderLabel =
    adjustmentEur === 0
      ? "Current pace"
      : adjustmentEur > 0
        ? `+€${adjustmentEur}/mo extra`
        : `-€${Math.abs(adjustmentEur)}/mo less`;

  return (
    <div className="space-y-4">
      <div className="border-border-subtle space-y-4 rounded-xl border p-4">
        <ForecastChart points={allPoints} currency={currency} />

        {/* Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-fg-muted text-xs">What if I save more each month?</p>
            <p className="text-xs font-medium">{sliderLabel}</p>
          </div>
          <input
            type="range"
            min={-200}
            max={1000}
            step={50}
            value={adjustmentEur}
            onChange={(e) => setAdjustmentEur(Number(e.target.value))}
            className="w-full cursor-pointer accent-current"
          />
          <div className="flex justify-between text-xs opacity-30">
            <span>-€200</span>
            <span>+€1,000</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-fg-muted text-xs">In 12 months</p>
            <p className="font-medium">{fmt(projected12m, currency)}</p>
          </div>
          <div>
            <p className="text-fg-muted text-xs">Monthly growth</p>
            <p
              className={`font-medium ${
                effectiveDelta >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {effectiveDelta >= 0 ? "+" : ""}
              {fmt(effectiveDelta, currency)}/mo
            </p>
          </div>
        </div>
      </div>

      {/* Goal crossings */}
      {goalCrossings.length > 0 && (
        <div className="space-y-1">
          <p className="text-fg-muted px-1 text-xs">Goal timeline</p>
          <div className="divide-border-subtle divide-y rounded-lg border text-sm">
            {goalCrossings.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-3 py-2">
                <span>{g.name}</span>
                <span
                  className={
                    g.done
                      ? "text-xs font-medium text-green-600 dark:text-green-400"
                      : g.reachDate
                        ? "text-xs"
                        : "text-fg-muted text-xs"
                  }
                >
                  {g.done
                    ? "Reached"
                    : g.reachDate
                      ? fmtMonthYear(g.reachDate)
                      : "Not at this rate"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {snapshotCount > 0 && earliestDate && (
        <p className="text-fg-muted text-xs">
          {snapshotCount} daily snapshots · trend from {earliestDate}
        </p>
      )}
    </div>
  );
}
