# SOC2 Phase A Control Evidence

Reference: Trust Services Criteria (TSC) 2017 — Common Criteria series.

## CC6.1 Logical access — RLS

- All tenant-owned tables have RLS enabled (`pg_tables.rowsecurity = true`).
- Policy: `tenant_isolation` keyed on `auth.jwt() ->> 'active_tenant_id'`.
- Evidence: migration `0013_rls_policies.sql`; adversarial test `tests/e2e/multi-tenant-isolation.spec.ts`.

## CC6.6 Encryption in transit

- Supabase enforces TLS 1.2+ on all connections.
- Vercel enforces HTTPS on all routes; HSTS header set in `next.config.ts`.

## CC6.7 Encryption at rest

- Supabase Postgres encrypted at rest (AES-256, AWS KMS).
- Supabase Vault used for any future aggregator tokens (Phase B).

## CC7.1 Vulnerability management

- GitHub Dependabot alerts enabled at repo level (Settings → Code security), plus automated security fixes.
- Scheduled dependency scanning via `.github/dependabot.yml`: npm + github-actions ecosystems, weekly, minor/patch grouped.
- CI runs `pnpm audit --audit-level=high` on every push/PR (`.github/workflows/ci.yml`).
- Evidence: `.github/dependabot.yml`; alert feed at https://github.com/hubi23798/truffe/security/dependabot; enablement verified via `GET /repos/hubi23798/truffe/vulnerability-alerts` (204) and `automated-security-fixes` (`enabled: true`) on 2026-07-05.

## CC7.2 System monitoring

- App logs shipped to Axiom with PII redaction (`src/lib/logging/redact.ts`).
- DB logs in Supabase dashboard with 7-day retention.

## CC7.3 Anomaly detection

- Audit log (`audit_log_v2`) hash-chained; verification function `verifyChain` runnable on demand.
- Backfill caveat: pre-v2 rows use Postgres canonical JSON; forward rows use Node canonical JSON. Chain verifies in two segments. Documented for auditor.

## CC8.1 Change management

- All migrations are forward-only.
- All code changes go through PR + preview deploy + CI before merge.

## Open evidence for next phases

- CC6.1 observer-scope policies: Phase B.
- CC6.6 BYOK for Family Office tier: Phase D.
