// Deterministic fatigue scoring.
// Replaces math/counting that Claude was hallucinating.
// Source of truth for weights + thresholds: meta-ads-kb/03-fatigue-scoring-public.md.
// Update both files together — see meta-ads-kb/USAGE.md.

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors NormalizedAd in app/api/webhook/route.ts plus creative_type which
// route.ts will need to start populating during normalizeAd().
export type ScoringAd = {
  index: number;
  headline: string;
  body: string;
  cta: string;
  landing_url: string;
  start_date: number | null; // unix seconds, from Apify
  creative_type: "image" | "video" | "carousel" | "unknown";
};

export type AccountMeta = {
  brand_size: BrandSize;
  total_active_ads: number;
  countries_count: number;
  ig_follower_count: number | null; // null when IG fetch was blocked
};

export type BrandSize = "small" | "mid" | "large" | "whale";

// Thresholds — KB §"S1 — Days-running interpretation"
const STALE_HERO_DAYS_BY_SIZE: Record<BrandSize, number> = {
  small: 28,
  mid: 21,
  large: 14,
  whale: 10,
};

// Composite weights — KB §"Composite Public Fatigue Score"
const WEIGHTS = {
  S1_days: 0.25,
  S2_concept: 0.30, // Andromeda — dominant 2026 lever
  S3_dup: 0.15,
  S4_format: 0.10,
  S5_cadence: 0.20,
} as const;

// Hook-duplication trigram threshold (Q1 in design review)
const HOOK_TRIGRAM_THRESHOLD = 0.85;

// ─────────────────────────────────────────────────────────────────────────────
// Outputs
// ─────────────────────────────────────────────────────────────────────────────

export type AdSubSignals = {
  hook_repetition: number; // 0-10, count-of-duplicates–based
  body_duplication: number;
  headline_pattern: number;
  cta_repetition: number;
  landing_destination: number;
};

export type AdScores = {
  ad_index: number;
  days_running: number;
  is_stale_hero: boolean;
  S1_days: number; // 0-5
  S3_dup: number; // 0-5, max of 5 sub-signals
  sub: AdSubSignals;
  fatigue_score: number; // 0-100
  days_until_fatigue: number; // KB Q4: max(threshold - days_running, 3)
  severity: "danger" | "warn" | "ok";
};

export type AccountRollup = {
  brand_size: BrandSize;
  brand_size_threshold_days: number;
  S2_concept_count: number; // raw count of distinct concepts (cheap proxy)
  S2_score: number; // 0-5
  S4_format_score: number;
  S5_cadence_score: number;
  cadence_label: "healthy" | "trickle" | "cliff" | "pulse-burn";
  format_mix: { image: number; video: number; carousel: number };
  account_fatigue_score: number; // 0-100, average of per-ad scores weighted by composite
  hero_concept_call_out_required: boolean; // S2 < 6
};

