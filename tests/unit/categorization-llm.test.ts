import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import { classifyTransactions } from "@/lib/categorization/llm";

const CATEGORIES = [
  { id: "cat-food", name: "Food & Dining", parentName: "Living" },
  { id: "cat-sub", name: "Subscriptions", parentName: "Entertainment" },
];

function makeTxns(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: `txn-${i}`,
    descriptionRaw: i === 0 ? "Deliveroo" : "Spotify",
    amountNative: -1500,
    currency: "EUR",
  }));
}

function mockAnthropicResponse(text: string) {
  mockCreate.mockResolvedValue({
    content: [{ type: "text", text }],
  });
}

describe("classifyTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] immediately for empty input without calling Anthropic", async () => {
    const result = await classifyTransactions([], CATEGORIES);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("parses valid JSON response and returns classifications", async () => {
    mockAnthropicResponse(
      JSON.stringify([
        { transactionId: "txn-0", categoryId: "cat-food", confidence: 0.95 },
        { transactionId: "txn-1", categoryId: "cat-sub", confidence: 0.88 },
      ]),
    );
    const result = await classifyTransactions(makeTxns(), CATEGORIES);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ transactionId: "txn-0", categoryId: "cat-food" });
    expect(result[1]).toMatchObject({ transactionId: "txn-1", categoryId: "cat-sub" });
    expect(result[0]!.confidence).toBe(0.95);
    expect(result[1]!.confidence).toBe(0.88);
  });

  it("filters out entries whose categoryId is not in the provided category list", async () => {
    mockAnthropicResponse(
      JSON.stringify([
        { transactionId: "txn-0", categoryId: "cat-food", confidence: 0.9 },
        { transactionId: "txn-1", categoryId: "cat-UNKNOWN", confidence: 0.7 },
      ]),
    );
    const result = await classifyTransactions(makeTxns(), CATEGORIES);
    expect(result).toHaveLength(1);
    expect(result[0]!.categoryId).toBe("cat-food");
  });

  it("returns [] when Anthropic throws", async () => {
    mockCreate.mockRejectedValue(new Error("Network error"));
    const result = await classifyTransactions(makeTxns(), CATEGORIES);
    expect(result).toEqual([]);
  });

  it("returns [] for malformed JSON response without throwing", async () => {
    mockAnthropicResponse("not valid json {{{");
    const result = await classifyTransactions(makeTxns(), CATEGORIES);
    expect(result).toEqual([]);
  });
});
