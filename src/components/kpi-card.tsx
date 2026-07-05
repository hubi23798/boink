import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type KpiDeltaDirection = "up" | "down" | "neutral";
export type KpiVariant = "default" | "hero";

export interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: KpiDeltaDirection;
  icon?: LucideIcon;
  variant?: KpiVariant;
  className?: string;
  /** Optional test id for e2e (e.g. net-worth hero on Home). */
  testId?: string;
}

function DeltaIcon({ direction }: { direction: KpiDeltaDirection }) {
  const props = { className: "h-3 w-3 shrink-0", strokeWidth: 2.2, "aria-hidden": true as const };
  if (direction === "up") return <TrendingUp {...props} />;
  if (direction === "down") return <TrendingDown {...props} />;
  return <Minus {...props} />;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaDirection = "neutral",
  icon: Icon,
  variant = "default",
  className,
  testId,
}: KpiCardProps) {
  const isHero = variant === "hero";

  const deltaColor: Record<KpiDeltaDirection, string> = {
    up: "text-success",
    down: "text-danger",
    neutral: "text-fg-muted",
  };

  return (
    <div
      data-testid={testId}
      className={cn(
        // Surface + radius
        "relative flex flex-col gap-3 bg-card",
        isHero
          ? "rounded-xl border border-gold/40 p-6 shadow-md-glow"
          : "rounded-lg border border-line p-4 shadow-sm",
        // Hover lift (subtle)
        "transition-shadow duration-150",
        isHero ? "" : "hover:border-line-strong",
        className,
      )}
    >
      {/* Header: label + icon */}
      <div className="flex items-start justify-between gap-3">
        <span className="text-caption text-fg-muted">{label}</span>
        {Icon && (
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gold-bg"
            aria-hidden="true"
          >
            <Icon className="h-4 w-4 text-gold" strokeWidth={1.75} />
          </div>
        )}
      </div>

      {/* Value */}
      <p
        className={cn(
          isHero ? "text-display text-gold" : "text-display-sm text-fg-default",
        )}
      >
        {value}
      </p>

      {/* Delta */}
      {delta && (
        <div
          className={cn("flex items-center gap-1 text-[13px] font-semibold", deltaColor[deltaDirection])}
          aria-label={`Change: ${delta}`}
        >
          <DeltaIcon direction={deltaDirection} />
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{children}</div>;
}
