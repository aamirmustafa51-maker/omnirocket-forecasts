// Call Prep Pack generator.
//
// Splits cleanly in two, on purpose:
//   - Facts are computed HERE, in code, from scraped data (prices, counts).
//   - Interpretation is Claude's (deep dive, plan, discovery, objections).
//
// The split exists because Kyle defends these numbers live on a call. A price
// range computed from the real catalog is checkable. A price range a model
// remembered is not.

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { ShopifyCatalog } from "@/lib/shared/shopify-products";
import type { SiteCrawl } from "@/lib/shared/site-crawl";
import type { PlaybookData } from "@/magnets/brand-playbook/lib/types";
import type { ThreadMessage } from "@/lib/shared/smartlead";
import { cleanCopy, extractJson } from "@/lib/shared/publish";
import type { CallPrepCopy, CallPrepData, MagnetLinks } from "./types";

// An ad we already scraped for this brand, carried over from their Fatigue
// Forecast. Scroll-Stopper leads have none (that segment is non-advertisers).
export type KnownAd = {
  headline: string;
  body: string;
  cta: string;
};

export type CallPrepEvidence = {
  catalog: ShopifyCatalog | null;
  crawl: SiteCrawl | null;
  ads: KnownAd[];
  playbook: PlaybookData | null;
  thread: ThreadMessage[];
  instagram_followers: number | null;
};

export type CallPrepMeta = {
  lead_first_name: string;
  lead_last_name: string;
  lead_email: string;
  lead_company: string;
  website: string;
  brand_domain: string;
  smartlead_campaign: string;
  magnet: MagnetLinks;
  prospect_logo_url?: string;
};

function readPrompt(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "magnets/call-prep/prompts", "call-prep.md"),
    "utf8",
  );
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Deterministic facts ─────────────────────────────────────────────────────

// The catalog midpoint, used everywhere as a stand-in for average order value.
// It is a MEDIAN, not a mean: one $900 bundle in a catalog of $40 tees would
// drag a mean up and quietly inflate every revenue estimate downstream.
function priceFacts(catalog: ShopifyCatalog | null): {
  product_count: number;
  price_low: number | null;
  price_high: number | null;
  typical_price: number | null;
} {
  const prices = (catalog?.products ?? [])
    .map((p) => p.price)
    .filter((p): p is number => typeof p === "number" && p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return {
      product_count: catalog?.products.length ?? 0,
      price_low: null,
      price_high: null,
      typical_price: null,
    };
  }

  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

  return {
    product_count: catalog?.products.length ?? 0,
    price_low: prices[0],
    price_high: prices[prices.length - 1],
    typical_price: Math.round(median * 100) / 100,
  };
}

// ── Evidence blocks for the prompt ──────────────────────────────────────────

function catalogBlock(catalog: ShopifyCatalog | null, currency: string): string {
  if (!catalog || catalog.products.length === 0) {
    return "(No scrapable catalog. Either not a Shopify store, or the product feed is closed. Do not guess at their products or prices.)";
  }
  const facts = priceFacts(catalog);
  const lines = catalog.products.slice(0, 25).map((p) => {
    const price = p.price !== null ? `${currency} ${p.price}` : "price unknown";
    const sale = p.on_sale ? ` (on sale, was ${p.compare_at_price})` : "";
    return `- ${p.title} | ${price}${sale} | ${stripTags(p.body_html).slice(0, 180)}`;
  });
  return [
    `${facts.product_count} products. Prices run ${currency} ${facts.price_low} to ${currency} ${facts.price_high}. Median price is ${currency} ${facts.typical_price} - use this as the stand-in for their average order value, and say that is what you did.`,
    "",
    ...lines,
  ].join("\n");
}

function siteBlock(crawl: SiteCrawl | null): string {
  if (!crawl || crawl.pages.length === 0) return "(Site could not be crawled.)";
  return crawl.pages
    .map((p) => `--- ${p.kind} (${p.url}) ---\n${p.text.slice(0, 2500)}`)
    .join("\n\n");
}

