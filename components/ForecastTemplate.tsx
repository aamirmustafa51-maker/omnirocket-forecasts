import fs from "fs"
import path from "path"
import ProspectLogo from "./ProspectLogo"

export type Ad = {
  ad_number: number
  headline: string
  body: string
  cta?: string
  fatigue_score: number
  days_until_fatigue: number
  drivers: string[]
  severity?: "danger" | "warn" | "ok"
}

export type CompactAd = {
  headline: string
  body: string
  fatigue_score: number
  days_until_fatigue: number
}

export type HeroConcept = {
  concept_name: string
  format: string
  hook: string
  headline: string
  primary_text: string
  cta: string
  visual_direction: string
  fills_gap: string
  image_prompt?: string
  image_path?: string | null
  reference_title?: string | null
  reference_url?: string | null
}

export type ForecastData = {
  brand: string
  brand_slug: string
  first_name: string
  website: string
  generated_date: string
  read_time_min: number
  total_ads: number
  tldr: string
  benchmark: {
    your_value_days: number
    category_median_days: number
    top_quartile_days: number
    context: string
  }
  ads: Ad[]
  ads_compact: CompactAd[]
  hero_concept: HeroConcept
  next_step: {
    urgency: string
    headline: string
    body: string
    calendly_url: string
  }
  prepared_by: string
  method_note: string
  logodev_token: string
}

function severityFor(score: number): "danger" | "warn" | "ok" {
  if (score >= 85) return "danger"
  if (score >= 65) return "warn"
  return "ok"
}

function adImageExists(slug: string, n: number): boolean {
  const p = path.join(process.cwd(), "public", "creatives", slug, `creative-${n}.jpg`)
  return fs.existsSync(p)
}

function mockupImageExists(slug: string): boolean {
  const p = path.join(process.cwd(), "public", "creatives", slug, "hero-mockup.jpg")
  return fs.existsSync(p)
}

// Detects unmerged template tokens like {{product.name}}, {% ... %}, or
// `default_collection_headline` / `default_*_*` placeholders that bleed
// through when a brand's CMS template fails to render.
const LIQUID_TOKEN = /\{\{[^}]+\}\}|\{%[^%]+%\}|\bdefault_[a-z_]+\b/i
function looksLikeBrokenToken(value: string): boolean {
  return LIQUID_TOKEN.test(value)
}

function FieldText({ value, missingLabel }: { value: string; missingLabel: string }) {
  if (!value || !value.trim()) return <span className="field-missing">({missingLabel})</span>
  if (looksLikeBrokenToken(value)) {
    return (
      <span className="field-broken-token">
        (their CMS template didn't render — the live ad shows: <code>{value}</code>)
      </span>
    )
  }
  return <>&ldquo;{value}&rdquo;</>
}

function brandDomain(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, "")
  } catch {
    return website
  }
}

