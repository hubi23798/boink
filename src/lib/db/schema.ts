import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// -- Constants ----------------------------------------------------------

/** Default tenant for single-tenant dev / cron jobs. */
export const PRIMARY_TENANT_ID = "00000000-0000-0000-0000-0000000000aa";

// -- Enums --------------------------------------------------------------

export const riskToleranceEnum = pgEnum("risk_tolerance", [
  "conservative",
  "moderate",
  "aggressive",
]);

export const auditActorEnum = pgEnum("audit_actor", ["user", "advisor", "system", "cron"]);

export const accountKindEnum = pgEnum("account_kind", [
  "cash",
  "investment",
  "crypto",
  "pension",
  "property",
  "other_asset",
  "liability",
]);

export const transactionStateEnum = pgEnum("transaction_state", [
  "pending",
  "completed",
  "reverted",
  "declined",
  "failed",
]);

export const categorizedByEnum = pgEnum("categorized_by", ["rule", "llm", "manual"]);

export const importBatchSourceKindEnum = pgEnum("import_batch_source_kind", ["revolut_csv"]);

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "pending",
  "parsing",
  "awaiting_account_confirmation",
  "done",
  "partial",
  "failed",
]);

export const categoryKindEnum = pgEnum("category_kind", [
  "income",
  "expense",
  "transfer",
  "investment_flow",
]);

export const ruleMatchKindEnum = pgEnum("rule_match_kind", [
  "description_contains",
  "description_regex",
  "type_raw_equals",
  "amount_range",
  "account_id_equals",
]);

export const ruleSourceEnum = pgEnum("rule_source", ["user", "llm_accepted"]);

export const advisorMessageRoleEnum = pgEnum("advisor_message_role", ["user", "assistant", "tool"]);

export const pendingProposalKindEnum = pgEnum("pending_proposal_kind", [
  "create_rule",
  "recategorize",
]);

export const pendingProposalStatusEnum = pgEnum("pending_proposal_status", [
  "pending",
  "accepted",
  "rejected",
  "expired",
]);

export const frequencyEnum = pgEnum("frequency", ["weekly", "fortnightly", "monthly"]);

export const goalKindEnum = pgEnum("goal_kind", [
  "cash_target",
  "emergency_fund",
  "debt_payoff",
  "portfolio_target",
]);

export const tenantPlanEnum = pgEnum("tenant_plan", ["trial", "solo", "family", "family_office"]);

export const tenantRegionEnum = pgEnum("tenant_region", ["us", "eu", "uk"]);

export const memberRoleEnum = pgEnum("member_role", ["owner", "observer"]);

export const memberScopeEnum = pgEnum("member_scope", ["full_read", "ledger_only", "audit_only"]);

// -- Tables -------------------------------------------------------------

/**
 * App user profile — seeded by migration 0001 with a fixed UUID.
 */
export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  baseCurrency: text("base_currency").notNull().default("EUR"),
  locale: text("locale").notNull().default("en-IE"),
  birthYear: integer("birth_year"),
  timeHorizonYears: integer("time_horizon_years"),
  riskTolerance: riskToleranceEnum("risk_tolerance"),
  householdIncomeAnnualBaseCcy: bigint("household_income_annual_base_ccy", {
    mode: "number",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  defaultTenantId: uuid("default_tenant_id").references((): AnyPgColumn => tenant.id, {
    onDelete: "set null",
  }),
});

export const tenant = pgTable("tenant", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: tenantPlanEnum("plan").notNull().default("trial"),
  region: tenantRegionEnum("region").notNull().default("us"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantMember = pgTable(
  "tenant_member",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull(),
    scope: memberScopeEnum("scope").notNull().default("full_read"),
    invitedBy: uuid("invited_by").references(() => user.id, { onDelete: "set null" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.userId] }),
    userIdActiveIdx: index("tenant_member_user_id_idx")
      .on(t.userId)
      .where(sql`revoked_at IS NULL`),
    revokedAfterAcceptedChk: check(
      "tenant_member_revoked_after_accepted_chk",
      sql`revoked_at IS NULL OR accepted_at IS NULL OR revoked_at >= accepted_at`,
    ),
  }),
);

