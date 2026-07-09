// Webhook for the Scroll-Stopper Sheet magnet. Smartlead "Lead Category
// Updated" fires here when Amir flips a positive-reply lead into the
// `Scroll_Stopper` category (the non-advertiser twin of Fatigue Forecast).
//
// ONE lead reply produces TWO linked artifacts from a single site scrape:
//   1. Brand Playbook  (/playbook/{slug})       — voice, customer language, claims
//   2. Scroll-Stopper  (/scroll-stopper/{slug})  — 3 Meta ad mockups, written
//      FROM the playbook (on-voice, uses customer words, banned claims enforced)
//
// The Playbook is generated first via the shared buildPlaybook() (the same
// function the future standalone brand-playbook webhook will call), then fed
// into ad generation as context. Slack pings both URLs so Amir sends them as
// the two links in his reply email. No ad-library data used anywhere.
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { fetchShopifyCatalog, ShopifyProduct } from "@/lib/shared/shopify-products";
import { crawlSite } from "@/lib/shared/site-crawl";
import { selectHeroProducts } from "@/magnets/scroll-stopper/lib/select";
import { buildPlaybook } from "@/magnets/brand-playbook/lib/generate";
import type { PlaybookData } from "@/magnets/brand-playbook/lib/types";
import { fetchProspectLogoUrl } from "@/lib/shared/logo";
import { fetchProductsByUrls, originFromProductUrls } from "@/lib/shared/product-by-url";
import {
  env, slugify, cleanCopy, postSlack, githubGetSha, putJson, extractJson, brandDomainFromWebsite,
} from "@/lib/shared/publish";
import { appendScrollStopperLead } from "@/lib/shared/sheets";

export const maxDuration = 300;
export const runtime = "nodejs";

const BASE_URL = "https://omnirocket-forecasts.vercel.app";
// Route this magnet's Slack notifications to its own #scroll-stopper channel
// (falls back to the default channel until that webhook env var is set).
const SLACK_KEY = "SLACK_WEBHOOK_URL_SCROLL_STOPPER";

type WebhookPayload = {
  lead_email: string;
  lead_first_name: string;
  lead_last_name: string;
  lead_company: string;
  website_url: string | null;
  category: string;
  campaign_name?: string;
  // Human-in-the-loop: operator-picked product links. When present, ads are
  // built from exactly these products instead of auto-selecting from the catalog.
  product_urls?: string[];
};

// Claude returns copy only; deterministic fields (image/price/url) are merged
// back in code from the selected products, keyed by product_index.
type ConceptCopy = {
  product_index: number;
  angle_label: string;
  primary_text: string;
  headline: string;
  cta: string;
  why_it_works: string;
};

type Concept = ConceptCopy & {
  product_title: string;
  product_url: string;
  image_url: string;
  price: number | null;
  compare_at_price: number | null;
  on_sale: boolean;
};

type ScrollStopperJson = {
  lead_company: string;
  lead_first_name: string;
  website: string;
  brand_domain: string;
  currency: string;
  brand_voice_note: string;
  playbook_url?: string;
  prospect_logo_url?: string;
  concepts: Concept[];
  generated_at: string;
};

