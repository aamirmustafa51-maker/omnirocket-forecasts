// Webhook route for the Competitor Teardown magnet. Smartlead "Lead Category
// Updated" fires here when Amir flips a positive-reply lead into the
// `Ad_Teardown` category. The lead's row carries 3 pre-locked competitor names
// (chosen at Clay enrichment time and name-dropped in the cold email copy).
//
// Per competitor: try Apify Meta Ad Library scrape → if ads found, run the
// hook-extraction Claude prompt; else, scrape the brand's homepage + about
// page and run the website-angle prompt. Branch ensures every competitor
// ships with content, advertiser or not.
//
// Output JSON schema is the contract the TeardownTemplate (built next
// session) will render against.
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { scrapeBrandSite } from "@/lib/shared/website-scrape";

export const maxDuration = 300;
export const runtime = "nodejs";

type CompetitorInput = {
  name: string;
  domain: string | null;
  instagram_handle: string | null;
  facebook_page_name: string | null;
  facebook_page_id: string | null;
  why_competitor: string | null;
};

type WebhookPayload = {
  lead_email: string;
  lead_first_name: string;
  lead_last_name?: string;
  lead_company: string;
  lead_aesthetic?: string;
  website_url?: string;
  campaign_name?: string;
  competitors: CompetitorInput[];
};

type ApifyAd = {
  snapshot?: {
    body?: { text?: string };
    title?: string;
    cta_text?: string;
    link_url?: string;
    cards?: Array<{
      body?: string;
      title?: string;
      cta_text?: string;
      link_url?: string;
    }>;
  };
  ad_archive_id?: string;
  page_name?: string;
  start_date?: number;
};

type NormalizedAd = {
  index: number;
  headline: string;
  body: string;
  cta: string;
  landing_url: string;
  ad_archive_id: string;
};

type CompetitorBlock =
  | {
      name: string;
      domain: string | null;
      instagram_handle: string | null;
      type: "ads";
      active_ad_count: number;
      ads_analysis: unknown;
    }
  | {
      name: string;
      domain: string | null;
      instagram_handle: string | null;
      type: "website";
      about_url: string | null;
      site_analysis: unknown;
    }
  | {
      name: string;
      domain: string | null;
      instagram_handle: string | null;
      type: "skipped";
      reason: string;
    };

type TeardownJson = {
  lead_company: string;
  lead_first_name: string;
  lead_aesthetic: string | null;
  competitors: CompetitorBlock[];
  generated_at: string;
};

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
};

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const stripNewlines = (s: string): string => s.replace(/[\r\n]+/g, " ").trim();

