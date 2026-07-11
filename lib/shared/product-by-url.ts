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

function metaContent(html: string, prop: string): string | null {
  // Match <meta property="og:x" content="..."> in either attribute order.
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']*)["']` +
      `|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`,
    "i",
  );
  const m = html.match(re);
  const v = (m?.[1] ?? m?.[2] ?? "").trim();
  return v || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

// FALLBACK for storefronts that don't serve Liquid's /products/{handle}.json:
// headless Shopify (Hydrogen/Oxygen - e.g. lpcgolf.com, whose product pages are
// 200 but every .json endpoint 404s) and most non-Shopify platforms. Their
// product pages still publish Open Graph tags, which give us everything the
// magnet actually needs: a title, a description, and a real product image to
// hand Kie.ai as the reference.
//
// Price is NOT in og for these pages, so it stays null - the ad card and the
// "Built from your X" line both already handle a null price by omitting it.
// Only accepts pages that declare og:type=product (or at least expose a title
// AND an image), so a 200-with-no-product page can't smuggle in a junk "ad".
async function fetchOneFromHtml(
  productUrl: string,
  parsed: Parsed,
): Promise<ShopifyProduct | null> {
  try {
    const res = await fetch(productUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    const ogType = metaContent(html, "og:type");
    const rawTitle = metaContent(html, "og:title") ?? metaContent(html, "twitter:title");
    const image =
      metaContent(html, "og:image") ??
      metaContent(html, "og:image:secure_url") ??
      metaContent(html, "twitter:image");
    if (!rawTitle || !image) return null;
    if (ogType && ogType.toLowerCase() !== "product") return null;

    // og:title is usually "Product Name | Brand" or "Brand | Product Name".
    // Take the longest segment - it's the product, not the brand.
    const title = decodeEntities(rawTitle)
      .split(/\s+[|·–-]\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] ?? decodeEntities(rawTitle);

    const description = decodeEntities(
      metaContent(html, "og:description") ?? metaContent(html, "description") ?? "",
    );

    return normalizeProduct(
      {
        id: 0,
        title,
        handle: parsed.handle,
        body_html: description,
        product_type: "",
        tags: [],
        variants: [],
        images: [{ src: image }],
      } as Parameters<typeof normalizeProduct>[0],
      parsed.origin,
    );
  } catch {
    return null;
  }
}

async function fetchOne(productUrl: string): Promise<ShopifyProduct | null> {
  const parsed = parseProductUrl(productUrl);
  if (!parsed) return null;
  try {
    const res = await fetch(`${parsed.origin}/products/${parsed.handle}.json`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = (await res.json()) as { product?: unknown };
      if (data?.product) {
        const p = normalizeProduct(
          data.product as Parameters<typeof normalizeProduct>[0],
          parsed.origin,
        );
        if (p?.image_url) return p;
      }
    }
  } catch {
    // fall through to the HTML scrape
  }
  return await fetchOneFromHtml(productUrl, parsed);
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
