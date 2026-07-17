import ProspectLogo from "@/components/ProspectLogo"
import type { PlanData } from "@/magnets/game-plan/lib/types"

export type { PlanData }

const LOGODEV_TOKEN = "pk_ZezWvcllSnOBRBeLqqlx6g"

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", CAD: "$", AUD: "$", NZD: "$", GBP: "£", EUR: "€", INR: "₹",
}

function money(amount: number | null, currency: string): string {
  if (amount === null) return "-"
  const sym = CURRENCY_SYMBOL[currency] ?? "$"
  return `${sym}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  } catch {
    return iso
  }
}

export default function PlanTemplate({ data }: { data: PlanData }) {
  const c = data.case_study
  return (
    <div className="wrap">
      <div className="brand-bar">
        <div className="left">
          <ProspectLogo website={data.website} brand={data.lead_company} token={LOGODEV_TOKEN} scrapedUrl={data.prospect_logo_url} />
        </div>
        <div className="right">
          <span className="by-line">Prepared by</span>
          <img className="om-logo" src="/omnirocket-logo.png" alt="OmniRocket" />
        </div>
      </div>

      <header className="intro">
        <div className="eyebrow">90-Day Game Plan · Prepared for {data.lead_first_name}</div>
        <h1>The 90-day plan we&rsquo;d run for {data.lead_company}.</h1>
        <div className="meta">Built {formatDate(data.generated_at)} · built on your playbook · 5-min read</div>
      </header>

      <div className="tldr">
        <p>{data.intro}</p>
      </div>

      <section className="pb-section">
        <div className="pb-kicker">01 · Account Architecture</div>
        <h2>How we&rsquo;d structure the account</h2>
        <p className="pb-lead">Three campaigns, three separate jobs. Most brands blur these into one, which is why their results are a coin flip.</p>
        <div className="plan-arch">
          {data.architecture.map((a, i) => (
            <div key={i} className="plan-arch-card">
              <div className="plan-arch-name">{a.name}</div>
              <div className="plan-arch-job">{a.job}</div>
              <div className="plan-arch-detail">{a.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-section">
        <div className="pb-kicker">02 · The 90 Days</div>
        <h2>What happens, in order</h2>
        <p className="pb-lead">Each phase has a decision gate. We don&rsquo;t move forward on a hunch - the data tells us when to scale and what to cut.</p>
        <div className="plan-timeline">
          {data.phases.map((p, i) => (
            <div key={i} className="plan-phase">
              <div className="plan-phase-head">
                <span className="plan-phase-window">{p.window}</span>
                <span className="plan-phase-name">{p.name}</span>
                <span className="plan-phase-spend">{p.spend}</span>
              </div>
              <div className="plan-phase-goal">{p.goal}</div>
              <div className="plan-phase-cols">
                <div>
                  <h4>What we run</h4>
                  <ul>{p.running.map((r, j) => <li key={j}>{r}</li>)}</ul>
                </div>
                <div>
                  <h4>What we read</h4>
                  <ul>{p.reading.map((r, j) => <li key={j}>{r}</li>)}</ul>
                </div>
              </div>
              <div className="plan-phase-gate"><span className="k">Decision gate</span>{p.gate}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-section">
        <div className="pb-kicker">03 · Testing Framework</div>
        <h2>One variable at a time, in this order</h2>
        <p className="pb-lead">Angle first, then hook, then format. Testing everything at once tells you nothing - this order tells you exactly why something worked.</p>
        <div className="plan-tests">
          {data.testing.map((t, i) => (
            <div key={i} className="plan-test">
              <div className="plan-test-layer">{t.layer}</div>
              <div className="plan-test-q">{t.question}</div>
              <ul className="plan-test-slate">{t.slate.map((s, j) => <li key={j}>{s}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-section">
        <div className="pb-kicker">04 · Products To Lead With</div>
        <h2>Where the spend goes first</h2>
        <table className="pb-products plan-ladder">
          <tbody>
            <tr><th>Product</th><th>Role</th><th>Price</th></tr>
            {data.products_ladder.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.title}
                  <span className="plan-ladder-note">{l.note}</span>
                </td>
                <td>{l.role}</td>
                <td>{money(l.price, data.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pb-section">
        <div className="pb-kicker">05 · Proof - The Decisions Behind 5.4x</div>
        <h2>{c.name}: {c.vertical}</h2>
        <p className="pb-lead">{c.situation}</p>
        <div className="plan-metrics">
          {c.metrics.map((m, i) => (
            <div key={i} className="plan-metric">
              <div className="v">{m.value}</div>
              <div className="l">{m.label}</div>
            </div>
          ))}
        </div>
        <div className="plan-case-decisions">
          <h4>The decisions that actually moved it</h4>
          {c.decisions.map((d, i) => (
            <div key={i} className="plan-decision">
              <div className="plan-decision-what">{d.decision}</div>
              <div className="plan-decision-why">{d.rationale}</div>
            </div>
          ))}
        </div>
        <div className="plan-case-result">{c.result}</div>
        <div className="plan-ramp">
          {c.ramp.map((r, i) => (
            <div key={i} className="plan-ramp-row">
              <span className="plan-ramp-month">{r.month}</span>
              <span className="plan-ramp-val">{r.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-section">
        <div className="pb-kicker">06 · What We&rsquo;d Aim At</div>
        <h2>Targets for {data.lead_company}</h2>
        <p className="pb-lead">{data.targets.basis}</p>
        <table className="pb-products plan-targets">
          <tbody>
            <tr><th>Window</th><th>Focus</th><th>What we&rsquo;d aim at</th></tr>
            {data.targets.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.window}</td>
                <td>{r.focus}</td>
                <td>{r.aim}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="next-step">
        <div className="urgency">⚡ This is the plan. The next move is yours, no call required.</div>
        <h2>Want me to tailor this to your numbers?</h2>
        <p className="next-step-body">
          This is built on your playbook and the 3 ads we already sent. If you tell me your rough monthly ad budget and
          margins, I&rsquo;ll come back - in writing - with the specific starting budget, the exact first angles I&rsquo;d
          launch, and the revenue we&rsquo;d realistically aim to add for {data.lead_company}. No call, no pressure. Just reply
          to the email and we&rsquo;ll take it one step at a time.
        </p>
        <div className="plan-links">
          <a href={data.playbook_url} target="_blank" rel="noopener">↳ Your Brand Playbook</a>
          <a href={data.scroll_stopper_url} target="_blank" rel="noopener">↳ Your 3 Ad Mockups</a>
        </div>
      </div>

      <footer>
        <div className="pb">Prepared by Kyle Hamar - OmniRocket</div>
        Plan built from {data.lead_company}&rsquo;s public website, reviews, and the brand playbook we sent. Targets are
        modeled aims based on comparable client results, not guarantees.
      </footer>

      <style>{PLAN_CSS}</style>
    </div>
  )
}

// Plan-specific styles kept local to this component so the shared globals.css is
// untouched. Reuses the house palette variables (--ink, --line, --card, etc.).
const PLAN_CSS = `
.plan-arch { display: grid; gap: 12px; }
.plan-arch-card { background: var(--card); border: 1px solid var(--line); border-left: 3px solid #6D3BD9; border-radius: 2px; padding: 16px 18px; }
.plan-arch-name { font-weight: 700; font-size: 15px; }
.plan-arch-job { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6D3BD9; margin: 3px 0 8px; }
.plan-arch-detail { font-size: 14px; line-height: 1.55; color: var(--ink-soft); }

.plan-timeline { display: grid; gap: 16px; }
.plan-phase { background: var(--card); border: 1px solid var(--line); border-radius: 2px; padding: 18px 20px; }
.plan-phase-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.plan-phase-window { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); }
.plan-phase-name { font-weight: 700; font-size: 18px; }
.plan-phase-spend { margin-left: auto; font-size: 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: 4px 12px; color: var(--ink); }
.plan-phase-goal { font-size: 15px; line-height: 1.55; color: var(--ink); margin-bottom: 14px; }
.plan-phase-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.plan-phase-cols h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); font-family: ui-sans-serif, system-ui, sans-serif; }
.plan-phase-cols ul { margin: 0; padding-left: 18px; }
.plan-phase-cols li { font-size: 13.5px; line-height: 1.5; color: var(--ink-soft); margin-bottom: 6px; }
.plan-phase-gate { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 14px; line-height: 1.5; }
.plan-phase-gate .k { display: inline-block; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #2f6f4f; margin-right: 8px; font-weight: 700; }

.plan-tests { display: grid; gap: 12px; }
.plan-test { background: var(--card); border: 1px solid var(--line); border-radius: 2px; padding: 16px 18px; }
.plan-test-layer { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
.plan-test-q { font-size: 14px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 10px; }
.plan-test-slate { margin: 0; padding-left: 18px; }
.plan-test-slate li { font-size: 13.5px; line-height: 1.5; margin-bottom: 5px; }

.plan-ladder-note { display: block; font-size: 12.5px; color: var(--ink-soft); margin-top: 3px; line-height: 1.45; font-weight: 400; }

.plan-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 4px 0 20px; }
.plan-metric { background: var(--card); border: 1px solid var(--line); border-radius: 2px; padding: 14px 8px; text-align: center; }
.plan-metric .v { font-weight: 800; font-size: 22px; color: #6D3BD9; }
.plan-metric .l { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); margin-top: 4px; }

.plan-case-decisions { background: var(--card); border: 1px solid var(--line); border-radius: 2px; padding: 16px 18px; }
.plan-case-decisions h4 { margin: 0 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); font-family: ui-sans-serif, system-ui, sans-serif; }
.plan-decision { padding-left: 14px; border-left: 3px solid #6D3BD9; margin-bottom: 14px; }
.plan-decision:last-child { margin-bottom: 0; }
.plan-decision-what { font-weight: 700; font-size: 14.5px; line-height: 1.5; }
.plan-decision-why { font-size: 13.5px; color: var(--ink-soft); line-height: 1.55; margin-top: 4px; }

.plan-case-result { background: #f6f3fd; border: 1px solid #e3d9fa; border-radius: 2px; padding: 14px 18px; font-size: 15px; line-height: 1.55; margin: 16px 0; }

.plan-ramp { display: grid; gap: 0; border: 1px solid var(--line); border-radius: 2px; overflow: hidden; }
.plan-ramp-row { display: flex; justify-content: space-between; padding: 10px 16px; background: var(--card); border-bottom: 1px solid var(--line); font-size: 14px; }
.plan-ramp-row:last-child { border-bottom: 0; font-weight: 700; }
.plan-ramp-month { color: var(--ink-soft); }

.plan-targets td:last-child { color: var(--ink-soft); }

.plan-links { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 16px; }
.plan-links a { font-size: 14px; color: #6D3BD9; text-decoration: none; font-weight: 600; }
.plan-links a:hover { text-decoration: underline; }

@media (max-width: 560px) {
  .plan-phase-cols { grid-template-columns: 1fr; }
  .plan-metrics { grid-template-columns: repeat(2, 1fr); }
}
`
