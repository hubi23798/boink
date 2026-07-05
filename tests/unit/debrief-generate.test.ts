import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DebriefFlag } from "@/lib/db/schema";
import { PRIMARY_TENANT_ID } from "@/lib/db/schema";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

const { generateDebrief } = await import("@/lib/debrief/generate");

function makeDb() {
  return {
    query: {
      transaction: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      budgetTarget: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      recurringSubscription: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({ baseCurrency: "EUR" }),
      },
    },
  } as unknown as Parameters<typeof generateDebrief>[0];
}

function mockAnthropicText(text: string) {
  mockCreate.mockResolvedValue({
    content: [{ type: "text", text }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

const VALID_RESPONSE = JSON.stringify({
  narrative: "This week you spent €200, up 10% from last week.",
  flags: [
    {
      kind: "spending_spike",
      category: "Food & Dining",
      changePct: 40,
      message: "40% more than last week",
    },
  ],
});

describe("generateDebrief", () => {
  it("returns parsed DebriefOutput for valid Claude JSON response", async () => {
    mockAnthropicText(VALID_RESPONSE);
    const result = await generateDebrief(makeDb(), PRIMARY_TENANT_ID, TEST_USER_ID, {
      weekStart: new Date("2026-05-11T00:00:00Z"),
      weekEnd: new Date("2026-05-17T23:59:59Z"),
    });
    expect(result.narrativeText).toBe("This week you spent €200, up 10% from last week.");
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]!.kind).toBe("spending_spike");
  });

  it("throws on malformed JSON response (does not swallow)", async () => {
    mockAnthropicText("not json at all");
    await expect(
      generateDebrief(makeDb(), PRIMARY_TENANT_ID, TEST_USER_ID, {
        weekStart: new Date("2026-05-11T00:00:00Z"),
        weekEnd: new Date("2026-05-17T23:59:59Z"),
      }),
    ).rejects.toThrow();
  });

  it("drops flags with unknown kind values", async () => {
    mockAnthropicText(
      JSON.stringify({
        narrative: "All good.",
        flags: [
          { kind: "spending_spike", category: "Food", changePct: 10, message: "ok" },
          { kind: "unknown_future_flag", category: "X", message: "ignore me" },
        ],
      }),
    );
    const result = await generateDebrief(makeDb(), PRIMARY_TENANT_ID, TEST_USER_ID, {
      weekStart: new Date("2026-05-11T00:00:00Z"),
      weekEnd: new Date("2026-05-17T23:59:59Z"),
    });
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]!.kind).toBe("spending_spike");
  });
});
