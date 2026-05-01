import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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

  return {
    index: idx,
    headline,
    body,
    cta,
    landing_url,
    image_url,
    ad_archive_id: ad.ad_archive_id ?? "",
    start_date: ad.start_date ?? null,
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

// Shopify exposes /products.json publicly on most stores. First product = most
// recently updated, which usually correlates with the brand's active push.
type ShopifyProduct = { title: string; image_url: string };
async function fetchShopifyHeroProduct(websiteUrl: string): Promise<ShopifyProduct | null> {
  try {
    const base = websiteUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/products.json?limit=1`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      products?: Array<{ title?: string; images?: Array<{ src?: string }> }>;
    };
    const p = data.products?.[0];
    const img = p?.images?.[0]?.src;
    if (!p?.title || !img) return null;
    return { title: p.title, image_url: img };
  } catch (e) {
    console.error("Shopify fetch failed:", e);
    return null;
  }
}

// KIE Nano Banana 2 (1K, 8 credits). Async task — submit, then poll.
async function kieGenerateMockup(prompt: string, referenceImageUrl: string): Promise<string | null> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    console.error("KIE_API_KEY not set — skipping mockup");
    return null;
  }
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
    if (!taskId) {
      console.error("KIE no taskId returned");
      return null;
    }

    // Poll up to 120s (test runs took ~40-60s)
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

function buildPrompt(
  payload: WebhookPayload,
  slug: string,
  allAds: NormalizedAd[],
  heroProductTitle: string | null,
) {
  const adsText = allAds
    .map(
      (a) =>
        `[INDEX:${a.index}] [IMG:${a.image_url ? "yes" : "no"}]\nHeadline: ${a.headline}\nBody: ${a.body}\nCTA: ${a.cta}\nLanding: ${a.landing_url}`,
    )
    .join("\n---\n");

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const adsWithImages = allAds.filter((a) => a.image_url).length;
  const totalUsable = allAds.length;
  const topK = Math.min(5, adsWithImages);
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

ALL LIVE ADS (analyze every one to detect patterns — duplicates, hook recycling, format gaps):
${adsText}

YOUR TASK
=========
1. Analyze ALL ${totalUsable} ads above for fatigue signals across the full pool.
2. Score each ad 0-10 on 6 fatigue signals (10=severe): FORMAT_REPETITION, HOOK_REPETITION, HEADLINE_PATTERN, CTA_REPETITION, LANDING_DESTINATION, LAUNCH_CLUSTER. Sum and normalize to 0-100. Map to days_until_fatigue: 80-100 → 5-10d, 60-79 → 11-20d, 40-59 → 21-35d, <40 → 36+d.
3. Pick the ${topK} most fatigued ads THAT HAVE IMAGES (IMG:yes). Output as full ad cards in "ads", numbered 1..${topK} where 1 = most fatigued. Each MUST include a "source_index" field with the [INDEX:N] from above.
4. Pick ${compactK} additional representative ads (with or without images) from the remaining pool. Output them in "ads_compact". If ${compactK} is 0, return an empty array.
5. Write ONE hero replacement concept (the strongest creative direction you'd ship for this brand right now). Its fills_gap should reference patterns observed across ALL ${totalUsable} ads.
6. Generate an image_prompt for the hero concept's mockup ad image. This will be passed to an image generation model (Nano Banana 2) along with a reference photo of the brand's hero product. Follow the prompt template strictly.

IMAGE PROMPT TEMPLATE (fill in the {SCENE}, {LIGHTING}, {AESTHETIC} slots based on the brand's existing creative style — observed from the ads above — and the concept's visual direction):

"A photorealistic editorial product photograph featuring the product from the reference image, styled in {SCENE}, with {LIGHTING}. {AESTHETIC}. Square 1:1 composition with breathing room top and bottom for ad text overlay. Maintain the exact appearance, color, and details of the product from the reference image. Premium commerce photography quality. NEGATIVE: no text, no logos, no watermarks, no UI elements, no Facebook interface, no buttons, no faces, no collage, no borders, no duplicate products."

Return a single valid JSON object matching this EXACT schema:

{
  "brand": "${payload.lead_company}",
  "brand_slug": "${slug}",
  "first_name": "${payload.lead_first_name}",
  "website": "https://example.com",
  "generated_date": "${today}",
  "read_time_min": 3,
  "total_ads": ${totalUsable},
  "tldr": "2-sentence executive summary mentioning fatigue counts and CPM impact timeframe.",
  "benchmark": {
    "your_value_days": 12,
    "category_median_days": 22,
    "top_quartile_days": 38,
    "context": "1-2 sentences comparing this brand to category averages, grounded in patterns from all ${totalUsable} ads."
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
    "primary_text": "~50 words in brand voice. This is the body copy that appears above the image in the mockup.",
    "cta": "Shop Now / Learn More / etc — short button label",
    "visual_direction": "1 sentence describing what the visual shows",
    "fills_gap": "What gap this fills, referencing patterns from the full ad pool — 1-2 sentences.",
    "image_prompt": "the fully-filled image generation prompt using the template above with {SCENE}, {LIGHTING}, {AESTHETIC} slots filled in based on the brand's aesthetic"
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
- "ads" length must equal exactly ${topK}. Each entry MUST have source_index pointing to one of the [INDEX:N] values where IMG was "yes". No duplicates.
- ad_number values in "ads" are sequential 1..${topK} where 1 = most fatigued.
- "ads_compact" length must equal exactly ${compactK} (the rest of the pool — used for analysis context only, not rendered).
- "severity": danger if fatigue_score>=85, warn if 65-84, ok if <65.
- "days_until_fatigue" must be an integer.
- Exactly ONE hero_concept (not multiple).
- hero_concept.image_prompt MUST follow the template structure exactly with the negative section preserved verbatim.
- All copy grounded in the actual live ads above.
- If an ad has an empty headline or body, exactly ONE of its 3 drivers MUST conversationally call out the missing field and explain the impact.
- Output ONLY the JSON object. No markdown fences. No prose before or after.`;

  return userMessage;
}

const SYSTEM_PROMPT = `You are an ad creative strategist generating a Fatigue Forecast deliverable for OmniRocket (a Meta ads agency for ecommerce fashion brands). You score live Meta ads on creative fatigue signals, predict days-until-fatigue, identify the 1 ad to scale and the 1 to kill, and write ONE hero replacement creative concept (with a mockup image prompt) in the brand's voice. TONE: peer operator. Specific, not generic. Quote actual ad copy from the live ads provided. NEVER use the words 'audit', 'review', or 'analysis'. OUTPUT: a single valid JSON object only — starting with { and ending with }. No prose, no markdown fences, no explanation. Match the schema exactly as shown in the user message.`;

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in Claude response");
  return JSON.parse(raw.slice(start, end + 1));
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
      websiteUrl ? fetchShopifyHeroProduct(websiteUrl) : Promise.resolve(null),
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

    // 3. Claude analyzes ALL ads, picks top K + writes ONE hero concept with image_prompt
    const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const userMessage = buildPrompt(payload, slug, normalized, heroProduct?.title ?? null);
    const claudeRes = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = claudeRes.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text content");
    }
    const forecastJson = extractJson(textBlock.text) as {
      ads: Array<{ ad_number: number; source_index?: number }>;
      hero_concept?: { image_prompt?: string; image_path?: string | null };
    };

    // 4. Upload top-ad images
    const indexById = new Map(normalized.map((a) => [a.index, a]));
    for (const ad of forecastJson.ads) {
      if (typeof ad.source_index !== "number") continue;
      const src = indexById.get(ad.source_index);
      if (!src || !src.image_url) continue;
      try {
        const b64 = await downloadImageBase64(src.image_url);
        await githubPut(
          `public/creatives/${slug}/creative-${ad.ad_number}.jpg`,
          b64,
          `chore: add creative-${ad.ad_number} for ${slug}`,
        );
      } catch (e) {
        console.error(
          `Image upload failed for creative-${ad.ad_number} (source_index=${ad.source_index}):`,
          e,
        );
      }
    }

    // 5. Generate hero mockup ad image (skip-and-revert: any failure → null path)
    if (
      forecastJson.hero_concept &&
      heroProduct &&
      forecastJson.hero_concept.image_prompt
    ) {
      const mockupUrl = await kieGenerateMockup(
        forecastJson.hero_concept.image_prompt,
        heroProduct.image_url,
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
          forecastJson.hero_concept.image_path = null;
        }
      } else {
        forecastJson.hero_concept.image_path = null;
      }
    } else if (forecastJson.hero_concept) {
      forecastJson.hero_concept.image_path = null;
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
