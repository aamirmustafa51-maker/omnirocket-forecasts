// Webhook for the Call Prep Pack. Smartlead "Lead Category Updated" fires here
// when Amir flips a lead into the `Call_Booked` category after they book on
// Kyle's Calendly.
//
// This is the only INTERNAL magnet. It is never sent to the prospect. Kyle has
// no Smartlead login, no ad account for the brand, and has never spoken to them,
// so the pack has to carry everything he needs onto one page:
//
//   1. The magnet they already received, as UNTRACKED links (clicking a tracked
//      link would log Kyle's own read as the prospect opening it).
//   2. The full email thread, pulled back out of Smartlead.
//   3. A deep dive on the brand, from public data only.
//   4. The 30 or 90 day game plan their magnet's call to action promised them.
//   5. Discovery questions, objections, and what we would actually do for them.
//
// Which magnet the lead received decides the plan length, so the tracker sheet
// lookup (not the webhook payload) is the source of truth for that.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchShopifyCatalog } from "@/lib/shared/shopify-products";
import { crawlSite } from "@/lib/shared/site-crawl";
import { fetchInstagramFollowerCount } from "@/lib/shared/instagram";
import { fetchLeadThread } from "@/lib/shared/smartlead";
import { findLeadByEmail, type TrackerLead } from "@/lib/shared/sheets";
import { buildCallPrep, type KnownAd } from "@/magnets/call-prep/lib/generate";
import type { MagnetLinks } from "@/magnets/call-prep/lib/types";
import type { PlaybookData } from "@/magnets/brand-playbook/lib/types";
import {
  env, postSlack, githubGetJson, putJson, brandDomainFromWebsite,
} from "@/lib/shared/publish";

export const maxDuration = 300;
export const runtime = "nodejs";

const BASE_URL = "https://omnirocket-forecasts.vercel.app";
const SLACK_KEY = "SLACK_WEBHOOK_URL_CALL_PREP";

// The category this route acts on. Smartlead's "Lead Category Updated" event
// fires on ANY category change for a campaign, so if this webhook is registered
// campaign-wide it will also receive Lead_Forecast and Scroll_Stopper flips.
// Without the guard below, flipping a lead into any other magnet's category
// would silently build a call prep pack for a call that was never booked.
const TRIGGER_CATEGORY = "call_booked";

type WebhookPayload = {
  lead_email: string;
  campaign_id: string;
  campaign_name: string;
  category: string;
  // Manual override: force a specific magnet when a lead legitimately received
  // more than one and the newest is not the one the call is about.
  magnet_override?: "forecast" | "scroll-stopper" | "brand-playbook";
};

type LooseRecord = Record<string, unknown>;

function normalizePayload(raw: unknown): WebhookPayload {
  const r = (raw ?? {}) as LooseRecord;
  const leadData = (r.lead_data ?? {}) as LooseRecord;
  const cf = (leadData.custom_fields ?? {}) as LooseRecord;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  // Smartlead sends campaign_id as a number on some events, a string on others.
  const idStr = (v: unknown): string =>
    typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

  // The category arrives in different places depending on how the event and the
  // lead list were set up: sometimes top-level, sometimes as a Category custom
  // field. Check both, case-insensitively, like the Fatigue route does.
  const cfLower: LooseRecord = {};
  for (const k of Object.keys(cf)) cfLower[k.toLowerCase()] = cf[k];
  const category =
    str(r.category) ||
    str(r.lead_category) ||
    str(cfLower["category"]);

  const override = str(r.magnet_override);
  return {
    lead_email: str(r.lead_email) || str(leadData.email),
    campaign_id: idStr(r.campaign_id) || idStr(r.campaignId),
    campaign_name: str(r.campaign_name) || str(r.sequence_name),
    category,
    magnet_override:
      override === "forecast" || override === "scroll-stopper" || override === "brand-playbook"
        ? override
        : undefined,
  };
}

// Shape of the committed Fatigue Forecast artifact. We only want the ad copy
// back out of it - the scoring and hero mockup are irrelevant to a call brief.
type ForecastJson = {
  ads?: Array<{ headline?: string; body?: string; cta?: string }>;
};

