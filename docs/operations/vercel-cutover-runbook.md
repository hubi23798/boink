# Vercel Cutover Runbook

## Prerequisites

- Vercel project `truffe` imported from repo — see `docs/operations/vercel-project-setup.md`
- Supabase project `truffe-eu` (Frankfurt, eu-central-1) live and migrations applied
- Production branch: `main`. Preview branches: all.

## Operator checklist (TRU-A-07)

> **Status:** Pending operator execution. Code/config for Vercel is ready (TRU-A-06); DNS cutover requires a scheduled maintenance window.

- [ ] Vercel preview deploy green on latest `main`
- [ ] All production env vars set in Vercel
- [ ] Fly traffic snapshot taken
- [ ] DNS CNAME updated (TTL 300)
- [ ] 30-min monitoring window complete
- [ ] Smoke test passed (login, dashboard, transactions, advisor)
- [ ] 24h soak complete; Fly kept warm for rollback

## Steps

### 1. Verify preview deploy

Confirm latest `main` preview deploy on Vercel is green (build + all checks pass).

### 2. Take Fly snapshot

Record Fly.io production traffic state: active connections, volume mounts, last deploy SHA.

### 3. Update DNS

Change DNS CNAME from Fly app (`truffe-ai.fly.dev`) to Vercel project URL.
Set TTL to 300s (5 min) before the cutover window for fast propagation.

### 4. Monitor (first 30 min)

- Vercel: Functions → Execution log, error rate
- Supabase: Database → Connections (watch Supavisor pool utilization)
- Axiom: error event count vs baseline
- Vercel: Functions → Execution duration (p95 should be < 2s for API routes)

### 5. Smoke test

Log in as primary user. Verify:

- Dashboard loads with accounts and net worth
- Transactions page renders
- Advisor responds to a message
- Logout works

### 6. Hold Fly warm (24h)

Keep Fly app running for 24h for instant rollback. Do NOT scale it down.

## Rollback

Revert DNS CNAME back to Fly app URL. TTL 300 means max 5-min exposure after rollback.

## Post-cutover cleanup (after 24h soak)

```bash
mkdir -p docs/archive/fly
git mv Dockerfile fly.toml docker-compose.yml docs/archive/fly/ 2>/dev/null || true
git commit -m "chore(deploy): archive Fly.io artifacts post-Vercel cutover"
```
