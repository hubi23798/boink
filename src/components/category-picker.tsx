"use client";

import { useState } from "react";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

interface Props {
  transactionId: string;
  categories: Category[];
  onDone?: () => void;
}

export function CategoryPicker({ transactionId, categories, onDone }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simple: show all non-parent categories (those that have a parentId set)
  const options = categories.filter((c) => c.parentId !== null);

  async function save() {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${transactionId}/categorize`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: value }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onDone?.();
      window.location.reload();
    } catch {
      setError("Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border-border-subtle rounded border bg-transparent px-2 py-1 text-xs"
        disabled={busy}
      >
        <option value="">Pick category…</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => void save()}
        disabled={!value || busy}
        className="rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        Save
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
