import ProspectLogo from "@/components/ProspectLogo"
import type { PlaybookData } from "@/magnets/brand-playbook/lib/types"

export type { PlaybookData }

const CALENDLY_URL = "https://calendly.com/kyle-hamar/30min"
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

export default function PlaybookTemplate({ data }: { data: PlaybookData }) {
  const cl = data.customer_language
  const sourceLine =
    data.review_count > 0
      ? `from your public site and ${data.review_count} customer reviews`
      : "from your public website"

  return (
    <div className="wrap">
      <div className="brand-bar">
        <div className="left">
          <ProspectLogo website={data.website} brand={data.lead_company} token={LOGODEV_TOKEN} />
        </div>
        <div className="right">
          <span className="by-line">Prepared by</span>
          <img className="om-logo" src="/omnirocket-logo.png" alt="OmniRocket" />
        </div>
      </div>

      <header className="intro">
        <div className="eyebrow">Brand Playbook · The Ad Brain · Prepared for {data.lead_first_name}</div>
        <h1>{data.lead_company}&rsquo;s Ad Brain: the source of truth behind every ad.</h1>
        <div className="meta">Built {formatDate(data.generated_at)} · {sourceLine} · 4-min read</div>
      </header>

      <div className="tldr">
        {data.standalone ? (
          <p>
            This is the sauce. Before we write a single ad for {data.lead_company}, we do the homework: we
            reverse-engineered your brand {sourceLine} into a working playbook. It&rsquo;s exactly what we&rsquo;d
            feed our AI so every ad stays on-brand, speaks your customers&rsquo; language, and never makes a claim
            you can&rsquo;t back. Below is the condensed version.
          </p>
        ) : (
          <p>
            This is the sauce. Before we wrote a single ad, we reverse-engineered {data.lead_company} {sourceLine}{" "}
            into a working brand playbook. This is exactly what we feed our AI so every ad stays on-brand, speaks
            your customers&rsquo; language, and never makes a claim you can&rsquo;t back. Below is the condensed version.
          </p>
        )}
      </div>

      <section className="pb-section">
        <div className="pb-kicker">01 · Brand DNA</div>
        <h2>Who {data.lead_company} is</h2>
        <ul className="pb-dna">
          <li><span className="k">Category</span>{data.brand_dna.category}</li>
          <li><span className="k">Core belief</span>{data.brand_dna.core_belief}</li>
          {data.brand_dna.proof_points?.length > 0 && (
            <li><span className="k">Proof points</span>{data.brand_dna.proof_points.join(" · ")}</li>
          )}
          <li><span className="k">Positioning</span>{data.brand_dna.positioning}</li>
        </ul>
      </section>

      {data.voice_pillars.length > 0 && (
        <section className="pb-section">
          <div className="pb-kicker">02 · Voice Pillars</div>
          <h2>How {data.lead_company} talks</h2>
          <p className="pb-lead">Pulled straight from your site copy. Every ad we write flexes these.</p>
          <div className="pb-pillars">
            {data.voice_pillars.map((p, i) => (
              <div key={i} className="pb-pillar">
                <div className="name">{p.name}</div>
                <div className="desc">{p.desc}</div>
                {p.quote && <blockquote>&ldquo;{p.quote}&rdquo;</blockquote>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(cl.phrases.length > 0 || cl.words.length > 0) && (
        <section className="pb-section">
          <div className="pb-kicker">03 · Customer Language</div>
          <h2>The exact words your customers use</h2>
          <p className="pb-lead">
            Ad copy that echoes these converts colder audiences, because it sounds like a friend, not a brand.
          </p>
          <div className="pb-lang">
            {cl.phrases.length > 0 && (
              <div className="box">
                <h4>Phrases to put in ads</h4>
                <ul className="pb-quotes">
                  {cl.phrases.map((q, i) => <li key={i}>&ldquo;{q}&rdquo;</li>)}
                </ul>
              </div>
            )}
            <div className="box">
              {cl.words.length > 0 && (
                <>
                  <h4>Words that resonate</h4>
                  <div className="pb-chips">
                    {cl.words.map((w, i) => <span key={i} className="pb-chip">{w}</span>)}
                  </div>
                </>
              )}
              {cl.avoid.length > 0 && (
                <>
                  <h4 style={{ marginTop: cl.words.length > 0 ? 16 : 0 }}>Steer away from</h4>
                  <div className="pb-chips">
                    {cl.avoid.map((w, i) => <span key={i} className="pb-chip">{w}</span>)}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="pb-section">
        <div className="pb-kicker">04 · Ideal Customer &amp; Personas</div>
        <h2>Who we target</h2>
        {data.icp && <p className="pb-lead"><strong>ICP:</strong> {data.icp}</p>}
        {data.personas.map((p, i) => (
          <div key={i} className="pb-persona">
            <div className="name">{p.name}</div>
            <div className="row">{p.description}</div>
          </div>
        ))}
      </section>

      {data.products_ladder.length > 0 && (
        <section className="pb-section">
          <div className="pb-kicker">05 · Products &amp; Price Ladder</div>
          <h2>What we&rsquo;d put spend behind</h2>
          <table className="pb-products">
            <tbody>
              <tr><th>Product</th><th>Role</th><th>Price</th></tr>
              {data.products_ladder.map((l, i) => (
                <tr key={i}>
                  <td>{l.title}</td>
                  <td>{l.role}</td>
                  <td>{money(l.price, data.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.offers.length > 0 && (
        <section className="pb-section">
          <div className="pb-kicker">06 · Offers On The Table</div>
          <h2>Current offer stack</h2>
          <div className="pb-chips">
            {data.offers.map((o, i) => <span key={i} className="pb-chip">{o}</span>)}
          </div>
        </section>
      )}

      {(data.claims.allowed.length > 0 || data.claims.banned.length > 0) && (
        <section className="pb-section">
          <div className="pb-kicker">07 · Claim Guardrails</div>
          <h2>What we can and can&rsquo;t say</h2>
          <p className="pb-lead">
            This is where most agencies get brands into trouble. These guardrails keep every ad compliant with
            FTC and ad-platform policy, so nothing gets flagged or torn down.
          </p>
          <div className="claims-grid">
            <div className="claim-col allowed">
              <h4>✓ Safe to run (already true on your site)</h4>
              <ul>
                {data.claims.allowed.map((c, i) => (
                  <li key={i}>{c.claim}<span className="why">{c.source}</span></li>
                ))}
              </ul>
            </div>
            <div className="claim-col banned">
              <h4>✗ Never claim (compliance risk)</h4>
              <ul>
                {data.claims.banned.map((c, i) => (
                  <li key={i}>{c.claim}<span className="why">{c.why}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <div className="next-step">
        <div className="urgency">⚡ This playbook is the foundation. The plan is where it turns into revenue.</div>
        <h2>Want the 90-day game plan built on top of this?</h2>
        <p className="next-step-body">
          This is the brain we&rsquo;d feed every ad for {data.lead_company}. Give me 30 minutes and I&rsquo;ll
          turn it into a 90-day game plan: the campaigns to launch, the products to lead with, and the revenue
          we&rsquo;d be aiming to add. If it makes obvious sense to run it together, we&rsquo;ll talk next steps.
          If not, you keep the whole playbook. Zero pressure either way.
        </p>
        <div className="cta-row">
          <a className="cta-primary" href={CALENDLY_URL} target="_blank" rel="noopener">Book your 30 minutes</a>
        </div>
      </div>

      <footer>
        <div className="pb">Prepared by Kyle Hamar - OmniRocket</div>
        Reverse-engineered from {data.lead_company}&rsquo;s public website and customer reviews. Claim
        guardrails are general best-practice guidance, not legal advice.
      </footer>
    </div>
  )
}
