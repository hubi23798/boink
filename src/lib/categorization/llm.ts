import Anthropic from "@anthropic-ai/sdk";

export interface LlmClassification {
  transactionId: string;
  categoryId: string;
  confidence: number;
}

interface TxnInput {
  id: string;
  descriptionRaw: string | null;
  amountNative: number;
  currency: string;
}

interface CategoryInput {
  id: string;
  name: string;
  parentName: string;
}

export async function classifyTransactions(
  txns: TxnInput[],
  categories: CategoryInput[],
): Promise<LlmClassification[]> {
  if (txns.length === 0) return [];

  const categoryList = categories.map((c) => `${c.id} — ${c.parentName} › ${c.name}`).join("\n");

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: process.env.MODEL_ADVISOR ?? "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You are a transaction categorizer. Given a list of transactions and a list of categories, assign each transaction to the most appropriate category.

Available categories (id — parent › name):
${categoryList}

Return a JSON array with one object per transaction:
[{ "transactionId": "...", "categoryId": "...", "confidence": 0.0-1.0 }]

Return ONLY the JSON array. No explanation.`,
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            txns.map((t) => ({
              id: t.id,
              description: t.descriptionRaw ?? "",
              amount: t.amountNative,
              currency: t.currency,
            })),
          ),
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as unknown[];

    const validCategoryIds = new Set(categories.map((c) => c.id));

    return (parsed as unknown[]).filter((item): item is LlmClassification => {
      if (typeof item !== "object" || item === null) return false;
      const r = item as Record<string, unknown>;
      return (
        typeof r["transactionId"] === "string" &&
        typeof r["categoryId"] === "string" &&
        validCategoryIds.has(r["categoryId"] as string) &&
        typeof r["confidence"] === "number" &&
        (r["confidence"] as number) >= 0 &&
        (r["confidence"] as number) <= 1
      );
    });
  } catch (e) {
    console.error("[llm-categorization] failed:", e);
    return [];
  }
}
