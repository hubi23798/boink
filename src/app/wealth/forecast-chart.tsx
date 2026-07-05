"use client";

import type { ForecastPoint } from "@/lib/net-worth/forecast";

interface Props {
  points: ForecastPoint[];
  currency?: string;
}

const PAD = { top: 20, right: 20, bottom: 28, left: 60 };
const W = 600;
const H = 180;
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;

function fmtCompact(cents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

function toPath(pts: { x: number; y: number }[]) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

export function ForecastChart({ points, currency = "EUR" }: Props) {
  if (points.length < 2) return null;

  const timestamps = points.map((p) => new Date(p.date).getTime());
  const values = points.map((p) => p.netWorth);

  const minX = Math.min(...timestamps);
  const maxX = Math.max(...timestamps);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const rangeV = maxV - minV || Math.abs(maxV) || 1;
  const pad = rangeV * 0.12;

  const scaleX = (ts: number) => PAD.left + ((ts - minX) / (maxX - minX)) * CW;
  const scaleY = (v: number) => PAD.top + CH - ((v - (minV - pad)) / (rangeV + 2 * pad)) * CH;

  const hist = points.filter((p) => !p.isForecast);
  const fore = points.filter((p) => p.isForecast);
  const joinFrom = hist[hist.length - 1];

  const histCoords = hist.map((p) => ({
    x: scaleX(new Date(p.date).getTime()),
    y: scaleY(p.netWorth),
  }));
  const foreCoords = [joinFrom, ...fore]
    .filter(Boolean)
    .map((p) => ({ x: scaleX(new Date(p!.date).getTime()), y: scaleY(p!.netWorth) }));

  // 3 y-axis ticks
  const yTicks = [minV - pad, (minV - pad + maxV + pad) / 2, maxV + pad];

  // x-axis: show first, middle, last labels
  const xLabelPoints = [
    points[0]!,
    points[Math.floor(points.length / 2)]!,
    points[points.length - 1]!,
  ];

  const todayX = joinFrom ? scaleX(new Date(joinFrom.date).getTime()) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Net worth forecast">
      {/* Grid + Y labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={scaleY(v)}
            y2={scaleY(v)}
            stroke="currentColor"
            strokeOpacity={0.07}
            strokeWidth={1}
          />
          <text
            x={PAD.left - 6}
            y={scaleY(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={9}
            fill="currentColor"
            opacity={0.45}
          >
            {fmtCompact(Math.round(v), currency)}
          </text>
        </g>
      ))}

      {/* Today divider */}
      {todayX !== null && (
        <line
          x1={todayX}
          x2={todayX}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}

      {/* Historical line */}
      {histCoords.length > 1 && (
        <path
          d={toPath(histCoords)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeOpacity={0.75}
        />
      )}

      {/* Forecast line */}
      {foreCoords.length > 1 && (
        <path
          d={toPath(foreCoords)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeOpacity={0.35}
          strokeDasharray="5 4"
        />
      )}

      {/* Today dot */}
      {joinFrom && (
        <circle
          cx={scaleX(new Date(joinFrom.date).getTime())}
          cy={scaleY(joinFrom.netWorth)}
          r={3}
          fill="currentColor"
          opacity={0.7}
        />
      )}

      {/* 12m label */}
      {fore.length > 0 && (
        <text
          x={scaleX(new Date(fore[fore.length - 1]!.date).getTime())}
          y={scaleY(fore[fore.length - 1]!.netWorth) - 7}
          textAnchor="end"
          fontSize={9}
          fill="currentColor"
          opacity={0.5}
        >
          {fmtCompact(fore[fore.length - 1]!.netWorth, currency)}
        </text>
      )}

      {/* X labels */}
      {xLabelPoints.map((p, i) => (
        <text
          key={i}
          x={scaleX(new Date(p.date).getTime())}
          y={H - 4}
          textAnchor={i === 0 ? "start" : i === xLabelPoints.length - 1 ? "end" : "middle"}
          fontSize={9}
          fill="currentColor"
          opacity={0.4}
        >
          {p.date.slice(0, 7)}
        </text>
      ))}
    </svg>
  );
}