// Pull operator-provided product links off a manual (form) submission.
function manualProductUrls(raw: unknown): string[] {
  const r = (raw ?? {}) as Record<string, unknown>;
  return Array.isArray(r.product_urls)
    ? (r.product_urls as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
}

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

  // Manual intake (the /scroll-stopper-new form): fields live at the top level,
  // not nested under Smartlead's lead_data. Website is optional — we derive it
  // from the product links if omitted.
  const productUrls = manualProductUrls(raw);
  if (productUrls.length) {
    return {
      lead_email: str(r.lead_email),
      lead_first_name: str(r.lead_first_name),
      lead_last_name: str(r.lead_last_name),
      lead_company: str(r.lead_company),
      website_url: optStr(r.website_url) ?? null,
      category: "Scroll_Stopper",
      campaign_name: optStr(r.campaign_name) ?? "manual-intake",
      product_urls: productUrls,
    };
  }

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

function readPrompt(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), "magnets/scroll-stopper/prompts", file), "utf8");
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function productBlurb(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

// Compact playbook context injected into the ad-copy prompt so the 3 ads inherit
// voice + customer language and respect the banned-claims guardrail.
function playbookContext(pb: PlaybookData | null): string {
  if (!pb) return "(no playbook available - infer voice from the product copy)";
  const pillars = pb.voice_pillars.map((p) => `${p.name} (${p.desc})`).join("; ") || "(n/a)";
  const phrases = pb.customer_language.phrases.slice(0, 6).map((p) => `"${p}"`).join(", ") || "(n/a)";
  const allowed = pb.claims.allowed.map((c) => c.claim).join("; ") || "(n/a)";
  const banned = pb.claims.banned.map((c) => c.claim).join("; ") || "(none)";
  return [
    `VOICE PILLARS: ${pillars}`,
    `CUSTOMER WORDS TO ECHO: ${phrases}`,
    `ALLOWED CLAIMS (safe to use): ${allowed}`,
    `BANNED CLAIMS (never write these): ${banned}`,
  ].join("\n");
}

async function writeAdCopy(
  anthropic: Anthropic,
  brand: string,
  website: string,
  products: ShopifyProduct[],
  playbook: PlaybookData | null,
): Promise<{ brand_voice_note: string; concepts: ConceptCopy[] }> {
  const tpl = readPrompt("ad-copy.md");
  const productsBlock = products
    .map((p, i) => {
      const priceLine =
        p.price !== null
          ? `Price: ${p.price}${p.on_sale ? ` (on sale, was ${p.compare_at_price})` : ""}`
          : "Price: (unknown)";
      return `--- Product ${i + 1} ---\nTitle: ${p.title}\n${priceLine}\nDescription: ${productBlurb(p.body_html) || "(none)"}`;
    })
    .join("\n\n");

  const categoryHint =
    products.map((p) => p.product_type).filter(Boolean).slice(0, 3).join(", ") || "ecommerce / consumer products";

  const prompt = fillTemplate(tpl, {
    brand,
    website,
    category_hint: categoryHint,
    product_count: String(products.length),
    products_block: productsBlock,
    playbook_context: playbookContext(playbook),
  });

  const res = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3072,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude returned no text");

  const parsed = extractJson(block.text) as { brand_voice_note?: string; concepts?: ConceptCopy[] };
  return {
    brand_voice_note: cleanCopy(parsed.brand_voice_note ?? ""),
    concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
  };
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Manual (form) submissions carry product_urls and must present the shared
  // secret. Smartlead-triggered runs (no product_urls) skip this check.
  const submittedUrls = manualProductUrls(rawBody);
  if (submittedUrls.length) {
    const secret =
      typeof (rawBody as Record<string, unknown>)?.secret === "string"
        ? ((rawBody as Record<string, unknown>).secret as string)
        : "";
    if (!process.env.INTAKE_SECRET || secret !== process.env.INTAKE_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const payload = normalizeSmartleadPayload(rawBody);

  if (!payload.lead_company) {
    console.log("[scroll-stopper] missing lead_company. Raw:", JSON.stringify(rawBody));
    return NextResponse.json({ error: "missing lead_company" }, { status: 400 });
  }

  // Resolve the storefront: the lead's stated site, or (manual) the domain the
  // product links point at.
  const websiteUrl =
    payload.website_url ||
    (payload.product_urls?.length ? originFromProductUrls(payload.product_urls) : null);
  if (!websiteUrl) {
    console.log("[scroll-stopper] missing website. Raw:", JSON.stringify(rawBody));
    return NextResponse.json({ error: "missing website" }, { status: 400 });
  }

  const slug = slugify(payload.lead_company);
  const tag = `${payload.lead_company} (${payload.lead_email})`;
  const reportUrl = `${BASE_URL}/scroll-stopper/${slug}`;
  const playbookUrl = `${BASE_URL}/playbook/${slug}`;

  // Idempotency: the report is the last thing written, so its presence means
  // this lead was fully processed. Repeat flips don't re-spend Claude budget.
  // Idempotency guard for the AUTO (Smartlead) path only — repeat category
  // flips shouldn't re-spend budget. Manual (form) submissions are deliberate
  // regenerations (e.g. redoing a lead with the RIGHT products), so they always
  // rebuild and overwrite the existing report/playbook.
  const existingSha = payload.product_urls?.length
    ? null
    : await githubGetSha(`outputs/scroll-stopper/${slug}.json`);
  if (existingSha) {
    await postSlack(`🔁 *Scroll-Stopper duplicate skipped* — ${tag} already done.\n🧠 ${playbookUrl}\n🖼️ ${reportUrl}`, SLACK_KEY);
    return NextResponse.json({ ok: true, status: "already_exists", url: reportUrl });
  }

  await postSlack(`🟡 Scroll-Stopper + Playbook started: *${payload.lead_company}* — scraping site…`, SLACK_KEY);

  try {
    const catalog = await fetchShopifyCatalog(websiteUrl);

    // Manual path: build heroes from exactly the operator's product links.
    // Auto path: rank heroes from the scraped catalog.
    let heroes: ShopifyProduct[];
    if (payload.product_urls?.length) {
      heroes = await fetchProductsByUrls(payload.product_urls);
      if (heroes.length === 0) {
        await postSlack(
          `🟠 *Scroll-Stopper skipped* — ${tag}\nNone of the provided product links could be fetched. Check they point to live Shopify product pages.`,
          SLACK_KEY,
        );
        return NextResponse.json({ ok: false, status: "no_products" }, { status: 200 });
      }
    } else {
      heroes = selectHeroProducts(catalog.products, catalog.homepage_html, 3);
      if (heroes.length === 0) {
        // No scrapable Shopify catalog (endpoint blocked or non-Shopify store).
        // Without products there are no ads, so we skip both artifacts.
        await postSlack(
          `🟠 *Scroll-Stopper skipped* — ${tag}\nNo scrapable product catalog at ${websiteUrl} (not Shopify or /products.json disabled). Needs manual handling.`,
          SLACK_KEY,
        );
        return NextResponse.json({ ok: false, status: "no_catalog" }, { status: 200 });
      }
    }

    const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const brandDomain = brandDomainFromWebsite(websiteUrl);

    // Deep crawl (shared by both artifacts), then Playbook first so the ads can
    // be written from it. A crawl/playbook failure must not kill the ads, so
    // it's caught and degrades to a report without the playbook link.
    const crawl = await crawlSite(websiteUrl, heroes.map((h) => h.url));

    let playbook: PlaybookData | null = null;
    try {
      playbook = await buildPlaybook(
        anthropic,
        {
          lead_company: payload.lead_company,
          lead_first_name: payload.lead_first_name,
          website: websiteUrl,
          brand_domain: brandDomain,
        },
        catalog,
        crawl,
      );
      await putJson(`outputs/playbook/${slug}.json`, playbook, `feat: playbook for ${slug}`);
    } catch (e) {
      console.error("[scroll-stopper] playbook generation failed:", e);
      playbook = null; // ads still ship, just without the playbook link
    }

    const { brand_voice_note, concepts: copy } = await writeAdCopy(
      anthropic,
      payload.lead_company,
      websiteUrl,
      heroes,
      playbook,
    );

    // Merge Claude's copy back onto deterministic product data by index.
    const concepts: Concept[] = heroes.map((p, i) => {
      const c = copy.find((x) => x.product_index === i + 1) ?? copy[i];
      return {
        product_index: i + 1,
        product_title: p.title,
        product_url: p.url,
        image_url: p.image_url as string,
        price: p.price,
        compare_at_price: p.compare_at_price,
        on_sale: p.on_sale,
        angle_label: cleanCopy(c?.angle_label ?? "Benefit-Forward"),
        primary_text: cleanCopy(c?.primary_text ?? ""),
        headline: cleanCopy(c?.headline ?? p.title),
        cta: cleanCopy(c?.cta ?? "Shop Now"),
        why_it_works: cleanCopy(c?.why_it_works ?? ""),
      };
    });

    // Scrape the brand's real logo (apple-touch-icon/favicon). logo.dev returns
    // wrong or placeholder logos for SMB ecom, so the scraped mark is the
    // primary source in the template (it falls back to logo.dev then a
    // wordmark). Best-effort — null just means the template uses its fallbacks.
    const prospectLogoUrl = await fetchProspectLogoUrl(websiteUrl);

    const out: ScrollStopperJson = {
      lead_company: payload.lead_company,
      lead_first_name: payload.lead_first_name,
      website: websiteUrl,
      brand_domain: brandDomain,
      currency: catalog.currency,
      brand_voice_note,
      playbook_url: playbook ? `${playbookUrl}?ref=email&magnet=playbook` : undefined,
      prospect_logo_url: prospectLogoUrl ?? undefined,
      concepts,
      generated_at: new Date().toISOString(),
    };

    await putJson(`outputs/scroll-stopper/${slug}.json`, out, `feat: scroll-stopper for ${slug}`);

    const reportShare = `${reportUrl}?ref=email&magnet=scroll-stopper`;
    const playbookShare = `${playbookUrl}?ref=email&magnet=playbook`;

    // Track in the "Scroll Stopper" tab of the lead sheet. Non-fatal: a sheet
    // failure must not lose the generated artifacts.
    try {
      await appendScrollStopperLead({
        date_sent: out.generated_at,
        first_name: payload.lead_first_name,
        last_name: payload.lead_last_name,
        email: payload.lead_email,
        company: payload.lead_company,
        website: websiteUrl,
        playbook_url: playbook ? playbookShare : "",
        report_url: reportShare,
        slug,
        category: payload.category,
        smartlead_campaign: payload.campaign_name ?? "",
      });
    } catch (e) {
      console.error("[scroll-stopper] sheet append failed:", e);
      await postSlack(`⚠️ Sheet row failed for *${payload.lead_company}* (artifacts are fine): ${e instanceof Error ? e.message : String(e)}`, SLACK_KEY);
    }

    // Vercel deploy delay (matches Fatigue + Teardown routes)
    await new Promise((r) => setTimeout(r, 10000));

    await postSlack(
      `🟢 Ready: *${payload.lead_company}* (${concepts.length} ads${playbook ? " + playbook" : ", playbook SKIPPED"})\n📧 ${payload.lead_email}\n👤 ${payload.lead_first_name}\n🧠 Playbook (link 1): ${playbook ? playbookShare : "—"}\n🖼️ Ads (link 2): ${reportShare}`,
      SLACK_KEY,
    );

    return NextResponse.json({ ok: true, slug, report_url: reportUrl, playbook_url: playbook ? playbookUrl : null, concepts: concepts.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scroll-stopper] webhook error:", msg);
    await postSlack(`❌ *Scroll-Stopper failed* — ${tag}\n\`\`\`${msg}\`\`\``, SLACK_KEY);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "POST a Smartlead Lead_Category_Updated payload" });
}
