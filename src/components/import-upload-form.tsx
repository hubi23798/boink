"use client";

import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ImportResult {
  batchId: string;
  status: string;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  dedupedCount: number;
  newAccountNames: string[];
}

interface ApiError {
  error: string;
  batchId?: string;
}

export function ImportUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  async function submit(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/settings/import", { method: "POST", body: form });
      if (res.status === 409) {
        const body = (await res.json()) as ApiError;
        window.location.href = `/settings/import/${body.batchId}`;
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiError;
        throw new Error(body.error ?? "Import failed");
      }
      const data = (await res.json()) as ImportResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void submit(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void submit(file);
  }

  if (result) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            {result.acceptedCount} new · {result.dedupedCount} skipped (duplicate) ·{" "}
            {result.rejectedCount} rejected
            {result.newAccountNames.length > 0 && (
              <span className="mt-1 block text-xs">
                New accounts created: {result.newAccountNames.join(", ")}
              </span>
            )}
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = `/settings/import/${result.batchId}`;
            }}
          >
            View batch detail
          </Button>
          <Button variant="outline" onClick={() => setResult(null)}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Import error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        role="button"
        tabIndex={0}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className="border-border-subtle flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      >
        {busy ? (
          <span className="text-fg-muted text-sm">Importing…</span>
        ) : (
          <>
            <span className="text-sm font-medium">Drop a Revolut CSV here</span>
            <span className="text-fg-muted text-xs">or click to browse · max 10 MB</span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="sr-only"
        onChange={onFileChange}
        disabled={busy}
      />
    </div>
  );
}
