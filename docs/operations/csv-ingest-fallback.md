# CSV ingest — the fallback path (TRU-BEU-10)

**Status:** Active and supported. Not deprecated by open banking.
**Spec:** `docs/superpowers/specs/2026-06-27-hnw-fraud-spine-design.md` §2.3, §5 Phase B ("CSV stays as escape hatch").

## Positioning

The marketed ingest flow is aggregator-first: live EU/UK bank connections via TrueLayer (Tink backup) once Phase B-EU ships. CSV import is **not** part of the marketed flow, but it stays as a permanent escape hatch for money that no aggregator can reach:

- private-bank accounts without PSD2 API coverage
- foreign accounts outside TrueLayer/Tink geographies
- alternative assets and sub-accounts (vaults, pockets) some providers don't expose over their API
- historical data deeper than the aggregator's history window (TrueLayer standard: 90 days)

Anything not coverable by CSV either (property, art, private equity) is handled by manual entry, not CSV.

## What works today

Format supported: **Revolut transaction CSV export** (the only `import_batch_source_kind` currently: `revolut_csv`).

- **UI:** Settings → Import CSV (`/settings/import`); per-batch detail at `/settings/import/[batchId]`.
- **API:** `POST /api/settings/import`, multipart field `file`. Limits: `.csv` extension required, 10 MB max.
- **Parser:** `src/lib/ingestion/revolut-csv.ts`. Required headers (import fails fast if any missing):
  `Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance`
- **Ingest pipeline:** `src/lib/ingestion/ingest.ts` —
  1. **File-level dedup** — SHA-256 of the file; re-uploading the same export is a 409 no-op (`DuplicateFileError`).
  2. **Account auto-creation** — accounts keyed `(externalProvider='revolut', externalAccountId='{Currency}|{Product}')`; first sight creates e.g. "Revolut EUR Savings".
  3. **Row-level dedup** — `external_id` = SHA-256 over `(Started Date, Completed Date, Amount, Fee, Description)`; unique per account, so overlapping exports import cleanly.
  4. **Never-silent-drop** — every row that fails validation lands in `import_batch_rejection` with raw content and reason; batch status becomes `partial` instead of hiding failures.
  5. **Post-ingest** — rule-based categorization + transfer heuristic, LLM classification for the remainder, balance-snapshot backfill.
- **Tenancy:** every ingest is tenant-scoped (`tenant_id` on `import_batch`, `transaction`, `import_batch_rejection`); RLS applies as on all tenant tables.
- **Untrusted input:** CSV descriptions/memos are untrusted data per merged-spec §4.5 — wrapped before any LLM contact (categorization today, fraud-detector urgency scans in Phase B/C).

## Regression guard

CSV import must keep working through and after the aggregator rollout. Coverage:

- `tests/unit/revolut-csv.test.ts` — parser contract, header validation, state mapping, rejection reasons.
- `tests/unit/ingestion-dedup.test.ts` — file- and row-level dedup invariants.

Both suites must stay green in CI. When the aggregator `Source` interface work lands (Phase B-EU Task 4), `RevolutCsvSource` remains a `Source` implementation — do not fork the ingest pipeline per source kind.

## Coexistence rules with live connections (Phase B-EU)

- A tenant can mix connection-synced accounts and CSV-imported accounts freely. Account identity keys don't collide: aggregator accounts use the provider's item/account ids; CSV accounts use `'{Currency}|{Product}'` under provider `revolut`.
- If a user connects a Revolut account live *and* has historical CSV imports for it, the accounts will appear as separate rows (different `external_account_id` namespaces). Merging is a manual operation and out of scope for Phase B — document this to design partners during onboarding.
- Fraud detectors (Phase B/C) run on transactions regardless of ingest path — CSV-imported transactions are first-class detector inputs.

## Non-goals

- No new CSV formats (other banks) until demand validates — one format, well-tested, beats five half-tested.
- No CSV in the marketed acquisition flow (spec §1 non-goals): landing and onboarding lead with live connections; CSV is mentioned as the fallback.
