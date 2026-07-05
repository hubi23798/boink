/* ──────────────────────────────────────────────
 * Dark, minimalist native mockups.
 * Replace cream Figma screenshots.
 * Match landing palette + radius + mono headings.
 * ────────────────────────────────────────────── */

/* Product frame — content only, no browser chrome */
function MockupFrame({ children }: { children: React.ReactNode }) {
  return <div className="product-mockup">{children}</div>;
}

/* HOME — hero centerpiece. Net worth + spark + activity + ask row. */
export function HomeOverviewMockup() {
  return (
    <MockupFrame>
      <div className="mk mk-home">
        <div className="mk-meta">May 2026</div>
        <div className="mk-metric">
          <span className="mk-metric-label">Net worth</span>
          <span className="mk-metric-value">€284,520</span>
          <span className="mk-metric-delta">+11.1% YTD</span>
        </div>

        <svg viewBox="0 0 480 64" className="mk-spark" aria-hidden>
          <defs>
            <linearGradient id="mk-home-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 48 C 40 46, 80 40, 120 42 S 200 30, 240 26 S 320 18, 360 14 S 440 8, 480 4 L 480 64 L 0 64 Z"
            fill="url(#mk-home-fill)"
          />
          <path
            d="M0 48 C 40 46, 80 40, 120 42 S 200 30, 240 26 S 320 18, 360 14 S 440 8, 480 4"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>

        <ul className="mk-rows">
          <li>
            <span>Spar Food &amp; Fuel</span>
            <span className="mk-num">−€4.63</span>
          </li>
          <li>
            <span>Ninja Sushi</span>
            <span className="mk-num">−€3.00</span>
          </li>
          <li>
            <span>Deliveroo</span>
            <span className="mk-num">−€18.44</span>
          </li>
        </ul>

        <div className="mk-ask" aria-hidden>
          <span>Ask truffe anything…</span>
          <span className="mk-ask-send">→</span>
        </div>
      </div>
    </MockupFrame>
  );
}

/* WEALTH — net worth headline + larger spark + 4 stat tiles (hairline grid). */
export function WealthMockup() {
  const stats = [
    { label: "Net Worth", value: "€284,520" },
    { label: "Savings", value: "42.9%" },
    { label: "5y Forecast", value: "€612k" },
    { label: "Runway", value: "11.4 mo" },
  ];
  return (
    <MockupFrame>
      <div className="mk mk-wealth">
        <div className="mk-meta">12-month snapshot</div>
        <div className="mk-metric">
          <span className="mk-metric-label">Net worth</span>
          <span className="mk-metric-value">€284,520</span>
          <span className="mk-metric-delta">+€28,420 since May 2025</span>
        </div>

        <svg viewBox="0 0 480 100" className="mk-spark mk-spark-lg" aria-hidden>
          <defs>
            <linearGradient id="mk-w-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 80 C 40 76, 80 68, 120 70 S 200 56, 240 46 S 320 32, 360 22 S 440 12, 480 6 L 480 100 L 0 100 Z"
            fill="url(#mk-w-fill)"
          />
          <path
            d="M0 80 C 40 76, 80 68, 120 70 S 200 56, 240 46 S 320 32, 360 22 S 440 12, 480 6"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>

        <div className="mk-stats">
          {stats.map((s) => (
            <div key={s.label} className="mk-stat">
              <span className="mk-stat-label">{s.label}</span>
              <span className="mk-stat-value">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </MockupFrame>
  );
}

/* BUDGET — total spend hero + category rows w/ thin bars. */
export function BudgetMockup() {
  const cats = [
    { name: "Housing", pct: 99 },
    { name: "Groceries", pct: 58 },
    { name: "Dining", pct: 124, over: true },
    { name: "Transport", pct: 40 },
    { name: "Entertainment", pct: 42 },
  ];
  return (
    <MockupFrame>
      <div className="mk mk-budget">
        <div className="mk-meta">May 2026 · 7 days left</div>
        <div className="mk-metric">
          <span className="mk-metric-label">Total spend</span>
          <span className="mk-metric-value">€3,199</span>
          <span className="mk-metric-delta">of €3,600 limit · 88%</span>
        </div>

        <div className="mk-bar mk-bar-summary" aria-hidden>
          <span style={{ width: "88%" }} />
        </div>

        <ul className="mk-cats">
          {cats.map((c) => (
            <li key={c.name}>
              <div className="mk-cat-head">
                <span>
                  {c.name}
                  {c.over && <span className="mk-over"> OVER</span>}
                </span>
                <span className={`mk-num${c.over ? "mk-num-gold" : ""}`}>{c.pct}%</span>
              </div>
              <div className="mk-bar" aria-hidden>
                <span
                  className={c.over ? "is-over" : undefined}
                  style={{ width: `${Math.min(c.pct, 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </MockupFrame>
  );
}

/* ADVISOR — empty state matching reference screenshot exactly. */
export function AdvisorMockup() {
  return (
    <MockupFrame>
      <div className="mk mk-advisor-v2">
        <div className="mk-advisor-greeting-stack">
          <h3 className="mk-advisor-greeting">Good evening, Julia.</h3>
          <p className="mk-advisor-greeting-sub">Ready to sniff out some hidden savings?</p>
        </div>

        <div className="mk-advisor-panel">
          <div className="mk-advisor-panel-input">Ask truffe anything about your money…</div>

          <div className="mk-advisor-panel-row">
            <div className="mk-advisor-actions">
              <button type="button" className="mk-advisor-action">
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                  <path
                    d="M8 2v12M2 8h12"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                Attach
              </button>
              <button type="button" className="mk-advisor-action">
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden fill="none">
                  <circle cx="8" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.4" />
                  <path
                    d="M3 14c0-2.5 2.2-4.2 5-4.2s5 1.7 5 4.2"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                Account
              </button>
              <button type="button" className="mk-advisor-action">
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden fill="none">
                  <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.4" />
                  <path
                    d="M10.2 10.2L13.5 13.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                Search
              </button>
            </div>
            <button type="button" className="mk-advisor-send" aria-label="Send">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="none">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="mk-advisor-suggest" aria-hidden>
          <span className="mk-advisor-chip">How am I doing this month?</span>
          <span className="mk-advisor-chip">Find savings I can move</span>
          <span className="mk-advisor-chip">Plan next month&rsquo;s rent</span>
          <span className="mk-advisor-chip">Subscriptions I forgot</span>
        </div>
      </div>
    </MockupFrame>
  );
}
