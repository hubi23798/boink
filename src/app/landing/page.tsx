import type { Metadata, Route } from "next";
import Link from "next/link";
import { TruffleMark } from "@/components/truffle-mark";
import { Reveal } from "./reveal";
import { PixelPig } from "./pixel-pig";
import { MockupParallax, MotionLink, MotionRoot, SplitHeadline } from "./motion";
import { AdvisorMockup, BudgetMockup, WealthMockup } from "./mockups";
import "./landing.css";

export const metadata: Metadata = {
  title: "truffe.ai — wealth software that works for you.",
  description:
    "A financial OS for founders, executives, and families managing wealth across multiple accounts, advisors, and jurisdictions. Audit-first. Detective-only. Built for trust.",
};

export default function LandingPage() {
  return (
    <MotionRoot>
      <div className="landing-root">
        <LandingNav />
        <main>
          <Hero />
          <FeatureBudget />
          <FeatureWealth />
          <AdvisorSection />
          <BottomCTA />
        </main>
        <LandingFooter />
      </div>
    </MotionRoot>
  );
}

/* ──────────────────────────────────────────────
 * NAV
 * ────────────────────────────────────────────── */
function LandingNav() {
  return (
    <header className="landing-nav">
      <div className="landing-container">
        <div className="landing-nav-inner">
          <Link
            href={"/landing" as Route}
            className="flex items-center gap-3"
            aria-label="truffe.ai home"
          >
            <TruffleMark size={28} small />
            <span className="nav-wordmark">
              truffe<span className="dot">.</span>ai
            </span>
          </Link>

          <div className="nav-actions">
            <Link href="/login" className="nav-signin">
              Sign in
            </Link>
            <MotionLink href="/login" className="btn btn-primary btn-sm">
              Get early access
            </MotionLink>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ──────────────────────────────────────────────
 * HERO
 * ────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="hero">
      <HeroGrain />
      <div className="landing-container">
        <Reveal>
          <div className="hero-stack">
            <h1 className="sr-only">
              Your money already knows. We just help you listen.
            </h1>

            <div className="hero-h1-top">
              <p className="line tier-1 soft">
                <SplitHeadline text="Your money" delay={0.05} />
              </p>
              <p className="line tier-1 strong">
                <SplitHeadline text="already knows." delay={0.2} />
              </p>
            </div>

            <HeroPrompt />

            <div className="hero-h1-bottom">
              <p className="line tier-2 soft">
                <SplitHeadline text="We just help you" delay={0.42} stagger={0.05} />
              </p>
              <p className="line tier-2 strong accent">
                <SplitHeadline text="listen." delay={0.62} />
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HeroPrompt() {
  return (
    <div className="hero-prompt">
      <div className="hero-prompt-lead-wrap">
        <PixelPig />
        <p className="hero-prompt-lead">Ask about a vendor, a pattern, or someone with access to your money.</p>
      </div>

      <form className="hero-prompt-form" action="/login" method="get">
        <label className="sr-only" htmlFor="hero-advisor-input">
          Ask truffe anything about your money
        </label>
        <input
          id="hero-advisor-input"
          type="text"
          readOnly
          placeholder="Ask truffe anything about your money..."
          className="hero-prompt-input"
        />
        <button type="submit" className="hero-prompt-send" aria-label="Get early access">
          <ArrowRightIcon />
        </button>
      </form>

      <div className="hero-prompt-brand" aria-label="truffe.ai">
        <TruffleMark size={22} small markColor="#311f13" ringColor="#D4BC82" coreColor="#C9A84C" />
        <span className="hero-prompt-wordmark">
          truffe<span className="dot">.</span>ai
        </span>
      </div>
    </div>
  );
}

function HeroGrain() {
  return (
    <svg className="hero-grain" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9021" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.79
                  0 0 0 0 0.66
                  0 0 0 0 0.30
                  0 0 0 1 0"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
}

/* ──────────────────────────────────────────────
 * FEATURE 1 — BUDGET
 * ────────────────────────────────────────────── */
function FeatureBudget() {
  return (
    <section className="section feature-section" id="features">
      <div className="landing-container">
        <div className="feature-story" data-visual="right">
          <Reveal className="feature-story-copy">
            <div className="section-marker">
              <span className="chapter-label">Budget</span>
            </div>
            <h2 className="section-h2">
              A monthly ritual,
              <br />
              not a monthly chore.
            </h2>
            <p className="section-body">
              truffe.ai turns your monthly budget review into a structured six-step ritual, from
              verifying your data to committing to next month&rsquo;s plan. Every step is guided,
              every decision is yours.
            </p>
            <FeatureList
              items={[
                "Category budgets with real-time progress tracking",
                "Guided monthly review with spending drivers surfaced automatically",
                "Recurring payment detection and budget conflict resolution",
              ]}
            />
          </Reveal>

          <Reveal delay={120} className="feature-story-visual">
            <MockupParallax intensity={4}>
              <BudgetMockup />
            </MockupParallax>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
 * FEATURE 2 — WEALTH
 * ────────────────────────────────────────────── */
function FeatureWealth() {
  return (
    <section className="section feature-section" data-pad="tight">
      <div className="landing-container">
        <div className="feature-story" data-visual="left">
          <Reveal className="feature-story-visual">
            <MockupParallax intensity={4}>
              <WealthMockup />
            </MockupParallax>
          </Reveal>

          <Reveal delay={120} className="feature-story-copy">
            <div className="section-marker">
              <span className="chapter-label">Wealth</span>
            </div>
            <h2 className="section-h2">
              Your net worth,
              <br />
              in full resolution.
            </h2>
            <p className="section-body">
              Track every asset and liability in one place. See your net worth trend over time,
              understand what&rsquo;s driving it, and project where it&rsquo;s heading without
              needing a spreadsheet.
            </p>
            <FeatureList
              items={[
                "Multi-account net worth with historical trend chart",
                "Asset allocation breakdown across cash, investments, and property",
                "Forward projection with goal-crossing date estimates",
              ]}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
 * ADVISOR
 * ────────────────────────────────────────────── */
function AdvisorSection() {
  return (
    <section className="section feature-section" data-pad="generous" id="advisor">
      <div className="landing-container">
        <div className="feature-story" data-visual="right">
          <Reveal className="feature-story-copy">
            <div className="section-marker">
              <span className="chapter-label">AI Advisor</span>
            </div>
            <h2 className="section-h2">
              An advisor that reads
              <br />
              your numbers,
              <br />
              not a script.
            </h2>
            <p className="section-body">
              The truffe.ai advisor is embedded in your financial data. It surfaces patterns,
              answers your questions, and proposes changes, but never acts without your explicit
              approval.
            </p>

            <div className="guardrails">
              <Guardrail
                icon={<ShieldIcon />}
                title="Read-only on your data"
                desc="The advisor sees everything, but can only propose changes. It never applies them automatically."
              />
              <Guardrail
                icon={<ClockIcon />}
                title="Contextual, not generic"
                desc="Every response is grounded in your actual transaction history, budgets, and goals."
              />
              <Guardrail
                icon={<ArrowRightIcon />}
                title="Long-term thinking"
                desc='Ask "can I afford this?" or "am I on track?" and get answers grounded in your actual trajectory.'
              />
            </div>
          </Reveal>

          <Reveal delay={120} className="feature-story-visual">
            <MockupParallax intensity={4}>
              <AdvisorMockup />
            </MockupParallax>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Guardrail({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="guardrail">
      <div className="guardrail-icon">{icon}</div>
      <div className="flex-1">
        <div className="guardrail-title">{title}</div>
        <div className="guardrail-desc">{desc}</div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
 * BOTTOM CTA
 * ────────────────────────────────────────────── */
function BottomCTA() {
  return (
    <section className="section" id="pricing">
      <div className="landing-container">
        <Reveal>
          <div className="cta-wrap">
            <h2 className="cta-h2">
              <span className="soft">Your money already knows,</span>{" "}
              <span className="strong accent">start listening</span>
            </h2>
            <p className="cta-body">
              truffe.ai is a financial OS for founders, executives, and families managing wealth
              across multiple accounts, advisors, and jurisdictions. Connect your accounts, invite a
              trusted observer, and let the audit trail surface what your data already knows.
            </p>
            <div className="cta-actions">
              <MotionLink href="/login" className="btn btn-primary">
                Get early access
                <ArrowRightIcon />
              </MotionLink>
              <MotionLink
                href={"https://github.com/hubi23798/truffe" as unknown as Route}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                <GitHubIcon />
                View on GitHub
              </MotionLink>
            </div>
            <p className="cta-foot">
              Multi-account · Observer access · AI advisor with strict guardrails
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
 * FOOTER
 * ────────────────────────────────────────────── */
function LandingFooter() {
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

          <FooterCol
            title="Resources"
            links={[
              { href: "https://github.com/hubi23798/truffe", label: "GitHub", external: true },
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
              { href: "/trust", label: "Trust & Security" },
            ]}
          />
        </div>

        <div className="footer-bottom">
          <span>© 2026 truffe.ai</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
}) {
  return (
    <div>
      <div className="footer-col-title">{title}</div>
      <ul className="footer-links">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <a
              href={l.href}
              {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ──────────────────────────────────────────────
 * SHARED
 * ────────────────────────────────────────────── */
function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="feature-list">
      {items.map((item) => (
        <li key={item}>
          <span className="tick" aria-hidden>
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
              <path
                d="M2 7.5L5.5 11L12 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

/* ──────────────────────────────────────────────
 * ICONS
 * ────────────────────────────────────────────── */
function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5L14.5 8 8 14.5M14.5 8H1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2L14 5V9C14 12.3 11.3 15 8 15C4.7 15 2 12.3 2 9V5L8 2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 8L7 9.5L10.5 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5V8.5L10 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
