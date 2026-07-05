import type { NetWorthPoint } from "./engine";

export interface ForecastPoint {
  date: string;
  netWorth: number;
  isForecast: boolean;
}

export interface ForecastResult {
  historicalPoints: ForecastPoint[];
  monthlyDelta: number;
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Pure: generate 12 monthly forecast points from a base NW and monthly delta (cents). */
export function generateForecastPoints(
  currentNW: number,
  monthlyDelta: number,
  today: string,
  months = 12,
): ForecastPoint[] {
  return Array.from({ length: months }, (_, i) => ({
    date: addMonths(today, i + 1),
    netWorth: Math.round(currentNW + monthlyDelta * (i + 1)),
    isForecast: true,
  }));
}

/** Computes the average monthly delta from the history window. */
export function buildForecast(history: NetWorthPoint[], _today: string): ForecastResult {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const historicalPoints: ForecastPoint[] = sorted.map((p) => ({ ...p, isForecast: false }));

  if (sorted.length < 2) {
    return { historicalPoints, monthlyDelta: 0 };
  }

  const earliest = sorted[0]!;
  const latest = sorted[sorted.length - 1]!;
  const daySpan =
    (new Date(latest.date).getTime() - new Date(earliest.date).getTime()) / 86_400_000;
  const monthlyDelta = daySpan > 0 ? ((latest.netWorth - earliest.netWorth) / daySpan) * 30 : 0;

  return { historicalPoints, monthlyDelta: Math.round(monthlyDelta) };
}
