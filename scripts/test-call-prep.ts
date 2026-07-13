// Local smoke test for the Call Prep Pack generator.
//
// Runs the REAL generator (prompt, Claude call, JSON parse, sanitizer, horizon
// logic) against fixture brand data. The scrapers are not exercised here - they
// need network access to a live storefront, and they are already prod-proven by
// the other magnets. What this checks is the part that is new:
//
//   - does the prompt produce a usable, defensible pack
//   - does every estimate carry a basis
//   - does the horizon follow the MAGNET (30 for forecast, 90 for scroll-stopper)
//   - does the em-dash sanitizer hold
//
//   npx tsx scripts/test-call-prep.ts forecast
//   npx tsx scripts/test-call-prep.ts scroll-stopper
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { buildCallPrep, type KnownAd } from "../magnets/call-prep/lib/generate";
import type { MagnetLinks } from "../magnets/call-prep/lib/types";
import type { ThreadMessage } from "../lib/shared/smartlead";
import type { ShopifyCatalog } from "../lib/shared/shopify-products";
import type { SiteCrawl } from "../lib/shared/site-crawl";
import type { PlaybookData } from "../magnets/brand-playbook/lib/types";

const envPath = path.join(process.cwd(), "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const BASE = "https://omnirocket-forecasts.vercel.app";

function product(title: string, price: number, body: string) {
  return {
    id: Math.abs(title.split("").reduce((a, c) => a + c.charCodeAt(0), 0)),
    title,
    handle: title.toLowerCase().replace(/\W+/g, "-"),
    body_html: `<p>${body}</p>`,
    product_type: "Shoes",
    tags: [] as string[],
    price,
    compare_at_price: null,
    on_sale: false,
    image_url: null,
    image_urls: [] as string[],
    image_count: 0,
    url: `https://www.allbirds.com/products/${title.toLowerCase().replace(/\W+/g, "-")}`,
  };
}

const CATALOG: ShopifyCatalog = {
  currency: "USD",
  origin: "https://www.allbirds.com",
  homepage_html: "<html></html>",
  products: [
    product("Women's Tree Runner NZ", 100, "Breathable eucalyptus fibre sneaker for warm days."),
    product("Men's Wool Runner", 110, "Merino wool sneaker, soft and temperature regulating."),
    product("Dasher NZ", 140, "A running shoe made from natural materials."),
    product("Men's Varsity", 120, "The everyday sneaker, refreshed."),
    product("Tree Breezer", 105, "A flat that breathes. Made with tree fibre."),
    product("Wool Loungers", 98, "Slip on comfort in merino wool."),
    product("Trail Runner SWT", 145, "Built for the trail, made from nature."),
    product("Anytime No Show Socks", 18, "Three pack of soft everyday socks."),
  ],
};

const CRAWL: SiteCrawl = {
  review_count: 1240,
  reviews: [
    "I have flat feet and these are the only shoes I can wear all day without pain.",
    "Bought them for travel and ended up wearing them every single day.",
    "They breathe. My feet do not sweat in these even in summer.",
    "Machine washable which is the reason I bought a second pair.",
    "Comfortable but they wear out faster than I expected for the price.",
    "The wool ones are so soft I stopped wearing socks entirely.",
  ],
  pages: [
    {
      kind: "homepage",
      url: "https://www.allbirds.com",
      text: "Allbirds. Natural materials, made better. Shoes made from merino wool and eucalyptus tree fibre. Carbon footprint printed on every product. Free shipping and 30 day wear test.",
    },
    {
      kind: "about",
      url: "https://www.allbirds.com/pages/our-story",
      text: "We make shoes from natural materials because the planet needs it. A New Zealand sheep farmer and a clean tech engineer started Allbirds to prove comfort and sustainability can live together. B Corp certified.",
    },
  ],
};

const THREAD: ThreadMessage[] = [
  {
    direction: "sent",
    from: "kyle@omnirocket.co",
    to: "founder@allbirds.com",
    subject: "your ads are wearing out",
    body_text:
      "Hi - I pulled your live Meta ads and scored how worn out each one is, then put it in a short report. No charge. Want the link?",
    sent_at: "2026-07-01T09:00:00Z",
  },
  {
    direction: "reply",
    from: "founder@allbirds.com",
    to: "kyle@omnirocket.co",
    subject: "Re: your ads are wearing out",
    body_text:
      "Go on then. We run everything in house right now, one person part time. Creative is honestly our bottleneck, we shot the current batch back in spring and haven't refreshed since.",
    sent_at: "2026-07-02T14:12:00Z",
  },
  {
    direction: "sent",
    from: "kyle@omnirocket.co",
    to: "founder@allbirds.com",
    subject: "Re: your ads are wearing out",
    body_text:
      "Here you go. The bottom of the report has a 30 day creative and spend plan if you want to talk it through.",
    sent_at: "2026-07-02T15:40:00Z",
  },
];

const ADS: KnownAd[] = [
  {
    headline: "Shoes made from trees",
    body: "The Tree Runner. Breathable, lightweight, machine washable. Free shipping both ways.",
    cta: "Shop Now",
  },
  {
    headline: "Your feet will thank you",
    body: "Merino wool sneakers that regulate temperature. No socks needed.",
    cta: "Shop Now",
  },
  {
    headline: "The world's most comfortable shoe",
    body: "30 day wear test. If you don't love them, send them back.",
    cta: "Learn More",
  },
];

async function main() {
  const mode = (process.argv[2] || "forecast") as "forecast" | "scroll-stopper";
  const slug = `calltest-${mode}`;

  const playbook = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "outputs", "playbook", "allbirds-demo.json"), "utf8"),
  ) as PlaybookData;

  const magnet: MagnetLinks =
    mode === "scroll-stopper"
      ? {
          kind: "scroll-stopper",
          report_url: `${BASE}/scroll-stopper/${slug}`,
          report_label: "Scroll-Stopper Sheet (the 3 ads we wrote them)",
          playbook_url: `${BASE}/playbook/${slug}`,
          playbook_label: "Brand Playbook (their voice, customers, claims)",
          report_opens: 6,
          playbook_opens: 2,
          last_opened_at: "2026-07-10T10:00:00Z",
        }
      : {
          kind: "forecast",
          report_url: `${BASE}/forecast/${slug}`,
          report_label: "Fatigue Forecast (their ads wearing out)",
          report_opens: 4,
          playbook_opens: 0,
          last_opened_at: "2026-07-08T10:00:00Z",
        };

  // Scroll-Stopper leads are non-advertisers by definition, so they have no ads.
  const ads = mode === "scroll-stopper" ? [] : ADS;

  console.log(`\n>>> mode=${mode}  (expecting a ${mode === "scroll-stopper" ? 90 : 30} day plan)\n`);
  console.log("generating with Claude…\n");

  const pack = await buildCallPrep(
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
    {
      lead_first_name: "Joey",
      lead_last_name: "Zwillinger",
      lead_email: "founder@allbirds.com",
      lead_company: "Allbirds",
      website: "https://www.allbirds.com",
      brand_domain: "allbirds.com",
      smartlead_campaign: "OR #6 | Forecast Lead Magnet",
      magnet,
    },
    { catalog: CATALOG, crawl: CRAWL, ads, playbook, thread: THREAD, instagram_followers: 412000 },
  );

  const outDir = path.join(process.cwd(), "outputs", "call-prep");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(pack, null, 2));

  // ── Assertions ────────────────────────────────────────────────────────────
  const fail: string[] = [];
  const gp = pack.copy.game_plan;

  const wantHorizon = mode === "scroll-stopper" ? 90 : 30;
  if (gp.horizon_days !== wantHorizon) fail.push(`horizon is ${gp.horizon_days}, expected ${wantHorizon}`);

  const wantPhases = mode === "scroll-stopper" ? 3 : 1;
  if (gp.phases.length !== wantPhases) fail.push(`${gp.phases.length} phases, expected ${wantPhases}`);

  if (gp.estimates.length === 0) fail.push("no estimates produced");
  for (const e of gp.estimates) {
    if (!e.basis?.trim()) fail.push(`estimate "${e.label}" has no basis - Kyle cannot defend it`);
  }

  // Median of 8 prices (18,98,100,105,110,120,140,145) = (105+110)/2 = 107.5
  if (pack.facts.typical_price !== 107.5) fail.push(`typical_price ${pack.facts.typical_price}, expected 107.5 (median)`);
  if (pack.facts.running_ads !== ads.length) fail.push(`running_ads ${pack.facts.running_ads}, expected ${ads.length}`);

  const blob = JSON.stringify(pack.copy);
  if (/[—–]/.test(blob)) fail.push("em/en dash survived the sanitizer");

  // Customer quotes must be REAL, copied from the reviews we supplied.
  for (const q of pack.copy.deep_dive.customer_voice) {
    const real = CRAWL.reviews.some((r) => r.includes(q.slice(0, 30)) || q.includes(r.slice(0, 30)));
    if (!real) fail.push(`invented customer quote: "${q.slice(0, 60)}"`);
  }

  const sections = pack.copy.discovery.map((d) => d.name.toLowerCase());
  for (const want of ["qualify", "diagnose", "expand"]) {
    if (!sections.some((s) => s.includes(want))) fail.push(`missing discovery section: ${want}`);
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log("=== TLDR ===\n" + pack.copy.tldr);
  console.log("\n=== PLAN (" + gp.horizon_days + " days) ===\n" + gp.headline);
  for (const p of gp.phases) console.log(`\n  [${p.window}] ${p.goal}\n    budget: ${p.budget}\n    lead with: ${p.lead_products.join("; ")}`);
  console.log("\n=== ESTIMATES ===");
  for (const e of gp.estimates) console.log(`  ${e.label}: ${e.value}\n    ^ basis: ${e.basis}`);
  console.log("\n=== DISCOVERY (first of each) ===");
  for (const d of pack.copy.discovery) console.log(`  [${d.name}] ${d.questions[0]?.question}\n     listen for: ${d.questions[0]?.listening_for}`);
  console.log("\n=== RED FLAGS ===");
  for (const r of pack.copy.red_flags) console.log(`  ${r.flag}: ${r.why_it_matters}`);
  console.log("\n=== OTHER CHANNELS ===\n  " + (pack.copy.other_channel_openings.join("\n  ") || "(none)"));

  console.log("\n" + "=".repeat(60));
  if (fail.length) {
    console.log("FAILED:\n" + fail.map((f) => "  ✗ " + f).join("\n"));
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
  console.log(`wrote outputs/call-prep/${slug}.json`);
  console.log(`view: npm run dev → http://localhost:3000/call-prep/${slug}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
