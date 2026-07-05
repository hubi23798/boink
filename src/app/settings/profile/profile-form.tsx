"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Profile {
  baseCurrency: string;
  locale: string;
  birthYear: number | null;
  timeHorizonYears: number | null;
  riskTolerance: "conservative" | "moderate" | "aggressive" | null;
}

interface Props {
  profile: Profile | null;
}

export function ProfileForm({ profile }: Props) {
  const [form, setForm] = useState<Profile>({
    baseCurrency: profile?.baseCurrency ?? "EUR",
    locale: profile?.locale ?? "en-IE",
    birthYear: profile?.birthYear ?? null,
    timeHorizonYears: profile?.timeHorizonYears ?? null,
    riskTolerance: profile?.riskTolerance ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const field = "border-border-subtle bg-surface w-full rounded-md border px-3 py-2 text-sm";
  const label = "block text-xs font-medium text-fg-muted mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Base currency</label>
          <select
            className={field}
            value={form.baseCurrency}
            onChange={(e) => set("baseCurrency", e.target.value)}
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="PLN">PLN</option>
            <option value="CZK">CZK</option>
          </select>
        </div>
        <div>
          <label className={label}>Locale</label>
          <select
            className={field}
            value={form.locale}
            onChange={(e) => set("locale", e.target.value)}
          >
            <option value="en-IE">en-IE</option>
            <option value="en-GB">en-GB</option>
            <option value="en-US">en-US</option>
            <option value="pl-PL">pl-PL</option>
          </select>
        </div>
        <div>
          <label className={label}>Birth year</label>
          <input
            type="number"
            className={field}
            placeholder="e.g. 1990"
            value={form.birthYear ?? ""}
            onChange={(e) => set("birthYear", e.target.value ? parseInt(e.target.value) : null)}
            min={1900}
            max={new Date().getFullYear() - 16}
          />
        </div>
        <div>
          <label className={label}>Investment time horizon (years)</label>
          <input
            type="number"
            className={field}
            placeholder="e.g. 30"
            value={form.timeHorizonYears ?? ""}
            onChange={(e) =>
              set("timeHorizonYears", e.target.value ? parseInt(e.target.value) : null)
            }
            min={1}
            max={60}
          />
        </div>
        <div>
          <label className={label}>Risk tolerance</label>
          <select
            className={field}
            value={form.riskTolerance ?? ""}
            onChange={(e) =>
              set("riskTolerance", (e.target.value || null) as Profile["riskTolerance"])
            }
          >
            <option value="">Not set</option>
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-success text-sm">Saved</span>}
      </div>
    </form>
  );
}
