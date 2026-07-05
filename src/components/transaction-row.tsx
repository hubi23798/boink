"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Tag, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Transaction {
  id: string;
  merchant: string;
  category?: string | null;
  categoryEmoji?: string;
  date: string;
  account?: string;
  /** Amount in cents. Negative = debit, positive = credit. */
  amountCents: number;
  currency?: string;
  pending?: boolean;
}

export interface TransactionRowProps {
  transaction: Transaction;
  categories?: string[];
  onCategoryAssign?: (transactionId: string, category: string) => void;
  onClick?: (transaction: Transaction) => void;
  className?: string;
}

const DEFAULT_CATEGORIES = [
  "Groceries",
  "Dining Out",
  "Transport",
  "Housing",
  "Utilities",
  "Entertainment",
  "Health",
  "Shopping",
  "Travel",
  "Subscriptions",
  "Income",
  "Savings Transfer",
  "Other",
];

function formatAmount(cents: number, currency = "EUR"): string {
  const abs = Math.abs(cents) / 100;
  const formatted = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return cents >= 0 ? `+${formatted}` : `−${formatted}`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const txDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - txDay.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-IE", { day: "numeric", month: "short" });
}

function merchantInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function TransactionRow({
  transaction,
  categories = DEFAULT_CATEGORIES,
  onCategoryAssign,
  onClick,
  className,
}: TransactionRowProps) {
  const {
    id,
    merchant,
    category,
    categoryEmoji,
    date,
    account,
    amountCents,
    currency = "EUR",
    pending = false,
  } = transaction;

  const [localCategory, setLocalCategory] = useState<string | null>(category ?? null);
  const isUncategorised = !localCategory;
  const isCredit = amountCents >= 0;

  function handleCategoryChange(value: string) {
    setLocalCategory(value);
    onCategoryAssign?.(id, value);
  }

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(transaction)}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(transaction);
        }
      }}
      className={cn(
        "group flex items-center gap-4 px-4 py-3 transition-colors duration-100",
        "hover:bg-elevated",
        pending && "opacity-60",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {/* Merchant avatar */}
      <div
        className="bg-elevated text-fg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[13px] font-bold select-none"
        aria-hidden="true"
      >
        {categoryEmoji ?? merchantInitials(merchant)}
      </div>

      {/* Main info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-body-strong truncate leading-tight",
              pending ? "text-fg-muted" : "text-fg-default",
            )}
          >
            {merchant}
          </span>
          {pending && (
            <span className="text-caption bg-elevated text-fg-muted flex items-center gap-1 rounded-full px-2 py-0.5">
              <Clock className="h-2.5 w-2.5" aria-hidden="true" />
              Pending
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isUncategorised ? (
            <div onClick={(e) => e.stopPropagation()} className="w-[160px]">
              <Select onValueChange={handleCategoryChange}>
                <SelectTrigger
                  className={cn(
                    "border-gold/60 h-6 rounded-full border border-dashed bg-transparent",
                    "text-gold px-2 text-[11px] font-semibold",
                    "hover:bg-gold-bg",
                  )}
                  aria-label="Assign category"
                >
                  <Tag className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
                  <SelectValue placeholder="Assign category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <span className="bg-elevated text-fg-muted rounded-full px-2 py-0.5 text-[11px] font-medium">
              {localCategory}
            </span>
          )}
          {account && <span className="text-fg-subtle text-[11px]">{account}</span>}
        </div>
      </div>

      {/* Amount + date */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={cn(
            "font-mono text-[14px] leading-tight font-bold tabular-nums",
            isCredit ? "text-success" : "text-fg-default",
          )}
          aria-label={`${isCredit ? "Credit" : "Debit"}: ${formatAmount(amountCents, currency)}`}
        >
          {formatAmount(amountCents, currency)}
        </span>
        <span className="text-fg-subtle text-[11px]">{formatDate(date)}</span>
      </div>

      {/* Hover chevron */}
      {onClick && (
        <ChevronRight
          className="text-line h-4 w-4 shrink-0 opacity-0 transition-opacity duration-100 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

interface TransactionListProps {
  transactions: Transaction[];
  categories?: string[];
  onCategoryAssign?: (transactionId: string, category: string) => void;
  onTransactionClick?: (transaction: Transaction) => void;
  className?: string;
}

export function TransactionList({
  transactions,
  categories,
  onCategoryAssign,
  onTransactionClick,
  className,
}: TransactionListProps) {
  const groups = transactions.reduce<Record<string, Transaction[]>>((acc, tx) => {
    const key = formatDate(tx.date);
    (acc[key] ??= []).push(tx);
    return acc;
  }, {});

  return (
    <div
      className={cn("border-line bg-card overflow-hidden rounded-lg border shadow-sm", className)}
    >
      {Object.entries(groups).map(([dateLabel, txs], groupIdx) => (
        <div key={dateLabel}>
          {/* Date group header */}
          <div className="bg-page sticky top-0 z-10 flex items-center justify-between px-4 py-2">
            <span className="text-caption text-fg-subtle">{dateLabel}</span>
            <span className="text-fg-subtle font-mono text-[11px] font-semibold tabular-nums">
              {formatAmount(
                txs.reduce((sum, tx) => sum + tx.amountCents, 0),
                txs[0]?.currency,
              )}
            </span>
          </div>

          {/* Rows */}
          {txs.map((tx, rowIdx) => (
            <div key={tx.id}>
              <TransactionRow
                transaction={tx}
                categories={categories}
                onCategoryAssign={onCategoryAssign}
                onClick={onTransactionClick}
              />
              {!(rowIdx === txs.length - 1 && groupIdx === Object.keys(groups).length - 1) && (
                <div className="border-line mx-4 border-b" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
