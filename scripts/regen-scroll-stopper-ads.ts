// Regenerate the AD VISUAL for specific ads on an already-published
// Scroll-Stopper sheet, leaving every other ad byte-for-byte untouched.
//
// Why this exists: the webhook regenerates all 3 ads in one run. When only one
// image comes out wrong (the classic case: a soft-pouch multipack rendered
// floating in mid-air, because the catalog reference is a flat cut-out on white
// and the model transplanted that arrangement into the scene), re-running the
// whole webhook re-rolls the ads that were already good. Kyle then loses a
// visual he'd approved. This script re-rolls ONLY the indices you name.
//
// The ad COPY is never touched. We reuse the concept's existing angle, headline
// and visual_direction and ask Claude for a fresh image_prompt only, built from
// the current IMAGE PROMPT TEMPLATE in magnets/scroll-stopper/prompts/ad-copy.md
// (single source of truth - the section is read out of that file, not copied).
// So a fix to the template's locks is picked up here automatically.
//
// Two steps on purpose, and --publish does NOT re-generate. Image generation is
// stochastic: if publishing re-rolled the image, the thing that goes live would
// be a fresh roll nobody looked at, and the preview you approved would be a lie.
// So step 1 renders to outputs/regen/{slug}/, you LOOK at it, and step 2 uploads
// those exact files.
//
//   npx tsx scripts/regen-scroll-stopper-ads.ts twisted-pepper 1,3    # render + preview
//   open outputs/regen/twisted-pepper/                                 # look at them
//   npx tsx scripts/regen-scroll-stopper-ads.ts twisted-pepper 1,3 --publish
//
// Not happy with a roll? Just run step 1 again - it overwrites the preview and
// nothing has touched the live page.
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { fetchProductsByUrls } from "../lib/shared/product-by-url";
import { githubGetJson, githubPut, extractJson } from "../lib/shared/publish";
import { kieGenerateMockup, downloadImageBase64 } from "../lib/shared/kie";

const envPath = path.join(process.cwd(), "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// The GitHub vars live in Vercel, not in the local .env - the webhook is the
// only thing that normally commits. Borrow the gh CLI's token so this script can
// read the published sheet and (with --commit) overwrite an image.
process.env.GITHUB_OWNER ||= "aamirmustafa51-maker";
process.env.GITHUB_REPO ||= "omnirocket-forecasts";
if (!process.env.GITHUB_TOKEN) {
  try {
    process.env.GITHUB_TOKEN = execSync("gh auth token", { encoding: "utf8" }).trim();
  } catch {
    throw new Error("No GITHUB_TOKEN in .env and `gh auth token` failed - run `gh auth login`");
  }
}

type Concept = {
  product_index: number;
  product_title: string;
  product_url: string;
  image_url: string;
  ai_image: boolean;
  angle_label: string;
  headline: string;
  visual_direction?: string;
};
type Sheet = { lead_company: string; website: string; concepts: Concept[] };

// The image-prompt spec (template + every slot instruction, including the
// GROUNDING_LOCK) lives in the copywriter prompt. Lift that one section rather
// than duplicating it, so this script can never drift from production.
function imageSpec(): string {
  const md = fs.readFileSync(
    path.join(process.cwd(), "magnets/scroll-stopper/prompts/ad-copy.md"),
    "utf8",
  );
  const start = md.indexOf("# THE AD IMAGE");
  const end = md.indexOf("# RULES");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      "Could not find the '# THE AD IMAGE' section in ad-copy.md - did the headings change?",
    );
  }
  return md.slice(start, end).trim();
}

// Ask Claude for ONE image_prompt, for one product, reusing the ad's existing
// angle and scene. Copy is frozen; this only re-art-directs the photograph.
async function writeImagePrompt(
  anthropic: Anthropic,
  brand: string,
  c: Concept,
  productDesc: string,
): Promise<string> {
  const prompt = `You are a senior art director at OmniRocket. You are re-shooting the visual for ONE existing Meta ad. The ad's copy is already approved and is NOT changing - your job is only to produce the image generation prompt for its photograph.

BRAND: ${brand}

THE AD (already written, do not change it):
- Product: ${c.product_title}
- Product description: ${productDesc || "(none)"}
- Angle: ${c.angle_label}
- Headline: ${c.headline}
- Intended shot: ${c.visual_direction || "(none given - choose a scene that fits the angle)"}

WHY WE ARE RE-SHOOTING: the previous render looked fake. The product was floating
in mid-air with no contact shadow, because the model copied the flat catalog
cut-out arrangement straight into the scene instead of re-staging the product as
a real object resting on a real surface. Your GROUNDING_LOCK must make that
impossible this time. Read the product title and description and be honest about
the packaging's rigidity: soft pouches, sachets and foil packets CANNOT stand up
unsupported and must lie flat, stack, or lean on something.

${imageSpec()}

Return ONLY a JSON object, no preamble and no markdown fences:
{"image_prompt": "the fully-filled template with all six slots filled and the NEGATIVE section verbatim"}`;

  const res = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = extractJson(text) as { image_prompt?: string };
  const out = json?.image_prompt?.trim();
  if (!out) throw new Error(`Claude returned no image_prompt for ad ${c.product_index}`);
  return out;
}