function reviewsBlock(crawl: SiteCrawl | null): string {
  if (!crawl || crawl.reviews.length === 0) {
    return "(No reviews found on the site. This is itself worth noting - a brand with no visible social proof is harder to run ads for, and that belongs in red_flags.)";
  }
  const total = crawl.review_count
    ? `${crawl.review_count} reviews reported on the site.`
    : `${crawl.reviews.length} reviews found.`;
  return [total, "", ...crawl.reviews.slice(0, 30).map((r) => `- "${r}"`)].join("\n");
}

function adsBlock(ads: KnownAd[]): string {
  if (ads.length === 0) {
    return "(No Meta ads found running. Either they don't advertise, or they stopped. Treat this as a fact about them, and shape the plan around starting from zero rather than fixing something.)";
  }
  return [
    `${ads.length} ads seen running on Meta:`,
    "",
    ...ads.slice(0, 12).map((a, i) => `${i + 1}. ${a.headline}\n   ${a.body.slice(0, 240)}\n   CTA: ${a.cta}`),
  ].join("\n");
}

function playbookBlock(pb: PlaybookData | null): string {
  if (!pb) return "(No playbook was built for this lead.)";
  return [
    `Category: ${pb.brand_dna.category}`,
    `What they believe: ${pb.brand_dna.core_belief}`,
    `Positioning: ${pb.brand_dna.positioning}`,
    `Who they sell to: ${pb.icp}`,
    `Voice: ${pb.voice_pillars.map((v) => v.name).join(", ")}`,
    `Words their customers use: ${pb.customer_language.phrases.slice(0, 8).join(" / ")}`,
    `Offers they run: ${pb.offers.join(" / ") || "(none seen)"}`,
    `Claims we must NOT make: ${pb.claims.banned.map((c) => c.claim).join(" / ") || "(none)"}`,
  ].join("\n");
}

// The transcript, as Claude sees it. Kyle sees the real thing rendered on the
// page; this is only so the plan and the discovery questions can pick up on
// what the lead already told us. Nothing is more embarrassing on a call than
// asking a question they answered in email three days ago.
function threadBlock(thread: ThreadMessage[]): string {
  if (thread.length === 0) {
    return "(No email thread available. Do not refer to anything they supposedly said.)";
  }
  return thread
    .map((m) => {
      const who = m.direction === "reply" ? `THEM (${m.from})` : `US (Kyle)`;
      const when = m.sent_at ? new Date(m.sent_at).toISOString().slice(0, 10) : "date unknown";
      return `[${when}] ${who}: ${m.subject}\n${m.body_text.slice(0, 1200)}`;
    })
    .join("\n\n");
}

// A 90 day plan is three phases; a 30 day plan is one. Spelling that out beats
// letting the model decide how to chunk it, which produced a 90 day plan with
// one giant phase on the first run.
function horizonGuidance(days: 30 | 90): string {
  if (days === 90) {
    return [
      "Three phases: Days 1-30, Days 31-60, Days 61-90.",
      "",
      "This lead received the Scroll-Stopper, and its call to action promised them a 90 day game plan to turn those ads into revenue. So the plan must start FROM the ads in that sheet: name them, and say which one goes live first and why.",
      "",
      "Phase 1 proves something can work at all. Phase 2 puts more money behind whatever won and widens the audience. Phase 3 scales it and adds a second product. Do not promise scale in month one.",
    ].join("\n");
  }
  return [
    "One phase: Days 1-30.",
    "",
    "This lead received the Fatigue Forecast, and its call to action promised them three customer avatars at their price point, the reason each one buys, and a 30 day plan for creative and spend. So your plan must deliver exactly that: name the three avatars, say what makes each one buy, and lay out what we would run and what we would spend across the 30 days.",
    "",
    "Keep it to what can genuinely be learned in 30 days. That is finding out which angle and which audience works, not scaling.",
  ].join("\n");
}