export type ScoringResult = {
  perAd: AdScores[];
  rollup: AccountRollup;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public entrypoint
// ─────────────────────────────────────────────────────────────────────────────

export function scoreAds(ads: ScoringAd[], meta: AccountMeta, today: Date = new Date()): ScoringResult {
  const threshold = STALE_HERO_DAYS_BY_SIZE[meta.brand_size];

  // Per-ad days_running
  const daysRunning = ads.map((a) => calcDaysRunning(a.start_date, today));

  // ── S2: concept count (cheap proxy — Q3) ──
  const conceptCount = countConcepts(ads);
  const S2_score = scoreConceptCount(conceptCount);

  // ── S4: format mix ──
  const formatMix = countFormats(ads);
  const S4_score = scoreFormatMix(formatMix, ads.length);

  // ── S5: refresh cadence ──
  const { score: S5_score, label: cadenceLabel } = scoreCadence(daysRunning);

  // ── Per-ad sub-signals ──
  const headlineCounts = countByNorm(ads.map((a) => a.headline));
  const bodyCounts = countByNorm(ads.map((a) => a.body));
  const ctaCounts = countByNorm(ads.map((a) => a.cta));
  const landingCounts = countByNorm(ads.map((a) => a.landing_url));
  const hookGroups = clusterHooks(ads.map((a) => a.body));

  const perAd: AdScores[] = ads.map((ad, i) => {
    const days = daysRunning[i];
    const S1 = scoreDaysRunning(days, threshold);
    const sub: AdSubSignals = {
      hook_repetition: scoreFromGroupSize(hookGroups[i] ?? 1),
      body_duplication: scoreFromGroupSize(bodyCounts.get(normForCount(ad.body)) ?? 1),
      headline_pattern: scoreFromGroupSize(headlineCounts.get(normForCount(ad.headline)) ?? 1),
      cta_repetition: scoreFromGroupSize(ctaCounts.get(normForCount(ad.cta)) ?? 1),
      landing_destination: scoreFromGroupSize(landingCounts.get(normForCount(ad.landing_url)) ?? 1),
    };
    const S3 = Math.max(
      sub.hook_repetition,
      sub.body_duplication,
      sub.headline_pattern,
      sub.cta_repetition,
      sub.landing_destination,
    );

    const composite =
      S1 * WEIGHTS.S1_days +
      S2_score * WEIGHTS.S2_concept +
      S3 * WEIGHTS.S3_dup +
      S4_score * WEIGHTS.S4_format +
      S5_score * WEIGHTS.S5_cadence;

    const fatigue_score = Math.round(composite * 20); // 0-5 weighted → 0-100
    const dut = Math.max(threshold - days, 3); // Q4 chosen formula
    const severity: AdScores["severity"] =
      fatigue_score >= 85 ? "danger" : fatigue_score >= 65 ? "warn" : "ok";

    return {
      ad_index: ad.index,
      days_running: days,
      is_stale_hero: days > threshold,
      S1_days: S1,
      S3_dup: S3,
      sub,
      fatigue_score,
      days_until_fatigue: dut,
      severity,
    };
  });

  const accountFatigue =
    perAd.length === 0 ? 0 : Math.round(perAd.reduce((s, a) => s + a.fatigue_score, 0) / perAd.length);

  return {
    perAd,
    rollup: {
      brand_size: meta.brand_size,
      brand_size_threshold_days: threshold,
      S2_concept_count: conceptCount,
      S2_score,
      S4_format_score: S4_score,
      S5_cadence_score: S5_score,
      cadence_label: cadenceLabel,
      format_mix: formatMix,
      account_fatigue_score: accountFatigue,
      hero_concept_call_out_required: conceptCount < 6,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand-size proxy (Q2: IG follower fetch with soft-fallback to ad count + countries)
// ─────────────────────────────────────────────────────────────────────────────

export function inferBrandSize(input: {
  ig_follower_count: number | null;
  total_active_ads: number;
  countries_count: number;
}): BrandSize {
  const { ig_follower_count, total_active_ads, countries_count } = input;

  // Primary signal: IG followers when available
  if (ig_follower_count !== null) {
    if (ig_follower_count >= 500_000) return "whale";
    if (ig_follower_count >= 50_000) return "large";
    if (ig_follower_count >= 10_000) return "mid";
    return "small";
  }

  // Fallback: ad count + country breadth
  if (total_active_ads >= 100 || countries_count >= 5) return "whale";
  if (total_active_ads >= 40 || countries_count >= 3) return "large";
  if (total_active_ads >= 10) return "mid";
  return "small";
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal helpers
// ─────────────────────────────────────────────────────────────────────────────

function calcDaysRunning(startDate: number | null, today: Date): number {
  if (!startDate) return 0;
  const start = new Date(startDate * 1000);
  const ms = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

// S1 — Days running (per ad). 0 = fresh, 5 = catastrophically stale.
function scoreDaysRunning(days: number, threshold: number): number {
  if (days <= threshold * 0.5) return 0;
  if (days <= threshold * 0.75) return 1;
  if (days <= threshold) return 2;
  if (days <= threshold * 1.5) return 3;
  if (days <= threshold * 2) return 4;
  return 5;
}

// S2 — Concept count buckets per KB §"S2 — Concept diversity"
function scoreConceptCount(n: number): number {
  if (n <= 2) return 5; // Critical — flipped (5 = severe fatigue)
  if (n <= 4) return 4;
  if (n <= 7) return 2;
  if (n <= 12) return 1;
  return 0;
}

// Cheap concept proxy (Q3 option a):
// concept = (first 5 normalized headline words, format)
function countConcepts(ads: ScoringAd[]): number {
  const seen = new Set<string>();
  for (const ad of ads) {
    const head5 = normWords(ad.headline).slice(0, 5).join(" ");
    seen.add(`${head5}::${ad.creative_type}`);
  }
  return seen.size;
}

function countFormats(ads: ScoringAd[]): { image: number; video: number; carousel: number } {
  const out = { image: 0, video: 0, carousel: 0 };
  for (const ad of ads) {
    if (ad.creative_type === "image") out.image++;
    else if (ad.creative_type === "video") out.video++;
    else if (ad.creative_type === "carousel") out.carousel++;
  }
  return out;
}

// S4 — Format diversity per KB §"S4 — Format diversity"
function scoreFormatMix(mix: { image: number; video: number; carousel: number }, total: number): number {
  if (total === 0) return 5;
  const present = [mix.image, mix.video, mix.carousel].filter((n) => n > 0).length;
  if (present === 1) return 5; // 100% one format
  if (present === 2) return 3;
  return 1; // all three present
}

// S5 — Refresh cadence per KB §"S5 — Refresh cadence"
function scoreCadence(daysRunning: number[]): {
  score: number;
  label: AccountRollup["cadence_label"];
} {
  if (daysRunning.length === 0) return { score: 5, label: "trickle" };
  // Bucket each ad into the week it first appeared.
  const weeks = daysRunning.map((d) => Math.floor(d / 7));
  const last4 = weeks.filter((w) => w <= 3); // first-seen in last 28 days
  const newAdsPerWeek = new Set(last4).size; // distinct weeks with at least one new ad

  const minWeek = Math.min(...weeks);
  const maxWeek = Math.max(...weeks);
  const span = maxWeek - minWeek;

  // Pulse-burn: 50%+ ads first-seen in same week, none in the last 14 days
  const sameWeekCounts = new Map<number, number>();
  for (const w of weeks) sameWeekCounts.set(w, (sameWeekCounts.get(w) ?? 0) + 1);
  const dominantWeekShare = Math.max(...sameWeekCounts.values()) / weeks.length;
  const noRecent = weeks.every((w) => w >= 2);
  if (dominantWeekShare >= 0.5 && noRecent) return { score: 5, label: "pulse-burn" };

  // Cliff: all ads within a 2-week window AND nothing in last 7 days
  if (span <= 2 && weeks.every((w) => w >= 1)) return { score: 4, label: "cliff" };

  // Healthy: at least 3 of last 4 weeks have at least one new ad
  if (newAdsPerWeek >= 3) return { score: 0, label: "healthy" };
  if (newAdsPerWeek === 2) return { score: 2, label: "healthy" };

  // Trickle: one new ad per 6+ weeks
  return { score: 4, label: "trickle" };
}

// Map "how many ads share this exact value" → 0-5 fatigue
function scoreFromGroupSize(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  if (n <= 4) return 3;
  if (n <= 7) return 4;
  return 5;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text normalization + grouping
// ─────────────────────────────────────────────────────────────────────────────

function normForCount(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function normWords(s: string): string[] {
  return normForCount(s).split(" ").filter(Boolean);
}

// Count occurrences of each normalized value in the array.
function countByNorm(values: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) {
    const k = normForCount(v);
    if (!k) continue;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

// Hook clustering (Q1: trigram >= 0.85 over first sentence).
// Returns parallel array: clusterSize[i] = number of ads sharing this ad's hook cluster.
function clusterHooks(bodies: string[]): number[] {
  const firstSentences = bodies.map(extractFirstSentence);
  const tris = firstSentences.map(trigrams);
  const n = bodies.length;
  const cluster: number[] = new Array(n).fill(0);
  const visited = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    if (tris[i].size === 0) {
      cluster[i] = 1;
      visited[i] = true;
      continue;
    }
    const members: number[] = [i];
    visited[i] = true;
    for (let j = i + 1; j < n; j++) {
      if (visited[j]) continue;
      if (tris[j].size === 0) continue;
      if (jaccard(tris[i], tris[j]) >= HOOK_TRIGRAM_THRESHOLD) {
        members.push(j);
        visited[j] = true;
      }
    }
    for (const m of members) cluster[m] = members.length;
  }
  return cluster;
}

function extractFirstSentence(text: string): string {
  const norm = text.replace(/\s+/g, " ").trim();
  const m = norm.match(/^[^.!?\n]+/);
  return (m ? m[0] : norm).trim();
}

function trigrams(s: string): Set<string> {
  const norm = normForCount(s);
  const out = new Set<string>();
  if (norm.length < 3) return out;
  for (let i = 0; i <= norm.length - 3; i++) out.add(norm.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
