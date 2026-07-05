// Picks the 3 products that make the strongest ad mockups for a brand. We have
// no sales data (products.json doesn't carry order counts), so we proxy
// "hero product" from public storefront signals:
//
//   1. Featured on the homepage      → strongest bestseller signal (brands put
//                                       their winners on the front page)
//   2. Actively discounted           → they're pushing it right now
//   3. Rich imagery (multi-photo)    → makes a better-looking ad card
//
// Every candidate must have a usable image (no image = no mockup). If fewer
// than 3 products are homepage-featured we backfill from the rest in catalog
// order so the report always ships 3 cards when the catalog is large enough.

import type { ShopifyProduct } from "@/lib/shared/shopify-products";

// Homepage HTML references a product by its handle inside collection/product
// links (/products/<handle>) — a reliable "featured" signal across themes.
function isFeaturedOnHomepage(handle: string, homepageHtml: string): boolean {
  if (!handle || !homepageHtml) return false;
  return homepageHtml.includes(`/products/${handle}`);
}

function score(product: ShopifyProduct, homepageHtml: string): number {
  let s = 0;
  if (isFeaturedOnHomepage(product.handle, homepageHtml)) s += 100;
  if (product.on_sale) s += 20;
  if (product.image_count >= 3) s += 10;
  else if (product.image_count === 2) s += 5;
  return s;
}

export function selectHeroProducts(
  products: ShopifyProduct[],
  homepageHtml: string,
  count = 3,
): ShopifyProduct[] {
  const withImages = products.filter((p) => p.image_url);

  // Stable sort: score desc, then original catalog order (index) as tie-break.
  const ranked = withImages
    .map((p, i) => ({ p, i, s: score(p, homepageHtml) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);

  return ranked.slice(0, count);
}