/**
 * Server-side sessions. The cookie carries only the session id; revocation
 * is done by deleting rows here.
 */
export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
});

/**
 * Login-attempt log for per-IP rate limiting on POST /api/auth/login.
 * Append-only; queried with `attempted_at > now() - interval '15 minutes'`.
 */
export const loginAttempt = pgTable(
  "login_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempt_ip_attempted_at_idx").on(t.ip, t.attemptedAt)],
);

/**
 * Append-only audit trail for every mutation. `actor` distinguishes
 * user / advisor / system / cron. `advisor_message_id` link added in Phase 3.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  actor: auditActorEnum("actor").notNull(),
  action: text("action").notNull(),
  targetTable: text("target_table"),
  targetId: text("target_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  advisorMessageId: uuid("advisor_message_id").references((): AnyPgColumn => advisorMessage.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Financial accounts — cash, investment, crypto, pension, property, liabilities.
 * `is_liquid` governs whether the account is included in liquid-asset totals.
 * Liabilities (kind='liability') are stored positive; net worth engine flips sign.
 */
export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: accountKindEnum("kind").notNull(),
    currency: text("currency").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    isLiquid: boolean("is_liquid").notNull().default(false),
    externalProvider: text("external_provider"),
    externalAccountId: text("external_account_id"),
    liabilityTerms: jsonb("liability_terms"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_tenant_id_idx").on(t.tenantId)],
);

/**
 * Tracks each CSV (or future source) file upload. `file_sha256` uniqueness
 * makes re-uploading the same file a fast no-op at the boundary.
 */
export const importBatch = pgTable(
  "import_batch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    accountId: uuid("account_id").references(() => account.id, { onDelete: "set null" }),
    sourceKind: importBatchSourceKindEnum("source_kind").notNull(),
    fileSha256: text("file_sha256").notNull().unique(),
    status: importBatchStatusEnum("status").notNull().default("pending"),
    rowCount: integer("row_count"),
    acceptedCount: integer("accepted_count"),
    rejectedCount: integer("rejected_count"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    importedByUserId: uuid("imported_by_user_id")
      .notNull()
      .references(() => user.id),
    notes: text("notes"),
  },
  (t) => [index("import_batch_tenant_id_idx").on(t.tenantId)],
);

/**
 * Two-level category tree (parent groups + leaf categories).
 * Seed taxonomy ships with ~20 leaves across 7 parent groups.
 */
export const category = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => category.id, {
      onDelete: "set null",
    }),
    kind: categoryKindEnum("kind").notNull(),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("category_tenant_id_idx").on(t.tenantId)],
);

/**
 * Pattern-matching rules applied in priority order during categorization.
 * First match wins. LLM-accepted suggestions are stored here once promoted.
 */
export const categorizationRule = pgTable(
  "categorization_rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull(),
    matchKind: ruleMatchKindEnum("match_kind").notNull(),
    matchValue: text("match_value").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id),
    source: ruleSourceEnum("source").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
    matchCount: integer("match_count").notNull().default(0),
  },
  (t) => [index("categorization_rule_tenant_id_idx").on(t.tenantId)],
);

/**
 * Ledger of all financial movements. Amounts stored in native currency
 * (minor units). Base-currency value derived on read via fx_rate.
 * Deduplication key: (account_id, external_id) — only when external_id set.
 */
export const transaction = pgTable(
  "transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    amountNative: bigint("amount_native", { mode: "number" }).notNull(),
    feeNative: bigint("fee_native", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull(),
    state: transactionStateEnum("state").notNull(),
    descriptionRaw: text("description_raw"),
    typeRaw: text("type_raw"),
    productRaw: text("product_raw"),
    runningBalanceNative: bigint("running_balance_native", { mode: "number" }),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    categorizedBy: categorizedByEnum("categorized_by"),
    categorizationRuleId: uuid("categorization_rule_id").references(() => categorizationRule.id, {
      onDelete: "set null",
    }),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatch.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transaction_account_id_started_at_idx").on(t.accountId, t.startedAt),
    index("transaction_category_id_idx").on(t.categoryId),
    index("transaction_import_batch_id_idx").on(t.importBatchId),
    uniqueIndex("transaction_account_external_id_udx")
      .on(t.accountId, t.externalId)
      .where(sql`"external_id" IS NOT NULL`),
    index("transaction_tenant_id_idx").on(t.tenantId),
    index("transaction_tenant_started_at_idx").on(t.tenantId, t.startedAt),
  ],
);

