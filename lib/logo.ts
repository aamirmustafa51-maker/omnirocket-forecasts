// Best-effort prospect logo fetch by scraping apple-touch-icon from the
// brand's homepage. logo.dev returns wrong logos for SMB ecom (Bravo Shoes
// gets Bravo TV's logo, unknown domains get Instagram's). The site's own
// apple-touch-icon is the brand's actual logo, set deliberately by the
// store owner. Returns absolute URL or null.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export async function fetchProspectLogoUrl(websiteUrl: string): Promise<string | null> {
  try {
    const res = await fetch(websiteUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const base = new URL(res.url);

    // Prefer apple-touch-icon, fall back to favicon. Skip og:image — it's
    // the brand's social-share image (often a hero/lifestyle photo, not a logo).
    // Twenty Compass case: og:image was a 4999x2800 slideshow of a model.
    const candidates: string[] = [];

    const appleMatches = [...html.matchAll(/<link[^>]+rel=["'](?:apple-touch-icon[^"']*)["'][^>]*>/gi)];
    for (const m of appleMatches) {
      const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
      if (href) candidates.push(href);
    }

    const iconMatches = [...html.matchAll(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]*>/gi)];
    for (const m of iconMatches) {
      const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
      if (href) candidates.push(href);
    }

    if (candidates.length === 0) return null;
    return new URL(candidates[0], base).toString();
  } catch {
    return null;
  }
}
