# Vercel Project Setup (TRU-A-06)

**Task:** TRF-77  
**Agent:** agent:cursor

## 1. Create project

Via [Vercel dashboard](https://vercel.com/new) or CLI:

```bash
pnpm dlx vercel link
pnpm dlx vercel env pull .env.vercel.local
```

- **Framework:** Next.js
- **Root directory:** `/` (repo root)
- **Production branch:** `main`
- **Preview branches:** all PR branches

## 2. Environment variables

Copy all vars from `.env.example` into Vercel (Production + Preview):

| Variable                                                         | Notes                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL` / `SUPABASE_DB_URL`                               | Supabase pooler (6543)                                                |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | From Supabase project settings                                        |
| `SUPABASE_DB_DIRECT_URL`                                         | Direct connection (migrations only; optional on Vercel)               |
| `RP_ID`, `RP_NAME`, `ORIGIN`                                     | Production domain values                                              |
| `CRON_SECRET`                                                    | Min 16 chars; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `ANTHROPIC_API_KEY`, `AXIOM_*`                                   | As configured                                                         |

## 3. Cron jobs

`vercel.json` defines three cron routes. Set `CRON_SECRET` in Vercel env; routes accept `Authorization: Bearer` (Vercel) or `x-cron-secret` (manual).

## 4. Verify preview deploy

1. Push branch → confirm Vercel preview URL builds green.
2. Smoke: `/login`, `/trust`, `/api/health`.
3. Auth flow: passkey or magic link against preview Supabase project.

## 5. Production

Production deploys automatically on merge to `main` once the project is linked. DNS cutover (TRU-A-07) is a separate operator step — see `vercel-cutover-runbook.md`.

## Rollback

Revert DNS to Fly per cutover runbook. Vercel preview deploys remain available for hotfix validation.