// ── The generator ───────────────────────────────────────────────────────────

// Recursively strip em/en dashes from every string Claude returned. The page is
// read by Kyle, but he quotes it on the call and pastes from it into email, so
// the house no-em-dash rule has to hold here too.
function sanitize<T>(node: T): T {
  if (typeof node === "string") return cleanCopy(node) as unknown as T;
  if (Array.isArray(node)) return node.map(sanitize) as unknown as T;
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = sanitize(v);
    return out as T;
  }
  return node;
}

const MAGNET_NAMES: Record<string, string> = {
  forecast: "Fatigue Forecast (their ads are wearing out)",
  "scroll-stopper": "Scroll-Stopper Sheet (3 ads we wrote for them) + Brand Playbook",
  "brand-playbook": "Brand Playbook",
};

export async function buildCallPrep(
  anthropic: Anthropic,
  meta: CallPrepMeta,
  evidence: CallPrepEvidence,
): Promise<CallPrepData> {
  const currency = evidence.catalog?.currency || "USD";
  const facts = priceFacts(evidence.catalog);

  // The horizon is decided by which magnet they received, NOT by Claude. Each
  // magnet's call to action promised a specific plan length, and the pack has to
  // honour the exact promise that got them on the call.
  const horizonDays: 30 | 90 = meta.magnet.kind === "scroll-stopper" ? 90 : 30;

  const prompt = fillTemplate(readPrompt(), {
    brand: meta.lead_company,
    website: meta.website,
    first_name: meta.lead_first_name,
    email: meta.lead_email,
    magnet_name: MAGNET_NAMES[meta.magnet.kind] ?? meta.magnet.kind,
    horizon_days: String(horizonDays),
    horizon_guidance: horizonGuidance(horizonDays),
    catalog_block: catalogBlock(evidence.catalog, currency),
    site_block: siteBlock(evidence.crawl),
    reviews_block: reviewsBlock(evidence.crawl),
    ads_block: adsBlock(evidence.ads),
    playbook_block: playbookBlock(evidence.playbook),
    thread_block: threadBlock(evidence.thread),
  });

  // MUST be streamed. The pack is the longest artifact we generate (a deep dive,
  // a three phase plan, three discovery sections, objections and red flags), and
  // at this token ceiling the SDK refuses a non-streaming request outright:
  // "Streaming is required for operations that may take longer than 10 minutes."
  // The other magnet routes get away with .create() only because they ask for
  // less. Do not "simplify" this back to .create().
  const res = await anthropic.messages
    .stream({
      model: "claude-opus-4-8",
      max_tokens: 24000,
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();

  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude returned no text");
  if (res.stop_reason === "max_tokens") {
    throw new Error(
      "Claude hit the 24000-token cap and returned truncated JSON. Raise max_tokens in buildCallPrep.",
    );
  }

  const parsed = sanitize(extractJson(block.text) as CallPrepCopy);

  return {
    lead_first_name: meta.lead_first_name,
    lead_last_name: meta.lead_last_name,
    lead_email: meta.lead_email,
    lead_company: meta.lead_company,
    website: meta.website,
    brand_domain: meta.brand_domain,
    currency,
    prospect_logo_url: meta.prospect_logo_url,
    smartlead_campaign: meta.smartlead_campaign,
    magnet: meta.magnet,
    thread: evidence.thread,
    facts: {
      ...facts,
      review_count: evidence.crawl?.review_count || evidence.crawl?.reviews.length || 0,
      instagram_followers: evidence.instagram_followers,
      running_ads: evidence.ads.length,
    },
    copy: {
      ...parsed,
      // horizon_days is ours, not Claude's. If it echoed the wrong number back
      // the page would contradict the plan it is rendering.
      game_plan: { ...parsed.game_plan, horizon_days: horizonDays },
    },
    generated_at: new Date().toISOString(),
  };
}