// Smartlead webhook payload — same envelope as the Fatigue route, with
// competitor merge fields injected via Clay. We accept multiple casings on
// the custom_fields keys because Smartlead's UI lowercases inconsistently.
function normalizeSmartleadPayload(raw: unknown): WebhookPayload {
  const r = (raw ?? {}) as Record<string, unknown>;
  const leadData = (r.lead_data ?? {}) as Record<string, unknown>;
  const cf = (leadData.custom_fields ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

  const cfGet = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = cf[k];
      if (typeof v === "string" && v) return v;
    }
    return undefined;
  };

  // Preferred shape: a single Clay formula column (`competitors_json`)
  // containing JSON.stringify of the agent's `candidates` array sliced to top
  // 3. Falls back to flat `Competitor_N_*` fields if someone wires it that
  // way instead. JSON shape uses the Clay AI Agent's native camelCase keys.
  type RawCandidate = {
    brandName?: string;
    domain?: string | null;
    instagramHandle?: string | null;
    facebookPageName?: string | null;
    facebookPageId?: string | number | null;
    pageId?: string | number | null;
    whyCompetitor?: string | null;
  };

  const fromJsonField = (): CompetitorInput[] => {
    const raw = cfGet("Competitors_JSON", "competitors_json", "CompetitorsJson");
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 3)
      .map((c: RawCandidate) => {
        if (!c?.brandName) return null;
        const rawId = c.facebookPageId ?? c.pageId ?? null;
        const pageId =
          rawId === null || rawId === undefined || rawId === "" ? null : String(rawId);
        return {
          name: c.brandName,
          domain: c.domain ?? null,
          instagram_handle: c.instagramHandle ?? null,
          facebook_page_name: c.facebookPageName ?? null,
          facebook_page_id: pageId,
          why_competitor: c.whyCompetitor ?? null,
        };
      })
      .filter((c): c is CompetitorInput => c !== null);
  };

  const fromFlatFields = (): CompetitorInput[] => {
    const competitor = (n: 1 | 2 | 3): CompetitorInput | null => {
      const name = cfGet(`Competitor_${n}_Name`, `competitor_${n}_name`, `Competitor${n}Name`);
      if (!name) return null;
      return {
        name,
        domain: cfGet(`Competitor_${n}_Domain`, `competitor_${n}_domain`) ?? null,
        instagram_handle:
          cfGet(`Competitor_${n}_Instagram_Handle`, `competitor_${n}_instagram_handle`) ?? null,
        facebook_page_name:
          cfGet(`Competitor_${n}_Facebook_Page_Name`, `competitor_${n}_facebook_page_name`) ?? null,
        facebook_page_id:
          cfGet(
            `Competitor_${n}_Facebook_Page_ID`,
            `competitor_${n}_facebook_page_id`,
            `Competitor_${n}_Page_ID`,
            `competitor_${n}_page_id`,
          ) ?? null,
        why_competitor: cfGet(`Competitor_${n}_Why`, `competitor_${n}_why`) ?? null,
      };
    };
    return [competitor(1), competitor(2), competitor(3)].filter(
      (c): c is CompetitorInput => c !== null,
    );
  };

  const jsonCompetitors = fromJsonField();
  const competitors = jsonCompetitors.length > 0 ? jsonCompetitors : fromFlatFields();

  return {
    lead_email: str(r.lead_email) || str(leadData.email),
    lead_first_name: str(leadData.first_name) || str(r.lead_name),
    lead_last_name: optStr(leadData.last_name),
    lead_company: str(leadData.company_name),
    lead_aesthetic: cfGet("Brand_Aesthetic", "brand_aesthetic", "Aesthetic"),
    website_url: optStr(leadData.website),
    campaign_name: optStr(r.campaign_name) || optStr(r.sequence_name),
    competitors,
  };
}

async function postSlack(text: string): Promise<void> {
  try {
    await fetch(env("SLACK_WEBHOOK_URL"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("Slack post failed:", e);
  }
}

// Apify Meta Ad Library scraper — same actor used by the Fatigue webhook.
// Prefers numeric page_id (proven Fatigue pattern: search_type=page +
// view_all_page_id). Falls back to keyword search by brand name when page_id
// is absent — though keyword search empirically returns ADS_NOT_FOUND for
// most brands, so a missing page_id usually drops us into the website-angle
// path downstream.
//
// TODO Phase 1.8: extract this + normalizeAd into lib/shared/meta-ad-library.ts
// alongside the Fatigue webhook's identical helpers.
async function apifyScrape(
  brandName: string,
  pageId: string | null,
): Promise<ApifyAd[]> {
  const url = pageId
    ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&search_type=page&view_all_page_id=${encodeURIComponent(
        pageId,
      )}`
    : `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(
        brandName,
      )}&search_type=keyword_unordered`;

  const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${env(
    "APIFY_TOKEN",
  )}&timeout=180`;

  const res = await fetch(apifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls: [{ url }], resultsLimit: 30 }),
  });
  if (!res.ok) {
    throw new Error(`Apify failed for ${brandName}: ${res.status}`);
  }
  return (await res.json()) as ApifyAd[];
}

function normalizeAd(ad: ApifyAd, idx: number): NormalizedAd | null {
  const snap = ad.snapshot ?? {};
  const card = snap.cards?.[0];
  const body = stripNewlines(card?.body || snap.body?.text || "");
  if (!body) return null;
  return {
    index: idx + 1,
    headline: stripNewlines(card?.title || snap.title || ""),
    body,
    cta: stripNewlines(card?.cta_text || snap.cta_text || ""),
    landing_url: card?.link_url || snap.link_url || "",
    ad_archive_id: ad.ad_archive_id ?? "",
  };
}

