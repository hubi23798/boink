"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  connectionStatusView,
  lastSyncedLabel,
  oauthBanner,
  providerLabel,
  truncateError,
} from "@/lib/aggregators/connection-view";
import type { Connection } from "@/lib/db/schema";

export interface ConnectionRow {
  id: string;
  provider: Connection["provider"];
  status: Connection["status"];
  lastSyncedAt: string | null;
  lastError: string | null;
  accountCount: number;
}

interface ConnectResponse {
  redirectUrl?: string;
  error?: string;
  message?: string;
}

export function ConnectionsClient({
  connections,
  connected,
  error,
}: {
  connections: ConnectionRow[];
  connected: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const banner = oauthBanner({ connected, error });
  const [busyAdd, setBusyAdd] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function clearQuery() {
    router.replace("/settings/connections");
  }

  async function startOAuth() {
    setBusyAdd(true);
    setActionError(null);
    try {
      const res = await fetch("/api/aggregators/truelayer/connect", { method: "POST" });
      const body = (await res.json()) as ConnectResponse;
      if (res.ok && body.redirectUrl) {
        window.location.assign(body.redirectUrl);
        return;
      }
      setActionError(body.message ?? "Couldn't start the connection. Please try again.");
    } catch {
      setActionError("Couldn't start the connection. Please try again.");
    } finally {
      setBusyAdd(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Connections</h1>
          <p className="text-fg-muted mt-1 text-sm">
            Link a bank to sync balances and transactions automatically. Data refreshes every 6
            hours.
          </p>
        </div>
        <Button onClick={startOAuth} disabled={busyAdd}>
          <Plus /> {busyAdd ? "Starting…" : "Add account"}
        </Button>
      </div>

      {banner ? (
        <Alert variant={banner.tone === "error" ? "destructive" : "default"}>
          {banner.tone === "error" ? <AlertTriangle /> : null}
          <AlertTitle>{banner.tone === "error" ? "Connection problem" : "Connected"}</AlertTitle>
          <AlertDescription>
            {banner.message}
            <button
              type="button"
              onClick={clearQuery}
              className="text-fg-muted hover:text-fg-default mt-1 text-xs underline"
            >
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      {actionError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {connections.length === 0 ? (
        <div className="border-border-subtle rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No accounts connected</p>
          <p className="text-fg-muted mx-auto mt-1 max-w-sm text-sm">
            Add your first bank connection to start syncing. Prefer to import a file? Use{" "}
            <Link href="/settings/import" className="underline">
              CSV import
            </Link>{" "}
            for accounts a live connection can&rsquo;t reach.
          </p>
          <Button className="mt-4" onClick={startOAuth} disabled={busyAdd}>
            <Plus /> Add account
          </Button>
        </div>
      ) : (
        <ul className="border-border-subtle divide-border-subtle divide-y rounded-lg border">
          {connections.map((c) => (
            <ConnectionItem key={c.id} conn={c} onReconnect={startOAuth} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ConnectionItem({ conn, onReconnect }: { conn: ConnectionRow; onReconnect: () => void }) {
  const router = useRouter();
  const status = connectionStatusView(conn.status);
  const [busy, setBusy] = useState<null | "resync" | "revoke">(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const errorDetail = truncateError(conn.lastError);
  const isRevoked = conn.status === "revoked";

  async function resync() {
    setBusy("resync");
    setRowError(null);
    try {
      const res = await fetch(`/api/connections/${conn.id}/resync`, { method: "POST" });
      if (res.ok) {
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setRowError(
        res.status === 429
          ? (body.message ?? "You can resync at most once every 15 minutes.")
          : (body.message ?? "Sync failed. Please try again."),
      );
    } catch {
      setRowError("Sync failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    setBusy("revoke");
    setRowError(null);
    try {
      const res = await fetch(`/api/connections/${conn.id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        return;
      }
      setRowError("Couldn't remove the connection. Please try again.");
    } catch {
      setRowError("Couldn't remove the connection. Please try again.");
    } finally {
      setBusy(null);
      setConfirmRevoke(false);
    }
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{providerLabel(conn.provider)}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-fg-muted text-xs">
          {conn.accountCount} account{conn.accountCount === 1 ? "" : "s"} ·{" "}
          {lastSyncedLabel(conn.lastSyncedAt)}
        </p>
        {conn.status === "error" && errorDetail ? (
          <p className="text-destructive text-xs">{errorDetail}</p>
        ) : null}
        {rowError ? <p className="text-destructive text-xs">{rowError}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {conn.status === "error" ? (
          <Button size="sm" variant="outline" onClick={onReconnect}>
            <RefreshCw /> Reconnect
          </Button>
        ) : null}
        {!isRevoked ? (
          <Button
            size="sm"
            variant="outline"
            onClick={resync}
            disabled={busy !== null}
            aria-label="Resync now"
          >
            <RefreshCw /> {busy === "resync" ? "Syncing…" : "Resync"}
          </Button>
        ) : null}
        {!isRevoked ? (
          confirmRevoke ? (
            <>
              <Button size="sm" variant="destructive" onClick={revoke} disabled={busy !== null}>
                {busy === "revoke" ? "Removing…" : "Confirm"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmRevoke(false)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmRevoke(true)}
              aria-label="Remove connection"
            >
              <Trash2 /> Remove
            </Button>
          )
        ) : null}
      </div>
    </li>
  );
}
