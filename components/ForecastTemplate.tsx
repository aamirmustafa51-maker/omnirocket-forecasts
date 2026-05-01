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

export type Concept = {
  concept_name: string
  format: string
  hook: string
  angle: string
  primary_text: string
  visual_direction: string
  fills_gap: string
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
  ad_to_scale: { headline: string; body: string; why: string; ad_label?: string }
  ad_to_kill: { headline: string; body: string; why: string; ad_label: string }
  concepts: Concept[]
  unlocks: string[]
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

function parseAdNumber(label?: string): number | null {
  if (!label) return null
  const m = label.match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

function FieldText({ value, missingLabel }: { value: string; missingLabel: string }) {
  if (value && value.trim()) return <>&ldquo;{value}&rdquo;</>
  return <span className="field-missing">({missingLabel})</span>
}

export default function ForecastTemplate({
  data,
  slug
}: {
  data: ForecastData
  slug: string
}) {
  const phClasses = ["ph-1", "ph-2", "ph-3", "ph-4", "ph-5"]

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
                <div className="creative-head-headline"><FieldText value={ad.headline} missingLabel="headline empty in Meta Ad Library" /></div>
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

      {data.ads_compact.length > 0 && (
        <div className="summary-rest">
          <div className="sr-head">
            The other {data.ads_compact.length} {data.ads_compact.length === 1 ? "ad" : "ads"} (analyzed, lower priority)
          </div>
          <table>
            <tbody>
              {data.ads_compact.map((a, i) => (
                <tr key={i}>
                  <td>
                    <strong><FieldText value={a.headline} missingLabel="headline empty in Meta Ad Library" /></strong>
                  </td>
                  <td className="body"><FieldText value={a.body} missingLabel="no body copy on this ad" /></td>
                  <td className="score-cell">
                    {a.fatigue_score} · ~{a.days_until_fatigue}d
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>What we'd do this week</h2>
      <div className="verdict-pair">
        {(() => {
          const scaleNum = parseAdNumber(data.ad_to_scale.ad_label)
          const scaleHasImg = scaleNum != null && adImageExists(slug, scaleNum)
          const killNum = parseAdNumber(data.ad_to_kill.ad_label)
          const killHasImg = killNum != null && adImageExists(slug, killNum)
          const sameAd =
            (scaleNum != null && killNum != null && scaleNum === killNum) ||
            data.ad_to_scale.headline.trim() === data.ad_to_kill.headline.trim()
          return (
            <>
              <div className={`verdict scale${sameAd ? " solo" : ""}`}>
                <div className="verdict-tag">Scale this one</div>
                <div className="verdict-head">
                  <div className="verdict-thumb t-scale">
                    {scaleHasImg && (
                      <img
                        src={`/creatives/${slug}/creative-${scaleNum}.jpg`}
                        alt={`Ad #${scaleNum} creative`}
                      />
                    )}
                  </div>
                  <div className="verdict-head-text">
                    <h3><FieldText value={data.ad_to_scale.headline} missingLabel="headline empty in Meta Ad Library" /></h3>
                    <div className="verdict-body"><FieldText value={data.ad_to_scale.body} missingLabel="no body copy on this ad" /></div>
                  </div>
                </div>
                <div className="verdict-why">{data.ad_to_scale.why}</div>
                {sameAd && (
                  <div className="verdict-solo-note">
                    Only one ad live right now — there's no second creative to kill yet. Once the
                    replacement concepts below are launched, retire this static within ~12 days to
                    avoid CPM penalty from frequency stacking.
                  </div>
                )}
              </div>
              {!sameAd && (
              <div className="verdict kill">
                <div className="verdict-tag">Kill this one today</div>
                <div className="verdict-head">
                  <div className="verdict-thumb t-kill">
                    {killHasImg && (
                      <img
                        src={`/creatives/${slug}/creative-${killNum}.jpg`}
                        alt={`Ad #${killNum} creative`}
                      />
                    )}
                  </div>
                  <div className="verdict-head-text">
                    <h3>
                      <FieldText value={data.ad_to_kill.headline} missingLabel="headline empty in Meta Ad Library" /> ({data.ad_to_kill.ad_label})
                    </h3>
                    <div className="verdict-body"><FieldText value={data.ad_to_kill.body} missingLabel="no body copy on this ad" /></div>
                  </div>
                </div>
                <div className="verdict-why">{data.ad_to_kill.why}</div>
              </div>
              )}
            </>
          )
        })()}
      </div>

      <h2>{data.concepts.length} replacement {data.concepts.length === 1 ? "concept" : "concepts"} in your voice</h2>
      {data.concepts.map((c, i) => (
        <div key={i} className="concept">
          <div className="concept-head">
            <div className="concept-name">{c.concept_name}</div>
            <div className="concept-format">{c.format}</div>
          </div>
          <div className="concept-row">
            <div className="k">Hook</div>
            <div className="v hook">"{c.hook}"</div>
          </div>
          <div className="concept-row">
            <div className="k">Angle</div>
            <div className="v">{c.angle}</div>
          </div>
          <div className="concept-row">
            <div className="k">Primary text</div>
            <div className="v">{c.primary_text}</div>
          </div>
          <div className="concept-row">
            <div className="k">Visual</div>
            <div className="v">{c.visual_direction}</div>
          </div>
          <div className="concept-gap">
            <strong>Gap this fills</strong>
            {c.fills_gap}
          </div>
        </div>
      ))}

      <div className="unlocks">
        <h2>If you ship these in the next 14 days</h2>
        <ul>
          {data.unlocks.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      </div>

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

