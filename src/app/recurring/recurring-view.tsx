"use client";

import React, { useState } from "react";
import type { RecurringSubscription } from "@/lib/db/schema";
import type { Frequency } from "@/lib/recurring/detect";

export interface SerializedCandidate {
  key: string;
  description: string;
  accountId: string;
  frequency: Frequency;
  amountNative: number;
  currency: string;
  occurrenceCount: number;
  nextExpected: string; // YYYY-MM-DD ISO date string
}

interface CategoryOption {
  id: string;
  name: string;
  parentName: string;
}

interface BudgetConflict {
  subscriptionId: string;
  categoryId: string;
  existingAmount: number;
  proposedAmount: number;
  categoryName: string;
}

interface FormState {
  name: string;
  amount: string;
  frequency: Frequency;
  categoryId: string;
  nextDue: string;
}

interface RecurringViewProps {
  subscriptions: RecurringSubscription[];
  candidates: SerializedCandidate[];
  categories: CategoryOption[];
  accountNames: Record<string, string>;
  currency: string;
}

function fmt(minorAbs: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minorAbs / 100);
}

function freqLabel(f: Frequency) {
  return { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly" }[f];
}

function toMonthly(absAmount: number, freq: Frequency): number {
  if (freq === "weekly") return (absAmount * 52) / 12;
  if (freq === "fortnightly") return (absAmount * 26) / 12;
  return absAmount;
}

function nextDueLabel(nextDue: string | null): string {
  if (!nextDue) return "";
  const diff = Math.round((new Date(nextDue).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "due today";
  return `due in ${diff}d`;
}

function nextExpectedLabel(nextExpected: string): string {
  const diff = Math.round((new Date(nextExpected).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "due today";
  return `due in ${diff}d`;
}

function defaultFormFromCandidate(item: SerializedCandidate): FormState {
  return {
    name: item.description,
    amount: String(Math.abs(item.amountNative) / 100),
    frequency: item.frequency,
    categoryId: "",
    nextDue: item.nextExpected, // already a YYYY-MM-DD string
  };
}

function defaultFormFromSub(sub: RecurringSubscription): FormState {
  return {
    name: sub.name,
    amount: String(Math.abs(sub.amountNative) / 100),
    frequency: sub.frequency as Frequency,
    categoryId: sub.categoryId ?? "",
    nextDue: sub.nextDue ?? "",
  };
}

const FREQ_ORDER: Record<Frequency, number> = { monthly: 0, fortnightly: 1, weekly: 2 };

interface InlineFormProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean;
  formError: string | null;
  categories: CategoryOption[];
  onSave: () => void;
  onCancel: () => void;
}

function InlineForm({
  form,
  setForm,
  saving,
  formError,
  categories,
  onSave,
  onCancel,
}: InlineFormProps) {
  return (
    <div className="border-border-subtle space-y-3 border-t px-4 py-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-fg-muted mb-1 block text-xs">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="border-border-subtle bg-surface focus:ring-fg-muted w-full rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-fg-muted mb-1 block text-xs">Amount</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="border-border-subtle bg-surface focus:ring-fg-muted w-full rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-fg-muted mb-1 block text-xs">Frequency</label>
          <select
            value={form.frequency}
            onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
            className="border-border-subtle bg-surface focus:ring-fg-muted w-full rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
          >
            <option value="monthly">Monthly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div>
          <label className="text-fg-muted mb-1 block text-xs">Category (optional)</label>
          <select
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="border-border-subtle bg-surface focus:ring-fg-muted w-full rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
          >
            <option value="">— none —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentName} › {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-fg-muted mb-1 block text-xs">Next due (optional)</label>
          <input
            type="date"
            value={form.nextDue}
            onChange={(e) => setForm((f) => ({ ...f, nextDue: e.target.value }))}
            className="border-border-subtle bg-surface focus:ring-fg-muted w-full rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
          />
        </div>
      </div>
      {formError && <p className="text-xs text-red-500">{formError}</p>}
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-fg-default text-surface rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="text-fg-muted hover:text-fg-default text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function RecurringView({
  subscriptions: initialSubs,
  candidates: initialCandidates,
  categories,
  accountNames,
  currency,
}: RecurringViewProps) {
  const [subs, setSubs] = useState<RecurringSubscription[]>(initialSubs);
  const [candidates, setCandidates] = useState<SerializedCandidate[]>(initialCandidates);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    amount: "",
    frequency: "monthly",
    categoryId: "",
    nextDue: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [budgetConflicts, setBudgetConflicts] = useState<BudgetConflict[]>([]);

  const confirmedMonthly = subs
    .filter((s) => s.currency === currency)
    .reduce((sum, s) => sum + toMonthly(Math.abs(s.amountNative), s.frequency as Frequency), 0);
  const detectedMonthly = candidates
    .filter((c) => c.currency === currency)
    .reduce((sum, c) => sum + toMonthly(Math.abs(c.amountNative), c.frequency), 0);

  function openForm(key: string, prefill: FormState) {
    setExpandedKey(key);
    setForm(prefill);
    setFormError(null);
  }

  function closeForm() {
    setExpandedKey(null);
    setFormError(null);
  }

  async function handleDismiss(key: string) {
    setCandidates((prev) => prev.filter((c) => c.key !== key));
    await fetch("/api/recurring/dismissals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
  }

  async function handleDelete(id: string) {
    setSubs((prev) => prev.filter((s) => s.id !== id));
    setBudgetConflicts((prev) => prev.filter((c) => c.subscriptionId !== id));
    await fetch(`/api/recurring/subscriptions/${id}`, { method: "DELETE" });
  }

  async function handleSave(
    opts:
      | { mode: "confirm"; detectionKey: string; candidateCurrency: string; amountSign: -1 | 1 }
      | { mode: "edit"; id: string; subCurrency: string; amountSign: -1 | 1 }
      | { mode: "new" },
  ) {
    setSaving(true);
    setFormError(null);

    const amountMajor = parseFloat(form.amount);
    if (isNaN(amountMajor) || amountMajor <= 0) {
      setFormError("Amount must be a positive number");
      setSaving(false);
      return;
    }

    const amountSign = opts.mode === "new" ? -1 : opts.amountSign;
    const amountNative = amountSign * Math.round(amountMajor * 100);
    const subCurrency =
      opts.mode === "confirm"
        ? opts.candidateCurrency
        : opts.mode === "edit"
          ? opts.subCurrency
          : currency;

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      frequency: form.frequency,
      amountNative,
      currency: subCurrency,
      ...(form.categoryId ? { categoryId: form.categoryId } : {}),
      ...(form.nextDue ? { nextDue: form.nextDue } : {}),
    };
    if (opts.mode === "confirm") body.detectionKey = opts.detectionKey;

    const url =
      opts.mode === "edit"
        ? `/api/recurring/subscriptions/${opts.id}`
        : "/api/recurring/subscriptions";
    const method = opts.mode === "edit" ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setFormError("Failed to save");
        return;
      }

      const data = (await res.json()) as {
        subscription: RecurringSubscription;
        budgetCreated?: boolean;
        budgetConflict?: { existingAmount: number; proposedAmount: number; categoryName: string };
      };

      if (opts.mode === "confirm") {
        setCandidates((prev) => prev.filter((c) => c.key !== opts.detectionKey));
        setSubs((prev) =>
          [...prev, data.subscription].sort(
            (a, b) =>
              FREQ_ORDER[a.frequency as Frequency] - FREQ_ORDER[b.frequency as Frequency] ||
              Math.abs(b.amountNative) - Math.abs(a.amountNative),
          ),
        );
      } else if (opts.mode === "edit") {
        setSubs((prev) => prev.map((s) => (s.id === opts.id ? data.subscription : s)));
      } else {
        setSubs((prev) =>
          [...prev, data.subscription].sort(
            (a, b) =>
              FREQ_ORDER[a.frequency as Frequency] - FREQ_ORDER[b.frequency as Frequency] ||
              Math.abs(b.amountNative) - Math.abs(a.amountNative),
          ),
        );
      }

      const conflict = data.budgetConflict;
      if (conflict && form.categoryId) {
        setBudgetConflicts((prev) => [
          ...prev.filter((c) => c.subscriptionId !== data.subscription.id),
          {
            subscriptionId: data.subscription.id,
            categoryId: form.categoryId,
            ...conflict,
          },
        ]);
      }

      closeForm();
    } catch {
      setFormError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleBudgetUpdate(conflict: BudgetConflict) {
    try {
      const res = await fetch(`/api/budget-targets/${conflict.categoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMonthly: conflict.proposedAmount }),
      });
      if (res.ok) {
        setBudgetConflicts((prev) =>
          prev.filter((c) => c.subscriptionId !== conflict.subscriptionId),
        );
      }
    } catch {
      // silent — user can retry
    }
  }

  function dismissConflict(subscriptionId: string) {
    setBudgetConflicts((prev) => prev.filter((c) => c.subscriptionId !== subscriptionId));
  }

  const sortedSubs = [...subs].sort(
    (a, b) =>
      FREQ_ORDER[a.frequency as Frequency] - FREQ_ORDER[b.frequency as Frequency] ||
      Math.abs(b.amountNative) - Math.abs(a.amountNative),
  );
  const groupedSubs: Record<Frequency, RecurringSubscription[]> = {
    monthly: sortedSubs.filter((s) => s.frequency === "monthly"),
    fortnightly: sortedSubs.filter((s) => s.frequency === "fortnightly"),
    weekly: sortedSubs.filter((s) => s.frequency === "weekly"),
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Recurring</h1>
          <p className="text-fg-muted mt-1 text-sm tabular-nums">
            {fmt(confirmedMonthly, currency)}/mo confirmed
            {detectedMonthly > 0 && <> · {fmt(detectedMonthly, currency)}/mo detected</>}
          </p>
        </div>
        <button
          onClick={() =>
            openForm("new", {
              name: "",
              amount: "",
              frequency: "monthly",
              categoryId: "",
              nextDue: "",
            })
          }
          className="border-border-subtle text-fg-muted hover:text-fg-default rounded border px-3 py-1.5 text-sm"
        >
          + Add subscription
        </button>
      </div>

      {/* New subscription inline form */}
      {expandedKey === "new" && (
        <div className="border-border-subtle overflow-hidden rounded-xl border">
          <InlineForm
            form={form}
            setForm={setForm}
            saving={saving}
            formError={formError}
            categories={categories}
            onSave={() => void handleSave({ mode: "new" })}
            onCancel={closeForm}
          />
        </div>
      )}

      {/* Confirmed subscriptions */}
      {(["monthly", "fortnightly", "weekly"] as Frequency[]).map((freq) => {
        const items = groupedSubs[freq];
        if (items.length === 0) return null;
        return (
          <section key={freq} className="space-y-0">
            <div className="border-border-subtle border-b px-4 py-2 text-xs font-semibold tracking-wide uppercase">
              {freqLabel(freq)}
            </div>
            <div className="border-border-subtle divide-border-subtle divide-y overflow-hidden rounded-b-xl border border-t-0">
              {items.map((sub) => {
                const conflict = budgetConflicts.find((c) => c.subscriptionId === sub.id);
                const isEditing = expandedKey === sub.id;
                const dueSoon = sub.nextDue !== null && sub.nextDue < today;
                return (
                  <div key={sub.id}>
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{sub.name}</p>
                        {sub.nextDue && (
                          <p
                            className={`text-xs tabular-nums ${dueSoon ? "text-red-600 dark:text-red-400" : "text-fg-muted"}`}
                          >
                            {nextDueLabel(sub.nextDue)}
                          </p>
                        )}
                      </div>
                      <div className="ml-4 flex shrink-0 items-center gap-3">
                        <span className="font-medium tabular-nums">
                          {sub.amountNative < 0 ? "−" : "+"}
                          {fmt(Math.abs(sub.amountNative), sub.currency)}
                        </span>
                        <button
                          onClick={() =>
                            isEditing ? closeForm() : openForm(sub.id, defaultFormFromSub(sub))
                          }
                          className="text-fg-muted hover:text-fg-default text-xs"
                          title="Edit"
                        >
                          ✏
                        </button>
                        <button
                          onClick={() => void handleDelete(sub.id)}
                          className="text-fg-muted text-xs hover:text-red-500"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {isEditing && (
                      <InlineForm
                        form={form}
                        setForm={setForm}
                        saving={saving}
                        formError={formError}
                        categories={categories}
                        onSave={() =>
                          void handleSave({
                            mode: "edit",
                            id: sub.id,
                            subCurrency: sub.currency,
                            amountSign: sub.amountNative < 0 ? -1 : 1,
                          })
                        }
                        onCancel={closeForm}
                      />
                    )}
                    {conflict && (
                      <div className="border-border-subtle border-t px-4 py-3 text-sm">
                        <p>
                          Budget target for <strong>{conflict.categoryName}</strong> is{" "}
                          {fmt(conflict.existingAmount, currency)}/mo — this subscription costs{" "}
                          {fmt(conflict.proposedAmount, currency)}/mo. Update?
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => void handleBudgetUpdate(conflict)}
                            className="bg-fg-default text-surface rounded px-3 py-1 text-xs font-medium"
                          >
                            Update
                          </button>
                          <button
                            onClick={() => dismissConflict(sub.id)}
                            className="text-fg-muted hover:text-fg-default text-xs"
                          >
                            Keep existing
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Suggested candidates */}
      {candidates.length > 0 && (
        <section className="space-y-0">
          <div className="border-border-subtle text-fg-muted border-b px-4 py-2 text-xs font-semibold tracking-wide uppercase">
            Suggested
          </div>
          <div className="border-border-subtle divide-border-subtle divide-y overflow-hidden rounded-b-xl border border-t-0">
            {candidates.map((item) => {
              const isExpanding = expandedKey === item.key;
              return (
                <div key={item.key}>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.description}</p>
                      <p className="text-fg-muted truncate text-xs">
                        {accountNames[item.accountId] ?? item.accountId} ·{" "}
                        {freqLabel(item.frequency)} · {item.occurrenceCount} times ·{" "}
                        {nextExpectedLabel(item.nextExpected)}
                      </p>
                    </div>
                    <div className="ml-4 flex shrink-0 items-center gap-2">
                      <span className="text-fg-muted tabular-nums">
                        {item.amountNative < 0 ? "−" : "+"}
                        {fmt(Math.abs(item.amountNative), item.currency)}
                      </span>
                      <button
                        onClick={() =>
                          isExpanding
                            ? closeForm()
                            : openForm(item.key, defaultFormFromCandidate(item))
                        }
                        className="border-border-subtle hover:bg-border-subtle rounded border px-2 py-1 text-xs"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => void handleDismiss(item.key)}
                        className="text-fg-muted text-xs hover:text-red-500"
                        title="Dismiss"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {isExpanding && (
                    <InlineForm
                      form={form}
                      setForm={setForm}
                      saving={saving}
                      formError={formError}
                      categories={categories}
                      onSave={() =>
                        void handleSave({
                          mode: "confirm",
                          detectionKey: item.key,
                          candidateCurrency: item.currency,
                          amountSign: item.amountNative < 0 ? -1 : 1,
                        })
                      }
                      onCancel={closeForm}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {subs.length === 0 && candidates.length === 0 && (
        <p className="text-fg-muted text-sm">
          No recurring transactions detected in the last 3 months.
        </p>
      )}
    </main>
  );
}