// A lead can appear in more than one tab (got the Forecast in March, the
// Scroll-Stopper in July). The call is almost always about the LAST thing we
// sent, so default to the newest row and let the operator override.
function pickRow(rows: TrackerLead[], override?: string): TrackerLead {
  if (override) {
    const match = rows.find((r) => r.magnet === override);
    if (match) return match;
  }
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.date_sent) || 0;
    const tb = Date.parse(b.date_sent) || 0;
    return tb - ta;
  })[0];
}

// Turn the tracker row into the link block Kyle sees, with tracking stripped.
function magnetLinks(row: TrackerLead): MagnetLinks {
  const base: MagnetLinks = {
    kind: row.magnet,
    report_url: row.report_url,
    report_label: "Report",
    report_opens: row.report_opens,
    playbook_opens: row.playbook_opens,
    last_opened_at: row.last_opened_at,
  };

  if (row.magnet === "scroll-stopper") {
    return {
      ...base,
      report_label: "Scroll-Stopper Sheet (the 3 ads we wrote them)",
      playbook_url: row.playbook_url || undefined,
      playbook_label: "Brand Playbook (their voice, customers, claims)",
    };
  }
  if (row.magnet === "brand-playbook") {
    // This magnet has one artifact, and the sheet stores it in the Playbook URL
    // column. Surface it as the report so the page always has a primary link.
    return {
      ...base,
      report_url: row.report_url || row.playbook_url,
      report_label: "Brand Playbook",
      report_opens: row.report_opens || row.playbook_opens,
    };
  }
  return { ...base, report_label: "Fatigue Forecast (their ads wearing out)" };
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const payload = normalizePayload(rawBody);

  // Ignore every category except the one this route is for. Returns 200, not an
  // error: Smartlead retries non-2xx, and a Lead_Forecast flip arriving here is
  // expected traffic, not a failure. A payload with NO category at all is let
  // through - that's a deliberate manual curl or a re-run.
  if (payload.category && payload.category.trim().toLowerCase() !== TRIGGER_CATEGORY) {
    console.log(`[call-prep] ignoring category "${payload.category}"`);
    return NextResponse.json({ ok: true, status: "ignored_category" });
  }

  if (!payload.lead_email) {
    console.log("[call-prep] missing lead_email. Raw:", JSON.stringify(rawBody));
    return NextResponse.json({ error: "missing lead_email" }, { status: 400 });
  }

  // The tracker is the only place that knows which magnet this lead got, and
  // therefore which plan we owe them. Without a row we cannot build the pack.
  let rows: TrackerLead[];
  try {
    rows = await findLeadByEmail(payload.lead_email);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await postSlack(`❌ *Call Prep failed* — could not read the tracker for ${payload.lead_email}\n\`\`\`${msg}\`\`\``, SLACK_KEY);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (rows.length === 0) {
    await postSlack(
      `🟠 *Call Prep skipped* — ${payload.lead_email} booked a call but has no row in the tracker, so we don't know which magnet they got. Build it by hand, or add the row and re-flip.`,
      SLACK_KEY,
    );
    return NextResponse.json({ ok: false, status: "not_in_tracker" }, { status: 200 });
  }

  const row = pickRow(rows, payload.magnet_override);
  const tag = `${row.company} (${payload.lead_email})`;
  const packUrl = `${BASE_URL}/call-prep/${row.slug}`;

  if (!row.website) {
    await postSlack(`🟠 *Call Prep skipped* — ${tag} has no website in the tracker.`, SLACK_KEY);
    return NextResponse.json({ ok: false, status: "no_website" }, { status: 200 });
  }

  // NOT idempotent by design, unlike the outbound magnets. A re-flip means Kyle
  // wants a fresh pack (the lead replied again, the call moved), and re-running
  // costs one Claude call against a deal that is already on the calendar.
  if (rows.length > 1) {
    await postSlack(
      `ℹ️ ${tag} appears in ${rows.length} magnet tabs. Building the pack from the newest (*${row.magnet}*, sent ${row.date_sent || "date unknown"}). Re-send with magnet_override to pick a different one.`,
      SLACK_KEY,
    );
  }

  await postSlack(`🟡 Call Prep started: *${row.company}* — pulling the thread and researching the brand…`, SLACK_KEY);

  try {
    // The campaign id can arrive on the payload or be recovered from the tracker
    // row, which recorded it when the magnet was first sent.
    const campaignId = payload.campaign_id || row.smartlead_campaign;

    // Everything public, in parallel. Each source degrades to empty rather than
    // throwing: a pack missing the reviews still beats no pack an hour before a
    // call, so nothing here is allowed to be fatal on its own.
    const [catalog, thread, followers, forecast, playbook] = await Promise.all([
      fetchShopifyCatalog(row.website).catch((e) => {
        console.error("[call-prep] catalog fetch failed:", e);
        return null;
      }),
      // Thread lookup needs a campaign id. Without one we still build the pack,
      // and the page says plainly that the transcript is missing.
      campaignId
        ? fetchLeadThread(campaignId, payload.lead_email)
        : Promise.resolve([]),
      fetchInstagramFollowerCount({ website_url: row.website }).catch(() => null),
      // The ads we already scraped for their Forecast. Scroll-Stopper leads have
      // no forecast and no ads - that segment was picked for NOT advertising.
      githubGetJson<ForecastJson>(`forecasts/${row.slug}.json`).catch(() => null),
      githubGetJson<PlaybookData>(`outputs/playbook/${row.slug}.json`).catch(() => null),
    ]);

    const crawl = await crawlSite(
      row.website,
      (catalog?.products ?? []).slice(0, 5).map((p) => p.url),
    ).catch((e) => {
      console.error("[call-prep] site crawl failed:", e);
      return null;
    });

    const ads: KnownAd[] = (forecast?.ads ?? []).map((a) => ({
      headline: a.headline ?? "",
      body: a.body ?? "",
      cta: a.cta ?? "",
    }));

    if (!campaignId) {
      await postSlack(
        `⚠️ *${row.company}* — no campaign id on the webhook or in the tracker, so the email thread could not be pulled. Pack is building without the transcript.`,
        SLACK_KEY,
      );
    }

    const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });

    const pack = await buildCallPrep(
      anthropic,
      {
        lead_first_name: row.first_name,
        lead_last_name: row.last_name,
        lead_email: row.email,
        lead_company: row.company,
        website: row.website,
        brand_domain: brandDomainFromWebsite(row.website),
        smartlead_campaign: payload.campaign_name || row.smartlead_campaign,
        magnet: magnetLinks(row),
      },
      { catalog, crawl, ads, playbook, thread, instagram_followers: followers },
    );

    await putJson(`outputs/call-prep/${row.slug}.json`, pack, `feat: call prep for ${row.slug}`);

    // Vercel redeploy delay, same as every other magnet route. Without it the
    // Slack link 404s for the first few seconds.
    await new Promise((r) => setTimeout(r, 10000));

    const threadNote =
      thread.length > 0
        ? `${thread.length} emails in the thread`
        : "no thread found (check Smartlead by hand)";

    await postSlack(
      [
        `🟢 *Call Prep ready: ${row.company}*`,
        `👤 ${[row.first_name, row.last_name].filter(Boolean).join(" ")} · ${row.email}`,
        `📄 Magnet they got: ${row.magnet} · ${pack.copy.game_plan.horizon_days}-day plan`,
        `💬 ${threadNote}`,
        "",
        `🧠 Send Kyle this: ${packUrl}`,
      ].join("\n"),
      SLACK_KEY,
    );

    return NextResponse.json({
      ok: true,
      slug: row.slug,
      url: packUrl,
      magnet: row.magnet,
      thread_messages: thread.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[call-prep] webhook error:", msg);
    await postSlack(`❌ *Call Prep failed* — ${tag}\n\`\`\`${msg}\`\`\``, SLACK_KEY);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "POST a Smartlead Lead_Category_Updated payload with category Call_Booked",
  });
}
