import ProspectLogo from "@/components/ProspectLogo"

type AdsHook = {
  label: string
  pattern_explanation: string
  example_ads?: number[]
  example_copy: string
  why_it_works: string
}

type AdsAnalysis = {
  competitor_name: string
  summary: string
  hooks: AdsHook[]
  swipeable_headlines: string[]
}

type AngleEntry =
  | string
  | { label?: string; angle_explanation?: string; verbatim_proof?: string; why_it_works?: string }

type SiteAnalysis = {
  competitor_name: string
  summary: string
  leading_angle: {
    label: string
    angle_explanation: string
    verbatim_proof: string
    why_it_works: string
  }
  secondary_angles: AngleEntry[]
  likely_ad_directions: AngleEntry[]
  swipeable_headlines: string[]
}

export type CompetitorBlock =
  | {
      name: string
      domain: string | null
      instagram_handle: string | null
      type: "ads"
      active_ad_count: number
      ads_analysis: AdsAnalysis
    }
  | {
      name: string
      domain: string | null
      instagram_handle: string | null
      type: "website"
      about_url: string | null
      site_analysis: SiteAnalysis
    }
  | {
      name: string
      domain: string | null
      instagram_handle: string | null
      type: "skipped"
      reason: string
    }

export type TeardownData = {
  lead_company: string
  lead_first_name: string
  lead_aesthetic: string | null
  competitors: CompetitorBlock[]
  generated_at: string
}

const CALENDLY_URL = "https://calendly.com/kyle-hamar/30min"
const LOGODEV_TOKEN = "pk_ZezWvcllSnOBRBeLqqlx6g"
const PREPARED_BY = "Prepared by Kyle Hamar — OmniRocket"

function angleText(a: AngleEntry): { label?: string; body: string } {
  if (typeof a === "string") return { body: a }
  const body =
    a.angle_explanation ||
    a.why_it_works ||
    a.verbatim_proof ||
    ""
  return { label: a.label, body }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  } catch {
    return iso
  }
}

function competitorWebsite(domain: string | null): string {
  if (!domain) return ""
  return domain.startsWith("http") ? domain : `https://${domain}`
}

function tldr(data: TeardownData): string {
  const ads = data.competitors.filter((c) => c.type === "ads") as Extract<
    CompetitorBlock,
    { type: "ads" }
  >[]
  const sites = data.competitors.filter((c) => c.type === "website")
  const skipped = data.competitors.filter((c) => c.type === "skipped")

  const parts: string[] = []
  if (ads.length > 0) {
    const totalAds = ads.reduce((sum, c) => sum + c.active_ad_count, 0)
    const names = ads.map((c) => c.name).join(", ")
    parts.push(
      `${names} ${ads.length === 1 ? "is" : "are"} actively running Meta ads (${totalAds} live creative${totalAds === 1 ? "" : "s"} between them) — so we extracted the hook patterns they're betting on.`,
    )
  }
  if (sites.length > 0) {
    const names = sites.map((c) => c.name).join(", ")
    parts.push(
      `${names} ${sites.length === 1 ? "isn't" : "aren't"} running ads right now — so we read ${sites.length === 1 ? "their site" : "their sites"} for the angle they'd most likely test next.`,
    )
  }
  if (skipped.length > 0) {
    parts.push(`${skipped.length} couldn't be analyzed (notes inline below).`)
  }
  return parts.join(" ")
}

