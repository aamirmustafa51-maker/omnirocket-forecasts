// Shared Brand Playbook build-and-publish flow. Mirrors the exact steps in
// app/api/webhook/brand-playbook/route.ts (scrape catalog -> pick heroes ->
// crawl site -> buildPlaybook -> commit JSON) so other routes can bundle a
// playbook without duplicating the pipeline. The standalone Brand_Playbook
// route is intentionally left untouched; this is additive.
import Anthropic from "@anthropic-ai/sdk";
import { fetchShopifyCatalog } from "@/lib/shared/shopify-products";
import { crawlSite } from "@/lib/shared/site-crawl";
import { selectHeroProducts } from "@/magnets/scroll-stopper/lib/select";
import { buildPlaybook } from "@/magnets/brand-playbook/lib/generate";
import { putJson, brandDomainFromWebsite, githubGetSha, slugify } from "@/lib/shared/publish";

const BASE_URL = "https://omnirocket-forecasts.vercel.app";

// Build (or reuse) the standalone Brand Playbook for a brand and return its
// shareable URL. Idempotent at the slug level: if a playbook already exists
// (from this flow, the standalone Brand_Playbook route, or scroll-stopper) it
// reuses that file and returns the same link instead of regenerating.
// Throws on a real generation failure — callers should wrap in try/catch since
// this is meant to run best-effort after the primary magnet is delivered.
export async function generateAndPublishPlaybook(params: {
  anthropic: Anthropic;
  lead_company: string;
  lead_first_name: string;
  website_url: string;
}): Promise<string> {
  const { anthropic, lead_company, lead_first_name, website_url } = params;
  const slug = slugify(lead_company);
  const playbookShare = `${BASE_URL}/playbook/${slug}?ref=email&magnet=brand-playbook`;

  const existing = await githubGetSha(`outputs/playbook/${slug}.json`);
  if (existing) return playbookShare;

  const catalog = await fetchShopifyCatalog(website_url);
  const heroes = selectHeroProducts(catalog.products, catalog.homepage_html, 4);
  const crawl = await crawlSite(website_url, heroes.map((h) => h.url));

  const playbook = await buildPlaybook(
    anthropic,
    {
      lead_company,
      lead_first_name,
      website: website_url,
      brand_domain: brandDomainFromWebsite(website_url),
      standalone: true,
    },
    catalog,
    crawl,
  );

  await putJson(
    `outputs/playbook/${slug}.json`,
    playbook,
    `feat: brand-playbook (forecast-bundled) for ${slug}`,
  );
  return playbookShare;
}