export default function ForecastTemplate({
  data,
  slug
}: {
  data: ForecastData
  slug: string
}) {
  const phClasses = ["ph-1", "ph-2", "ph-3", "ph-4", "ph-5"]
  const hero = data.hero_concept
  const heroImageReady = hero && hero.image_path && mockupImageExists(slug)

  return (
    <div className="wrap">
      {/* Brand bar */}
      <div className="brand-bar">
        <div className="left">
          <ProspectLogo
            website={data.website}
            brand={data.brand}
            token={data.logodev_token}
          />
        </div>
        <div className="right">
          <span className="by-line">Prepared by</span>
          <img className="om-logo" src="/omnirocket-logo.png" alt="OmniRocket" />
        </div>
      </div>

      {/* Header */}
      <header className="intro">
        <div className="eyebrow">
          Fatigue Forecast · Prepared for {data.first_name}
        </div>
        <h1>
          {data.brand} — your {data.ads.length} live Meta {data.ads.length === 1 ? "ad" : "ads"}, modeled.
        </h1>
        <div className="meta">
          Built {data.generated_date} · {data.read_time_min}-min read
        </div>
      </header>

      <div className="tldr">
        <p>{data.tldr}</p>
      </div>

      <h2>Where you sit today</h2>
      <div className="benchmark">
        <div className="you">
          <div className="num">{data.benchmark.your_value_days}d</div>
          <div className="lbl">Your creative half-life</div>
        </div>
        <div className="median">
          <div className="num">{data.benchmark.category_median_days}d</div>
          <div className="lbl">Category median</div>
        </div>
        <div className="top">
          <div className="num">{data.benchmark.top_quartile_days}d</div>
          <div className="lbl">Top quartile</div>
        </div>
      </div>
      <p className="benchmark-context">{data.benchmark.context}</p>

      <h2>Your {data.ads.length} most fatigued {data.ads.length === 1 ? "ad" : "ads"}</h2>

      {[...data.ads].sort((a, b) => a.ad_number - b.ad_number).map((ad, i) => {
        const sev = ad.severity ?? severityFor(ad.fatigue_score)
        const hasImage = adImageExists(slug, ad.ad_number)
        return (
          <div key={i} className={`creative-card severity-${sev}`}>
            <div className="creative-head">
              <div className={`creative-thumb ${hasImage ? "" : phClasses[i % 5]}`}>
                <span className="creative-thumb-tag">Ad #{ad.ad_number}</span>
                {hasImage ? (
                  <img
                    src={`/creatives/${slug}/creative-${ad.ad_number}.jpg`}
                    alt={`Ad #${ad.ad_number} creative`}
                  />
                ) : (
                  <div className="creative-thumb-placeholder">Ad creative</div>
                )}
              </div>
              <div className="creative-head-left">
                <div className="creative-tag">Ad #{ad.ad_number}</div>
                <div className="creative-head-headline"><FieldText value={ad.headline} missingLabel="no headline on this ad" /></div>
                <div className="creative-head-body"><FieldText value={ad.body} missingLabel="no body copy on this ad" /></div>
              </div>
              <div className="creative-score">
                <div className="creative-score-num">{ad.fatigue_score}</div>
                <div className="creative-score-lbl">Fatigue score</div>
              </div>
            </div>
            <div className="creative-bar">
              <div
                className="creative-bar-fill"
                style={{ width: `${ad.fatigue_score}%` }}
              />
            </div>
            <div className="creative-bar-labels">
              <span>Fresh</span>
              <span>
                <strong className="days-num">
                  ~{ad.days_until_fatigue} days
                </strong>{" "}
                until fatigue
              </span>
              <span>Burnt</span>
            </div>
            <ul className="drivers">
              {ad.drivers.map((d, j) => (
                <li key={j}>{d}</li>
              ))}
            </ul>
          </div>
        )
      })}

      {/* Hero Concept Mockup — image generated by Nano Banana 2 wrapped in FB ad chrome */}
      {hero && (
        <>
          <h2>Here's the ad we'd run for you</h2>
          <div className="hero-mockup">
            <div className="fb-ad">
              <div className="fb-ad-header">
                <ProspectLogo
                  website={data.website}
                  brand={data.brand}
                  token={data.logodev_token}
                  className="fb-ad-avatar"
                />
                <div className="fb-ad-meta">
                  <div className="fb-ad-pagename">{data.brand}</div>
                  <div className="fb-ad-sponsored">Sponsored · <span aria-label="globe">🌐</span></div>
                </div>
              </div>
              <div className="fb-ad-primary">{hero.primary_text}</div>
              <div className="fb-ad-image">
                {heroImageReady ? (
                  <img src={`/creatives/${slug}/hero-mockup.jpg`} alt={hero.concept_name} />
                ) : (
                  <div className="fb-ad-image-fallback">
                    <div className="fb-ad-image-fallback-label">Visual direction</div>
                    <div className="fb-ad-image-fallback-text">{hero.visual_direction}</div>
                  </div>
                )}
              </div>
              <div className="fb-ad-footer">
                <div className="fb-ad-footer-left">
                  <div className="fb-ad-domain">{brandDomain(data.website)}</div>
                  <div className="fb-ad-headline">{hero.headline}</div>
                </div>
                <button className="fb-ad-cta" type="button">{hero.cta}</button>
              </div>
            </div>
            {hero.reference_title && (
              <div className="hero-mockup-disclaimer">
                Mocked from your{" "}
                {hero.reference_url ? (
                  <a href={hero.reference_url} target="_blank" rel="noopener">
                    {hero.reference_title}
                  </a>
                ) : (
                  <em>{hero.reference_title}</em>
                )}
                {" "}· AI rendering from public catalog photos — directional, not exact.
              </div>
            )}
            <div className="hero-mockup-rationale">
              <div className="hero-mockup-tag">Why this concept</div>
              <p>{hero.fills_gap}</p>
              <div className="hero-mockup-meta">
                <span><strong>Format:</strong> {hero.format}</span>
                <span><strong>Hook:</strong> &ldquo;{hero.hook}&rdquo;</span>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="next-step">
        <div className="urgency">⚠ {data.next_step.urgency}</div>
        <h2>{data.next_step.headline}</h2>
        <p>{data.next_step.body}</p>
        <div className="cta-row">
          <a
            className="cta-primary"
            href={data.next_step.calendly_url}
            target="_blank"
            rel="noopener"
          >
            Book your 30 minutes →
          </a>
          <span className="cta-secondary">
            {data.next_step.calendly_url.replace(/^https?:\/\//, "")}
          </span>
        </div>
      </div>

      <footer>
        <div className="pb">{data.prepared_by}</div>
        {data.method_note}
      </footer>
    </div>
  )
}