export default function TeardownTemplate({ data }: { data: TeardownData }) {
  return (
    <div className="wrap">
      {/* Brand bar — prospect logo isn't available for teardowns (no website
          scrape baked in yet), so we lean on a wordmark fallback inside
          ProspectLogo via empty website + brand text. */}
      <div className="brand-bar">
        <div className="left">
          <ProspectLogo
            website={`https://${data.lead_company.toLowerCase().replace(/\s+/g, "")}.com`}
            brand={data.lead_company}
            token={LOGODEV_TOKEN}
          />
        </div>
        <div className="right">
          <span className="by-line">Prepared by</span>
          <img className="om-logo" src="/omnirocket-logo.png" alt="OmniRocket" />
        </div>
      </div>

      <header className="intro">
        <div className="eyebrow">Competitor Teardown · Prepared for {data.lead_first_name}</div>
        <h1>
          What {data.competitors.length} of {data.lead_company}'s closest competitors are doing in Meta ads right now.
        </h1>
        <div className="meta">Built {formatDate(data.generated_at)} · 4-min read</div>
      </header>

      <div className="tldr">
        <p>{tldr(data)}</p>
      </div>

      {data.competitors.map((c, i) => (
        <section key={i} className="td-comp">
          <div className="td-comp-head">
            <div className="td-comp-name">
              {c.domain ? (
                <a href={competitorWebsite(c.domain)} target="_blank" rel="noopener">
                  {c.name}
                </a>
              ) : (
                c.name
              )}
            </div>
            <div className="td-comp-badge">
              {c.type === "ads" && (
                <span className="td-badge td-badge-ads">
                  {c.active_ad_count} live ad{c.active_ad_count === 1 ? "" : "s"}
                </span>
              )}
              {c.type === "website" && <span className="td-badge td-badge-site">Not advertising — site read</span>}
              {c.type === "skipped" && <span className="td-badge td-badge-skip">Couldn't analyze</span>}
            </div>
          </div>

          {c.type === "ads" && (
            <>
              <p className="td-summary">{c.ads_analysis.summary}</p>

              <h3 className="td-section-h">The hook patterns they're betting on</h3>
              <div className="td-hooks">
                {c.ads_analysis.hooks.map((h, j) => (
                  <div key={j} className="td-hook">
                    <div className="td-hook-label">{h.label}</div>
                    <p className="td-hook-pattern">{h.pattern_explanation}</p>
                    <blockquote className="td-hook-quote">&ldquo;{h.example_copy}&rdquo;</blockquote>
                    <div className="td-hook-why">
                      <span className="td-hook-why-tag">Why it works</span>
                      <p>{h.why_it_works}</p>
                    </div>
                  </div>
                ))}
              </div>

              {c.ads_analysis.swipeable_headlines?.length > 0 && (
                <>
                  <h3 className="td-section-h">Swipe these headlines</h3>
                  <ul className="td-swipe">
                    {c.ads_analysis.swipeable_headlines.map((h, j) => (
                      <li key={j}>{h}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {c.type === "website" && (
            <>
              <p className="td-summary">{c.site_analysis.summary}</p>

              <h3 className="td-section-h">Their leading angle</h3>
              <div className="td-hook">
                <div className="td-hook-label">{c.site_analysis.leading_angle.label}</div>
                <p className="td-hook-pattern">{c.site_analysis.leading_angle.angle_explanation}</p>
                <blockquote className="td-hook-quote">
                  &ldquo;{c.site_analysis.leading_angle.verbatim_proof}&rdquo;
                </blockquote>
                <div className="td-hook-why">
                  <span className="td-hook-why-tag">Why it works</span>
                  <p>{c.site_analysis.leading_angle.why_it_works}</p>
                </div>
              </div>

              {c.site_analysis.secondary_angles?.length > 0 && (
                <>
                  <h3 className="td-section-h">Secondary angles</h3>
                  <ul className="td-angles">
                    {c.site_analysis.secondary_angles.map((a, j) => {
                      const t = angleText(a)
                      return (
                        <li key={j}>
                          {t.label ? <strong>{t.label}: </strong> : null}
                          {t.body}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}

              {c.site_analysis.likely_ad_directions?.length > 0 && (
                <>
                  <h3 className="td-section-h">Where they'd likely take this in ads</h3>
                  <ul className="td-angles">
                    {c.site_analysis.likely_ad_directions.map((a, j) => {
                      const t = angleText(a)
                      return (
                        <li key={j}>
                          {t.label ? <strong>{t.label}: </strong> : null}
                          {t.body}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}

              {c.site_analysis.swipeable_headlines?.length > 0 && (
                <>
                  <h3 className="td-section-h">Swipe these headlines</h3>
                  <ul className="td-swipe">
                    {c.site_analysis.swipeable_headlines.map((h, j) => (
                      <li key={j}>{h}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {c.type === "skipped" && (
            <p className="td-skip-note">
              Skipped: <code>{c.reason}</code>. Most often this is a missing site or a brand
              that's gone dark on both ads and their domain.
            </p>
          )}
        </section>
      ))}

      <div className="next-step">
        <div className="urgency">⚡ Knowing what to copy is half the work — building it is the other half.</div>
        <h2>Want hooks like these built specifically for {data.lead_company}?</h2>
        <p className="next-step-body">
          We'll take the same teardown frame above, plus your raw assets, and ship 10–20 production-ready hook variations (image + video) for {data.lead_company} every week. 30 minutes is enough to scope it.
        </p>
        <div className="cta-row">
          <a className="cta-primary" href={CALENDLY_URL} target="_blank" rel="noopener">
            Book your 30 minutes
          </a>
        </div>
      </div>

      <footer>
        <div className="pb">{PREPARED_BY}</div>
        Hooks reverse-engineered from active Meta Ad Library creatives + public site copy. Patterns are illustrative; we don't claim performance data on competitor accounts.
      </footer>
    </div>
  )
}
