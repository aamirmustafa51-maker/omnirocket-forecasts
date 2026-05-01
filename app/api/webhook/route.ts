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

function buildPrompt(payload: WebhookPayload, slug: string, top5: NormalizedAd[], rest: NormalizedAd[]) {
  const top5Text = top5
    .map(
      (a, i) =>
        `Ad: ${i + 1}\nHeadline: ${a.headline}\nBody: ${a.body}\nCTA: ${a.cta}\nLanding: ${a.landing_url}\nImage: /creatives/${slug}/creative-${i + 1}.jpg`,
    )
    .join("\n---\n");

  const restText = rest
    .map(
      (a, i) =>
        `Ad: ${i + 6}\nHeadline: ${a.headline}\nBody: ${a.body}\nCTA: ${a.cta}\nLanding: ${a.landing_url}`,
    )
    .join("\n---\n");

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const totalAds = top5.length + rest.length;

  const userMessage = `Brand: ${payload.lead_company}
Brand slug: ${slug}
First name: ${payload.lead_first_name}
Voice (for replacement copy): ${payload.company_overview_summary}
Today's date: ${today}
Total ads scraped: ${totalAds}

TOP 5 most-recent live ads (full detail — score these and include as full ad cards):
${top5Text}

REMAINING ads (text only — include as ads_compact):
${restText || "(none)"}

Score each TOP-5 ad 0-10 on 6 fatigue signals (10=severe fatigue):
FORMAT_REPETITION, HOOK_REPETITION, HEADLINE_PATTERN, CTA_REPETITION, LANDING_DESTINATION, LAUNCH_CLUSTER.
Sum and normalize to 0-100. Map to days_until_fatigue:
80-100 → 5-10d, 60-79 → 11-20d, 40-59 → 21-35d, <40 → 36+d.

Return a single valid JSON object matching this EXACT schema. Quote real headlines and body copy where possible.

{
  "brand": "${payload.lead_company}",
  "brand_slug": "${slug}",
  "first_name": "${payload.lead_first_name}",
  "website": "https://example.com",
  "generated_date": "${today}",
  "read_time_min": 4,
  "total_ads": ${totalAds},
  "tldr": "2-sentence executive summary mentioning fatigue counts and CPM impact timeframe.",
  "benchmark": {
    "your_value_days": 12,
    "category_median_days": 22,
    "top_quartile_days": 38,
    "context": "1-2 sentences comparing this brand to category averages."
  },
  "ads": [
    {
      "ad_number": 1,
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
  "ad_to_scale": { "ad_label": "Ad #1", "headline": "...", "body": "...", "why": "2-3 sentences." },
  "ad_to_kill": { "ad_label": "Ad #3", "headline": "...", "body": "...", "why": "2-3 sentences." },
  "concepts": [
    {
      "concept_name": "short descriptor",
      "format": "Video / Carousel / Static / UGC + length",
      "hook": "≤10 words",
      "angle": "strategic angle",
      "primary_text": "~60 words in brand voice",
      "visual_direction": "what the visual shows",
      "fills_gap": "what gap this fills"
    }
  ],
  "unlocks": ["3-4 short bullets describing what improves if user acts on this"],
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

Rules:
- "ads" = the TOP 5 ads with full detail. Number them sequentially 1-5 (use the "Ad: N" labels in the input). Order the array by fatigue_score descending.
- "ads_compact" = the remaining ads from the REMAINING section.
- "severity": danger if fatigue_score>=85, warn if 65-84, ok if <65.
- "ad_to_scale.ad_label" and "ad_to_kill.ad_label" must reference the ad_number field (e.g. "Ad #1").
- 3 distinct "concepts", each filling a different creative gap.
- "days_until_fatigue" must be an integer.
- All copy grounded in the actual live ads above.
- Output ONLY the JSON object. No markdown fences. No prose before or after.`;

  return userMessage;
}

const SYSTEM_PROMPT = `You are an ad creative strategist generating a Fatigue Forecast deliverable for OmniRocket (a Meta ads agency for ecommerce fashion brands). You score live Meta ads on creative fatigue signals, predict days-until-fatigue, identify the 1 ad to scale and the 1 to kill, and write 3 replacement creative concepts in the brand's voice. TONE: peer operator. Specific, not generic. Quote actual ad copy from the live ads provided. NEVER use the words 'audit', 'review', or 'analysis'. OUTPUT: a single valid JSON object only — starting with { and ending with }. No prose, no markdown fences, no explanation. Match the schema exactly as shown in the user message.`;

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

  try {
    // 1. Apify scrape
    const apifyAds = await apifyScrape(fbValue, isPageId);
    if (!apifyAds || apifyAds.length === 0) {
      await postSlack(`⚠️ *No ads found* — ${tag} has no live Meta ads. Skipping forecast.`);
      return NextResponse.json({ ok: true, status: "no_ads" });
    }

    // 2. Normalize
    const normalized = apifyAds.map(normalizeAd);

    // 3. Pick top 5 with images, rest text-only (next 15)
    const withImages = normalized.filter((a) => a.image_url && a.body);
    const top5 = withImages.slice(0, 5);
    const rest = normalized.filter((a) => !top5.includes(a)).slice(0, 15);

    if (top5.length === 0) {
      await postSlack(`⚠️ *No usable ads* — ${tag} ad data missing images/body. Manual review.`);
      return NextResponse.json({ ok: true, status: "no_usable_ads" });
    }

    // 4. Download + upload top 5 images sequentially as creative-1..N.jpg
    for (let i = 0; i < top5.length; i++) {
      const ad = top5[i];
      const n = i + 1;
      const b64 = await downloadImageBase64(ad.image_url!);
      await githubPut(
        `public/creatives/${slug}/creative-${n}.jpg`,
        b64,
        `chore: add creative-${n} for ${slug}`,
      );
    }

    // 5. Claude API
    const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const userMessage = buildPrompt(payload, slug, top5, rest);
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
    const forecastJson = extractJson(textBlock.text);

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