async function githubGetSha(filePath: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/contents/${filePath}?ref=main`,
    {
      headers: {
        Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${filePath} failed: ${res.status}`);
  const json = (await res.json()) as { sha?: string };
  return json.sha ?? null;
}

async function githubPut(filePath: string, contentBase64: string, message: string): Promise<void> {
  const sha = await githubGetSha(filePath);
  const body: Record<string, string> = { message, branch: "main", content: contentBase64 };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`GitHub PUT ${filePath} failed: ${res.status} ${await res.text()}`);
}

function readPrompt(file: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "magnets/competitor-teardown/prompts", file),
    "utf8",
  );
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in Claude response");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function analyzeAdvertiser(
  anthropic: Anthropic,
  competitor: CompetitorInput,
  ads: NormalizedAd[],
  leadCompany: string,
  leadAesthetic: string,
): Promise<unknown> {
  const tpl = readPrompt("hook-extraction.md");
  const adsBlock = ads
    .map(
      (a) =>
        `--- Ad ${a.index} ---\nHeadline: ${a.headline}\nBody: ${a.body}\nCTA: ${a.cta}\nLanding: ${a.landing_url}`,
    )
    .join("\n\n");

  const prompt = fillTemplate(tpl, {
    lead_company: leadCompany,
    lead_aesthetic: leadAesthetic,
    competitor_name: competitor.name,
    competitor_domain: competitor.domain ?? "(unknown)",
    active_ad_count: String(ads.length),
    ad_count: String(ads.length),
    ads_block: adsBlock,
  });

  const res = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude returned no text");
  return extractJson(block.text);
}

async function analyzeNonAdvertiser(
  anthropic: Anthropic,
  competitor: CompetitorInput,
  homepageText: string,
  aboutText: string,
  leadCompany: string,
  leadAesthetic: string,
): Promise<unknown> {
  const tpl = readPrompt("website-angle.md");
  const prompt = fillTemplate(tpl, {
    lead_company: leadCompany,
    lead_aesthetic: leadAesthetic,
    competitor_name: competitor.name,
    competitor_domain: competitor.domain ?? "(unknown)",
    homepage_text: homepageText || "(empty)",
    about_text: aboutText || "(empty)",
  });

  const res = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 3072,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude returned no text");
  return extractJson(block.text);
}

const MIN_ADS_FOR_HOOK_EXTRACTION = 3;