/**
 * Sidecar table for the never-silent-drop guarantee. Every row that fails
 * ingestion validation is recorded here with its raw content and reason.
 */
export const importBatchRejection = pgTable(
  "import_batch_rejection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatch.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    rawRowJson: jsonb("raw_row_json").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [index("import_batch_rejection_tenant_id_idx").on(t.tenantId)],
);

/**
 * Daily per-account balance close, written by cron and first-ingest backfill.
 * Truth for net worth charts. Composite PK (account_id, as_of_date).
 */
export const balanceSnapshot = pgTable(
  "balance_snapshot",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    balanceNative: bigint("balance_native", { mode: "number" }).notNull(),
    balanceBaseCcy: bigint("balance_base_ccy", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.asOfDate] }),
    index("balance_snapshot_tenant_id_idx").on(t.tenantId),
    index("balance_snapshot_tenant_as_of_date_idx").on(t.tenantId, t.asOfDate),
  ],
);

/**
 * ECB daily FX rates relative to base currency (EUR). Composite PK.
 * Missing dates fall back to most recent prior date at query time.
 */
export const fxRate = pgTable(
  "fx_rate",
  {
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    currency: text("currency").notNull(),
    rateToBase: numeric("rate_to_base", { precision: 20, scale: 10 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.asOfDate, t.currency] })],
);

/**
 * Monthly spend targets per leaf category. One row per (user, category).
 * Upsert-based — updating overwrites the previous value. No target history.
 */
export const budgetTarget = pgTable(
  "budget_target",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    amountMonthly: bigint("amount_monthly", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("budget_target_user_category_udx").on(t.userId, t.categoryId),
    index("budget_target_tenant_id_idx").on(t.tenantId),
  ],
);

export const advisorConversation = pgTable(
  "advisor_conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    isArchived: boolean("is_archived").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("advisor_conversation_tenant_id_idx").on(t.tenantId)],
);

export const advisorMessage = pgTable(
  "advisor_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => advisorConversation.id, { onDelete: "cascade" }),
    role: advisorMessageRoleEnum("role").notNull(),
    contentText: text("content_text"),
    toolCalls: jsonb("tool_calls"),
    toolResults: jsonb("tool_results"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("advisor_message_conversation_id_created_at_idx").on(t.conversationId, t.createdAt),
    index("advisor_message_tenant_id_idx").on(t.tenantId),
  ],
);

export const pendingProposal = pgTable(
  "pending_proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    advisorMessageId: uuid("advisor_message_id")
      .notNull()
      .references(() => advisorMessage.id, { onDelete: "cascade" }),
    kind: pendingProposalKindEnum("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: pendingProposalStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("pending_proposal_status_created_at_idx").on(t.status, t.createdAt),
    index("pending_proposal_tenant_id_idx").on(t.tenantId),
  ],
);

export const recurringSubscription = pgTable(
  "recurring_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    detectionKey: text("detection_key"),
    name: text("name").notNull(),
    frequency: frequencyEnum("frequency").notNull(),
    amountNative: bigint("amount_native", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    nextDue: date("next_due", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recurring_subscription_user_id_idx").on(t.userId),
    index("recurring_subscription_tenant_id_idx").on(t.tenantId),
  ],
);

export const recurringDismissal = pgTable(
  "recurring_dismissal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("recurring_dismissal_user_id_key_idx").on(t.userId, t.key),
    index("recurring_dismissal_tenant_id_idx").on(t.tenantId),
  ],
);

