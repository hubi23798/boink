# truffe.ai — Pricing Tiers

**Date:** 2026-06-30
**Spec reference:** `docs/superpowers/specs/2026-06-27-hnw-fraud-spine-design.md` §6.1
**Currency:** EUR (EU-first launch; USD equivalent at parity for US expansion)

---

## Billing

- **Default:** annual (12 months billed upfront).
- **Monthly option:** available at 20% premium over the annual monthly rate.
- **Trial:** 14-day free trial on Solo and Family tiers. No credit card required at trial start.
- **Demo tenant:** always accessible without signup for prospect evaluation of all features.

---

## Tiers

### Solo — €39/mo (annual) · €47/mo (monthly)

Annual price: **€468/yr**

**Who it's for:** founder, executive, or creator managing their own wealth across multiple accounts. Has — or has been burned by — a bookkeeper or wealth manager.

| Limit | Value |
|---|---|
| Owner accounts | 1 |
| Observers | 1 (read-only, audit scope only) |
| Aggregator connections | Up to 10 |
| Fraud detectors | All (vendor-bec, subscription-trap, crypto-outflow-scam) |
| Digest | Daily email to owner + observer |
| Advisor cost ceiling | Standard |
| Audit export | No |
| Role scopes | No |
| Multi-entity | No |

---

### Family — €99/mo (annual) · €119/mo (monthly)

Annual price: **€1,188/yr**

**Who it's for:** HNW family unit. Owner + spouse + accountant + attorney in one shared audit view.

Includes everything in Solo, plus:

| Limit | Value |
|---|---|
| Owner accounts | 1 |
| Observers | Up to 5 |
| Aggregator connections | Up to 10 |
| Observer role scopes | full_read / ledger_only / audit_only per observer |
| Audit log export | Yes (signed JSON download) |
| Priority sync | Yes (6h → 2h cadence) |
| Advisor cost ceiling | Raised |
| Multi-entity | No |

---

### Family Office — €399/mo (annual) · €479/mo (monthly)

Annual price: **€4,788/yr**

**Who it's for:** family office, trust, or multi-entity HNW operator. Typically $5M+ net worth across trusts, LLCs, partnerships, and multiple jurisdictions.

Includes everything in Family, plus:

| Limit | Value |
|---|---|
| Owner identity | 1 (multi-entity under single owner) |
| Entities per tenant | Trust, LLC, partnership (up to 5 in v1) |
| Observer portal | White-label (custom domain + logo) |
| Encryption | BYOK (bring-your-own-key via Supabase BYOK tier) |
| SOC2 report | Available on request |
| Support | Named support contact; SLA 4h business hours |
| Audit export | Yes — signed JSON + CSV |

---

## What's never included (any tier)

- Specific securities, fund, or crypto recommendations (hard guardrail in advisor).
- Regulated financial advice (information service, not RIA/IFA).
- Tax filing, trading, or payment execution (permanent non-goals).
- Real-time push alerts at MVP (daily digest only; real-time = Phase D).
- Mobile app at MVP (PWA only).

---

## Why no free tier

- Target persona has €500k+ NW; price elasticity at €39/mo is near zero.
- Free signups invite adversarial probing (jailbreak attempts, AML probing, subscription abuse). T&S cost on free tier exceeds revenue.
- Free tier dilutes the premium brand signal required at this price point.

---

## Discount policy (design-partner cohort only)

- First 10 design partners: 50% lifetime discount on any tier, in exchange for monthly feedback call + testimonial.
- Referral: 1 month free per referred paying tenant. Family Office: 3 months.
- No other discount programmes at launch.
