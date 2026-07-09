// Webhook route for the Fatigue Forecast magnet. Smartlead "Lead Category Updated"
// fires here. The Competitor Teardown magnet has its own route at
// app/api/webhook/teardown/route.ts; this path stays /api/webhook/ for backward
// compatibility with the existing Smartlead webhook configuration.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { scoreAds, inferBrandSize, type ScoringAd, type ScoringResult } from "@/magnets/fatigue-forecast/lib/fatigue";
import { getBenchmark, classifyNiche, q4InflationMultiplier, type NicheKey } from "@/magnets/fatigue-forecast/lib/benchmarks";
import { buildKbBlock } from "@/magnets/fatigue-forecast/lib/kb";
import { fetchInstagramFollowerCount } from "@/lib/shared/instagram";
import { fetchProspectLogoUrl } from "@/lib/shared/logo";
import { appendNewLead } from "@/lib/shared/sheets";
import { writeLeadCustomFields } from "@/lib/shared/smartlead";
import { generateAndPublishPlaybook } from "@/lib/shared/playbook-flow";
import { generateFollowupHooks } from "@/lib/shared/followup-hooks";

export const maxDuration = 300;
export const runtime = "nodejs";

type WebhookPayload = {
  lead_email: string;
  lead_first_name: string;
  lead_last_name?: string;
  lead_company: string;
  company_overview_summary: string;
  facebook_page_id?: string;
  facebook_url?: string;
  website_url?: string;
  category?: string;
  campaign_name?: string;
  campaign_id?: string;
  hero_product_handle?: string;
};

// Fallback campaign_name -> id map for the Fatigue Forecast campaigns, used
// ONLY if the Smartlead webhook payload doesn't carry campaign_id. Keeps the
// post-yes custom-field write-back (magnet_link / brand_playbook_link)
// targeting the right campaign so the follow-up subsequence can render links.
const FORECAST_CAMPAIGN_IDS: Record<string, string> = {
  "OR #5 | Personalized Line | Forecast Lead Magnet | With Other Contact Name": "3598513",
  "OR #6 | Personalized Line | Forecast Lead Magnet | Without Other Contact Name": "3597865",
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
      original_image_url?: string;
      video_preview_image_url?: string;
    }>;
    images?: Array<{ original_image_url?: string }>;
    videos?: Array<{ video_preview_image_url?: string }>;
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
  image_url: string | null;
  ad_archive_id: string;
  start_date: number | null;
  creative_type: "image" | "video" | "carousel" | "unknown";
};

// Test fallback: hardcoded website lookup by slug while Smartlead payload is
// being updated to include website_url. Production reads from payload.
const WEBSITE_FALLBACK: Record<string, string> = {
  deenin: "https://deenin.com/",
  "deenin-v2": "https://deenin.com/",
  ohtnyc: "https://ohtnyc.com/",
  "ohtnyc-v2": "https://ohtnyc.com/",
};

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const stripNewlines = (s: string): string => s.replace(/[\r\n]+/g, " ").trim();

// Detects unmerged template tokens like {{product.name}}, {% ... %}, or
// default_*_* placeholders that bleed through from a brand's catalog/DPA ads
// when Meta's Ad Library shows the raw Liquid template instead of the rendered
// product. Mirrors the same detector in ForecastTemplate.tsx so the candidate
// pool Claude ranks stays in lockstep with what actually renders.
const LIQUID_TOKEN = /\{\{[^}]+\}\}|\{%[^%]+%\}|\bdefault_[a-z_]+\b/i;
const looksLikeBrokenToken = (value: string): boolean => LIQUID_TOKEN.test(value);

// An ad is usable only if, after stripping broken template tokens, at least one
// of headline/body is real rendered copy. Excludes pure-DPA placeholder ads
// (both fields are {{...}} tokens) that would otherwise be picked as top-K and
// then silently dropped by the render layer, leaving gaps in the numbering.
const hasRenderableCopy = (a: NormalizedAd): boolean => {
  const h = looksLikeBrokenToken(a.headline) ? "" : a.headline.trim();
  const b = looksLikeBrokenToken(a.body) ? "" : a.body.trim();
  return !!(h || b);
};

