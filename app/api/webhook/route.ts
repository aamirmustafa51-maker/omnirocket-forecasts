import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { scoreAds, inferBrandSize, type ScoringAd, type ScoringResult } from "@/lib/fatigue";
import { getBenchmark, classifyNiche, q4InflationMultiplier, type NicheKey } from "@/lib/benchmarks";
import { buildKbBlock } from "@/lib/kb";
import { fetchInstagramFollowerCount } from "@/lib/instagram";

export const maxDuration = 300;
export const runtime = "nodejs";

type WebhookPayload = {
  lead_email: string;
  lead_first_name: string;
  lead_company: string;
  normalized_company_name: string;
  company_overview_summary: string;
  facebook_page_id?: string;
  facebook_url?: string;
  website_url?: string;
  category?: string;
  hero_product_handle?: string;
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
    body: JSON.stringify({ urls: [{ url }], resultsLimit: 30 }),
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
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
) {
  const benchmark = getBenchmark(nicheKey);
  const q4 = q4InflationMultiplier();
  const scoreByIndex = new Map(scoring.perAd.map((s) => [s.ad_index, s]));

  const adsText = allAds
    .map((a) => {
      const s = scoreByIndex.get(a.index);
      const stats = s
        ? `\nDays running: ${s.days_running} | fatigue_score: ${s.fatigue_score} | days_until_fatigue: ${s.days_until_fatigue} | severity: ${s.severity}`
        : "";
      return `[INDEX:${a.index}] [IMG:${a.image_url ? "yes" : "no"}] [FORMAT:${a.creative_type}]\nHeadline: ${a.headline}\nBody: ${a.body}\nCTA: ${a.cta}\nLanding: ${a.landing_url}${stats}`;
    })
    .join("\n---\n");

  const r = scoring.rollup;
  const factsBlock = `══════ DETERMINISTIC FACTS — quote verbatim, do NOT invent or alter ══════
Brand size (inferred): ${r.brand_size} (stale-hero threshold: ${r.brand_size_threshold_days} days)
Account fatigue score: ${r.account_fatigue_score} / 100
Active concept count: ${r.S2_concept_count} ${r.hero_concept_call_out_required ? "(BELOW Andromeda 5-concept floor — MANDATORY call-out)" : "(at or above Andromeda floor)"}
Format mix: image=${r.format_mix.image}, video=${r.format_mix.video}, carousel=${r.format_mix.carousel}
Refresh cadence: ${r.cadence_label}

Niche: ${nicheKey}
Per-niche CPM band: $${benchmark.cpm_low}–$${benchmark.cpm_high} (industry benchmark — context only, not their actual CPM)
E-com median CPM: $${benchmark.ecom_cpm_median}
E-com median ROAS: ${benchmark.ecom_roas_median}× | Advantage+ Sales: ${benchmark.ecom_roas_advantage_plus}× | Retargeting: ${benchmark.ecom_roas_retargeting}×
Andromeda concept-count buckets: ≤2 critical, 3–4 poor, 5–7 acceptable, 8–12 good, 13+ excellent
Q4 timing: ${q4.label}${q4.in_q4 ? " — flag stale-hero entering expensive impressions" : ""}

Per-ad scores are pre-computed above each ad's [INDEX:N] block. Use these numbers EXACTLY in the JSON output. Do NOT recompute, do NOT round, do NOT invent.
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
  const candidateK = Math.min(7, adsWithImages);
  const compactK = compactCount(totalUsable);

  const heroProductLine = heroProductTitle
    ? `\nHero product to feature in the mockup: "${heroProductTitle}" (sourced from their Shopify store — most recently active SKU).`
    : "";

  const userMessage = `Brand: ${payload.lead_company}
Brand slug: ${slug}
First name: ${payload.lead_first_name}
Voice (for replacement copy): ${payload.company_overview_summary}
Today's date: ${today}
Total ads scraped (use ALL for pattern analysis): ${totalUsable}
Ads with images available: ${adsWithImages}${heroProductLine}

${factsBlock}

ALL LIVE ADS (each ad is annotated with its pre-computed scores — quote those numbers verbatim in the JSON):
${adsText}

YOUR TASK
=========
1. DO NOT recompute fatigue scores or days_until_fatigue. Each ad's numbers are pre-computed in the [INDEX:N] block above; copy them verbatim into the JSON.
2. Pick the ${candidateK} most fatigued ads THAT HAVE IMAGES (IMG:yes), ranked by the pre-computed fatigue_score descending. Output as full ad cards in "ads", numbered 1..${candidateK} where 1 = most fatigued. Each MUST include a "source_index" field with the [INDEX:N] from above. (We'll display only the top 5 — extras serve as backups when image downloads fail.)
3. Pick ${compactK} additional representative ads (with or without images) from the remaining set. Output them in "ads_compact". For each, copy the pre-computed fatigue_score and days_until_fatigue verbatim. If ${compactK} is 0, return an empty array.
4. For "benchmark": set your_value_days to the account-level stale-hero threshold (${r.brand_size_threshold_days}). Set category_median_days to the brand-size-mid threshold (21). Set top_quartile_days to the brand-size-large threshold (14). Write the context line referencing the brand_size, the concept count, and (if applicable) the Andromeda call-out — do NOT invent CPM/CTR/ROAS numbers about THIS brand.
5. Write ONE hero replacement concept (the strongest creative direction you'd ship right now). fills_gap MUST reference the deterministic patterns above (e.g., "you're at ${r.S2_concept_count} concepts, below the Andromeda 5-concept floor"). DO NOT cite any number that doesn't appear in the FACTS block or per-ad annotations.
6. Generate an image_prompt for the hero mockup. Follow the IMAGE PROMPT TEMPLATE below strictly.

For each ad's "drivers" field: write 3 short bullets explaining WHY this ad's score landed where it did, citing the pre-computed numbers (e.g., "running ${r.brand_size_threshold_days}+ days past brand-size-${r.brand_size} threshold", "shares hook with N other ads in your set"). Do NOT invent counts — use group sizes implied by the per-ad sub-scores or rely on what you can VERIFY in the ad list above.

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
  "total_ads": ${totalUsable},
  "niche": "ONE plain-English noun the brand's customers would use to describe what they sell — lowercase, 1-3 words, used in a sentence as 'other ___ brands'. Examples: 'jewelry', 'streetwear', 'outerwear', 'luxury womenswear', 'modest fashion', 'sustainable fashion', 'skincare', 'home fragrance'. Avoid jargon ('DTC', 'D2C', 'ecom', 'fashion ecom') and avoid the brand's own name.",
  "tldr": "2-sentence executive summary citing the pre-computed account_fatigue_score (${r.account_fatigue_score}/100), the concept count (${r.S2_concept_count}), and ${q4.in_q4 ? "the Q4 timing" : "the cadence label"}. Do NOT invent CPM/CTR/ROAS figures about THIS brand.",
  "benchmark": {
    "your_value_days": ${r.brand_size_threshold_days},
    "category_median_days": 21,
    "top_quartile_days": 14,
    "context": "1-2 sentences. Reference the brand_size (${r.brand_size}), the concept count vs Andromeda floor, and — if applicable — Q4 inflation framing. Industry CPM context: per-niche band $${benchmark.cpm_low}–$${benchmark.cpm_high} (only mention if useful)."
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
      "drivers": ["driver 1", "driver 2", "driver 3"]
    }
  ],
  "ads_compact": [
    { "headline": "...", "body": "...", "fatigue_score": 58, "days_until_fatigue": 21 }
  ],
  "hero_concept": {
    "concept_name": "short descriptor",
    "format": "Static image / Carousel / etc",
    "hook": "≤10 words — appears as primary text above the ad image",
    "headline": "≤6 words — appears below the ad image as the headline",
    "primary_text": "60-90 words in brand voice, FORMATTED AS 2-3 SHORT PARAGRAPHS separated by literal \\n\\n. First paragraph hooks/opens, second develops, optional third closes with the offer. Example: 'When Lea started L.CUPPINI in London in 2019, the goal was simple: outerwear that doesn't expire.\\n\\nThe Linda Tux Blazer in beige is cut for the woman who's done chasing seasons — tailored shoulder, soft hand, weight that holds its shape after the tenth wear.\\n\\nFree express shipping worldwide on orders over £600.'",
    "cta": "Shop Now / Learn More / etc — short button label",
    "visual_direction": "1 sentence describing what the visual shows",
    "fills_gap": "What gap this fills, referencing patterns from their live ads — 1-2 sentences. NO mention of indexes, pools, or datasets.",
    "image_prompt": "the fully-filled image generation prompt using the template above with ALL FIVE slots filled in: {SCENE}, {LIGHTING}, {AESTHETIC}, {MATERIAL_LOCK}, {STRUCTURE_LOCK}. The MATERIAL_LOCK clause must name the reference product's exact material/metal/color/finish with explicit forbids on the wrong-tone swap. The STRUCTURE_LOCK clause must name every countable structural feature (button counts, pocket counts, closure type, silhouette, sleeve length, neckline, hardware, AND any printed graphics/text/logos on the garment) with explicit forbids on adding/removing/modifying them. Both clauses are MANDATORY — do not output an image_prompt missing either lock. Do NOT use words like graffiti, tagged, weapon, drug, alcohol, blood — Google's content filter rejects them."
  },
  "next_step": {
    "urgency": "short urgency line tied to ad death dates",
    "headline": "call CTA headline",
    "body": "2-sentence pitch for the call.",
    "calendly_url": "https://calendly.com/kyle-hamar/30min"
  },
  "prepared_by": "Prepared by Kyle Hamar — OmniRocket",
  "method_note": "1 sentence on methodology and limits.",
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
- If an ad has an empty headline or body, exactly ONE of its 3 drivers MUST conversationally call out the missing field and explain the impact ("No headline on this ad — the body is doing all the work...").

ABSOLUTELY FORBIDDEN — these reveal you are an AI processing structured data:
- NEVER reference [INDEX:N] numbers in any user-facing copy. Not in drivers. Not in tldr. Not in benchmark.context. Not in fills_gap. Not anywhere.
  ❌ "Body copy is duplicated verbatim across indexes 0, 1, 10, 13, 28"
  ❌ "duplicated on indexes 15 and 59"
  ❌ "INDEX 1, 2, and 5"
  ✅ "Body copy is duplicated verbatim across five of your live ads"
  ✅ "this same hook is recycled across roughly a dozen variants"
- NEVER use the words: index, indexes, the pool, the dataset, the data, source_index, ad_label.
- NEVER use the words: audit, review, analysis (use: walked through, looked at, went through, mapped).
- Refer to ads by what they ARE, not by number: "your camo coat ad", "the 'BOGO' headline variant", "the three Valentine's heart-pendant ads", "your founder-story video".
- The reader must believe a human strategist on Kyle's team manually went through their Meta Ad Library and wrote this. Every sentence should pass that test.

Output ONLY the JSON object. No markdown fences. No prose before or after.`;

  return userMessage;
}

function buildSystemPrompt(nicheKey: NicheKey): string {
  return `You are an ad creative strategist generating a Fatigue Forecast deliverable for OmniRocket (a Meta ads agency for ecommerce fashion brands). You identify the ads to scale and to kill, and write ONE hero replacement creative concept (with a mockup image prompt) in the brand's voice.

CRITICAL — DETERMINISM RULE:
The user message contains a "DETERMINISTIC FACTS" block and per-ad pre-computed scores (fatigue_score, days_until_fatigue, severity, days_running). These numbers are computed by deterministic code, not by you. Your job is to NARRATE them, not invent them. NEVER output a number that doesn't appear in the FACTS block or per-ad annotations. NEVER recompute. NEVER round.

TONE: peer operator. Specific, not generic. Quote actual ad copy verbatim from the live ads provided.
NEVER use the words 'audit', 'review', or 'analysis' — use 'walked through', 'looked at', 'went through', 'mapped'.
OUTPUT: a single valid JSON object only — starting with { and ending with }. No prose, no markdown fences, no explanation. Match the schema exactly as shown in the user message.

The following knowledge base is your source of truth for Meta ad policy, anti-patterns, and 2025–2026 platform reality. Apply it when writing findings, drivers, and the hero concept. Cite Andromeda by name when concept count is below floor.
${buildKbBlock(nicheKey)}`;
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in Claude response");
  return JSON.parse(raw.slice(start, end + 1));
}

type ForecastJson = {
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
};

// Diff Claude's per-ad numbers + benchmark.your_value_days against deterministic
// truth. Returns mismatch descriptions; does NOT mutate.
function findMismatches(json: ForecastJson, scoring: ScoringResult): string[] {
  const out: string[] = [];
  const scoreByIndex = new Map(scoring.perAd.map((s) => [s.ad_index, s]));
  for (const ad of json.ads ?? []) {
    if (typeof ad.source_index !== "number") continue;
    const truth = scoreByIndex.get(ad.source_index);
    if (!truth) continue;
    if (ad.fatigue_score !== truth.fatigue_score) {
      out.push(`ad ${ad.source_index} fatigue_score: claude=${ad.fatigue_score} truth=${truth.fatigue_score}`);
    }
    if (ad.days_until_fatigue !== truth.days_until_fatigue) {
      out.push(`ad ${ad.source_index} days_until_fatigue: claude=${ad.days_until_fatigue} truth=${truth.days_until_fatigue}`);
    }
    if (ad.severity !== truth.severity) {
      out.push(`ad ${ad.source_index} severity: claude=${ad.severity} truth=${truth.severity}`);
    }
  }
  if (json.benchmark) {
    const expected = scoring.rollup.brand_size_threshold_days;
    if (json.benchmark.your_value_days !== expected) {
      out.push(`benchmark.your_value_days: claude=${json.benchmark.your_value_days} truth=${expected}`);
    }
  }
  return out;
}

// Apply deterministic truth to the JSON in place. Last resort after retry.
function applyOverwrite(json: ForecastJson, scoring: ScoringResult): void {
  const scoreByIndex = new Map(scoring.perAd.map((s) => [s.ad_index, s]));
  for (const ad of json.ads ?? []) {
    if (typeof ad.source_index !== "number") continue;
    const truth = scoreByIndex.get(ad.source_index);
    if (!truth) continue;
    ad.fatigue_score = truth.fatigue_score;
    ad.days_until_fatigue = truth.days_until_fatigue;
    ad.severity = truth.severity;
  }
  if (json.benchmark) {
    json.benchmark.your_value_days = scoring.rollup.brand_size_threshold_days;
  }
}

async function callClaude(
  anthropic: Anthropic,
  system: string,
  user: string,
): Promise<ForecastJson> {
  const res = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    temperature: 0.3,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude returned no text content");
  return extractJson(block.text) as ForecastJson;
}

async function runClaudeWithValidation(
  anthropic: Anthropic,
  systemPrompt: string,
  userMessage: string,
  scoring: ScoringResult,
): Promise<{ forecastJson: ForecastJson; mismatchesAfterRetry: string[]; retried: boolean }> {
  const first = await callClaude(anthropic, systemPrompt, userMessage);
  const firstMismatches = findMismatches(first, scoring);
  if (firstMismatches.length === 0) {
    return { forecastJson: first, mismatchesAfterRetry: [], retried: false };
  }

  // Retry once with a corrective addendum. We DO NOT change the numbers in the
  // user message — Claude already has the truth, it just failed to copy it.
  const correction = `\n\nYOUR PREVIOUS OUTPUT HAD ${firstMismatches.length} NUMBER MISMATCHES against the deterministic FACTS block. Specifically:\n${firstMismatches
    .slice(0, 20)
    .map((m) => `  - ${m}`)
    .join("\n")}\n\nRegenerate the FULL JSON now. Copy the truth values verbatim into the JSON. Make sure the surrounding prose (drivers, tldr, fills_gap, benchmark.context) is consistent with the corrected numbers.`;
  const retried = await callClaude(anthropic, systemPrompt + correction, userMessage);
  const retriedMismatches = findMismatches(retried, scoring);
  if (retriedMismatches.length === 0) {
    return { forecastJson: retried, mismatchesAfterRetry: [], retried: true };
  }

  // Retry still wrong — overwrite the numbers and ship. Prose may drift from
  // the corrected values; the Slack alert flags this for human review.
  applyOverwrite(retried, scoring);
  return { forecastJson: retried, mismatchesAfterRetry: retriedMismatches, retried: true };
}

export async function POST(req: NextRequest) {
  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!payload.lead_company || !payload.normalized_company_name) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const slug = slugify(payload.normalized_company_name);
  const tag = `${payload.lead_company} (${payload.lead_email})`;

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

    // 2. Normalize and keep usable ads (must have body text)
    const normalized = apifyAds
      .map(normalizeAd)
      .filter((a) => a.body)
      .map((a, i) => ({ ...a, index: i }));

    if (normalized.length === 0) {
      await postSlack(`⚠️ *No usable ads* — ${tag} ad data missing body text. Manual review.`);
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

    // 3. Claude narrates the deterministic facts + writes ONE hero concept.
    // Validate output against scoring; on mismatch, retry ONCE with corrective
    // addendum so prose stays coherent with corrected numbers. Final fallback
    // is overwrite-and-ship with Slack alert.
    const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const userMessage = buildPrompt(
      payload,
      slug,
      normalized,
      heroProduct?.title ?? null,
      scoring,
      nicheKey,
    );
    const systemPrompt = buildSystemPrompt(nicheKey);

    const { forecastJson, mismatchesAfterRetry, retried } = await runClaudeWithValidation(
      anthropic,
      systemPrompt,
      userMessage,
      scoring,
    );

    if (retried) {
      const detail =
        mismatchesAfterRetry.length === 0
          ? "✅ retry produced clean numbers"
          : `❌ retry still had ${mismatchesAfterRetry.length} mismatches — overwritten and shipped`;
      await postSlack(
        `⚠️ *Number-validator triggered retry* for ${tag}\n${detail}` +
          (mismatchesAfterRetry.length > 0
            ? "\n```" + mismatchesAfterRetry.slice(0, 8).join("\n") + (mismatchesAfterRetry.length > 8 ? `\n…(+${mismatchesAfterRetry.length - 8} more)` : "") + "```"
            : ""),
      );
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

    // 6. PUT forecast JSON
    const forecastBase64 = Buffer.from(JSON.stringify(forecastJson, null, 2)).toString("base64");
    await githubPut(`forecasts/${slug}.json`, forecastBase64, `feat: forecast for ${slug}`);

    // 7. Wait for Vercel deploy
    await new Promise((r) => setTimeout(r, 10000));

    // 8. Slack ready
    const forecastUrl = `https://omnirocket-forecasts.vercel.app/forecast/${slug}`;
    await postSlack(
      `🟢 Fatigue Forecast ready: *${payload.lead_company}*\n📧 ${payload.lead_email}\n👤 ${payload.lead_first_name}\n🔗 ${forecastUrl}\n\nReply to the lead and paste this URL.`,
    );

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
