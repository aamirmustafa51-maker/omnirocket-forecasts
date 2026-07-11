// Kie.ai (nano-banana-2) image generation — shared by the magnets that render
// "here's the ad we'd run for you" mockups from a real product photo.
//
// The reference image is the brand's own product shot (Shopify CDN URL). The
// model re-photographs THAT product into an editorial ad scene, so the mockup
// looks like a shoot we ran instead of a lifted catalog image. Prompts must
// carry a MATERIAL_LOCK + STRUCTURE_LOCK or the model quietly recolors metals,
// adds buttons, and wipes printed graphics.
//
// Extracted from app/api/webhook/route.ts (Fatigue Forecast), which is the
// battle-tested original. Scroll-Stopper now calls the same code.

// Words that have tripped Google's content filter on Nano Banana 2 in testing.
// Strip these from prompts (case-insensitive) before submitting.
const NB2_BLOCKLIST = [
  "graffiti",
  "tagged",
  "underpass",
  "weapon",
  "gun",
  "alcohol",
  "drug",
  "tattoo",
  "blood",
];

export function sanitizeNB2Prompt(prompt: string): string {
  let out = prompt;
  for (const word of NB2_BLOCKLIST) {
    out = out.replace(new RegExp(`\\b${word}\\w*\\b`, "gi"), "");
  }
  return out.replace(/\s+/g, " ").replace(/ ,/g, ",").trim();
}

export function buildSafeFallbackPrompt(productTitle: string): string {
  return `A photorealistic editorial product photograph featuring the product from the reference image, styled on a soft cream linen surface with natural diffused daylight from a side window casting gentle shadows. Calm, premium, minimalist aesthetic with a muted neutral palette. Square 1:1 composition with breathing room top and bottom for ad text overlay. CRITICAL — preserve the exact metal type, color, finish, fabric, weave, stones, surface treatment, and EVERY visible construction detail of the ${productTitle} as shown in the reference image. STRUCTURE — preserve the exact silhouette, button/snap/zipper count, pocket count, closure style, sleeves, neckline, hardware, and any printed graphics or text on the garment exactly as shown. Do NOT change the metal type, do NOT shift the color temperature, do NOT introduce tones not present in the reference, do NOT add or remove any buttons/snaps/zippers/pockets/straps, do NOT alter the silhouette, do NOT remove or modify printed graphics or text on the garment. IMPORTANT: the 'no text' and 'no logos' items in the NEGATIVE list apply ONLY to overlay text/logos added to the photograph itself — text, logos, graphics, prints, and brand labels that exist ON the product in the reference are part of the product and must be preserved exactly. Premium commerce photography quality. NEGATIVE: no overlay text added to the photograph, no overlay logos added to the photograph, no watermarks, no UI elements, no Facebook interface, no clickable buttons, no faces, no models, no collage, no borders, no duplicate products, no color shift, no metal swap, no silver-to-gold or gold-to-silver conversion, no warm-tone bias on cool metals, no recoloring of fabric or stones, no pattern modifications, no removing or replacing the product's printed graphics, no extra hardware not present in reference, no added pockets or pleats, no silhouette alterations, no design modifications.`;
}

export async function kieSubmitAndPoll(
  prompt: string,
  referenceImageUrl: string,
  apiKey: string,
): Promise<string | null> {
  try {
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
          // 1:1 is the Meta feed's native square. Every mockup card renders
          // square, so anything else would letterbox inside the ad chrome.
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
        console.error("KIE generation failed:", pollJson.data?.failMsg);
        return null;
      }
    }
    console.error("KIE polling timeout");
    return null;
  } catch (e) {
    console.error("KIE error:", e);
    return null;
  }
}

// First attempt with Claude's prompt (sanitized). On failure, retry once with
// a stripped-down safe template that only varies by product name.
export async function kieGenerateMockup(
  prompt: string,
  referenceImageUrl: string,
  productTitle: string,
): Promise<string | null> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    console.error("KIE_API_KEY not set — skipping mockup");
    return null;
  }
  const sanitized = sanitizeNB2Prompt(prompt);
  const first = await kieSubmitAndPoll(sanitized, referenceImageUrl, apiKey);
  if (first) return first;

  console.error("NB2 first attempt failed; retrying with safe fallback prompt");
  return await kieSubmitAndPoll(buildSafeFallbackPrompt(productTitle), referenceImageUrl, apiKey);
}

export async function downloadImageBase64(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Image download failed: ${res.status} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString("base64");
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
