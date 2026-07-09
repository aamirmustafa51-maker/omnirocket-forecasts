// Fetch the EXACT products an operator hand-picked, by their storefront URLs.
// This is the human-in-the-loop path for the scroll-stopper magnet: instead of
// auto-selecting heroes from /products.json (which fails on wholesale or
// thin catalogs), Kyle pastes 2-3 product links and we build the ads from
// exactly those. Every Shopify product page also serves /products/{handle}.json.
import { ShopifyProduct, normalizeProduct } from "@/lib/shared/shopify-products";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

type Parsed = { origin: string; handle: string };

function parseProductUrl(u: string): Parsed | null {
  try {
    const url = new URL(u.trim());
    const m = url.pathname.match(/\/products\/([^/?#]+)/);
    if (!m) return null;
    return { origin: `${url.protocol}//${url.host}`, handle: m[1] };
  } catch {
    return null;
  }
}

// The storefront origin the operator's links point at (e.g. the real retail
// site, which may differ from the lead's stated website). Used to fetch the
// catalog/currency and scrape the logo when no website was supplied.
export function originFromProductUrls(urls: string[]): string | null {
  for (const u of urls) {
    const p = parseProductUrl(u);
    if (p) return p.origin;
  }
  return null;
}

async function fetchOne(productUrl: string): Promise<ShopifyProduct | null> {
  const parsed = parseProductUrl(productUrl);
  if (!parsed) return null;
  try {
    const res = await fetch(`${parsed.origin}/products/${parsed.handle}.json`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { product?: unknown };
    if (!data?.product) return null;
    return normalizeProduct(
      data.product as Parameters<typeof normalizeProduct>[0],
      parsed.origin,
    );
  } catch {
    return null;
  }
}

// Fetch the operator's chosen products in order. Returns the ones that fetched
// with an image (order preserved, so the first link becomes Ad 1) AND the list
// of links that failed (bad URL, not a live Shopify product page, or no image)
// so the caller can flag them instead of silently dropping to fewer ads.
export async function fetchProductsByUrls(
  urls: string[],
): Promise<{ products: ShopifyProduct[]; failedUrls: string[] }> {
  const settled = await Promise.all(
    urls.map(async (u) => ({ url: u, product: await fetchOne(u) })),
  );
  const products: ShopifyProduct[] = [];
  const failedUrls: string[] = [];
  for (const s of settled) {
    if (s.product && s.product.image_url) products.push(s.product);
    else failedUrls.push(s.url);
  }
  return { products, failedUrls };
}
