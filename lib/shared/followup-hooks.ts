// Generates 1-2 short, insertion-ready follow-up hooks from a finished Fatigue
// Forecast. These personalize the post-yes follow-up subsequence: the copy
// renders them as {{followup_hook_1}} / {{followup_hook_2}} so a touch can name
// the single sharpest finding from THAT lead's report ("one thing that stood
// out: <hook>"). Best-effort by design — returns null on any failure so the
// caller can still write magnet_link / brand_playbook_link.
import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/shared/publish";

export async function generateFollowupHooks(
  anthropic: Anthropic,
  forecast: unknown,
  brand: string,
): Promise<{ followup_hook_1: string; followup_hook_2?: string } | null> {
  try {
    const f = (forecast ?? {}) as {
      tldr?: string;
      ads?: Array<{ drivers?: string[] }>;
    };
    const findings: string[] = [];
    if (f.tldr) findings.push(f.tldr);
    for (const ad of (f.ads ?? []).slice(0, 3)) {
      for (const d of ad.drivers ?? []) findings.push(d);
    }
    const findingsBlock = findings.slice(0, 8).map((x, i) => `${i + 1}. ${x}`).join("\n");
    if (!findingsBlock) return null;

    const prompt = `You wrote a Meta-ads fatigue report for the brand "${brand}". Here are its key findings:
${findingsBlock}

Pick the TWO most alarming, specific, dollar-costing findings. Rewrite each as a short standalone clause that drops mid-sentence into a follow-up email right after "one thing that stood out:".

Rules for EACH hook:
- lowercase start, NO trailing period, one clause, max ~20 words
- plain brand-owner English, grade 7-8, no jargon, no codenames
- NO long dashes (use a normal hyphen or none), and NO curly braces { or } anywhere
- specific to THIS brand's findings, never generic
- hook 1 and hook 2 must be DIFFERENT findings

Return ONLY a JSON object: {"followup_hook_1": "...", "followup_hook_2": "..."}`;

    const res = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;

    const parsed = extractJson(block.text) as {
      followup_hook_1?: string;
      followup_hook_2?: string;
    };
    if (!parsed.followup_hook_1) return null;

    // Strip anything that would break the merge-tag render: long dashes and any
    // stray curly braces (a hook that itself contains {{...}} would confuse
    // Smartlead's variable parser).
    const clean = (s?: string): string | undefined =>
      s ? s.replace(/[—–]/g, "-").replace(/[{}]/g, "").trim() : undefined;

    return {
      followup_hook_1: clean(parsed.followup_hook_1)!,
      followup_hook_2: clean(parsed.followup_hook_2),
    };
  } catch (e) {
    console.error("[followup-hooks] generation failed:", e);
    return null;
  }
}