function normalizeSmartleadPayload(raw: unknown): WebhookPayload {
  const r = (raw ?? {}) as Record<string, unknown>;
  const leadData = (r.lead_data ?? {}) as Record<string, unknown>;
  const cf = (leadData.custom_fields ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  // campaign_id can arrive as a number or string depending on Smartlead's
  // webhook serialization; normalize both to a string.
  const idStr = (v: unknown): string | undefined =>
    typeof v === "number" ? String(v) : typeof v === "string" && v ? v : undefined;

  // Custom-field keys drift by how each Smartlead list was set up (Page_ID vs
  // Page_Id, FB_Page_URL vs Facebook_Url, ...). Look up case-insensitively
  // across known aliases so a naming difference doesn't silently drop the
  // Facebook target and force the lead into manual handling.
  const cfLower: Record<string, unknown> = {};
  for (const k of Object.keys(cf)) cfLower[k.toLowerCase()] = cf[k];
  const cfGet = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = cfLower[k.toLowerCase()];
      if (typeof v === "string" && v) return v;
    }
    return undefined;
  };

  return {
    lead_email: str(r.lead_email) || str(leadData.email),
    lead_first_name: str(leadData.first_name) || str(r.lead_name),
    lead_last_name: optStr(leadData.last_name),
    lead_company: str(leadData.company_name),
    company_overview_summary: cfGet("Company_Overview_(Response)", "Company_Overview") ?? "",
    facebook_page_id: cfGet("Page_ID", "Page_Id", "page_id", "Facebook_Page_Id", "FB_Page_ID"),
    facebook_url: cfGet("FB_Page_URL", "Facebook_Url", "facebook_url", "FB_URL", "Facebook_URL"),
    website_url: optStr(leadData.website),
    category: cfGet("Category"),
    campaign_name: optStr(r.campaign_name) || optStr(r.sequence_name),
    campaign_id: idStr(r.campaign_id) ?? idStr((r as Record<string, unknown>).campaignId),
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

async function apifyScrape(fbTarget: string, isPageId: boolean): Promise<ApifyAd[]> {
  const url = isPageId
    ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&search_type=page&view_all_page_id=${fbTarget}`
    : `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&search_type=page&view_all_page_id=${encodeURIComponent(
        fbTarget,
      )}`;

  const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${env(
    "APIFY_TOKEN",
  )}&timeout=180`;

  const res = await fetch(apifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls: [{ url }], resultsLimit: 100 }),
  });
  if (!res.ok) {
    throw new Error(`Apify failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ApifyAd[];
}

function normalizeAd(ad: ApifyAd, idx: number): NormalizedAd {
  const snap = ad.snapshot ?? {};
  const card = snap.cards?.[0];

  const body = stripNewlines(card?.body || snap.body?.text || "");
  const headline = stripNewlines(card?.title || snap.title || "");
  const cta = stripNewlines(card?.cta_text || snap.cta_text || "Shop Now");
  const landing_url = card?.link_url || snap.link_url || "";

  const image_url =
    card?.original_image_url ||
    snap.images?.[0]?.original_image_url ||
    snap.videos?.[0]?.video_preview_image_url ||
    card?.video_preview_image_url ||
    null;

  // Derive creative_type from the snapshot shape:
  //   - cards array with >1 entries → carousel
  //   - any video metadata → video
  //   - otherwise image (or unknown if neither)
  const cardsCount = snap.cards?.length ?? 0;
  const hasVideo = (snap.videos?.length ?? 0) > 0 || !!card?.video_preview_image_url;
  let creative_type: NormalizedAd["creative_type"] = "unknown";
  if (cardsCount > 1) creative_type = "carousel";
  else if (hasVideo) creative_type = "video";
  else if (image_url) creative_type = "image";

  return {
    index: idx,
    headline,
    body,
    cta,
    landing_url,
    image_url,
    ad_archive_id: ad.ad_archive_id ?? "",
    start_date: ad.start_date ?? null,
    creative_type,
  };
}

async function githubGetSha(path: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/contents/${path}?ref=main`,
    {
      headers: {
        Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
  const json = (await res.json()) as { sha?: string };
  return json.sha ?? null;
}

async function githubPut(path: string, contentBase64: string, message: string): Promise<void> {
  const sha = await githubGetSha(path);
  const body: Record<string, string> = {
    message,
    branch: "main",
    content: contentBase64,
  };
  if (sha) body.sha = sha;

  const res = await fetch(
    `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/contents/${path}`,
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
  if (!res.ok) {
    throw new Error(`GitHub PUT ${path} failed: ${res.status} ${await res.text()}`);
  }
}

async function downloadImageBase64(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Image download failed: ${res.status} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString("base64");
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

function compactCount(totalUsable: number): number {
  if (totalUsable <= 5) return 0;
  if (totalUsable <= 7) return totalUsable - 5;
  return 3;
}

// Shopify exposes /products.json publicly on most stores. We pull a window of
// recent products and pick the first one that's published, in stock, and looks
// like an apparel/jewelry SKU (skip art/decor/ceramic/candle/home goods).
type ShopifyProduct = { title: string; image_url: string; page_url: string };
const SKU_TYPE_BLOCKLIST = /\b(art|ceramic|candle|home|decor|fragrance|book|sticker|gift card)\b/i;
async function fetchShopifyHeroProduct(
  websiteUrl: string,
  overrideHandle?: string | null,
): Promise<ShopifyProduct | null> {
  try {
    const base = websiteUrl.replace(/\/$/, "");

    // If caller specified an exact product handle, fetch that product directly.
    // Bypasses the auto-pick heuristic for brands with noisy catalogs (e.g. a
    // licensed-merch line that overshadows the core SKUs).
    if (overrideHandle) {
      const res = await fetch(`${base}/products/${overrideHandle}.json`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          product?: {
            title?: string;
            handle?: string;
            images?: Array<{ src?: string }>;
          };
        };
        const p = data.product;
        if (p?.title && p?.handle && p.images?.[0]?.src) {
          return {
            title: p.title,
            image_url: p.images[0].src,
            page_url: `${base}/products/${p.handle}`,
          };
        }
      }
      console.error(
        `Shopify override handle "${overrideHandle}" not found at ${base}; falling back to auto-pick`,
      );
    }

    const res = await fetch(`${base}/products.json?limit=20`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      products?: Array<{
        title?: string;
        handle?: string;
        product_type?: string;
        tags?: string[];
        published_at?: string | null;
        images?: Array<{ src?: string }>;
        variants?: Array<{ available?: boolean }>;
      }>;
    };
    const products = data.products ?? [];

    const candidates = products.filter((p) => {
      if (!p.title || !p.handle || !p.images?.[0]?.src) return false;
      if (!p.published_at) return false;
      const inStock = (p.variants ?? []).some((v) => v.available === true);
      if (!inStock) return false;
      return true;
    });
    if (candidates.length === 0) return null;

    // Prefer SKUs that don't look like art/home/non-apparel; fall back to any.
    const apparelLike = candidates.find((p) => {
      const blob = `${p.product_type ?? ""} ${(p.tags ?? []).join(" ")}`;
      return !SKU_TYPE_BLOCKLIST.test(blob);
    });
    const picked = apparelLike ?? candidates[0];

    return {
      title: picked.title!,
      image_url: picked.images![0].src!,
      page_url: `${base}/products/${picked.handle}`,
    };
  } catch (e) {
    console.error("Shopify fetch failed:", e);
    return null;
  }
}

// Words that have tripped Google's content filter on Nano Banana 2 in testing.
// Strip these from prompts (case-insensitive) before submitting.
const NB2_BLOCKLIST = [
  "graffiti",
  "tagged",
  "underpass",
  "weapon",
  "gun",
  "alcohol",
  "drug",
  "tattoo",
  "blood",
];

function sanitizeNB2Prompt(prompt: string): string {
  let out = prompt;
  for (const word of NB2_BLOCKLIST) {
    out = out.replace(new RegExp(`\\b${word}\\w*\\b`, "gi"), "");
  }
  return out.replace(/\s+/g, " ").replace(/ ,/g, ",").trim();
}

function buildSafeFallbackPrompt(productTitle: string): string {
  return `A photorealistic editorial product photograph featuring the product from the reference image, styled on a soft cream linen surface with natural diffused daylight from a side window casting gentle shadows. Calm, premium, minimalist aesthetic with a muted neutral palette. Square 1:1 composition with breathing room top and bottom for ad text overlay. CRITICAL — preserve the exact metal type, color, finish, fabric, weave, stones, surface treatment, and EVERY visible construction detail of the ${productTitle} as shown in the reference image. STRUCTURE — preserve the exact silhouette, button/snap/zipper count, pocket count, closure style, sleeves, neckline, hardware, and any printed graphics or text on the garment exactly as shown. Do NOT change the metal type, do NOT shift the color temperature, do NOT introduce tones not present in the reference, do NOT add or remove any buttons/snaps/zippers/pockets/straps, do NOT alter the silhouette, do NOT remove or modify printed graphics or text on the garment. IMPORTANT: the 'no text' and 'no logos' items in the NEGATIVE list apply ONLY to overlay text/logos added to the photograph itself — text, logos, graphics, prints, and brand labels that exist ON the product in the reference are part of the product and must be preserved exactly. Premium commerce photography quality. NEGATIVE: no overlay text added to the photograph, no overlay logos added to the photograph, no watermarks, no UI elements, no Facebook interface, no clickable buttons, no faces, no models, no collage, no borders, no duplicate products, no color shift, no metal swap, no silver-to-gold or gold-to-silver conversion, no warm-tone bias on cool metals, no recoloring of fabric or stones, no pattern modifications, no removing or replacing the product's printed graphics, no extra hardware not present in reference, no added pockets or pleats, no silhouette alterations, no design modifications.`;
}

async function kieSubmitAndPoll(
  prompt: string,
  referenceImageUrl: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const submitRes = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nano-banana-2",
        input: {
          prompt,
          image_input: [referenceImageUrl],
          aspect_ratio: "1:1",
          resolution: "1K",
          output_format: "jpg",
        },
      }),
    });
    if (!submitRes.ok) {
      console.error("KIE submit failed:", submitRes.status, await submitRes.text());
      return null;
    }
    const submitJson = (await submitRes.json()) as { data?: { taskId?: string } };
    const taskId = submitJson.data?.taskId;
    if (!taskId) return null;

    const start = Date.now();
    while (Date.now() - start < 120000) {
      await new Promise((r) => setTimeout(r, 4000));
      const pollRes = await fetch(
        `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!pollRes.ok) continue;
      const pollJson = (await pollRes.json()) as {
        data?: { state?: string; resultJson?: string; failMsg?: string };
      };
      const state = pollJson.data?.state;
      if (state === "success") {
        const result = JSON.parse(pollJson.data?.resultJson ?? "{}") as { resultUrls?: string[] };
        return result.resultUrls?.[0] ?? null;
      }
      if (state === "fail") {
        console.error("KIE generation failed:", pollJson.data?.failMsg);
        return null;
      }
    }
    console.error("KIE polling timeout");
    return null;
  } catch (e) {
    console.error("KIE error:", e);
    return null;
  }
}

// First attempt with Claude's prompt (sanitized). On failure, retry once with
// a stripped-down safe template that only varies by product name.
async function kieGenerateMockup(
  prompt: string,
  referenceImageUrl: string,
  productTitle: string,
): Promise<string | null> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    console.error("KIE_API_KEY not set — skipping mockup");
    return null;
  }
  const sanitized = sanitizeNB2Prompt(prompt);
  const first = await kieSubmitAndPoll(sanitized, referenceImageUrl, apiKey);
  if (first) return first;

  console.error("NB2 first attempt failed; retrying with safe fallback prompt");
  return await kieSubmitAndPoll(buildSafeFallbackPrompt(productTitle), referenceImageUrl, apiKey);
}

function buildPrompt(
  payload: WebhookPayload,
  slug: string,
  allAds: NormalizedAd[],
  heroProductTitle: string | null,
  scoring: ScoringResult,
  nicheKey: NicheKey,
  rawScrapeCount: number,
) {
  const benchmark = getBenchmark(nicheKey);
  const q4 = q4InflationMultiplier();
  const daysByIndex = new Map(scoring.perAd.map((s) => [s.ad_index, s.days_running]));

  const adsText = allAds
    .map((a) => {
      const days = daysByIndex.get(a.index);
      const daysTag = typeof days === "number" ? ` [DAYS:${days}]` : "";
      return `[INDEX:${a.index}] [IMG:${a.image_url ? "yes" : "no"}] [FORMAT:${a.creative_type}]${daysTag}\nHeadline: ${a.headline}\nBody: ${a.body}\nCTA: ${a.cta}\nLanding: ${a.landing_url}`;
    })
    .join("\n---\n");

  const r = scoring.rollup;
  // FACTS block — only things Claude can't see from the ad text. Brand size +
  // benchmarks + Q4 timing inform Claude's scoring; we don't pre-compute the
  // scores themselves (that produced numbers that didn't match narrative
  // urgency — see hybrid revert decision in conversation 2026-05-03).
  // No internal taxonomy ("whale-tier", "S2", "bucket") — Claude must
  // translate to plain English in the report (see system prompt rule).
  const cadenceCopy: Record<typeof r.cadence_label, string> = {
    healthy: "fresh ads shipping consistently across recent weeks",
    trickle: "new creative arriving slowly — long gaps between launches",
    cliff: "all active ads launched within a tight window — they'll fatigue together",
    "pulse-burn": "big batch shipped at once, nothing since — burst-and-stall pattern",
  };
  const factsBlock = `══════ ACCOUNT FACTS (Claude can't derive these — use as context, but translate to plain English in the report) ══════
This brand is running ${r.S2_concept_count} distinct ad ideas across ${allAds.length} ads. ${r.hero_concept_call_out_required ? "⚠️ Meta needs at least 5 genuinely different ad ideas, or it treats the near-identical ones as one ad and stops showing the rest. This brand is below that — you MUST call this out, but in plain owner English (no codenames), explaining the consequence to them." : "(this brand has enough distinct ad ideas)"}
Format mix: ${r.format_mix.image} static image / ${r.format_mix.video} video / ${r.format_mix.carousel} carousel.
Refresh pattern: ${cadenceCopy[r.cadence_label]}.

This brand's typical hero-creative refresh window: ${r.brand_size_threshold_days} days. (Use this for benchmark.your_value_days. Do NOT mention "tier", "bracket", "whale", or any internal taxonomy.)
Refresh window context (for benchmark.category_median_days = 21, top_quartile_days = 14): the typical brand refreshes every ~21 days; the top performers refresh every ~14 days; high-volume accounts at this brand's scale should refresh every ~10 days.

Niche: ${nicheKey}
Per-niche industry CPM band (background only — NOT their actual CPM): $${benchmark.cpm_low}–$${benchmark.cpm_high}
E-commerce industry medians: CPM $${benchmark.ecom_cpm_median} / ROAS ${benchmark.ecom_roas_median}× / Advantage+ Sales ROAS ${benchmark.ecom_roas_advantage_plus}× / Retargeting ROAS ${benchmark.ecom_roas_retargeting}×
Q4 timing: ${q4.label}${q4.in_q4 ? " — if you flag stale hero, mention they're entering expensive impressions with fatigued creative" : ""}
══════════════════════════════════════════════════════════════════════════════`;

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const adsWithImages = allAds.filter((a) => a.image_url).length;
  const totalUsable = allAds.length;
  // Pick a slightly larger pool than we'll display so the pipeline can fall
  // back when Apify image URLs 404 at download time. Render only the top 5
  // that upload cleanly.
  const candidateK = Math.min(10, adsWithImages);
  const compactK = compactCount(totalUsable);

  const heroProductLine = heroProductTitle
    ? `\nHero product to feature in the mockup: "${heroProductTitle}" (sourced from their Shopify store — most recently active SKU).`
    : "";

  const userMessage = `Brand: ${payload.lead_company}
Brand slug: ${slug}
First name: ${payload.lead_first_name}
Voice (for replacement copy): ${payload.company_overview_summary}
Today's date: ${today}
Total live ads in their Meta Library: ${rawScrapeCount} ${rawScrapeCount === totalUsable ? "" : `(${totalUsable} have usable copy and are listed below for analysis; the remaining ${rawScrapeCount - totalUsable} are DCO template ads or copy-empty variants — count them in the total but don't try to analyze copy you can't see)`}
Ads with images available: ${adsWithImages}${heroProductLine}

${factsBlock}

ALL LIVE ADS (analyze every one to detect patterns — duplicates, hook recycling, format gaps; [DAYS:N] is days running):
${adsText}

YOUR TASK
=========
1. Analyze ALL ${totalUsable} ads above for fatigue signals across everything they're running. Use the ACCOUNT FACTS block as context (brand size, niche policy from KB, Q4 timing).
2. Score each ad 0-10 on 6 fatigue signals (10=severe): FORMAT_REPETITION, HOOK_REPETITION, HEADLINE_PATTERN, CTA_REPETITION, LANDING_DESTINATION, LAUNCH_CLUSTER. Sum and normalize to 0-100. Map to days_until_fatigue: 80-100 → 5-10d, 60-79 → 11-20d, 40-59 → 21-35d, <40 → 36+d. Calibrate scoring against the brand's refresh window (${r.brand_size_threshold_days}d) — an ad past that window with copy duplication should land in the danger band.
3. Pick the ${candidateK} most fatigued ads THAT HAVE IMAGES (IMG:yes), ranked by fatigue_score descending. Output as full ad cards in "ads", numbered 1..${candidateK} where 1 = most fatigued. Each MUST include a "source_index" field with the [INDEX:N] from above. (We'll display only the top 5 — extras serve as backups when image downloads fail.)
4. Pick ${compactK} additional representative ads (with or without images) from the remaining set. Output them in "ads_compact". If ${compactK} is 0, return an empty array.
5. Write ONE hero replacement concept (the strongest creative direction you'd ship for this brand right now). Its fills_gap should reference patterns observed across ALL ${rawScrapeCount} of their live ads.
6. Generate an image_prompt for the hero concept's mockup ad image. Follow the IMAGE PROMPT TEMPLATE strictly.

IMAGE PROMPT TEMPLATE (fill in the {SCENE}, {LIGHTING}, {AESTHETIC}, {MATERIAL_LOCK}, and {STRUCTURE_LOCK} slots based on the brand's existing creative style — observed from the ads above — and the concept's visual direction):

"A photorealistic editorial product photograph featuring the product from the reference image, styled in {SCENE}, with {LIGHTING}. {AESTHETIC}. Square 1:1 composition with breathing room top and bottom for ad text overlay. CRITICAL — {MATERIAL_LOCK}. STRUCTURE — {STRUCTURE_LOCK}. Render the product's metal, color, finish, fabric, weave, stones, surface treatment, AND every visible construction detail (silhouette, closures, hardware count, pockets, sleeves, neckline, printed graphics) EXACTLY as they appear in the reference image. Do NOT change the metal type, do NOT shift the color temperature, do NOT introduce tones not present in the reference, do NOT add or remove buttons, snaps, zippers, pockets, straps, or any hardware, do NOT alter the silhouette, do NOT remove or modify printed graphics or text on the garment. IMPORTANT: the 'no text' and 'no logos' items in the NEGATIVE list below apply ONLY to text or logos added as overlay to the photograph itself — text, logos, graphics, prints, and brand labels that exist ON the product in the reference image are part of the product and must be preserved exactly. Premium commerce photography quality. NEGATIVE: no overlay text added to the photograph, no overlay logos added to the photograph, no watermarks, no UI elements, no Facebook interface, no clickable buttons, no faces, no models, no collage, no borders, no duplicate products, no color shift, no metal swap, no silver-to-gold or gold-to-silver conversion, no warm-tone bias on cool metals, no recoloring of fabric or stones, no pattern modifications, no removing or replacing the product's printed graphics, no extra hardware not present in reference, no added pockets or pleats, no silhouette alterations, no design modifications."

{MATERIAL_LOCK} INSTRUCTIONS:
Read the reference product title and, if you can see it in the ads above, its visible properties. Write a single sentence locking the dominant material/color/finish in plain language with explicit forbids. Examples:
- Sterling silver bracelet → "preserve sterling silver / .925 silver finish exactly as shown — strictly NO gold, brass, yellow, copper, or warm metallic tones"
- Beige wool blazer → "preserve the exact beige/camel wool tone shown — strictly NO grey, taupe, cream, or color shift"
- Dark chocolate suede → "preserve the exact dark chocolate brown suede color and matte nap — strictly NO caramel, tan, gold-brown, or black shift"
- Pale yellow sheer mesh → "preserve the exact pale buttery yellow color and lightweight sheer mesh fabric — strictly NO white, cream, peach, greenish, or orange shift"
- Black graphic tee → "preserve the exact deep black colorway of the cotton jersey AND every printed graphic, color, and text element exactly as shown on the chest and neck label — strictly NO color shift, NO removing of print, NO altering of graphic colors"
- Mini-check woven fabric → "preserve the exact dusty lavender mini-check pattern at the same scale and proportions as shown — strictly NO smoothing to a solid, NO replacing with stripes/plaid, NO color shift"

{STRUCTURE_LOCK} INSTRUCTIONS:
Write a single sentence naming every COUNTABLE or VISIBLE structural feature of the garment/product as it appears in the reference, with explicit forbids on adding/removing/modifying them. The model is prone to adding extra buttons, swapping single-breasted to double-breasted, adding pockets, changing strap counts, etc. Be specific. Examples:
- Cropped suede jacket + shorts co-ord → "preserve the exact construction: jacket has stand-up collar with snap closure, two chest patch pockets each with snap-flap, snap-front placket centered down the front; shorts are high-rise mid-thigh length matching suede; metal hardware is small silver-tone snaps. Do NOT add or remove buttons, snaps, zippers, or pockets, do NOT change garment silhouette, do NOT replace snaps with buttons"
- Single-breasted blazer with 2 buttons → "preserve the exact construction: single-breasted, two visible front buttons in a single column, peaked lapel, structured shoulder, two flap pockets at the waist, no breast pocket. Do NOT add additional buttons, do NOT convert to double-breasted, do NOT change lapel style or pocket count"
- Babydoll cami top → "preserve the exact construction: V-neckline with scalloped lace trim, delicate spaghetti straps, gathered empire-waist body that flows loose below the bust, scalloped lace trim along the bottom hem. Do NOT change strap thickness, do NOT alter V-neckline depth, do NOT remove or relocate lace trim, do NOT change to a fitted cami silhouette"
- Graphic tee with chest print → "preserve the exact construction: crew neckline, short sleeves, regular straight fit, printed brand label at back of neck. PRESERVE the front-chest printed graphic exactly — every illustration, every text element, all colors, same placement. Do NOT remove the print, do NOT alter the graphic, do NOT change neckline or sleeve length"
- Wide-leg pant → "preserve the exact construction: full-length wide-leg silhouette (loose hip to ankle, no taper), mid-rise waistband, any visible pleats or pintucks at the waistband as shown. Do NOT change to slim/tapered/cropped, do NOT add or remove pleats, darts, or pockets, do NOT alter waistband style"
- Bracelet/necklace with stones → "preserve the exact construction: same number of stones, same stone shapes, same setting style, same chain link pattern, same clasp type. Do NOT add or remove stones, do NOT change setting style, do NOT swap chain pattern"

If the garment has printed graphics, text, logos, or brand labels visible on it: name them all in the STRUCTURE_LOCK and explicitly call out that they must be preserved (the model otherwise wipes them per the no-text negative).

HARD RULE — NO TEMPLATE TOKENS IN PROSE:
Every text field you write (tldr, benchmark.context, hero_concept.*, next_step.*, method_note, etc.) must be fully-rendered human English. Never emit template syntax like {{product.name}}, {{ collection.title }}, {% if ... %}, or default_collection_headline / default_*_* placeholders. If you would otherwise reference a value you don't have, rewrite the sentence so the phrase is gone — do not leave a placeholder.

Return a single valid JSON object matching this EXACT schema:

{
  "brand": "${payload.lead_company}",
  "brand_slug": "${slug}",
  "first_name": "${payload.lead_first_name}",
  "website": "https://example.com",
  "generated_date": "${today}",
  "read_time_min": 3,
  "total_ads": ${rawScrapeCount},
  "niche": "ONE plain-English noun the brand's customers would use to describe what they sell — lowercase, 1-3 words, used in a sentence as 'other ___ brands'. Examples: 'jewelry', 'streetwear', 'outerwear', 'luxury womenswear', 'modest fashion', 'sustainable fashion', 'skincare', 'home fragrance'. Avoid jargon ('DTC', 'D2C', 'ecom', 'fashion ecom') and avoid the brand's own name.",
  "tldr": "2 short sentences, grade 7-8, no jargon. Say how many ads are wearing out and the single biggest problem in plain words (too many near-identical ads, the same wording repeated, all one format, etc.), plus why it matters to them. Name the problem — do NOT tell them how to fix it. No made-up numbers.",
  "benchmark": {
    "your_value_days": "integer — the brand's actual hero-creative refresh window per the FACTS block (${r.brand_size_threshold_days} for this ${r.brand_size}-tier brand). Adjust DOWN if ads in danger band push the practical window earlier.",
    "category_median_days": 21,
    "top_quartile_days": 14,
    "context": "1-2 plain-English sentences (grade 7-8, no jargon) comparing this brand to typical brands in their space.${r.hero_concept_call_out_required ? " You MUST mention, in plain terms with no codenames, that they don't have enough genuinely different ads, so Meta shows fewer of them." : ""}${q4.in_q4 ? " Briefly note that ad costs run higher this time of year." : ""} Do NOT mention CPM numbers or other made-up figures."
  },
  "ads": [
    {
      "ad_number": 1,
      "source_index": 7,
      "headline": "actual headline",
      "body": "actual body",
      "cta": "Shop Now",
      "fatigue_score": 89,
      "days_until_fatigue": 6,
      "severity": "danger",
      "drivers": ["one short plain-English sentence (grade 7-8, under ~18 words, no jargon or codenames): a specific problem with THIS ad and what it costs them — never how to fix it", "a second, DIFFERENT problem — don't repeat a point already made on another ad", "a third, distinct problem"]
    }
  ],
  "ads_compact": [
    { "headline": "...", "body": "...", "fatigue_score": 58, "days_until_fatigue": 21 }
  ],
  "hero_concept": {
    "concept_name": "short descriptor",
    "format": "the ad type in plain words: 'Single image', 'Swipeable set' (not 'carousel'), or 'Video'",
    "hook": "≤10 words — appears as primary text above the ad image",
    "headline": "≤6 words — appears below the ad image as the headline",
    "primary_text": "60-90 words in brand voice, FORMATTED AS 2-3 SHORT PARAGRAPHS separated by literal \\n\\n. First paragraph hooks/opens, second develops, optional third closes with the offer. Example: 'When Lea started L.CUPPINI in London in 2019, the goal was simple: outerwear that doesn't expire.\\n\\nThe Linda Tux Blazer in beige is cut for the woman who's done chasing seasons — tailored shoulder, soft hand, weight that holds its shape after the tenth wear.\\n\\nFree express shipping worldwide on orders over £600.'",
    "cta": "Shop Now / Learn More / etc — short button label",
    "visual_direction": "1 sentence describing what the visual shows",
    "fills_gap": "Why this ad idea, in plain owner English (grade 7-8, no jargon, no long dashes), 1-2 short sentences. Say what their current ads are missing in words the owner uses: say 'swipeable ad' not 'carousel', 'your best selling point' not 'proof point', 'runs your account' not 'carry the account'. Do NOT say 'video twin', 'collection ad', 'riding shotgun', or 'proof point'. NO indexes, pools, or datasets.",
    "image_prompt": "the fully-filled image generation prompt using the template above with ALL FIVE slots filled in: {SCENE}, {LIGHTING}, {AESTHETIC}, {MATERIAL_LOCK}, {STRUCTURE_LOCK}. The MATERIAL_LOCK clause must name the reference product's exact material/metal/color/finish with explicit forbids on the wrong-tone swap. The STRUCTURE_LOCK clause must name every countable structural feature (button counts, pocket counts, closure type, silhouette, sleeve length, neckline, hardware, AND any printed graphics/text/logos on the garment) with explicit forbids on adding/removing/modifying them. Both clauses are MANDATORY — do not output an image_prompt missing either lock. Do NOT use words like graffiti, tagged, weapon, drug, alcohol, blood — Google's content filter rejects them."
  },
  "next_step": {
    "urgency": "one short plain-English line (grade 7-8, no jargon) about which ads stop working soon and roughly when",
    "headline": "call CTA headline",
    "body": "2-sentence pitch for the call.",
    "calendly_url": "https://calendly.com/kyle-hamar/30min"
  },
  "prepared_by": "Prepared by Kyle Hamar — OmniRocket",
  "method_note": "1 short plain sentence on how this was made and its limits, no jargon. Example: 'Based only on your public Facebook and Instagram ads — the pictures, the words, and how long each one has been running. No access to your account or private numbers.'",
  "logodev_token": "pk_ZezWvcllSnOBRBeLqqlx6g"
}

HARD RULES
==========
- "ads" length must equal exactly ${candidateK}. Each entry MUST have source_index pointing to one of the [INDEX:N] values where IMG was "yes". No duplicates.
- ad_number values in "ads" are sequential 1..${candidateK} where 1 = most fatigued.
- "ads_compact" length must equal exactly ${compactK} (used for analysis context only, not rendered).
- "severity": danger if fatigue_score>=85, warn if 65-84, ok if <65.
- "days_until_fatigue" must be an integer.
- Exactly ONE hero_concept (not multiple).
- hero_concept.image_prompt MUST follow the template structure exactly with BOTH the {MATERIAL_LOCK} AND {STRUCTURE_LOCK} clauses filled in, the printed-graphics override note preserved, and the negative section preserved verbatim. The MATERIAL_LOCK must name the actual material/metal/color/finish (e.g. "sterling silver", "beige wool", "dark chocolate suede") with wrong-tone forbids. The STRUCTURE_LOCK must name visible construction (button/snap/zipper count, pocket count, closure style, silhouette, sleeves, neckline, hardware) AND any printed graphics/text/logos on the garment, with explicit forbids on adding, removing, or altering them. If the product has printed graphics or text on it (graphic tees, branded sweatshirts, logo'd items), the STRUCTURE_LOCK must explicitly name them so the no-overlay-text negative does not cause the model to wipe them.
- hero_concept.primary_text MUST contain literal \\n\\n separators between paragraphs (2-3 paragraphs total).
- All copy grounded in the actual live ads above.
- If an ad has an empty headline or body, exactly ONE of its 3 drivers MUST conversationally call out the missing field and explain the impact ("No headline on this ad, so the body is doing all the work...").

ABSOLUTELY FORBIDDEN — these reveal you are an AI processing structured data:
- NEVER reference [INDEX:N] numbers in any user-facing copy. Not in drivers. Not in tldr. Not in benchmark.context. Not in fills_gap. Not anywhere.
  ❌ "Body copy is duplicated verbatim across indexes 0, 1, 10, 13, 28"
  ❌ "duplicated on indexes 15 and 59"
  ❌ "INDEX 1, 2, and 5"
  ✅ "The exact same wording is copied word-for-word across five of your live ads"
  ✅ "you're running the same opening line across roughly a dozen ads"
- NEVER use the words: index, indexes, the pool, the dataset, the data, source_index, ad_label.
- NEVER use the words: audit, review, analysis (use: walked through, looked at, went through, mapped).
- Refer to ads by what they ARE, not by number: "your camo coat ad", "the 'BOGO' headline ad", "the three Valentine's heart-pendant ads", "your founder-story video".
- The reader must believe a human strategist on Kyle's team manually went through their Meta Ad Library and wrote this. Every sentence should pass that test.

Output ONLY the JSON object. No markdown fences. No prose before or after.`;

  return userMessage;
}

function buildSystemPrompt(nicheKey: NicheKey): string {
  return `You are an ad creative strategist generating a Fatigue Forecast deliverable for OmniRocket (a Meta ads agency for ecommerce fashion brands). You score live Meta ads on creative fatigue signals, predict days-until-fatigue, identify the ad to scale and the ad to kill, and write ONE hero replacement creative concept (with a mockup image prompt) in the brand's voice.

The user message contains an ACCOUNT FACTS block (brand size, niche benchmarks, refresh windows, Q4 timing) — use it to calibrate your scoring and to ground the benchmark.* fields. Do NOT invent CPM/CTR/ROAS numbers about the brand itself; you only see public ad data, never their account.

TONE: peer operator. Specific, not generic. Quote actual ad copy verbatim from the live ads provided.
NEVER use the words 'audit', 'review', or 'analysis' — use 'walked through', 'looked at', 'went through', 'mapped'.

PLAIN ENGLISH RULE: the reader is a Shopify brand OWNER with NO agency and NO media-buying background. They run their own ads and asked for a second opinion. Write so a smart 13-year-old (US grade 7-8) understands it on the first read. NEVER use marketing or ad-platform jargon. If a word would make the owner stop and think "what does that mean?", it is banned.

These rules apply to every OWNER-FACING report field: tldr, benchmark.context, every ad's drivers, next_step.urgency, method_note, AND hero_concept.fills_gap and hero_concept.visual_direction (these two explain things TO the owner, so they must be plain and jargon-free like the rest of the report).
ONE narrow exception: hero_concept.hook, hero_concept.headline, hero_concept.primary_text, and hero_concept.cta are the actual replacement AD's copy, written in the brand's marketing voice — they should read like a real ad, so they don't have to sound like a plain explanation. (They still must NOT use a long dash, and still avoid platform jargon like "carousel"/"CTA".)

HARD-BANNED WORDS/PHRASES (must never appear in owner-facing fields): "Andromeda", "cluster"/"clustering"/"cluster suppression", "retrieval", "cannibalization"/"cannibalize", "ad set", "concept" as a noun for an ad (say "ad idea" or "different ad"), "creative" as a noun (say "ad" or "the image/video"), "CPM", "ROAS", "impressions", "reach" (say "how many people see it"), "throttle"/"soft-throttle"/"suppress" (say "shows it to fewer people"), "SKU" (say "product"), "hook" (say "opening line"), "A/B", "variant", "cadence", "refresh window" (say "how often you post new ads"), "top-quartile"/"quartile"/"category median" (say "the best brands"/"the typical brand"), "auction", "monoculture", "avatars", "verbatim" (say "word-for-word"), "landing page" (say "the page the ad sends people to"). Still banned: "whale-tier", "mid-tier", "spend bracket", "S1/S2/S3", "fatigue bucket", "concept signature".

EXPLAIN, DON'T NAME: when a platform mechanic matters, describe it in plain cause-and-effect — never with its codename. E.g. instead of "Andromeda clusters these and throttles the cluster" → "Meta sees these near-identical ads as basically one ad, so it quietly shows just one and stops running the rest — you paid to make ads almost no one sees."

READING RULES (owner-facing fields):
- Grade 7-8. Short sentences, aim under 18 words, one idea each. Break long sentences in two.
- NEVER use a long dash (em dash "—" or en dash "–"). They look AI-written. Use a normal hyphen "-" instead, or just start a new sentence.
- Say each point ONCE. Do not repeat the same finding across tldr, benchmark.context, and several drivers. If multiple ads share a problem, say it once, then let each ad's drivers add something NEW.
- Keep the whole owner-facing read (tldr + benchmark.context + all drivers + urgency) under ~300-350 words — a real 90-second read. Be ruthless.

DIAGNOSE, DON'T PRESCRIBE (critical): your job is to make each problem vivid and show what it is COSTING them — not to hand over the fix. Name what is wrong and the consequence, then STOP. Never tell them what to do about it (do NOT write "pause this", "delete the duplicate", "write a benefit-led headline", "add a video", "refresh sooner", "shorten this", etc.). The owner should finish each ad thinking "that's bad, and I'm not sure how to fix it myself." The fix is what the call is for. State the symptom and the cost; withhold the cure.
OUTPUT: a single valid JSON object only — starting with { and ending with }. No prose, no markdown fences, no explanation. Match the schema exactly as shown in the user message.

The following knowledge base is your source of truth for Meta ad policy, anti-patterns, and 2025–2026 platform reality. Apply it when writing findings, drivers, and the hero concept — but translate every platform mechanic into plain owner English per the rules above. Never name internal systems (e.g. "Andromeda"); explain what they DO to the owner's ads instead.
${buildKbBlock(nicheKey)}`;
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in Claude response");
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (e) {
    // Claude occasionally emits unescaped control chars (raw \n, \t, \r) inside
    // string values, which JSON.parse rejects. Strip them and retry once before
    // surfacing the failure.
    const sanitized = slice.replace(/[\u0000-\u001F]+/g, " ");
    return JSON.parse(sanitized);
  }
}

type ForecastJson = {
  total_ads?: number;
  prospect_logo_url?: string;
  ads: Array<{
    ad_number: number;
    source_index?: number;
    fatigue_score?: number;
    days_until_fatigue?: number;
    severity?: string;
  }>;
  ads_compact?: Array<{ fatigue_score?: number; days_until_fatigue?: number }>;
  benchmark?: { your_value_days?: number; category_median_days?: number; top_quartile_days?: number };
  hero_concept?: {
    image_prompt?: string;
    image_path?: string | null;
    reference_title?: string | null;
    reference_url?: string | null;
  };
  next_step?: {
    urgency?: string;
    headline?: string;
    body?: string;
    calendly_url?: string;
  };
};


export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const payload = normalizeSmartleadPayload(rawBody);

  if (!payload.lead_company) {
    console.log("[webhook] missing lead_company after normalization. Raw payload:", JSON.stringify(rawBody));
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  console.log(`[webhook] normalized payload for ${payload.lead_company} (${payload.lead_email})`);

  const slug = slugify(payload.lead_company);
  const tag = `${payload.lead_company} (${payload.lead_email})`;
  const forecastUrl = `https://omnirocket-forecasts.vercel.app/forecast/${slug}`;

  // Idempotency: if forecast already exists for this slug, re-Slack and exit.
  // Smartlead fires Lead Category Updated on activity beyond manual recategorization,
  // so we guard against duplicate pipeline runs at the slug level.
  const existingSha = await githubGetSha(`forecasts/${slug}.json`);
  if (existingSha) {
    console.log(`[webhook] forecast already exists for ${slug}, skipping pipeline`);
    await postSlack(
      `🔁 *Duplicate fire skipped* — ${tag} already has a forecast.\n🔗 ${forecastUrl}`,
    );
    return NextResponse.json({ ok: true, status: "already_exists", url: forecastUrl });
  }

  // No FB target → manual handling
  const fbTarget = payload.facebook_page_id || payload.facebook_url || "";
  if (!fbTarget) {
    await postSlack(
      `⚠️ *Manual handling needed* — ${tag} replied interested but has NO Facebook page_id and NO facebook_url. Cannot run Apify scrape.`,
    );
    return NextResponse.json({ ok: true, status: "manual_handling" });
  }

  const isPageId = !!payload.facebook_page_id;
  const fbValue = payload.facebook_page_id || payload.facebook_url!;
  const websiteUrl = payload.website_url || WEBSITE_FALLBACK[slug] || null;

  try {
    // 1. Apify scrape + Shopify hero product fetch in parallel
    const [apifyAds, heroProduct] = await Promise.all([
      apifyScrape(fbValue, isPageId),
      websiteUrl
        ? fetchShopifyHeroProduct(websiteUrl, payload.hero_product_handle ?? null)
        : Promise.resolve(null),
    ]);

    if (!apifyAds || apifyAds.length === 0) {
      await postSlack(`⚠️ *No ads found* — ${tag} has no live Meta ads. Skipping forecast.`);
      return NextResponse.json({ ok: true, status: "no_ads" });
    }

    // 2. Normalize and keep usable ads (must have real rendered copy in at
    //    least one field — excludes pure catalog/DPA placeholder ads whose
    //    headline+body are both unrendered {{product.*}} tokens).
    const normalized = apifyAds
      .map(normalizeAd)
      .filter(hasRenderableCopy)
      .map((a, i) => ({ ...a, index: i }));

    if (normalized.length === 0) {
      await postSlack(`⚠️ *No usable ads* — ${tag} ad copy is all unrendered template tokens. Manual review.`);
      return NextResponse.json({ ok: true, status: "no_usable_ads" });
    }

    // 2.5 Pre-classify niche (for KB injection) from operator-provided fields.
    // Claude still writes the user-facing `niche` string in the JSON output.
    const nicheKey = classifyNiche(
      `${payload.category ?? ""} ${payload.company_overview_summary ?? ""}`,
    );

    // 2.6 Brand-size proxy: try IG followers, soft-fallback to ad count + countries.
    const igFollowers = websiteUrl
      ? await fetchInstagramFollowerCount({ website_url: websiteUrl })
      : null;
    const countriesCount = new Set(
      apifyAds.flatMap((a) => {
        const sd = (a as { reached_countries?: string[] }).reached_countries;
        return Array.isArray(sd) ? sd : [];
      }),
    ).size;
    const brandSize = inferBrandSize({
      ig_follower_count: igFollowers,
      total_active_ads: normalized.length,
      countries_count: countriesCount || 1,
    });

    // 2.7 Deterministic scoring — replaces the Claude-side math.
    const scoringInput: ScoringAd[] = normalized.map((a) => ({
      index: a.index,
      headline: a.headline,
      body: a.body,
      cta: a.cta,
      landing_url: a.landing_url,
      start_date: a.start_date,
      creative_type: a.creative_type,
    }));
    const scoring = scoreAds(scoringInput, {
      brand_size: brandSize,
      total_active_ads: normalized.length,
      countries_count: countriesCount || 1,
      ig_follower_count: igFollowers,
    });

    // 3. Claude analyzes ALL ads, picks top K + writes ONE hero concept.
    // KB + brand-size + benchmarks injected as context so Claude scores with
    // real industry framing instead of vibes.
    const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const userMessage = buildPrompt(
      payload,
      slug,
      normalized,
      heroProduct?.title ?? null,
      scoring,
      nicheKey,
      apifyAds.length,
    );
    const systemPrompt = buildSystemPrompt(nicheKey);

    const claudeRes = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const textBlock = claudeRes.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text content");
    }
    const forecastJson = extractJson(textBlock.text) as ForecastJson;

    // Force total_ads to the raw scrape count — display value, not the
    // post-body-filter count Claude analyzes from. Keeps the report headline
    // accurate to "what's actually live in their Library" even when DCO
    // template ads with empty body get filtered out of analysis.
    forecastJson.total_ads = apifyAds.length;

    // Prospect logo: scrape apple-touch-icon from homepage. logo.dev returns
    // wrong logos for SMB ecom (Bravo TV for Bravo Shoes, IG for unknowns).
    if (websiteUrl) {
      const prospectLogoUrl = await fetchProspectLogoUrl(websiteUrl);
      if (prospectLogoUrl) {
        forecastJson.prospect_logo_url = prospectLogoUrl;
      }
    }

    // Lock next_step headline + body to a fixed template — value-stack copy
    // tested with Kyle. Only `urgency` stays Claude-generated (dynamic per the
    // analysis). Server-side overwrite avoids any drift on the offer copy.
    if (forecastJson.next_step) {
      forecastJson.next_step.headline = `Walk through the ${payload.lead_company} refresh plan with Kyle`;
      forecastJson.next_step.body = `${payload.lead_first_name}, in this 30 min call, we'll map out:\n• 3 customer avatars at your price point\n• The motivational hook driving each\n• A 30-day creative + spend roadmap (to outbeat your current ROAS)\n\nYours to keep — work with us or don't.`;
    }

    // 4. Try to upload images for ALL of Claude's candidates (up to 7).
    // Keep only the top 5 by fatigue_score that succeeded, then renumber 1..5.
    const indexById = new Map(normalized.map((a) => [a.index, a]));
    const sortedCandidates = [...forecastJson.ads].sort(
      (a, b) => (b.fatigue_score ?? 0) - (a.fatigue_score ?? 0),
    );
    const successfulAds: typeof forecastJson.ads = [];
    for (const ad of sortedCandidates) {
      if (successfulAds.length >= 5) break;
      if (typeof ad.source_index !== "number") continue;
      const src = indexById.get(ad.source_index);
      if (!src || !src.image_url) continue;
      const targetNumber = successfulAds.length + 1;
      try {
        const b64 = await downloadImageBase64(src.image_url);
        await githubPut(
          `public/creatives/${slug}/creative-${targetNumber}.jpg`,
          b64,
          `chore: add creative-${targetNumber} for ${slug}`,
        );
        successfulAds.push({ ...ad, ad_number: targetNumber });
      } catch (e) {
        console.error(
          `Image upload failed for source_index=${ad.source_index}; trying next candidate:`,
          e,
        );
      }
    }
    forecastJson.ads = successfulAds;

    // 5. Generate hero mockup ad image. If we couldn't fetch a real Shopify
    // hero product, drop the hero_concept entirely — Claude's copy is anchored
    // to a hallucinated SKU and the image is missing, so the section would
    // render off-brand. Better to hide it (template gates on `hero && ...`).
    if (forecastJson.hero_concept) {
      if (!heroProduct) {
        delete forecastJson.hero_concept;
        await postSlack(
          `ℹ️ *Hero section dropped* for ${tag} — no Shopify product fetched (non-Shopify site, geo-block, or 404). Forecast still delivered without the "Here's the ad we'd run for you" section.`,
        );
      } else {
        forecastJson.hero_concept.reference_title = heroProduct.title;
        forecastJson.hero_concept.reference_url = heroProduct.page_url;
        forecastJson.hero_concept.image_path = null;

        if (forecastJson.hero_concept.image_prompt) {
          const mockupUrl = await kieGenerateMockup(
            forecastJson.hero_concept.image_prompt,
            heroProduct.image_url,
            heroProduct.title,
          );
          if (mockupUrl) {
            try {
              const b64 = await downloadImageBase64(mockupUrl);
              await githubPut(
                `public/creatives/${slug}/hero-mockup.jpg`,
                b64,
                `chore: add hero-mockup for ${slug}`,
              );
              forecastJson.hero_concept.image_path = `/creatives/${slug}/hero-mockup.jpg`;
            } catch (e) {
              console.error("Mockup upload failed:", e);
            }
          }
        }
      }
    }

    // Backstop: swap every long dash (em "—" / en "–") for a plain hyphen
    // across all copy. Long dashes read as AI-written; keep surrounding spaces
    // as authored so " — " becomes " - " and "day—to—day" becomes "day-to-day".
    const normalizeDashes = (v: unknown): unknown => {
      if (typeof v === "string") return v.replace(/[—–]/g, "-");
      if (Array.isArray(v)) return v.map(normalizeDashes);
      if (v && typeof v === "object") {
        const obj = v as Record<string, unknown>;
        for (const k of Object.keys(obj)) obj[k] = normalizeDashes(obj[k]);
        return obj;
      }
      return v;
    };
    normalizeDashes(forecastJson);

    // 6. PUT forecast JSON
    const forecastBase64 = Buffer.from(JSON.stringify(forecastJson, null, 2)).toString("base64");
    await githubPut(`forecasts/${slug}.json`, forecastBase64, `feat: forecast for ${slug}`);

    // 7. Wait for Vercel deploy
    await new Promise((r) => setTimeout(r, 10000));

    // 8. Slack ready
    const forecastUrl = `https://omnirocket-forecasts.vercel.app/forecast/${slug}`;
    const shareUrl = `${forecastUrl}?ref=email`;
    await postSlack(
      `🟢 Fatigue Forecast ready: *${payload.lead_company}*\n📧 ${payload.lead_email}\n👤 ${payload.lead_first_name}\n🔗 ${shareUrl}\n\nReply to the lead and paste this URL.`,
    );

    try {
      await appendNewLead({
        date_sent: new Date().toISOString(),
        first_name: payload.lead_first_name || "",
        last_name: payload.lead_last_name || "",
        email: payload.lead_email,
        company: payload.lead_company || "",
        website: payload.website_url || "",
        facebook_url: payload.facebook_url || "",
        report_url: forecastUrl,
        slug,
        category: payload.category || "",
        smartlead_campaign: payload.campaign_name || "",
      });
    } catch (e) {
      console.error("Sheet append failed:", e);
    }

    // 9. Post-yes follow-up wiring (ADDITIVE, best-effort). The forecast is
    //    already generated, committed, and Slacked above, so every step here is
    //    independently guarded and can only skip — never break the magnet flow.
    //    Goal: stash magnet_link (the report) + build/bundle the Brand Playbook
    //    and stash brand_playbook_link, so the follow-up subsequence renders
    //    {{magnet_link}} (T0) and {{brand_playbook_link}} (T3, ~day 8).
    const followupCampaignId =
      payload.campaign_id ||
      (payload.campaign_name ? FORECAST_CAMPAIGN_IDS[payload.campaign_name] : undefined);

    if (!followupCampaignId) {
      await postSlack(
        `⚠️ *Follow-up fields not written* — ${tag}: no campaign_id in the webhook payload and campaign_name "${payload.campaign_name ?? ""}" isn't in the fallback map. Forecast delivered fine; add magnet_link / brand_playbook_link manually if you want the subsequence to render links.`,
      );
    } else {
      // 9a. magnet_link + follow-up personalization hooks. magnet_link is the
      //     report; followup_hook_1/2 are the two sharpest findings pulled from
      //     THIS report so the subsequence can name them ("one thing that stood
      //     out: <hook>"). Hook generation is best-effort — if it fails we just
      //     omit the hooks and still write magnet_link (subsequences use a
      //     Smartlead fallback value for the tag, so an empty hook degrades
      //     gracefully). All written in one upsert.
      const followupFields: Record<string, string> = { magnet_link: shareUrl };
      try {
        const hooks = await generateFollowupHooks(anthropic, forecastJson, payload.lead_company);
        if (hooks?.followup_hook_1) followupFields.followup_hook_1 = hooks.followup_hook_1;
        if (hooks?.followup_hook_2) followupFields.followup_hook_2 = hooks.followup_hook_2;
      } catch (e) {
        console.error("follow-up hook generation threw:", e);
      }
      try {
        const ok = await writeLeadCustomFields(
          followupCampaignId,
          payload.lead_email,
          followupFields,
        );
        if (!ok) {
          await postSlack(
            `⚠️ *magnet_link/hooks write failed* — ${tag} (campaign ${followupCampaignId}). Forecast delivered fine.`,
          );
        }
      } catch (e) {
        console.error("magnet_link/hooks write threw:", e);
      }

      // 9b. Brand Playbook build + brand_playbook_link — only if we have a site
      //     to scrape. Reuses the same Anthropic client + buildPlaybook engine
      //     as the standalone Brand_Playbook route.
      if (websiteUrl) {
        try {
          const playbookShare = await generateAndPublishPlaybook({
            anthropic,
            lead_company: payload.lead_company,
            lead_first_name: payload.lead_first_name,
            website_url: websiteUrl,
          });
          const wrote = await writeLeadCustomFields(followupCampaignId, payload.lead_email, {
            brand_playbook_link: playbookShare,
          });
          await postSlack(
            `🧠 Brand Playbook bundled for *${payload.lead_company}* (follow-up T3)\n🔗 ${playbookShare}${
              wrote ? "" : "\n⚠️ but writing brand_playbook_link to Smartlead failed — check the custom field before the subsequence runs."
            }`,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Playbook bundle failed:", msg);
          await postSlack(
            `⚠️ *Playbook bundle failed* — ${tag}\n\`\`\`${msg}\`\`\`\nForecast delivered fine; flip Brand_Playbook manually if you want the T3 drop.`,
          );
        }
      } else {
        await postSlack(
          `ℹ️ *No website for playbook* — ${tag}: skipped the T3 Brand Playbook build. Forecast delivered fine.`,
        );
      }
    }

    return NextResponse.json({ ok: true, slug, url: forecastUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Webhook error:", msg);
    await postSlack(`❌ *Forecast failed* — ${tag}\n\`\`\`${msg}\`\`\``);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "POST a Smartlead payload to this endpoint" });
}
