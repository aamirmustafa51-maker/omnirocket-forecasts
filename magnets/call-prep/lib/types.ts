// Canonical Call Prep Pack contract. Shared by the generator, the webhook route
// and the page template.
//
// This is the ONLY magnet that is not sent to the prospect. It's an internal
// brief that Kyle reads right before a booked call, so the rules are inverted
// from the outbound magnets: links are untracked, nothing is designed to
// persuade the reader, and every inferred number carries the assumption that
// produced it (Kyle has to defend these live, on a call, with no ad account to
// check them against).

import type { ThreadMessage } from "@/lib/shared/smartlead";
import type { MagnetKind } from "@/lib/shared/sheets";

// ── What Claude writes ──────────────────────────────────────────────────────

export type BrandDeepDive = {
  // Two or three sentences. What this brand is, in plain words.
  what_they_are: string;
  what_they_sell: string;
  // How they position against the rest of their category.
  positioning: string;
  // Who is actually buying, inferred from reviews + site copy.
  who_buys: string;
  // Verbatim customer quotes worth reading aloud on the call.
  customer_voice: string[];
  // Things that are working for them already. Kyle opens with these.
  strengths: string[];
  // Gaps we could plausibly fix. NOT a pitch, just observations.
  gaps: string[];
};

// A number Kyle might have to defend on the call. `basis` is what it was
// derived from, and it is rendered next to the number, never hidden.
export type Estimate = {
  label: string;
  value: string;
  basis: string;
};

export type PlanPhase = {
  // "Days 1-30", "Days 31-60", "Days 61-90"
  window: string;
  goal: string;
  campaigns: string[];
  // Which products we'd put spend behind first, and why those.
  lead_products: string[];
  creative: string;
  budget: string;
  what_success_looks_like: string;
};

export type GamePlan = {
  // 30 for Fatigue Forecast leads, 90 for Scroll-Stopper leads. Set by the
  // route from the magnet they actually received, not by Claude, so the plan
  // always matches the promise made in that magnet's CTA.
  horizon_days: 30 | 90;
  headline: string;
  phases: PlanPhase[];
  estimates: Estimate[];
  // The assumptions the whole plan rests on. If one is wrong the plan changes,
  // and Kyle should ask about it on the call.
  assumptions: string[];
};

export type DiscoveryQuestion = {
  question: string;
  // Why we're asking. Kyle reads this so he knows what he's listening for.
  listening_for: string;
};

export type DiscoverySection = {
  // "Qualify" | "Diagnose" | "Expand"
  name: string;
  questions: DiscoveryQuestion[];
};

export type Objection = {
  objection: string;
  answer: string;
};

// Anything in the data that says "be careful on this call".
export type RedFlag = {
  flag: string;
  why_it_matters: string;
};

// The interpretive half of the pack: everything Claude produces.
export type CallPrepCopy = {
  // The single most useful sentence Kyle could read 60 seconds before dialling.
  tldr: string;
  deep_dive: BrandDeepDive;
  game_plan: GamePlan;
  discovery: DiscoverySection[];
  objections: Objection[];
  red_flags: RedFlag[];
  // Openings for the services beyond Meta (Kyle also sells Google and SEO).
  // Empty when the public data gives us no honest reason to raise them.
  other_channel_openings: string[];
};

// ── What the route assembles ────────────────────────────────────────────────

// The magnet the lead actually received, with untracked links for Kyle.
export type MagnetLinks = {
  kind: MagnetKind;
  // Present for every magnet.
  report_url: string;
  report_label: string;
  // Scroll-Stopper leads also got the Brand Playbook, so they get two links.
  playbook_url?: string;
  playbook_label?: string;
  report_opens: number;
  playbook_opens: number;
  last_opened_at: string;
};

export type CallPrepData = {
  lead_first_name: string;
  lead_last_name: string;
  lead_email: string;
  lead_company: string;
  website: string;
  brand_domain: string;
  currency: string;
  prospect_logo_url?: string;

  smartlead_campaign: string;
  magnet: MagnetLinks;
  // The full back-and-forth, oldest first. Empty if Smartlead had nothing (the
  // pack still ships; the transcript section just says so).
  thread: ThreadMessage[];

  // Hard facts pulled from public sources, shown as-is. Kept separate from the
  // Claude-written sections so the reader can tell scraped fact from inference.
  facts: {
    product_count: number;
    price_low: number | null;
    price_high: number | null;
    // Catalog midpoint. A proxy for AOV, and labelled as such everywhere.
    typical_price: number | null;
    review_count: number;
    instagram_followers: number | null;
    // Ads we saw running on Meta. Empty for Scroll-Stopper leads by definition
    // (that segment was picked BECAUSE they aren't advertising).
    running_ads: number;
  };

  copy: CallPrepCopy;
  generated_at: string;
};
