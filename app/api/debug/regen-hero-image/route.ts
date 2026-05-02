import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 180;
export const runtime = "nodejs";

// Debug-only endpoint: regenerates ONLY the hero mockup image for a brand
// using the caller-supplied prompt against the brand's Shopify hero product
// as reference. Writes the result to public/creatives/{slug}/hero-mockup.jpg
// on the fix/v2-iteration branch (NOT main) so the preview rebuilds without
// touching production. Use this to verify prompt-side fixes (e.g. material
// color lock) without re-running the full Apify+Claude+KIE pipeline.

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
};

const TARGET_BRANCH = "fix/v2-iteration";

type ShopifyProduct = { title: string; image_url: string; page_url: string };
const SKU_TYPE_BLOCKLIST = /\b(art|ceramic|candle|home|decor|fragrance|book|sticker|gift card)\b/i;

async function fetchShopifyHeroProduct(websiteUrl: string): Promise<ShopifyProduct | null> {
  const base = websiteUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/products.json?limit=20`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    products?: Array<{
      title?: string;
      handle?: string;
      product_type?: string;
      tags?: string[];
      published_at?: string | null;
      images?: Array<{ src?: string }>;
      variants?: Array<{ available?: boolean }>;
    }>;
  };
  const products = data.products ?? [];
  const candidates = products.filter((p) => {
    if (!p.title || !p.handle || !p.images?.[0]?.src) return false;
    if (!p.published_at) return false;
    const inStock = (p.variants ?? []).some((v) => v.available === true);
    return inStock;
  });
  if (candidates.length === 0) return null;
  const apparelLike = candidates.find((p) => {
    const blob = `${p.product_type ?? ""} ${(p.tags ?? []).join(" ")}`;
    return !SKU_TYPE_BLOCKLIST.test(blob);
  });
  const picked = apparelLike ?? candidates[0];
  return {
    title: picked.title!,
    image_url: picked.images![0].src!,
    page_url: `${base}/products/${picked.handle}`,
  };
}

async function kieSubmitAndPoll(
  prompt: string,
  referenceImageUrl: string,
  apiKey: string,
): Promise<string | null> {
  const submitRes = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nano-banana-2",
      input: {
        prompt,
        image_input: [referenceImageUrl],
        aspect_ratio: "1:1",
        resolution: "1K",
        output_format: "jpg",
      },
    }),
  });
  if (!submitRes.ok) {
    console.error("KIE submit failed:", submitRes.status, await submitRes.text());
    return null;
  }
  const submitJson = (await submitRes.json()) as { data?: { taskId?: string } };
  const taskId = submitJson.data?.taskId;
  if (!taskId) return null;

  const start = Date.now();
  while (Date.now() - start < 120000) {
    await new Promise((r) => setTimeout(r, 4000));
    const pollRes = await fetch(
      `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!pollRes.ok) continue;
    const pollJson = (await pollRes.json()) as {
      data?: { state?: string; resultJson?: string; failMsg?: string };
    };
    const state = pollJson.data?.state;
    if (state === "success") {
      const result = JSON.parse(pollJson.data?.resultJson ?? "{}") as { resultUrls?: string[] };
      return result.resultUrls?.[0] ?? null;
    }
    if (state === "fail") {
      console.error("KIE failed:", pollJson.data?.failMsg);
      return null;
    }
  }
  return null;
}

async function downloadImageBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

async function githubGetShaOnBranch(path: string, branch: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path}@${branch} failed: ${res.status}`);
  const json = (await res.json()) as { sha?: string };
  return json.sha ?? null;
}

async function githubPutOnBranch(
  path: string,
  contentBase64: string,
  branch: string,
  message: string,
): Promise<void> {
  const sha = await githubGetShaOnBranch(path, branch);
  const body: Record<string, string> = { message, branch, content: contentBase64 };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub PUT ${path}@${branch} failed: ${res.status} ${await res.text()}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      slug?: string;
      websiteUrl?: string;
      prompt?: string;
    };
    if (!body.slug || !body.websiteUrl || !body.prompt) {
      return NextResponse.json(
        { ok: false, error: "Required: slug, websiteUrl, prompt" },
        { status: 400 },
      );
    }

    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "KIE_API_KEY missing" }, { status: 500 });
    }

    const hero = await fetchShopifyHeroProduct(body.websiteUrl);
    if (!hero) {
      return NextResponse.json(
        { ok: false, error: "Could not fetch Shopify hero product" },
        { status: 502 },
      );
    }

    const mockupUrl = await kieSubmitAndPoll(body.prompt, hero.image_url, apiKey);
    if (!mockupUrl) {
      return NextResponse.json(
        { ok: false, error: "KIE generation failed", referenceImage: hero.image_url },
        { status: 502 },
      );
    }

    const b64 = await downloadImageBase64(mockupUrl);
    await githubPutOnBranch(
      `public/creatives/${body.slug}/hero-mockup.jpg`,
      b64,
      TARGET_BRANCH,
      `debug: regen hero-mockup for ${body.slug} (material-lock test)`,
    );

    return NextResponse.json({
      ok: true,
      mockupUrl,
      referenceImage: hero.image_url,
      referenceTitle: hero.title,
      committedTo: `${TARGET_BRANCH}:public/creatives/${body.slug}/hero-mockup.jpg`,
    });
  } catch (e) {
    console.error("regen-hero-image error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { slug, websiteUrl, prompt } — regenerates hero mockup on fix/v2-iteration branch",
  });
}
