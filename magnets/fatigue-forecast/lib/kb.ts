// KB injection — loads markdown files at module init and returns concatenated
// strings for prompt injection. Files live at omnirocket-forecasts/meta-ads-kb/
// (copied from the canonical /meta-ads-kb/ at repo root). See meta-ads-kb/USAGE.md.

import fs from "node:fs";
import path from "node:path";

const KB_ROOT = path.join(process.cwd(), "meta-ads-kb");

function loadFile(relPath: string): string {
  try {
    return fs.readFileSync(path.join(KB_ROOT, relPath), "utf-8");
  } catch (e) {
    console.warn(`KB file missing: ${relPath}`, e);
    return "";
  }
}

// Always-on KB — loaded once at module init.
const SCOPE_AND_RULES = loadFile("01-scope-and-rules.md");
const ANTI_PATTERNS = loadFile("13-anti-patterns.md");
const ANDROMEDA = loadFile("14-andromeda-and-platform-changes.md");
const NICHE_GENERAL = loadFile("niches/00-general-meta-policy.md");

// Per-niche files — keyed by classifyNiche() output in lib/benchmarks.ts.
const NICHE_FILES: Record<string, string> = {
  apparel: loadFile("niches/10-apparel-fashion.md"),
  beauty: loadFile("niches/09-beauty-skincare-cosmetics.md"),
  home: loadFile("niches/11-home-goods-furniture.md"),
  supplements: loadFile("niches/01-supplements-vitamins-nootropics.md"),
  pet: loadFile("niches/12-pet-products.md"),
  kids: loadFile("niches/08-kids-baby.md"),
  cbd: loadFile("niches/03-cbd-hemp-cannabis-adjacent.md"),
  health: loadFile("niches/13-health-medical-adjacent.md"),
  generic: "",
};

// Returns the full KB block to inject into the system prompt.
export function buildKbBlock(nicheKey: string): string {
  const nicheFile = NICHE_FILES[nicheKey] ?? "";
  const sections: Array<[string, string]> = [
    ["SCOPE AND CARDINAL RULES", SCOPE_AND_RULES],
    ["ANTI-PATTERNS — NEVER PUT IN THE REPORT", ANTI_PATTERNS],
    ["2025–2026 PLATFORM CHANGES (Andromeda, attribution, exclusions)", ANDROMEDA],
    ["GENERAL META AD POLICY", NICHE_GENERAL],
  ];
  if (nicheFile) sections.push([`NICHE-SPECIFIC POLICY (${nicheKey})`, nicheFile]);

  return sections
    .filter(([, body]) => body.trim().length > 0)
    .map(([title, body]) => `\n\n══════ ${title} ══════\n${body.trim()}`)
    .join("\n");
}
