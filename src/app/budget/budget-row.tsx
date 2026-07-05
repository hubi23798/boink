"use client";

import { useState, useRef } from "react";
import { computeBudgetStatus } from "@/lib/budget/compute";

interface BudgetRowProps {
  categoryId: string;
  categoryName: string;
  initialTarget: number | null;
  actual: number;
  currency: string;
}

function fmt(minor: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minor / 100);
}

const STATUS_LABEL: Record<string, string> = {
  no_target: "No target",
  on_track: "On track",
  getting_close: "Getting close",
  over_budget: "Over budget",
};

const STATUS_CLASS: Record<string, string> = {
  no_target: "text-fg-muted",
  on_track: "text-green-600 dark:text-green-400",
  getting_close: "text-warning",
  over_budget: "text-red-600 dark:text-red-400",
};

const BAR_CLASS: Record<string, string> = {
  on_track: "bg-green-500",
  getting_close: "bg-amber-400",
  over_budget: "bg-red-500",
  no_target: "bg-fg-muted",
};

export function BudgetRow({
  categoryId,
  categoryName,
  initialTarget,
  actual,
  currency,
}: BudgetRowProps) {
  const [target, setTarget] = useState<number | null>(initialTarget);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const committingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { status, ratio } = computeBudgetStatus(actual, target);

  function startEdit() {
    setInputValue(target !== null ? String(target / 100) : "");
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function commitEdit() {
    if (committingRef.current) return;
    committingRef.current = true;
    const major = parseFloat(inputValue);
    if (isNaN(major) || major <= 0) {
      setEditing(false);
      committingRef.current = false;
      return;
    }
    const minor = Math.round(major * 100);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget-targets/${categoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMonthly: minor }),
      });
      if (!res.ok) {
        setError("Failed to save");
        return;
      }
      const data = (await res.json()) as { amountMonthly: number };
      setTarget(data.amountMonthly);
    } catch {
      setError("Failed to save");
    } finally {
      committingRef.current = false;
      setSaving(false);
      setEditing(false);
    }
  }

  async function removeTarget() {
    setSaving(true);
    try {
      const res = await fetch(`/api/budget-targets/${categoryId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Failed to remove");
        return;
      }
      setTarget(null);
    } catch {
      setError("Failed to remove");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  const hasTarget = target !== null;
  const pct = ratio !== null ? Math.min(ratio * 100, 100) : 0;

  return (
    <div className={`flex flex-col gap-1 px-4 py-3 ${!hasTarget ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        {/* Name */}
        <span className="min-w-0 flex-1 truncate">{categoryName}</span>

        {/* Amounts + edit trigger */}
        <div className="flex shrink-0 items-center gap-2 text-right">
          {editing ? (
            <div className="flex items-center gap-1">
              <span className="text-fg-muted text-xs">{fmt(actual, currency)} /</span>
              <input
                ref={inputRef}
                type="number"
                min="0.01"
                step="0.01"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                onBlur={() => void commitEdit()}
                className="border-border-subtle bg-surface focus:ring-fg-muted w-24 rounded border px-2 py-0.5 text-right text-sm focus:ring-1 focus:outline-none"
                disabled={saving}
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  void removeTarget();
                }}
                className="text-fg-muted ml-1 text-xs hover:text-red-500"
                title="Remove target"
                disabled={saving}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              className="hover:text-fg-default text-sm tabular-nums"
              title="Click to set or edit target"
            >
              {hasTarget ? (
                <span>
                  <span className="text-fg-muted">{fmt(actual, currency)}</span>
                  {" / "}
                  <span className="font-medium">{fmt(target, currency)}</span>
                </span>
              ) : (
                <span className="text-fg-muted">
                  {fmt(actual, currency)}{" "}
                  <span className="text-xs underline decoration-dashed">Set target</span>
                </span>
              )}
            </button>
          )}

          {/* Status pill */}
          <span className={`w-24 text-right text-xs tabular-nums ${STATUS_CLASS[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      {/* Progress bar — only when target is set */}
      {hasTarget && !editing && (
        <div className="bg-border-subtle h-1 w-full overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full transition-all ${BAR_CLASS[status]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