async function main() {
  const slug = process.argv[2];
  const indices = (process.argv[3] || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  const publish = process.argv.includes("--publish");

  if (!slug || !indices.length) {
    console.error(
      "usage: npx tsx scripts/regen-scroll-stopper-ads.ts <slug> <1-based ad indices, comma separated> [--publish]\n" +
        "  (no flag) render previews to outputs/regen/{slug}/ and touch nothing live\n" +
        "  --publish  upload the previews already sitting in outputs/regen/{slug}/",
    );
    process.exit(1);
  }

  // Read the LIVE sheet from GitHub, not from disk. The local clone is routinely
  // stale (artifacts are committed by the Vercel function, not from here), so
  // the filesystem copy may not even exist.
  const sheet = await githubGetJson<Sheet>(`outputs/scroll-stopper/${slug}.json`);
  if (!sheet) throw new Error(`No published sheet at outputs/scroll-stopper/${slug}.json`);

  const targets = indices.map((i) => {
    const c = sheet.concepts.find((x) => x.product_index === i);
    if (!c) throw new Error(`Ad ${i} not found in ${slug} (has ${sheet.concepts.length} concepts)`);
    return c;
  });

  const untouched = sheet.concepts
    .filter((c) => !indices.includes(c.product_index))
    .map((c) => `ad ${c.product_index} (${c.headline})`);

  const outDir = path.join(process.cwd(), "outputs", "regen", slug);

  console.log(`\nBrand: ${sheet.lead_company}  [${slug}]`);
  console.log(`Targeting: ${targets.map((c) => `ad ${c.product_index} (${c.headline})`).join(", ")}`);
  console.log(`Leaving alone: ${untouched.join(", ") || "(nothing)"}`);

  // PUBLISH: upload the previews already on disk. Deliberately does NOT call the
  // image model - what goes live is exactly the file that was looked at.
  if (publish) {
    console.log("Mode: PUBLISH (uploading the previews you already reviewed)\n");
    const files = targets.map((c) => {
      const f = path.join(outDir, `ad-${c.product_index}.jpg`);
      if (!fs.existsSync(f)) {
        throw new Error(
          `No preview at outputs/regen/${slug}/ad-${c.product_index}.jpg - run without --publish first, then look at it.`,
        );
      }
      return { c, f };
    });
    // Sequential: every githubPut writes to the same branch, so parallel commits
    // race and all but the first are rejected as non-fast-forward.
    for (const { c, f } of files) {
      const b64 = fs.readFileSync(f).toString("base64");
      const repoPath = `public/creatives/scroll-stopper/${slug}/ad-${c.product_index}.jpg`;
      await githubPut(repoPath, b64, `chore: regenerate scroll-stopper ad-${c.product_index} for ${slug} (grounded staging)`);
      console.log(`ad ${c.product_index}: published -> ${repoPath}`);
    }
    console.log(
      `\nDone. Vercel redeploys on push; the live page updates in ~1 min:\n  https://omnirocket-forecasts.vercel.app/scroll-stopper/${slug}`,
    );
    return;
  }

  console.log("Mode: PREVIEW (nothing is written to the repo)\n");

  // The reference photo the image model re-photographs: the product's real
  // catalog shot, fetched fresh from the storefront by its URL.
  //
  // One call per URL on purpose. fetchProductsByUrls DROPS products it failed to
  // fetch, so a batch call returns a shorter array and every product after the
  // failure silently pairs with the wrong concept - which would render ad 3's
  // photo into ad 1's scene. Fetching singly keeps the concept binding exact.
  const products = await Promise.all(
    targets.map(async (c) => (await fetchProductsByUrls([c.product_url])).products[0] ?? null),
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  fs.mkdirSync(outDir, { recursive: true });

  // Generate concurrently - each NB2 job polls up to 120s, so serial would crawl.
  const results = await Promise.all(
    targets.map(async (c, n) => {
      const p = products[n];
      const ref = p?.image_url ?? p?.image_urls?.[0];
      if (!ref) return { c, error: `no reference photo found at ${c.product_url}` };
      try {
        const imagePrompt = await writeImagePrompt(
          anthropic,
          sheet.lead_company,
          c,
          (p.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
        );
        fs.writeFileSync(path.join(outDir, `ad-${c.product_index}.prompt.txt`), imagePrompt);
        console.log(`ad ${c.product_index}: prompt written, generating from ${ref}`);

        const url = await kieGenerateMockup(imagePrompt, ref, c.product_title);
        if (!url) return { c, error: "image generation failed (NB2 returned nothing)" };
        const b64 = await downloadImageBase64(url);
        fs.writeFileSync(path.join(outDir, `ad-${c.product_index}.jpg`), Buffer.from(b64, "base64"));
        console.log(`ad ${c.product_index}: rendered -> outputs/regen/${slug}/ad-${c.product_index}.jpg`);
        return { c, b64 };
      } catch (e) {
        return { c, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  const failed = results.filter((r) => r.error);
  for (const r of failed) {
    console.error(`\n  ✗ ad ${r.c.product_index} FAILED: ${r.error}`);
  }

  const ok = results.filter((r) => !r.error).map((r) => r.c.product_index);
  console.log(
    `\nPreview only - the live page is untouched.` +
      `\n  Look:    open outputs/regen/${slug}/` +
      `\n  Check:   is every unit resting on the surface, with a contact shadow, at the right scale?` +
      (ok.length
        ? `\n  Publish: npx tsx scripts/regen-scroll-stopper-ads.ts ${slug} ${ok.join(",")} --publish`
        : "") +
      `\n  Re-roll: just run this same command again (overwrites the preview, nothing goes live).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
