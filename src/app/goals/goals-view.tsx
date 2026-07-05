"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { SerializedGoal, AccountOption } from "./page";
import type { GoalProgress } from "@/lib/goals/progress";
import type { Goal } from "@/lib/db/schema";

type GoalKind = Goal["kind"];

interface GoalsViewProps {
  goals: SerializedGoal[];
  accounts: AccountOption[];
  currency: string;
}

interface FormState {
  name: string;
  kind: GoalKind;
  amount: string;
  targetDate: string;
  linkedAccountIds: string[];
}

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100);
}

function kindLabel(kind: GoalKind) {
  return {
    cash_target: "Cash Target",
    emergency_fund: "Emergency Fund",
    debt_payoff: "Debt Payoff",
    portfolio_target: "Portfolio Target",
  }[kind];
}

function kindBadgeClass(kind: GoalKind) {
  if (kind === "cash_target" || kind === "emergency_fund") {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }
  if (kind === "portfolio_target") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  }
  // debt_payoff
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
}

function progressBarClass(kind: GoalKind) {
  if (kind === "cash_target" || kind === "emergency_fund") {
    return "bg-green-500";
  }
  if (kind === "portfolio_target") {
    return "bg-blue-500";
  }
  return "bg-red-500";
}

const KIND_DESCRIPTIONS: Record<GoalKind, string> = {
  cash_target: "Save toward a specific amount",
  emergency_fund: "3–6 months of expenses as a safety net",
  debt_payoff: "Track paying down a debt",
  portfolio_target: "Build an investment portfolio",
};

function defaultForm(): FormState {
  return {
    name: "",
    kind: "cash_target",
    amount: "",
    targetDate: "",
    linkedAccountIds: [],
  };
}

function formFromGoal(g: SerializedGoal): FormState {
  return {
    name: g.name,
    kind: g.kind,
    amount: String(g.targetAmount / 100),
    targetDate: g.targetDate ?? "",
    linkedAccountIds: g.linkedAccountIds,
  };
}

interface GoalCardProps {
  goal: SerializedGoal;
  currency: string;
  isExpanded: boolean;
  accounts: AccountOption[];
  form: FormState;
  saving: boolean;
  formError: string | null;
  onEdit: () => void;
  onArchive: () => void;
  onFormChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
}