// -- Goals -------------------------------------------------------------

export const goal = pgTable(
  "goal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: goalKindEnum("kind").notNull(),
    targetAmount: bigint("target_amount", { mode: "number" }).notNull(), // cents in user's baseCurrency
    targetDate: date("target_date", { mode: "string" }), // nullable YYYY-MM-DD
    linkedAccountIds: uuid("linked_account_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    initialBalance: bigint("initial_balance", { mode: "number" }), // debt_payoff only: debt at creation (positive cents)
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("goal_user_id_idx").on(t.userId), index("goal_tenant_id_idx").on(t.tenantId)],
);

// -- Weekly Debrief -----------------------------------------------------

export type DebriefFlag =
  | { kind: "spending_spike"; category: string; changePct: number; message: string }
  | { kind: "spending_drop"; category: string; changePct: number; message: string }
  | { kind: "budget_overrun"; category: string; message: string }
  | { kind: "recurring_due"; name: string; message: string }
  | { kind: "income_change"; changePct: number; message: string }
  | { kind: "new_category"; category: string; message: string };

export const weeklyDebrief = pgTable(
  "weekly_debrief",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    weekEnd: date("week_end", { mode: "string" }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    narrativeText: text("narrative_text").notNull(),
    flags: jsonb("flags").$type<DebriefFlag[]>().notNull().default([]),
  },
  (t) => [
    uniqueIndex("weekly_debrief_user_week_udx").on(t.userId, t.weekStart),
    index("weekly_debrief_tenant_id_idx").on(t.tenantId),
  ],
);

// -- Audit Log V2 ------------------------------------------------------

export const auditLogV2 = pgTable(
  "audit_log_v2",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    context: jsonb("context"),
    prevHash: bytea("prev_hash").notNull(),
    thisHash: bytea("this_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCreatedIdx: index("audit_log_v2_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export type AuditLogV2 = typeof auditLogV2.$inferSelect;

// -- Inferred types -----------------------------------------------------

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type LoginAttempt = typeof loginAttempt.$inferSelect;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type ImportBatch = typeof importBatch.$inferSelect;
export type NewImportBatch = typeof importBatch.$inferInsert;
export type ImportBatchRejection = typeof importBatchRejection.$inferSelect;
export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type CategorizationRule = typeof categorizationRule.$inferSelect;
export type NewCategorizationRule = typeof categorizationRule.$inferInsert;
export type Transaction = typeof transaction.$inferSelect;
export type NewTransaction = typeof transaction.$inferInsert;
export type BalanceSnapshot = typeof balanceSnapshot.$inferSelect;
export type FxRate = typeof fxRate.$inferSelect;
export type BudgetTarget = typeof budgetTarget.$inferSelect;
export type NewBudgetTarget = typeof budgetTarget.$inferInsert;
export type AdvisorConversation = typeof advisorConversation.$inferSelect;
export type NewAdvisorConversation = typeof advisorConversation.$inferInsert;
export type AdvisorMessage = typeof advisorMessage.$inferSelect;
export type NewAdvisorMessage = typeof advisorMessage.$inferInsert;
export type PendingProposal = typeof pendingProposal.$inferSelect;
export type NewPendingProposal = typeof pendingProposal.$inferInsert;
export type RecurringSubscription = typeof recurringSubscription.$inferSelect;
export type NewRecurringSubscription = typeof recurringSubscription.$inferInsert;
export type RecurringDismissal = typeof recurringDismissal.$inferSelect;
export type NewRecurringDismissal = typeof recurringDismissal.$inferInsert;
export type Goal = typeof goal.$inferSelect;
export type NewGoal = typeof goal.$inferInsert;
export type WeeklyDebrief = typeof weeklyDebrief.$inferSelect;
export type NewWeeklyDebrief = typeof weeklyDebrief.$inferInsert;
export type Tenant = typeof tenant.$inferSelect;
export type NewTenant = typeof tenant.$inferInsert;
export type TenantMember = typeof tenantMember.$inferSelect;
export type NewTenantMember = typeof tenantMember.$inferInsert;
