import type { Metadata, Route } from "next";
import Link from "next/link";
import { TruffleMark } from "@/components/truffle-mark";
import "../landing/landing.css";

export const metadata: Metadata = {
  title: "Trust & Security — truffe.ai",
  description:
    "How truffe.ai protects your wealth data: SOC2 controls, GDPR-native data residency, tamper-evident audit log, advisor refusal policy, and bug bounty programme.",
};

export default function TrustPage() {
  return (
    <div className="landing-root">
      <TrustNav />
      <main>
        <TrustHero />
        <SectionSOC2 />
        <SectionGDPR />
        <SectionAuditChain />
        <SectionRefusalPolicy />
        <SectionDetectorTransparency />
        <SectionBugBounty />
      </main>
      <TrustFooter />
    </div>
  );
}

/* ──────────────────────────────────────────────
 * NAV
 * ────────────────────────────────────────────── */
function TrustNav() {
  return (
    <header className="landing-nav">
      <div className="landing-container">
        <div className="landing-nav-inner">
          <Link href="/landing" className="flex items-center gap-3" aria-label="truffe.ai home">
            <TruffleMark size={28} small />
            <span className="nav-wordmark">
              truffe<span className="dot">.</span>ai
            </span>
          </Link>
          <div className="nav-actions">
            <Link href="/login" className="nav-signin">
              Sign in
            </Link>
            <Link href="/login" className="btn btn-primary btn-sm">
              Get early access
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ──────────────────────────────────────────────
 * HERO
 * ────────────────────────────────────────────── */
function TrustHero() {
  return (
    <section className="section" style={{ paddingBottom: "var(--section-pad-tight)" }}>
      <div className="landing-container">
        <div className="trust-hero">
          <p className="chapter-label" style={{ marginBottom: "1rem" }}>
            Trust &amp; Security
          </p>
          <h1 className="section-h2" style={{ maxWidth: "640px" }}>
            Built to be verified,
            <br />
            not just trusted.
          </h1>
          <p
            className="section-body"
            style={{ maxWidth: "560px", marginTop: "1.25rem", color: "var(--ink-muted)" }}
          >
            Every control, every policy, and every refusal category on this page is a working system
            — not a promise. HNW operators can verify each claim independently.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
 * SECTIONS
 * ────────────────────────────────────────────── */
function SectionSOC2() {
  return (
    <TrustSection id="soc2" label="Compliance" title="SOC2 Type I — in progress from day one">
      <p>
        truffe.ai accumulates SOC2 evidence from Phase A (Supabase + Vercel infrastructure cutover).
        Formal Type I audit engagement is initiated at the end of Phase C. Type II certification
        target is 12 months after Type I.
      </p>
      <TrustTable
        rows={[
          ["Infrastructure", "Supabase (SOC2 Type 2) + Vercel (SOC2 Type 2) — inherited controls"],
          [
            "Encryption at rest",
            "AES-256 via Supabase managed encryption; aggregator tokens in Supabase Vault (KMS-backed)",
          ],
          [
            "Encryption in transit",
            "TLS 1.2+ enforced end-to-end; HSTS preload header on all responses",
          ],
          [
            "Access control",
            "Postgres Row-Level Security on every tenant-owned table; JWT claim–scoped per request",
          ],
          ["Audit log", "Append-only, hash-chained, S3 Object Lock mirror (7-year retention)"],
          ["Backups", "Supabase PITR (point-in-time recovery); nightly logical snapshot"],
          ["Audit firm", "To be named at Type I engagement kickoff"],
          [
            "Report availability",
            "Available to Family Office tier on request after Type I certification",
          ],
        ]}
      />
    </TrustSection>
  );
}

function SectionGDPR() {
  return (
    <TrustSection id="gdpr" label="Data Residency" title="GDPR-native from launch">
      <p>
        truffe.ai is EU-first. All tenant data is stored in the Supabase EU (Frankfurt, AWS
        eu-central-1) region by default. A US region project is provisioned for US-market expansion;
        tenants are routed to their region at onboarding and data does not cross regions without
        explicit tenant action.
      </p>
      <TrustTable
        rows={[
          ["Primary region", "EU — Frankfurt (AWS eu-central-1) via Supabase"],
          ["US region", "Provisioned; activated for US tenants at onboarding"],
          [
            "Cross-region transfer",
            "No automatic cross-region routing; tenant region locked at signup",
          ],
          [
            "Data subject rights",
            "Deletion, export, and rectification available on request via settings",
          ],
          [
            "Sub-processors",
            "Supabase, Vercel, Anthropic (AI inference only, no training on tenant data), Postmark/Resend (transactional email)",
          ],
          ["DPA", "Available on request for Family and Family Office tiers"],
          ["Lawful basis", "Contractual necessity (Art. 6(1)(b) GDPR)"],
        ]}
      />
    </TrustSection>
  );
}

function SectionAuditChain() {
  return (
    <TrustSection id="audit" label="Audit Log" title="Tamper-evident hash chain">
      <p>
        Every mutation in truffe.ai — every connection added, every transaction categorised, every
        fraud signal dismissed, every observer invited — is written to an append-only audit log. The
        log is hash-chained so any tampering breaks the chain visibly. Observers can verify chain
        integrity from the UI without contacting us.
      </p>
      <CodeBlock>{`-- audit_log_v2 schema (simplified)
id          bigserial primary key
tenant_id   uuid references tenant
actor_id    uuid references "user"
action      text          -- e.g. 'connection.add' | 'signal.dismiss'
target_type text
target_id   text
before      jsonb
after       jsonb
context     jsonb         -- ip_hash, user_agent, session_id
prev_hash   bytea
this_hash   bytea         -- sha256(prev_hash || canonical(row))
created_at  timestamptz`}</CodeBlock>
      <TrustTable
        rows={[
          ["Hash algorithm", "SHA-256 over canonical row serialisation"],
          ["Chain start", "Genesis row has prev_hash = 0x00…00 (32 zero bytes)"],
          ["Verification", "Observer can download signed JSON and verify chain locally"],
          [
            "Tamper detection",
            "Any row deletion or edit breaks every subsequent hash; visually flagged in UI",
          ],
          [
            "Off-site mirror",
            "Nightly replication to S3-compatible Object Lock store (WORM, compliance mode)",
          ],
          ["Retention", "7 years (SOC2 + general financial recordkeeping)"],
          [
            "Observer export",
            "Signed JSON download from /observe/audit — usable in attorney or forensic context",
          ],
        ]}
      />
    </TrustSection>
  );
}

function SectionRefusalPolicy() {
  return (
    <TrustSection
      id="refusals"
      label="Advisor Guardrails"
      title="Refusal policy — every category is hardcoded"
    >
      <p>
        The truffe.ai advisor refuses certain request categories unconditionally. These are
        hardcoded in the system prompt and enforced by an output filter — not configuration that can
        be changed per tenant. Every refusal is logged to <code>policy_event</code> for owner review
        and SOC2 evidence.
      </p>
      <TrustTable
        rows={[
          [
            "Specific securities / tickers",
            "Refused. Advisor speaks in asset classes only (e.g. 'global equity index').",
          ],
          ["Tax evasion / structuring", "Refused. Suggests licensed CPA or solicitor."],
          ["Money laundering / sanctions evasion", "Refused. Logged as category: aml."],
          [
            "Insider trading reasoning",
            "Refused when user mentions material non-public information. Logged as category: insider.",
          ],
          ["Legal advice", "Refused. Suggests attorney or solicitor."],
          [
            "Financial crisis / self-harm signals",
            "Soft refusal. Surfaces crisis line: Samaritans UK 116 123 · US 988. Logged as category: welfare.",
          ],
          [
            "Scam-enablement",
            "Advisor flags the opportunity as suspicious rather than reasoning positively about it.",
          ],
          [
            "Cross-tenant data requests",
            "Refused at DB layer (RLS) and advisor layer. Logged as category: cross_tenant.",
          ],
        ]}
      />
      <p style={{ marginTop: "1.25rem", fontSize: "0.875rem", color: "var(--ink-muted)" }}>
        Each refusal returns a structured response: category, user-facing explanation, and suggested
        next action. The raw trigger text is hashed (not stored) for PII hygiene.
      </p>
    </TrustSection>
  );
}

function SectionDetectorTransparency() {
  return (
    <TrustSection
      id="detectors"
      label="Fraud Detectors"
      title="Evidence-cited, deterministic, detective-only"
    >
      <p>
        Every fraud signal truffe.ai surfaces carries a machine-readable evidence array. The advisor
        never writes &ldquo;the model thinks&rdquo; — every claim cites a specific data point, its
        source, and the date the source was last updated. Detectors are deterministic rule engines,
        not probabilistic models, so signals are reproducible and auditable.
      </p>
      <TrustTable
        rows={[
          [
            "vendor-bec",
            "Net-new payee heuristic + anomaly vs vendor history + urgency-language scan + address-mismatch. Evidence: payee first-seen date, amount vs N-month median, memo text hash.",
          ],
          [
            "subscription-trap",
            "Recurring-engine extension. Evidence: price change amount + date, post-trial conversion flag, double-billing pair (account A × account B).",
          ],
          [
            "crypto-outflow-scam",
            "Outflow to exchange deposit address or on-chain destination cross-referenced against Chainabuse public feed + OFAC SDN crypto list. Evidence: matched address, feed source, feed update date.",
          ],
        ]}
      />
      <TrustTable
        rows={[
          [
            "Detective-only",
            "Detectors never block, never auto-act. Owner explicitly reviews and dismisses or escalates.",
          ],
          [
            "False-positive feedback",
            "Owner can dismiss with reason; tuning is per-tenant (no global learning from HNW data).",
          ],
          [
            "Feed sources",
            "Chainabuse (open, MVP) → Chainalysis / TRM Labs (commercial, post-MVP). Feed treated as untrusted upstream — sanity-checked before use.",
          ],
          [
            "Observer visibility",
            "All fraud signals are observer-visible by default. Dismissal reason is also logged and observer-readable.",
          ],
        ]}
      />
    </TrustSection>
  );
}

function SectionBugBounty() {
  return (
    <TrustSection id="bounty" label="Bug Bounty" title="Responsible disclosure">
      <p>
        truffe.ai operates a responsible disclosure programme. Valid security findings are rewarded.
        We aim to acknowledge reports within 2 business days and resolve critical findings within 14
        days.
      </p>
      <TrustTable
        rows={[
          [
            "Scope",
            "truffe.ai web application, API endpoints, authentication flows, aggregator token handling, RLS policies",
          ],
          [
            "Out of scope",
            "Social engineering, physical attacks, third-party services (Supabase, Vercel, TrueLayer), volumetric DoS",
          ],
          ["Critical (RLS bypass, token exfil, cross-tenant read)", "£2,000–£5,000"],
          ["High (auth bypass, persistent XSS, IDOR)", "£500–£2,000"],
          ["Medium (CSRF, reflected XSS, info disclosure)", "£100–£500"],
          ["Platform", "HackerOne (target: launch at end of Phase C); direct email prior to that"],
          [
            "Disclosure policy",
            "90-day coordinated disclosure window; CVE requested for critical findings",
          ],
        ]}
      />
      <p style={{ marginTop: "1.25rem", fontSize: "0.875rem", color: "var(--ink-muted)" }}>
        To report a vulnerability before the HackerOne programme launches, email security@truffe.ai
        with subject line{" "}
        <code style={{ fontSize: "0.8125rem" }}>[SECURITY] &lt;brief description&gt;</code>. PGP key
        available on request.
      </p>
    </TrustSection>
  );
}

/* ──────────────────────────────────────────────
 * SHARED PRIMITIVES
 * ────────────────────────────────────────────── */
function TrustSection({
  id,
  label,
  title,
  children,
}: {
  id: string;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section" id={id}>
      <div className="landing-container">
        <div style={{ maxWidth: "760px" }}>
          <div className="section-marker" style={{ marginBottom: "0.75rem" }}>
            <span className="chapter-label">{label}</span>
          </div>
          <h2 className="section-h2" style={{ marginBottom: "1.25rem" }}>
            {title}
          </h2>
          <div className="trust-body">{children}</div>
        </div>
      </div>
    </section>
  );
}

function TrustTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="trust-table-wrap" style={{ marginTop: "1.25rem" }}>
      <table className="trust-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="trust-td-label">{label}</td>
              <td className="trust-td-value">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="trust-code" style={{ marginTop: "1.25rem" }}>
      <code>{children}</code>
    </pre>
  );
}

/* ──────────────────────────────────────────────
 * FOOTER
 * ────────────────────────────────────────────── */
function TrustFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <div className="footer-grid">
          <div>
            <div className="flex items-center gap-3">
              <TruffleMark size={26} small />
              <span className="nav-wordmark" style={{ fontSize: 14 }}>
                truffe<span className="dot">.</span>ai
              </span>
            </div>
            <p className="footer-tag">your money already knows.</p>
          </div>
          <div>
            <div className="footer-col-title">Resources</div>
            <ul className="footer-links">
              <li>
                <a
                  href="https://github.com/hubi23798/truffe"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Legal</div>
            <ul className="footer-links">
              <li>
                <Link href={"/privacy" as Route}>Privacy</Link>
              </li>
              <li>
                <Link href={"/terms" as Route}>Terms</Link>
              </li>
              <li>
                <Link href={"/trust" as Route}>Trust &amp; Security</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 truffe.ai</span>
        </div>
      </div>
    </footer>
  );
}
