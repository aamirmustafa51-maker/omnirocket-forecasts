// Best-effort Instagram follower count fetch.
// IG blocks unauthenticated scraping aggressively — soft-fallback to null and
// let lib/fatigue.ts inferBrandSize() use ad count + country breadth instead.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function deriveHandle(input: { ig_handle?: string | null; website_url?: string | null }): string | null {
  if (input.ig_handle) return input.ig_handle.replace(/^@/, "").trim() || null;
  // Try to derive from website hostname
  if (!input.website_url) return null;
  try {
    const host = new URL(input.website_url).hostname.replace(/^www\./, "");
    return host.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchInstagramFollowerCount(input: {
  ig_handle?: string | null;
  website_url?: string | null;
}): Promise<number | null> {
  const handle = deriveHandle(input);
  if (!handle) return null;

  try {
    const res = await fetch(`https://www.instagram.com/${handle}/`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // IG embeds follower count in a JSON-LD-ish meta description like:
    //   <meta property="og:description" content="123K Followers, 456 Following, ..."
    const m = html.match(/(\d[\d,.]*)\s*([KMB])?\s*Followers/i);
    if (!m) return null;

    const num = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(num)) return null;
    const mult = m[2]?.toUpperCase();
    if (mult === "K") return Math.round(num * 1_000);
    if (mult === "M") return Math.round(num * 1_000_000);
    if (mult === "B") return Math.round(num * 1_000_000_000);
    return Math.round(num);
  } catch {
    return null;
  }
}
