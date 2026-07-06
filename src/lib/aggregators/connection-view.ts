/**
 * Pure presentation helpers for the connection management UI (TRU-BEU-05).
 * No DB / no React — kept separate so the mapping logic is unit-testable.
 */
import type { Connection } from "@/lib/db/schema";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "secondary" | "outline";

export interface StatusView {
  variant: BadgeVariant;
  label: string;
}

export function connectionStatusView(status: Connection["status"]): StatusView {
  switch (status) {
    case "active":
      return { variant: "success", label: "Active" };
    case "error":
      return { variant: "danger", label: "Needs attention" };
    case "paused":
      return { variant: "warning", label: "Paused" };
    case "revoked":
      return { variant: "secondary", label: "Revoked" };
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  truelayer: "TrueLayer",
  tink: "Tink",
  plaid: "Plaid",
  manual: "Manual",
  csv: "CSV import",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/** Truncate a bank/sync error for inline display. Returns null for empty input. */
export function truncateError(msg: string | null | undefined, max = 140): string | null {
  if (!msg) return null;
  const trimmed = msg.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** Coarse relative label for last-sync time. */
export function lastSyncedLabel(date: Date | string | null, now: Date = new Date()): string {
  if (!date) return "Never synced";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return "Just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface OAuthBanner {
  tone: "success" | "error";
  message: string;
}

const OAUTH_ERRORS: Record<string, string> = {
  missing_code: "Your bank didn't return an authorization code. Please try again.",
  invalid_state: "The connection request expired or didn't match. Please try again.",
  callback_failed: "We couldn't finish connecting your account. Please try again.",
  access_denied: "You cancelled the connection at your bank.",
  truelayer_not_configured: "Bank connections aren't configured yet. Contact support.",
  rate_limit: "Too many connection attempts. Wait a few minutes and try again.",
};

export function oauthErrorMessage(code: string): string {
  return OAUTH_ERRORS[code] ?? "Something went wrong connecting your account. Please try again.";
}

/** Map the `?connected` / `?error` return-from-OAuth query into a banner. */
export function oauthBanner(params: {
  connected?: string | null;
  error?: string | null;
}): OAuthBanner | null {
  if (params.connected === "truelayer") {
    return { tone: "success", message: "Account connected. Your first sync is running now." };
  }
  if (params.error) {
    return { tone: "error", message: oauthErrorMessage(params.error) };
  }
  return null;
}