function GoalCard({
  goal,
  currency,
  isExpanded,
  accounts,
  form,
  saving,
  formError,
  onEdit,
  onArchive,
  onFormChange,
  onSave,
  onCancel,
}: GoalCardProps) {
  const { progress } = goal;
  const verbLabel = goal.kind === "debt_payoff" ? "paid" : "saved";

  return (
    <div className="border-border-subtle bg-surface space-y-3 rounded border p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-fg-default truncate font-medium">{goal.name}</span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${kindBadgeClass(goal.kind)}`}
          >
            {kindLabel(goal.kind)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onEdit}
            className="text-fg-muted hover:text-fg-default text-xs"
            title="Edit"
          >
            ✏
          </button>
          <button
            onClick={onArchive}
            className="text-fg-muted hover:text-fg-default text-xs"
            title="Archive"
          >
            ×
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-2 rounded-full transition-all ${progressBarClass(goal.kind)}`}
          style={{ width: `${Math.min(100, progress.progressPct)}%` }}
        />
      </div>

      {/* Amount text */}
      <p className="text-fg-muted text-sm">
        {fmt(progress.currentAmount, currency)} of {fmt(goal.targetAmount, currency)} {verbLabel}
      </p>

      {/* Chips */}
      <div className="flex flex-wrap gap-2">
        {progress.progressPct >= 100 ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300">
            Goal reached 🎯
          </span>
        ) : progress.requiredMonthly !== null ? (
          <span className="border-border-subtle text-fg-muted rounded-full border px-2 py-0.5 text-xs">
            {fmt(progress.requiredMonthly, currency)}/mo needed
          </span>
        ) : null}
      </div>

      {/* Inline edit form */}
      {isExpanded && (
        <GoalForm
          mode="edit"
          form={form}
          accounts={accounts}
          currency={currency}
          saving={saving}
          formError={formError}
          onFormChange={onFormChange}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

interface GoalFormProps {
  mode: "create" | "edit";
  form: FormState;
  accounts: AccountOption[];
  currency: string;
  saving: boolean;
  formError: string | null;
  onFormChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
}

function GoalForm({
  mode,
  form,
  accounts,
  currency,
  saving,
  formError,
  onFormChange,
  onSave,
  onCancel,
}: GoalFormProps) {
  const [emergencySuggestion, setEmergencySuggestion] = useState<{
    low: number;
    high: number;
  } | null>(null);

  const inputClass =
    "border-border-subtle bg-surface w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-fg-muted";

  const orderedAccounts =
    form.kind === "debt_payoff"
      ? [
          ...accounts.filter((a) => a.kind === "liability"),
          ...accounts.filter((a) => a.kind !== "liability"),
        ]
      : accounts;

  async function handleKindChange(newKind: GoalKind) {
    onFormChange({ ...form, kind: newKind });
    if (newKind === "emergency_fund") {
      try {
        const r = await fetch("/api/goals/emergency-suggestion");
        if (r.ok) {
          const data = (await r.json()) as { suggested3x: number; suggested6x: number };
          setEmergencySuggestion({ low: data.suggested3x, high: data.suggested6x });
        }
      } catch {
        // fire and forget
      }
    } else {
      setEmergencySuggestion(null);
    }
  }

  return (
    <div className="border-border-subtle mt-2 space-y-3 rounded border p-4">
      {/* Kind */}
      <div className="space-y-1">
        <label className="text-fg-muted text-xs font-medium">Type</label>
        {mode === "edit" ? (
          <p className="text-fg-default text-sm">{kindLabel(form.kind)}</p>
        ) : (
          <div className="space-y-1.5">
            {(
              ["cash_target", "emergency_fund", "debt_payoff", "portfolio_target"] as GoalKind[]
            ).map((k) => (
              <label key={k} className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="goal-kind"
                  value={k}
                  checked={form.kind === k}
                  onChange={() => handleKindChange(k)}
                  className="mt-0.5"
                />
                <span className="text-fg-default text-sm">
                  <span className="font-medium">{kindLabel(k)}</span>
                  <span className="text-fg-muted"> — {KIND_DESCRIPTIONS[k]}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-fg-muted text-xs font-medium">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onFormChange({ ...form, name: e.target.value })}
          className={inputClass}
          placeholder="e.g. House deposit"
        />
      </div>

      {/* Target amount */}
      <div className="space-y-1">
        <label className="text-fg-muted text-xs font-medium">Target amount ({currency})</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={(e) => onFormChange({ ...form, amount: e.target.value })}
          className={inputClass}
          placeholder="0.00"
        />
        {form.kind === "emergency_fund" && emergencySuggestion && (
          <p className="text-fg-muted text-xs">
            Suggested: {fmt(emergencySuggestion.low, currency)} (3×) –{" "}
            {fmt(emergencySuggestion.high, currency)} (6×)
          </p>
        )}
      </div>

      {/* Target date */}
      <div className="space-y-1">
        <label className="text-fg-muted text-xs font-medium">Target date (optional)</label>
        <input
          type="date"
          value={form.targetDate}
          onChange={(e) => onFormChange({ ...form, targetDate: e.target.value })}
          className={inputClass}
        />
      </div>

      {/* Linked accounts */}
      <div className="space-y-1">
        <label className="text-fg-muted text-xs font-medium">Linked accounts</label>
        <select
          multiple
          value={form.linkedAccountIds}
          onChange={(e) =>
            onFormChange({
              ...form,
              linkedAccountIds: Array.from(e.target.selectedOptions).map((o) => o.value),
            })
          }
          className={`${inputClass} min-h-[80px]`}
        >
          {orderedAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.kind})
            </option>
          ))}
        </select>
      </div>

      {formError && <p className="text-xs text-red-600">{formError}</p>}

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-fg-default text-surface rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "create" ? "Create goal" : "Save changes"}
        </button>
        <button
          onClick={onCancel}
          className="text-fg-muted hover:text-fg-default px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function GoalsView({ goals: initialGoals, accounts, currency }: GoalsViewProps) {
  const router = useRouter();
  const [goals, setGoals] = useState<SerializedGoal[]>(initialGoals);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function openCreate() {
    setForm(defaultForm());
    setFormError(null);
    setExpandedId("new");
  }

  function openEdit(g: SerializedGoal) {
    setForm(formFromGoal(g));
    setFormError(null);
    setExpandedId(g.id);
  }

  function closeForm() {
    setExpandedId(null);
    setFormError(null);
  }

  function validate(f: FormState): string | null {
    if (!f.name.trim()) return "Name is required.";
    const amt = parseFloat(f.amount);
    if (isNaN(amt) || amt <= 0) return "Target amount must be greater than 0.";
    if (f.linkedAccountIds.length === 0) return "Select at least one linked account.";
    return null;
  }

  async function handleCreate() {
    const err = validate(form);
    if (err) {
      setFormError(err);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: form.name.trim(),
        kind: form.kind,
        targetAmount: Math.round(parseFloat(form.amount) * 100),
        targetDate: form.targetDate || undefined,
        linkedAccountIds: form.linkedAccountIds,
      };
      const r = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setFormError(d.error ?? "Failed to create goal.");
        return;
      }
      const data = (await r.json()) as { id: string };
      const dummyProgress: GoalProgress = {
        currentAmount: 0,
        progressPct: 0,
        requiredMonthly: null,
      };
      const newGoal: SerializedGoal = {
        id: data.id,
        name: body.name,
        kind: body.kind,
        targetAmount: body.targetAmount,
        targetDate: form.targetDate || null,
        linkedAccountIds: body.linkedAccountIds,
        initialBalance: null,
        progress: dummyProgress,
      };
      setGoals((prev) => [newGoal, ...prev]);
      closeForm();
      router.refresh();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(goalId: string) {
    const err = validate(form);
    if (err) {
      setFormError(err);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        targetAmount: Math.round(parseFloat(form.amount) * 100),
        targetDate: form.targetDate || null,
        linkedAccountIds: form.linkedAccountIds,
      };
      const r = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setFormError(d.error ?? "Failed to update goal.");
        return;
      }
      const data = (await r.json()) as {
        goal?: {
          id: string;
          name: string;
          kind: GoalKind;
          targetAmount: number;
          targetDate: string | null;
          linkedAccountIds: string[];
          initialBalance: number | null;
        };
      };
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== goalId) return g;
          if (data.goal) {
            return {
              ...g,
              name: data.goal.name,
              kind: data.goal.kind,
              targetAmount: data.goal.targetAmount,
              targetDate: data.goal.targetDate,
              linkedAccountIds: data.goal.linkedAccountIds,
              initialBalance: data.goal.initialBalance,
            };
          }
          return {
            ...g,
            name: form.name.trim(),
            targetAmount: Math.round(parseFloat(form.amount) * 100),
            targetDate: form.targetDate || null,
            linkedAccountIds: form.linkedAccountIds,
          };
        }),
      );
      closeForm();
      router.refresh();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(goalId: string) {
    setArchiveError(null);
    try {
      const r = await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      if (r.ok) {
        setGoals((prev) => prev.filter((g) => g.id !== goalId));
        if (expandedId === goalId) closeForm();
        router.refresh();
      } else {
        setArchiveError("Failed to archive goal.");
      }
    } catch {
      setArchiveError("Network error. Please try again.");
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-fg-default text-lg font-semibold">Goals</h1>
        {expandedId !== "new" && (
          <button
            onClick={openCreate}
            className="bg-fg-default text-surface rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            + New goal
          </button>
        )}
      </div>

      {/* New goal form */}
      {expandedId === "new" && (
        <GoalForm
          mode="create"
          form={form}
          accounts={accounts}
          currency={currency}
          saving={saving}
          formError={formError}
          onFormChange={setForm}
          onSave={handleCreate}
          onCancel={closeForm}
        />
      )}

      {goals.length === 0 && expandedId !== "new" && (
        <p className="text-fg-muted text-sm">No goals yet. Create your first goal above.</p>
      )}

      {archiveError && <p className="text-xs text-red-600">{archiveError}</p>}

      <div className="space-y-4">
        {goals.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            currency={currency}
            isExpanded={expandedId === g.id}
            accounts={accounts}
            form={expandedId === g.id ? form : formFromGoal(g)}
            saving={saving}
            formError={expandedId === g.id ? formError : null}
            onEdit={() => (expandedId === g.id ? closeForm() : openEdit(g))}
            onArchive={() => handleArchive(g.id)}
            onFormChange={setForm}
            onSave={() => handleEdit(g.id)}
            onCancel={closeForm}
          />
        ))}
      </div>
    </main>
  );
}
