import Anthropic from "@anthropic-ai/sdk";
import { eq, gte, sql } from "drizzle-orm";
import { env } from "@/env";
import type { Db } from "@/lib/db/client";
import {
  advisorMessage,
  pendingProposal,
} from "@/lib/db/schema";
import { TOOL_DEFINITIONS, type ToolContext, executeTool } from "./tools";
import { SYSTEM_PROMPT, buildSnapshotBlock, buildUserProfileBlock } from "./system-prompt";
import { DISCLAIMER, applyOutputFilter } from "./filter";

export interface AdvisorTurnResult {
  assistantText: string;
  proposals: Array<{ id: string; kind: string; payload: Record<string, unknown>; summary: string }>;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

const GENERIC_FILTER_ERROR =
  "I'm unable to provide a response that meets our guidelines right now. Please try rephrasing your question." +
  DISCLAIMER;

const MAX_TOOL_ROUNDS = 5;

async function getDailyTokenUsage(db: Db): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${advisorMessage.inputTokens} + ${advisorMessage.outputTokens}), 0)`,
    })
    .from(advisorMessage)
    .where(gte(advisorMessage.createdAt, todayStart));

  return parseInt(row?.total ?? "0", 10);
}

function buildMessagesFromHistory(
  rows: Array<{
    role: "user" | "assistant" | "tool";
    contentText: string | null;
    toolCalls: unknown;
    toolResults: unknown;
  }>,
): Anthropic.MessageParam[] {
  return rows.map((row): Anthropic.MessageParam => {
    if (row.role === "user") {
      return { role: "user", content: row.contentText! };
    }
    if (row.role === "assistant" && row.toolCalls) {
      return {
        role: "assistant",
        content: row.toolCalls as Anthropic.ContentBlock[],
      };
    }
    if (row.role === "tool") {
      return {
        role: "user",
        content: row.toolResults as Anthropic.ToolResultBlockParam[],
      };
    }
    return { role: "assistant", content: row.contentText! };
  });
}

export async function runAdvisorTurn(
  db: Db,
  tenantId: string,
  userId: string,
  conversationId: string,
  userMessageText: string,
): Promise<AdvisorTurnResult> {
  // Check daily token budget
  const dailyUsage = await getDailyTokenUsage(db);
  const budget = env().ADVISOR_DAILY_TOKEN_BUDGET;
  if (dailyUsage >= budget) {
    return {
      assistantText:
        "The advisor is paused for today — the daily usage limit has been reached. It will reset at midnight UTC.",
      proposals: [],
      inputTokens: 0,
      outputTokens: 0,
      model: env().MODEL_ADVISOR,
    };
  }

  // Build cached system blocks
  const [profileBlock, snapshotBlock] = await Promise.all([
    buildUserProfileBlock(db, userId),
    buildSnapshotBlock(db, tenantId, userId),
  ]);

  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: profileBlock, cache_control: { type: "ephemeral" } },
    { type: "text", text: snapshotBlock, cache_control: { type: "ephemeral" } },
  ];

  // Load conversation history
  const historyRows = await db.query.advisorMessage.findMany({
    where: eq(advisorMessage.conversationId, conversationId),
    columns: {
      role: true,
      contentText: true,
      toolCalls: true,
      toolResults: true,
    },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  // Persist user message
  await db.insert(advisorMessage).values({
    tenantId,
    conversationId,
    role: "user",
    contentText: userMessageText,
  });

  const client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });
  const ctx: ToolContext = { db, tenantId, userId, proposals: [] };

  const messages: Anthropic.MessageParam[] = [
    ...buildMessagesFromHistory(historyRows),
    { role: "user", content: userMessageText },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let rounds = 0;
  let response: Anthropic.Message;

  // Tool call loop
  do {
    response = await client.messages.create({
      model: env().MODEL_ADVISOR,
      max_tokens: 4000,
      system: systemBlocks,
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    if (response.stop_reason !== "tool_use") break;

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // Persist intermediate assistant message (tool calls)
    await db.insert(advisorMessage).values({
      tenantId,
      conversationId,
      role: "assistant",
      contentText: null,
      toolCalls: response.content as unknown as Record<string, unknown>[],
      model: env().MODEL_ADVISOR,
    });

    // Execute tools
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      let result: unknown;
      try {
        result = await executeTool(block.name, block.input, ctx);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Tool execution failed" };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    // Persist tool results message
    await db.insert(advisorMessage).values({
      tenantId,
      conversationId,
      role: "tool",
      contentText: null,
      toolResults: toolResults as unknown as Record<string, unknown>[],
    });

    // Append to in-flight messages
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    rounds++;
  } while (rounds < MAX_TOOL_ROUNDS);

  // Get final text
  let finalText =
    response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";

  if (rounds >= MAX_TOOL_ROUNDS && response.stop_reason === "tool_use") {
    finalText =
      finalText ||
      "I've gathered the available data but reached the tool limit for this turn. Here's what I found so far.";
  }

  // Apply output filter with up to 2 retries
  let filterResult = applyOutputFilter(finalText);
  let filterRetries = 0;

  while (!filterResult.ok && filterResult.flaggedTicker && filterRetries < 2) {
    const retryResponse = await client.messages.create({
      model: env().MODEL_ADVISOR,
      max_tokens: 4000,
      system: systemBlocks,
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
      messages: [
        ...messages,
        { role: "assistant", content: finalText },
        {
          role: "user",
          content: `Your response contained a specific security ticker or fund abbreviation (${filterResult.flaggedTicker}). Remove all specific ticker symbols and retry.`,
        },
      ],
    });
    totalInputTokens += retryResponse.usage.input_tokens;
    totalOutputTokens += retryResponse.usage.output_tokens;
    finalText =
      retryResponse.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    filterResult = applyOutputFilter(finalText);
    filterRetries++;
  }

  const outputText = filterResult.ok ? (filterResult.text ?? finalText) : GENERIC_FILTER_ERROR;

  // Persist final assistant message
  const [finalMsg] = await db
    .insert(advisorMessage)
    .values({
      tenantId,
      conversationId,
      role: "assistant",
      contentText: outputText,
      model: env().MODEL_ADVISOR,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    })
    .returning({ id: advisorMessage.id });

  // Persist proposals
  if (ctx.proposals.length > 0 && finalMsg?.id) {
    await db.insert(pendingProposal).values(
      ctx.proposals.map((draft) => ({
        tenantId,
        id: draft.id,
        advisorMessageId: finalMsg.id,
        kind: draft.kind,
        payload: draft.payload,
        status: "pending" as const,
      })),
    );
  }

  return {
    assistantText: outputText,
    proposals: ctx.proposals,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    model: env().MODEL_ADVISOR,
  };
}
