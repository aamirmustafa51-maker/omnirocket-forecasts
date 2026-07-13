// The Call Prep Pack page. INTERNAL - Kyle reads this before a booked call.
//
// Two things make it different from every other template in here:
//   1. Every link is untracked. Kyle clicking his own prospect's report must not
//      show up as the prospect opening it, or the open counts become fiction.
//   2. Nothing persuades. The outbound magnets are sales assets; this is a
//      briefing. Facts are labelled as facts, guesses are labelled as guesses.
import ProspectLogo from "@/components/ProspectLogo"
import type { CallPrepData } from "@/magnets/call-prep/lib/types"

export type { CallPrepData }

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

function formatDateTime(iso: string | null): string {
  if (!iso) return "date unknown"
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return iso
  }
}

const MAGNET_LABEL: Record<string, string> = {
  forecast: "Fatigue Forecast",
  "scroll-stopper": "Scroll-Stopper Sheet",
  "brand-playbook": "Brand Playbook",
}

export default function CallPrepTemplate({ data }: { data: CallPrepData }) {
  const { copy, facts, magnet } = data
  const fullName = [data.lead_first_name, data.lead_last_name].filter(Boolean).join(" ")

  return (
    <div className="wrap cp">
      <div className="brand-bar">
        <div className="left">
          <ProspectLogo
            website={data.website}
            brand={data.lead_company}
            token={LOGODEV_TOKEN}
            scrapedUrl={data.prospect_logo_url}
          />
        </div>
        <div className="right">
          <span className="by-line">Internal brief</span>
          <img className="om-logo" src="/omnirocket-logo.png" alt="OmniRocket" />
        </div>
      </div>

      <header className="intro">
        <div className="eyebrow">Call Prep · Internal · Do not send to the brand</div>
        <h1>{data.lead_company}</h1>
        <div className="meta">
          {fullName || "(no name on file)"} · {data.lead_email} ·{" "}
          <a href={data.website} target="_blank" rel="noreferrer">{data.brand_domain}</a>
        </div>
        <div className="meta">Prepared {formatDate(data.generated_at)}</div>
      </header>

      <div className="tldr">
        <p>{copy.tldr}</p>
      </div>

      {/* ── What they got from us ─────────────────────────────────────────── */}
      <section className="cp-section">
        <div className="pb-kicker">01 · What they already have</div>
        <p className="cp-lede">
          {data.lead_first_name || "They"} received the <strong>{MAGNET_LABEL[magnet.kind] ?? magnet.kind}</strong>
          {magnet.kind === "scroll-stopper" ? " and the Brand Playbook" : ""} from the{" "}
          {data.smartlead_campaign || "cold email"} campaign. Read these before the call. They are the last thing
          the brand saw from us, and they will expect you to know what is in them.
        </p>

        <div className="cp-links">
          {magnet.playbook_url && (
            <a className="cp-link" href={magnet.playbook_url} target="_blank" rel="noreferrer">
              <span className="cp-link-label">{magnet.playbook_label ?? "Brand Playbook"}</span>
              <span className="cp-link-url">{magnet.playbook_url}</span>
              <span className="cp-link-opens">
                Opened {magnet.playbook_opens} {magnet.playbook_opens === 1 ? "time" : "times"}
              </span>
            </a>
          )}
          <a className="cp-link" href={magnet.report_url} target="_blank" rel="noreferrer">
            <span className="cp-link-label">{magnet.report_label ?? "Report"}</span>
            <span className="cp-link-url">{magnet.report_url}</span>
            <span className="cp-link-opens">
              Opened {magnet.report_opens} {magnet.report_opens === 1 ? "time" : "times"}
              {magnet.last_opened_at ? `, last on ${formatDateTime(magnet.last_opened_at)}` : ""}
            </span>
          </a>
        </div>
        <p className="cp-note">
          These are the internal links. They carry no tracking, so opening them will not add to the counts above.
        </p>
      </section>

      {/* ── The conversation ──────────────────────────────────────────────── */}
      <section className="cp-section">
        <div className="pb-kicker">02 · Every email, start to finish</div>
        {data.thread.length === 0 ? (
          <p className="cp-lede">
            The email thread could not be pulled from Smartlead for this lead. Everything below still holds, but you
            are going into the call without the transcript. Worth a manual look before you dial.
          </p>
        ) : (
          <div className="cp-thread">
            {data.thread.map((m, i) => (
              <div key={i} className={`cp-msg ${m.direction === "reply" ? "them" : "us"}`}>
                <div className="cp-msg-head">
                  <span className="cp-who">{m.direction === "reply" ? fullName || "Them" : "Kyle"}</span>
                  <span className="cp-when">{formatDateTime(m.sent_at)}</span>
                </div>
                {m.subject && (
                  <div className="cp-subject">
                    <span className="cp-subject-tag">Subject line</span>
                    {m.subject}
                  </div>
                )}
                <div className="cp-body">{m.body_text}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Deep dive ─────────────────────────────────────────────────────── */}
      <section className="cp-section">
        <div className="pb-kicker">03 · Who this brand is</div>

        <div className="cp-facts">
          <div className="cp-fact">
            <span className="cp-fact-n">{facts.product_count || "-"}</span>
            <span className="cp-fact-l">products</span>
          </div>
          <div className="cp-fact">
            <span className="cp-fact-n">{money(facts.typical_price, data.currency)}</span>
            <span className="cp-fact-l">typical price</span>
          </div>
          <div className="cp-fact">
            <span className="cp-fact-n">
              {money(facts.price_low, data.currency)} to {money(facts.price_high, data.currency)}
            </span>
            <span className="cp-fact-l">price range</span>
          </div>
          <div className="cp-fact">
            <span className="cp-fact-n">{facts.review_count || "0"}</span>
            <span className="cp-fact-l">reviews</span>
          </div>
          <div className="cp-fact">
            <span className="cp-fact-n">
              {facts.instagram_followers ? facts.instagram_followers.toLocaleString() : "-"}
            </span>
            <span className="cp-fact-l">Instagram</span>
          </div>
          <div className="cp-fact">
            <span className="cp-fact-n">{facts.running_ads}</span>
            <span className="cp-fact-l">ads running</span>
          </div>
        </div>
        <p className="cp-note">
          Scraped from their public site and the Meta ad library. The typical price is the middle of their catalog,
          which is our best public stand-in for what an order is worth. It is not their real average order value, so
          ask for that on the call.
        </p>

        {/* Each of these is its own titled block with a rule above it. Run
            together as plain paragraphs they read as one grey wall, and Kyle is
            skimming this minutes before a call. */}
        <div className="cp-block">
          <h3 className="cp-block-h">What they are</h3>
          <p>{copy.deep_dive.what_they_are}</p>
        </div>

        <div className="cp-block">
          <h3 className="cp-block-h">What they sell</h3>
          <p>{copy.deep_dive.what_they_sell}</p>
        </div>

        <div className="cp-block">
          <h3 className="cp-block-h">How they position themselves</h3>
          <p>{copy.deep_dive.positioning}</p>
        </div>

        <div className="cp-block">
          <h3 className="cp-block-h">Who buys from them</h3>
          <p>{copy.deep_dive.who_buys}</p>
        </div>

        {copy.deep_dive.customer_voice.length > 0 && (
          <div className="cp-block">
            <h3 className="cp-block-h">In their customers&rsquo; words</h3>
            <div className="cp-quotes">
              {copy.deep_dive.customer_voice.map((q, i) => (
                <blockquote key={i} className="cp-quote">{q}</blockquote>
              ))}
            </div>
          </div>
        )}

        <div className="cp-block">
          <div className="cp-two-col">
            <div>
              <h3 className="cp-block-h">What is working</h3>
              <ul className="cp-list">
                {copy.deep_dive.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="cp-block-h">Where the gaps are</h3>
              <ul className="cp-list">
                {copy.deep_dive.gaps.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── The game plan ─────────────────────────────────────────────────── */}
      <section className="cp-section">
        <div className="pb-kicker">04 · The {copy.game_plan.horizon_days}-day game plan</div>
        <p className="cp-lede">
          This is what we promised them at the bottom of the {MAGNET_LABEL[magnet.kind] ?? "report"}. They booked the
          call expecting to hear it, so lead with it.
        </p>

        <h2 className="cp-h2">{copy.game_plan.headline}</h2>

        {copy.game_plan.phases.map((p, i) => (
          <div key={i} className="cp-phase">
            <div className="cp-phase-head">
              <span className="cp-window">{p.window}</span>
              <span className="cp-goal">{p.goal}</span>
            </div>
            <dl className="cp-phase-body">
              <dt>Campaigns</dt>
              <dd>
                <ul className="cp-list">{p.campaigns.map((c, j) => <li key={j}>{c}</li>)}</ul>
              </dd>
              <dt>Lead with</dt>
              <dd>
                <ul className="cp-list">{p.lead_products.map((c, j) => <li key={j}>{c}</li>)}</ul>
              </dd>
              <dt>Creative</dt>
              <dd>{p.creative}</dd>
              <dt>Budget</dt>
              <dd>{p.budget}</dd>
              <dt>Success looks like</dt>
              <dd>{p.what_success_looks_like}</dd>
            </dl>
          </div>
        ))}

        <h3 className="cp-h3">The numbers, and where they came from</h3>
        <div className="cp-estimates">
          {copy.game_plan.estimates.map((e, i) => (
            <div key={i} className="cp-estimate">
              <div className="cp-est-top">
                <span className="cp-est-label">{e.label}</span>
                <span className="cp-est-value">{e.value}</span>
              </div>
              <div className="cp-est-basis">{e.basis}</div>
            </div>
          ))}
        </div>
        <p className="cp-note">
          Every number here is an estimate built from public data. We have never seen their ad account, their store,
          or their analytics. If they ask where a number came from, read the line underneath it. Never present these
          as things we know.
        </p>

        <h3 className="cp-h3">What this plan assumes</h3>
        <ul className="cp-list">
          {copy.game_plan.assumptions.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </section>

      {/* ── Discovery ─────────────────────────────────────────────────────── */}
      <section className="cp-section">
        <div className="pb-kicker">05 · What to ask them</div>
        {copy.discovery.map((sec, i) => (
          <div key={i} className="cp-block">
            <h3 className="cp-block-h">{sec.name}</h3>
            {sec.questions.map((q, j) => (
              <div key={j} className="cp-q">
                <div className="cp-q-text">{q.question}</div>
                <div className="cp-q-listen">
                  <span className="cp-listen-tag">Listen for</span>
                  {q.listening_for}
                </div>
              </div>
            ))}
          </div>
        ))}

        {copy.other_channel_openings.length > 0 && (
          <div className="cp-block">
            <h3 className="cp-block-h">Openings beyond Meta</h3>
            <ul className="cp-list">
              {copy.other_channel_openings.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </div>
        )}
      </section>

      {/* ── Objections + red flags ────────────────────────────────────────── */}
      <section className="cp-section">
        <div className="pb-kicker">06 · What they will push back on</div>
        {copy.objections.map((o, i) => (
          <div key={i} className="cp-obj">
            <div className="cp-obj-q">&ldquo;{o.objection}&rdquo;</div>
            <div className="cp-obj-a">{o.answer}</div>
          </div>
        ))}

        {copy.red_flags.length > 0 && (
          <>
            <h3 className="cp-h3">Be careful about</h3>
            {copy.red_flags.map((r, i) => (
              <div key={i} className="cp-flag">
                <div className="cp-flag-t">{r.flag}</div>
                <div className="cp-flag-w">{r.why_it_matters}</div>
              </div>
            ))}
          </>
        )}
      </section>

      {/* What OmniRocket sells (capabilities, USPs, pricing, case studies,
          onboarding) deliberately does NOT live here. This page is a briefing:
          it tells Kyle who the brand is and what to ask them. The pitch belongs
          in a separate sales deck, which is a different artifact for a different
          audience - the brand owner, not Kyle. */}
    </div>
  )
}
