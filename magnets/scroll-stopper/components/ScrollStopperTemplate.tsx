import ProspectLogo from "@/components/ProspectLogo"

export type ScrollStopperConcept = {
  product_index: number
  product_title: string
  product_url: string
  image_url: string
  // True when the visual is an AI-generated ad concept shot from the brand's
  // real product photo (square, Meta-feed ratio). False when generation failed
  // and we fell back to the raw catalog photo, which keeps its natural aspect.
  ai_image?: boolean
  price: number | null
  compare_at_price: number | null
  on_sale: boolean
  angle_label: string
  primary_text: string
  headline: string
  cta: string
  why_it_works: string
  visual_direction?: string
}

export type ScrollStopperData = {
  lead_company: string
  lead_first_name: string
  website: string
  brand_domain: string
  currency: string
  brand_voice_note: string
  playbook_url?: string
  prospect_logo_url?: string
  concepts: ScrollStopperConcept[]
  generated_at: string
}

const CALENDLY_URL = "https://calendly.com/kyle-hamar/30min"
const LOGODEV_TOKEN = "pk_ZezWvcllSnOBRBeLqqlx6g"
const PREPARED_BY = "Prepared by Kyle Hamar - OmniRocket"

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", CAD: "$", AUD: "$", NZD: "$", GBP: "£", EUR: "€", INR: "₹",
}

function money(amount: number | null, currency: string): string {
  if (amount === null) return ""
  const sym = CURRENCY_SYMBOL[currency] ?? "$"
  // Drop the ".00" tail for whole prices so the ad reads clean.
  const n = Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
  return `${sym}${n}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  } catch {
    return iso
  }
}

export default function ScrollStopperTemplate({ data }: { data: ScrollStopperData }) {
  const n = data.concepts.length
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
        <div className="eyebrow">Scroll-Stopper Sheet · Prepared for {data.lead_first_name}</div>
        <h1>{n} Meta ads we&rsquo;d run for {data.lead_company}, built from your actual products.</h1>
        <div className="meta">Built {formatDate(data.generated_at)} · 3-min read</div>
      </header>

      <div className="tldr">
        {data.playbook_url ? (
          <p>
            Start with{" "}
            <a href={data.playbook_url} target="_blank" rel="noopener">your Brand Playbook</a>
            {" "}- the real sauce behind these {n} ads. Your voice, your customers&rsquo; exact words, and
            what you can and can&rsquo;t claim, all in one place. It&rsquo;s the source of truth we feed our
            AI so every ad stays sharp and on-brand.
            <span className="ss-same-as-email"> (same link we sent in your email)</span>
          </p>
        ) : (
          <p>
            {n} Meta ad concepts built from {data.lead_company}&rsquo;s own products, each a different angle.
            Direction to react to, not finished assets.
          </p>
        )}
      </div>

      {data.concepts.map((c, i) => (
        <section key={i} className="ss-concept">
          <div className="ss-concept-head">
            <span className="ss-concept-num">Ad {i + 1}</span>
            <span className="ss-angle-badge">{c.angle_label}</span>
          </div>

          <div className="hero-mockup">
            <div className="fb-ad">
              <div className="fb-ad-header">
                <ProspectLogo
                  website={data.website}
                  brand={data.lead_company}
                  token={LOGODEV_TOKEN}
                  scrapedUrl={data.prospect_logo_url}
                  className="fb-ad-avatar"
                />
                <div className="fb-ad-meta">
                  <div className="fb-ad-pagename">{data.lead_company}</div>
                  <div className="fb-ad-sponsored">Sponsored · <span aria-label="globe">🌐</span></div>
                </div>
              </div>
              <div className="fb-ad-primary">{c.primary_text}</div>
              {/* AI concept renders are a true 1:1 Meta square and render square.
                  A fallback catalog photo keeps its natural height (ss-native) so
                  tall products aren't sliced by the crop. */}
              <div className={`fb-ad-image${c.ai_image ? "" : " ss-native"}`}>
                <img src={c.image_url} alt={c.product_title} />
                {c.on_sale && c.compare_at_price !== null && (
                  <div className="ss-sale-flag">
                    Sale · {money(c.price, data.currency)}{" "}
                    <s>{money(c.compare_at_price, data.currency)}</s>
                  </div>
                )}
              </div>
              <div className="fb-ad-footer">
                <div className="fb-ad-footer-left">
                  <div className="fb-ad-domain">{data.brand_domain}</div>
                  <div className="fb-ad-headline">{c.headline}</div>
                </div>
                <button className="fb-ad-cta" type="button">{c.cta}</button>
              </div>
            </div>

            <div className="hero-mockup-disclaimer">
              {c.ai_image ? "Concept shot we created from your " : "Built from your "}
              <a href={c.product_url} target="_blank" rel="noopener">{c.product_title}</a>
              {c.price !== null ? ` (${money(c.price, data.currency)})` : ""}
            </div>

            <div className="hero-mockup-rationale">
              <div className="hero-mockup-tag">Why this angle</div>
              <p>{c.why_it_works}</p>
              {c.ai_image && c.visual_direction && (
                <p className="ss-visual-note">
                  <strong>The shot:</strong> {c.visual_direction}
                </p>
              )}
            </div>
          </div>
        </section>
      ))}

      <div className="next-step">
        <div className="urgency">⚡ The mockups are free. The plan is where it gets real.</div>
        <h2>Want the 90-day game plan to turn these into revenue?</h2>
        <p className="next-step-body">
          Give me 30 minutes and I&rsquo;ll build {data.lead_company} a 90-day game plan: the exact campaigns
          to launch, which products to lead with, the budget to start on, and the revenue we&rsquo;d be aiming
          to add. If it makes obvious sense to run it together, we&rsquo;ll talk next steps. If not, you keep
          the whole plan and we part as friends. Zero pressure either way.
        </p>
        <div className="cta-row">
          <a className="cta-primary" href={CALENDLY_URL} target="_blank" rel="noopener">
            Book your 30 minutes
          </a>
        </div>
      </div>

      <footer>
        <div className="pb">{PREPARED_BY}</div>
        Ad concepts built from {data.lead_company}&rsquo;s public product catalog. The ad visuals are concept
        renders created from {data.lead_company}&rsquo;s own product photos, which remain the property of
        {" "}{data.lead_company}. Copy and visuals are illustrative sample creative, not finished production assets.
      </footer>
    </div>
  )
}
