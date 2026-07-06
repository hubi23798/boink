import { describe, expect, it } from "vitest";
import {
  connectionStatusView,
  lastSyncedLabel,
  oauthBanner,
  oauthErrorMessage,
  providerLabel,
  truncateError,
} from "@/lib/aggregators/connection-view";

describe("connectionStatusView", () => {
  it("maps each status to a badge variant + label", () => {
    expect(connectionStatusView("active")).toEqual({ variant: "success", label: "Active" });
    expect(connectionStatusView("error")).toEqual({
      variant: "danger",
      label: "Needs attention",
    });
    expect(connectionStatusView("paused")).toEqual({ variant: "warning", label: "Paused" });
    expect(connectionStatusView("revoked")).toEqual({ variant: "secondary", label: "Revoked" });
  });
});

describe("providerLabel", () => {
  it("prettifies known providers and falls back to the raw id", () => {
    expect(providerLabel("truelayer")).toBe("TrueLayer");
    expect(providerLabel("csv")).toBe("CSV import");
    expect(providerLabel("mystery")).toBe("mystery");
  });
});

describe("truncateError", () => {
  it("returns null for empty/whitespace input", () => {
    expect(truncateError(null)).toBeNull();
    expect(truncateError(undefined)).toBeNull();
    expect(truncateError("   ")).toBeNull();
  });

  it("passes short messages through and ellipsizes long ones", () => {
    expect(truncateError("token expired")).toBe("token expired");
    const long = "x".repeat(200);
    const out = truncateError(long, 140)!;
    expect(out).toHaveLength(140);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("lastSyncedLabel", () => {
  const now = new Date("2026-07-06T12:00:00Z");
  it("handles never / minutes / hours / days", () => {
    expect(lastSyncedLabel(null, now)).toBe("Never synced");
    expect(lastSyncedLabel(new Date(now.getTime() - 30_000), now)).toBe("Just now");
    expect(lastSyncedLabel(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 min ago");
    expect(lastSyncedLabel(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3h ago");
    expect(lastSyncedLabel(new Date(now.getTime() - 2 * 86_400_000), now)).toBe("2d ago");
  });

  it("accepts ISO strings", () => {
    expect(lastSyncedLabel("2026-07-06T11:00:00Z", now)).toBe("1h ago");
  });
});

describe("oauthBanner", () => {
  it("returns a success banner on connected=truelayer", () => {
    expect(oauthBanner({ connected: "truelayer" })).toEqual({
      tone: "success",
      message: "Account connected. Your first sync is running now.",
    });
  });

  it("maps known + unknown error codes", () => {
    expect(oauthBanner({ error: "access_denied" })?.tone).toBe("error");
    expect(oauthErrorMessage("invalid_state")).toMatch(/expired/);
    expect(oauthErrorMessage("weird_code")).toMatch(/Something went wrong/);
  });

  it("returns null when there is nothing to show", () => {
    expect(oauthBanner({})).toBeNull();
  });
});
