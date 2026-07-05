// Webhook for the standalone Brand Playbook magnet. Smartlead "Lead Category
// Updated" fires here when Amir flips a lead into the `Brand_Playbook`
// category — a value-add follow-up for leads (often already running ads) who
// didn't book on the main magnet. Produces ONLY the Brand Playbook, no ads.
//
// Reuses the exact same buildPlaybook() the scroll-stopper webhook uses, so
// this is a thin wrapper: scrape → playbook → GitHub → Slack (#brand-playbook)
// → sheet. Website-only, no Meta-ads data. More lenient than scroll-stopper:
// a non-Shopify brand still gets a playbook (just without a product ladder).
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchShopifyCatalog } from "@/lib/shared/shopify-products";
import { crawlSite } from "@/lib/shared/site-crawl";
import { selectHeroProducts } from "@/magnets/scroll-stopper/lib/select";
import { buildPlaybook } from "@/magnets/brand-playbook/lib/generate";
import { appendBrandPlaybookLead } from "@/lib/shared/sheets";
import {
  env, slugify, postSlack, githubGetSha, putJson, brandDomainFromWebsite,
} from "@/lib/shared/publish";

export const maxDuration = 300;
export const runtime = "nodejs";

const BASE_URL = "https://omnirocket-forecasts.vercel.app";
const SLACK_KEY = "SLACK_WEBHOOK_URL_BRAND_PLAYBOOK";

type WebhookPayload = {
  lead_email: string;
  lead_first_name: string;
  lead_last_name: string;
  lead_company: string;
  website_url: string | null;
  category: string;
  campaign_name?: string;
};

function normalizeSmartleadPayload(raw: unknown): WebhookPayload {
  const r = (raw ?? {}) as Record<string, unknown>;
  const leadData = (r.lead_data ?? {}) as Record<string, unknown>;
  const cf = (leadData.custom_fields ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const cfGet = (...keys: string[]): string => {
    for (const k of keys) if (typeof cf[k] === "string" && cf[k]) return cf[k] as string;
    return "";
  };
  return {
    lead_email: str(r.lead_email) || str(leadData.email),
    lead_first_name: str(leadData.first_name) || str(r.lead_name),
    lead_last_name: str(leadData.last_name),
    lead_company: str(leadData.company_name),
    website_url: optStr(leadData.website) ?? null,
    category: cfGet("Category", "category"),
    campaign_name: optStr(r.campaign_name) || optStr(r.sequence_name),
  };
}

async function trackRow(payload: WebhookPayload, slug: string, playbookShare: string, dateSent: string): Promise<void> {
  try {
    await appendBrandPlaybookLead({
      date_sent: dateSent,
      first_name: payload.lead_first_name,
      last_name: payload.lead_last_name,
      email: payload.lead_email,
      company: payload.lead_company,
      website: payload.website_url ?? "",
      playbook_url: playbookShare,
      slug,
      category: payload.category,
      smartlead_campaign: payload.campaign_name ?? "",
    });
  } catch (e) {
    console.error("[brand-playbook] sheet append failed:", e);
    await postSlack(`⚠️ Sheet row failed for *${payload.lead_company}* (playbook is fine): ${e instanceof Error ? e.message : String(e)}`, SLACK_KEY);
  }
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const payload = normalizeSmartleadPayload(rawBody);
  if (!payload.lead_company) {
    console.log("[brand-playbook] missing lead_company. Raw:", JSON.stringify(rawBody));
    return NextResponse.json({ error: "missing lead_company" }, { status: 400 });
  }
  if (!payload.website_url) {
    console.log("[brand-playbook] missing website. Raw:", JSON.stringify(rawBody));
    return NextResponse.json({ error: "missing website" }, { status: 400 });
  }

  const slug = slugify(payload.lead_company);
  const tag = `${payload.lead_company} (${payload.lead_email})`;
  const playbookUrl = `${BASE_URL}/playbook/${slug}`;
  const playbookShare = `${playbookUrl}?ref=email&magnet=brand-playbook`;

  // Idempotency: a playbook for this slug may already exist (from this magnet
  // or the scroll-stopper flow). Reuse it — still log a row + send the link.
  const existingSha = await githubGetSha(`outputs/playbook/${slug}.json`);
  if (existingSha) {
    await trackRow(payload, slug, playbookShare, new Date().toISOString());
    await postSlack(`🔁 Brand Playbook already exists — *${payload.lead_company}*\n📧 ${payload.lead_email}\n🧠 ${playbookShare}`, SLACK_KEY);
    return NextResponse.json({ ok: true, status: "already_exists", url: playbookUrl });
  }

  await postSlack(`🟡 Brand Playbook started: *${payload.lead_company}* — scraping site…`, SLACK_KEY);

  try {
    const catalog = await fetchShopifyCatalog(payload.website_url);
    const heroes = selectHeroProducts(catalog.products, catalog.homepage_html, 4);
    const crawl = await crawlSite(payload.website_url, heroes.map((h) => h.url));

    const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const playbook = await buildPlaybook(
      anthropic,
      {
        lead_company: payload.lead_company,
        lead_first_name: payload.lead_first_name,
        website: payload.website_url,
        brand_domain: brandDomainFromWebsite(payload.website_url),
      },
      catalog,
      crawl,
    );

    await putJson(`outputs/playbook/${slug}.json`, playbook, `feat: brand-playbook for ${slug}`);
    await trackRow(payload, slug, playbookShare, playbook.generated_at);

    // Vercel deploy delay (matches the other routes)
    await new Promise((r) => setTimeout(r, 10000));

    await postSlack(
      `🟢 Brand Playbook ready: *${payload.lead_company}*\n📧 ${payload.lead_email}\n👤 ${payload.lead_first_name}\n🧠 ${playbookShare}`,
      SLACK_KEY,
    );
    return NextResponse.json({ ok: true, slug, url: playbookUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brand-playbook] webhook error:", msg);
    await postSlack(`❌ *Brand Playbook failed* — ${tag}\n\`\`\`${msg}\`\`\``, SLACK_KEY);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "POST a Smartlead Lead_Category_Updated payload" });
}