async function processCompetitor(
  anthropic: Anthropic,
  competitor: CompetitorInput,
  leadCompany: string,
  leadAesthetic: string,
): Promise<CompetitorBlock> {
  // Path A: Apify scrape. If we get ≥ MIN_ADS_FOR_HOOK_EXTRACTION usable ads,
  // run the hook-extraction prompt. Below the threshold we don't have enough
  // signal for pattern detection, so fall through to website-angle.
  let normalizedAds: NormalizedAd[] = [];
  try {
    const raw = await apifyScrape(
      competitor.facebook_page_name || competitor.name,
      competitor.facebook_page_id,
    );
    normalizedAds = raw
      .map((ad, i) => normalizeAd(ad, i))
      .filter((a): a is NormalizedAd => a !== null)
      .slice(0, 12);
  } catch (e) {
    console.error(`[teardown] Apify failed for ${competitor.name}:`, e);
  }

  if (normalizedAds.length >= MIN_ADS_FOR_HOOK_EXTRACTION) {
    const ads_analysis = await analyzeAdvertiser(
      anthropic,
      competitor,
      normalizedAds,
      leadCompany,
      leadAesthetic,
    );
    return {
      name: competitor.name,
      domain: competitor.domain,
      instagram_handle: competitor.instagram_handle,
      type: "ads",
      active_ad_count: normalizedAds.length,
      ads_analysis,
    };
  }

  // Path B: website angle
  if (!competitor.domain) {
    return {
      name: competitor.name,
      domain: null,
      instagram_handle: competitor.instagram_handle,
      type: "skipped",
      reason: "no_ads_found_and_no_domain_to_scrape",
    };
  }

  const site = await scrapeBrandSite(competitor.domain);
  if (!site.homepage_text && !site.about_text) {
    return {
      name: competitor.name,
      domain: competitor.domain,
      instagram_handle: competitor.instagram_handle,
      type: "skipped",
      reason: "no_ads_and_site_scrape_empty",
    };
  }

  const site_analysis = await analyzeNonAdvertiser(
    anthropic,
    competitor,
    site.homepage_text,
    site.about_text,
    leadCompany,
    leadAesthetic,
  );

  return {
    name: competitor.name,
    domain: competitor.domain,
    instagram_handle: competitor.instagram_handle,
    type: "website",
    about_url: site.about_url,
    site_analysis,
  };
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
    console.log("[teardown] missing lead_company. Raw:", JSON.stringify(rawBody));
    return NextResponse.json({ error: "missing lead_company" }, { status: 400 });
  }
  if (payload.competitors.length === 0) {
    console.log("[teardown] no competitors in payload. Raw:", JSON.stringify(rawBody));
    return NextResponse.json({ error: "no competitors" }, { status: 400 });
  }

  const slug = slugify(payload.lead_company);
  const tag = `${payload.lead_company} (${payload.lead_email})`;
  const teardownUrl = `https://omnirocket-forecasts.vercel.app/teardown/${slug}`;

  // Idempotency: same pattern as Fatigue webhook. Repeat category flips don't
  // re-spend Apify + Claude budget.
  const existingSha = await githubGetSha(`outputs/teardown/${slug}.json`);
  if (existingSha) {
    await postSlack(`🔁 *Teardown duplicate skipped* — ${tag} already has a teardown.\n🔗 ${teardownUrl}`);
    return NextResponse.json({ ok: true, status: "already_exists", url: teardownUrl });
  }

  await postSlack(
    `🟡 Teardown started: *${payload.lead_company}* — analyzing ${payload.competitors.length} competitor${payload.competitors.length === 1 ? "" : "s"}…`,
  );

  try {
    const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });

    // Run all 3 competitors in parallel. Per-competitor try/catch keeps one
    // bad scrape from killing the whole report — failed competitors land in
    // the JSON as type=skipped so the template can render the rest.
    const blocks: CompetitorBlock[] = await Promise.all(
      payload.competitors.map(async (c) => {
        try {
          return await processCompetitor(
            anthropic,
            c,
            payload.lead_company,
            payload.lead_aesthetic ?? "",
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[teardown] competitor ${c.name} failed:`, msg);
          return {
            name: c.name,
            domain: c.domain,
            instagram_handle: c.instagram_handle,
            type: "skipped",
            reason: msg,
          };
        }
      }),
    );

    const teardownJson: TeardownJson = {
      lead_company: payload.lead_company,
      lead_first_name: payload.lead_first_name,
      lead_aesthetic: payload.lead_aesthetic ?? null,
      competitors: blocks,
      generated_at: new Date().toISOString(),
    };

    const base64 = Buffer.from(JSON.stringify(teardownJson, null, 2)).toString("base64");
    await githubPut(
      `outputs/teardown/${slug}.json`,
      base64,
      `feat: teardown for ${slug}`,
    );

    // Vercel deploy delay (matches Fatigue route)
    await new Promise((r) => setTimeout(r, 10000));

    const shareUrl = `${teardownUrl}?ref=email&magnet=teardown`;
    const successCount = blocks.filter((b) => b.type !== "skipped").length;
    const skippedCount = blocks.length - successCount;
    await postSlack(
      `🟢 Teardown ready: *${payload.lead_company}* (${successCount}/${blocks.length} competitors${skippedCount ? `, ${skippedCount} skipped` : ""})\n📧 ${payload.lead_email}\n👤 ${payload.lead_first_name}\n🔗 ${shareUrl}`,
    );

    return NextResponse.json({ ok: true, slug, url: teardownUrl, competitors: blocks.length, succeeded: successCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[teardown] webhook error:", msg);
    await postSlack(`❌ *Teardown failed* — ${tag}\n\`\`\`${msg}\`\`\``);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "POST a Smartlead Lead_Category_Updated payload" });
}
