// Plain-text site scraper for the Competitor Teardown magnet's website-angle
// fallback (used when a competitor isn't running active Meta ads). Pulls
// homepage + about-page HTML, strips tags, returns text. Brand sites are
// generally vanilla HTML/Shopify — no JS-challenge wall like Meta Ad Library —
// so a single fetch is sufficient. Failures soft-fall to empty string; the
// website-angle prompt is built to tolerate sparse inputs.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const ABOUT_PATHS = ["/pages/about", "/pages/about-us", "/about", "/about-us", "/our-story", "/pages/our-story"];

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

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    return stripHtml(html);
  } catch {
    return "";
  }
}

function originFromDomain(domain: string): string {
  const cleaned = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return `https://${cleaned}`;
}

export type SiteScrape = {
  homepage_text: string;
  about_text: string;
  about_url: string | null;
};

const MAX_CHARS = 6000;

export async function scrapeBrandSite(domain: string): Promise<SiteScrape> {
  const origin = originFromDomain(domain);
  const homepage_text = (await fetchText(origin)).slice(0, MAX_CHARS);

  for (const path of ABOUT_PATHS) {
    const url = `${origin}${path}`;
    const text = await fetchText(url);
    if (text.length > 200) {
      return { homepage_text, about_text: text.slice(0, MAX_CHARS), about_url: url };
    }
  }

  return { homepage_text, about_text: "", about_url: null };
}
