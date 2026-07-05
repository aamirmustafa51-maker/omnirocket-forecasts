// Public Shopify catalog scraper for the Scroll-Stopper Sheet magnet. Every
// Shopify store exposes `/products.json` (paginated, no auth) with title,
// handle, body_html, variants (price + compare_at_price) and image srcs on the
// cdn.shopify.com domain. That's everything we need to build real ad mockups
// from a brand's actual products — no image generation, no login.
//
// We also grab the raw homepage HTML (tags intact) so the selector can tell
// which products the brand features on their storefront (a hero/bestseller
// signal). Non-Shopify stores 404 or return HTML here; callers treat an empty
// product list as "no scrapable catalog" and bail gracefully.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  product_type: string;
  tags: string[];
  price: number | null;
  compare_at_price: number | null;
  on_sale: boolean;
  image_url: string | null;
  image_count: number;
  url: string;
};

export type ShopifyCatalog = {
  products: ShopifyProduct[];
  homepage_html: string;
  currency: string;
  origin: string;
};

// Shape of the relevant slice of Shopify's /products.json response.
type RawVariant = { price?: string; compare_at_price?: string | null };
type RawImage = { src?: string };
type RawProduct = {
  id?: number;
  title?: string;
  handle?: string;
  body_html?: string;
  product_type?: string;
  tags?: string[] | string;
  variants?: RawVariant[];
  images?: RawImage[];
};

function originFromDomain(domain: string): string {
  const cleaned = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return `https://${cleaned}`;
}

async function fetchText(url: string, accept: string, timeoutMs = 10000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function toNumber(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTags(tags: string[] | string | undefined): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string") return tags.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

// Gift cards, samples and warranty/donation SKUs are never good ad heroes.
const JUNK_TITLE = /gift\s*card|sample|donation|warranty|protection plan|test product/i;

function normalizeProduct(raw: RawProduct, origin: string): ShopifyProduct | null {
  if (!raw?.handle || !raw?.title) return null;
  if (JUNK_TITLE.test(raw.title)) return null;

  const firstVariant = raw.variants?.[0] ?? {};
  const price = toNumber(firstVariant.price);
  const compare = toNumber(firstVariant.compare_at_price ?? null);
  const images = raw.images ?? [];
  const image_url = images[0]?.src ?? null;

  return {
    id: raw.id ?? 0,
    title: raw.title,
    handle: raw.handle,
    body_html: raw.body_html ?? "",
    product_type: raw.product_type ?? "",
    tags: normalizeTags(raw.tags),
    price,
    compare_at_price: compare,
    on_sale: price !== null && compare !== null && compare > price,
    image_url,
    image_count: images.length,
    url: `${origin}/products/${raw.handle}`,
  };
}

// products.json returns currency only indirectly; sniff it from the homepage
// (Shopify injects `Shopify.currency = {"active":"USD",...}`). Defaults to USD.
function detectCurrency(homepageHtml: string): string {
  const m =
    homepageHtml.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/) ||
    homepageHtml.match(/"currency"\s*:\s*"([A-Z]{3})"/);
  return m ? m[1] : "USD";
}

const PER_PAGE = 250;
const MAX_PAGES = 2; // 500 products is plenty to find heroes

export async function fetchShopifyCatalog(domain: string): Promise<ShopifyCatalog> {
  const origin = originFromDomain(domain);

  const [homepage_html, ...pages] = await Promise.all([
    fetchText(origin, "text/html"),
    ...Array.from({ length: MAX_PAGES }, (_, i) =>
      fetchText(`${origin}/products.json?limit=${PER_PAGE}&page=${i + 1}`, "application/json"),
    ),
  ]);

  const products: ShopifyProduct[] = [];
  for (const body of pages) {
    if (!body) continue;
    try {
      const json = JSON.parse(body) as { products?: RawProduct[] };
      for (const raw of json.products ?? []) {
        const p = normalizeProduct(raw, origin);
        if (p) products.push(p);
      }
    } catch {
      // Non-JSON (store blocks the endpoint or isn't Shopify) — skip the page.
    }
  }

  return { products, homepage_html, currency: detectCurrency(homepage_html), origin };
}
