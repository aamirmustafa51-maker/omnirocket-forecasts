// Deep (but bounded) website crawl for the Brand Playbook magnet. Pulls the
// pages that carry brand voice + positioning (homepage, about, FAQ, top product
// pages) and mines customer-review language from schema.org JSON-LD embedded in
// product pages. JSON-LD is the most reliable cross-widget review source: it
// works for Judge.me / Loox / Yotpo / Okendo when they inject it, with no
// per-widget API tokens. Everything soft-fails to empty so a partial scrape
// still yields a usable playbook.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const ABOUT_PATHS = ["/pages/about", "/pages/about-us", "/about", "/about-us", "/our-story", "/pages/our-story"];
const INFO_PATHS = ["/pages/faq", "/pages/faqs", "/pages/help", "/policies/shipping-policy", "/policies/refund-policy"];

const MAX_PAGE_CHARS = 6000;
const MAX_PRODUCT_PAGES = 5;
const MAX_REVIEWS = 40;
const MAX_REVIEW_CHARS = 320;

export type CrawledPage = { kind: string; url: string; text: string };
export type SiteCrawl = {
  pages: CrawledPage[];
  reviews: string[];
  review_count: number; // total count reported by aggregateRating, if any
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function originFromDomain(domain: string): string {
  const cleaned = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return `https://${cleaned}`;
}

async function fetchRaw(url: string, timeoutMs = 9000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

// Walk arbitrary JSON-LD looking for review bodies + an aggregate review count.
// Shapes vary wildly (single object, array, @graph, nested), so we recurse.
function harvestJsonLd(node: unknown, reviews: string[], counts: number[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) harvestJsonLd(item, reviews, counts);
    return;
  }
  const obj = node as Record<string, unknown>;

  const agg = obj.aggregateRating as Record<string, unknown> | undefined;
  if (agg) {
    const c = Number(agg.reviewCount ?? agg.ratingCount);
    if (Number.isFinite(c)) counts.push(c);
  }

  const collectReview = (r: Record<string, unknown>) => {
    const body =
      (typeof r.reviewBody === "string" && r.reviewBody) ||
      (typeof r.description === "string" && r.description) ||
      "";
    const clean = stripHtml(String(body)).slice(0, MAX_REVIEW_CHARS);
    if (clean.length > 20 && reviews.length < MAX_REVIEWS) reviews.push(clean);
  };

  const review = obj.review;
  if (Array.isArray(review)) review.forEach((r) => collectReview(r as Record<string, unknown>));
  else if (review && typeof review === "object") collectReview(review as Record<string, unknown>);

  for (const key of ["@graph", "itemListElement", "mainEntity"]) {
    if (obj[key]) harvestJsonLd(obj[key], reviews, counts);
  }
}

function extractReviews(html: string, reviews: string[], counts: number[]): void {
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of scripts) {
    const json = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      harvestJsonLd(JSON.parse(json), reviews, counts);
    } catch {
      // Malformed JSON-LD is common; skip it.
    }
  }
}

export async function crawlSite(domain: string, productUrls: string[]): Promise<SiteCrawl> {
  const origin = originFromDomain(domain);
  const pages: CrawledPage[] = [];
  const reviews: string[] = [];
  const counts: number[] = [];

  const homeRaw = await fetchRaw(origin);
  if (homeRaw) pages.push({ kind: "homepage", url: origin, text: stripHtml(homeRaw).slice(0, MAX_PAGE_CHARS) });

  for (const path of ABOUT_PATHS) {
    const raw = await fetchRaw(`${origin}${path}`);
    const text = stripHtml(raw);
    if (text.length > 200) {
      pages.push({ kind: "about", url: `${origin}${path}`, text: text.slice(0, MAX_PAGE_CHARS) });
      break;
    }
  }

  for (const path of INFO_PATHS) {
    const raw = await fetchRaw(`${origin}${path}`);
    const text = stripHtml(raw);
    if (text.length > 200) {
      pages.push({ kind: "info", url: `${origin}${path}`, text: text.slice(0, MAX_PAGE_CHARS) });
    }
    if (pages.filter((p) => p.kind === "info").length >= 2) break;
  }

  for (const url of productUrls.slice(0, MAX_PRODUCT_PAGES)) {
    const raw = await fetchRaw(url);
    if (!raw) continue;
    extractReviews(raw, reviews, counts);
    pages.push({ kind: "product", url, text: stripHtml(raw).slice(0, 2500) });
  }

  return { pages, reviews, review_count: counts.length ? Math.max(...counts) : reviews.length };
}
