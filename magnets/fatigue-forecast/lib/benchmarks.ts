// Static industry benchmarks extracted from meta-ads-kb/08-benchmarks-public-data.md
// and meta-ads-kb/14-andromeda-and-platform-changes.md.
// Update both files together — see meta-ads-kb/USAGE.md.

export type NicheKey =
  | "apparel"
  | "beauty"
  | "home"
  | "supplements"
  | "pet"
  | "kids"
  | "cbd"
  | "health"
  | "generic";

export type Benchmark = {
  niche: NicheKey;
  cpm_low: number;
  cpm_high: number;
  // Cross-vertical defaults
  ecom_cpm_median: 12.79;
  ecom_roas_median: 2.19;
  ecom_roas_advantage_plus: 4.52;
  ecom_roas_retargeting: 3.61;
  ecom_cpa_median: 23.74;
  // Andromeda thresholds
  concept_count_critical: 2;
  concept_count_poor: 4;
  concept_count_acceptable: 7;
  concept_count_good: 12;
};

const PER_NICHE_CPM: Record<NicheKey, [number, number]> = {
  apparel: [9, 14],
  beauty: [10, 15],
  home: [11, 16],
  supplements: [12, 18],
  pet: [10, 15],
  kids: [10, 15],
  cbd: [12, 18],
  health: [12, 18],
  generic: [10, 16],
};

const NICHE_MATCH: Array<{ keywords: string[]; key: NicheKey }> = [
  { keywords: ["apparel", "fashion", "streetwear", "outerwear", "womenswear", "menswear", "modest", "activewear", "denim"], key: "apparel" },
  { keywords: ["beauty", "skincare", "cosmetic", "makeup", "fragrance", "perfume", "haircare"], key: "beauty" },
  { keywords: ["home", "furniture", "decor", "kitchen", "bedding"], key: "home" },
  { keywords: ["supplement", "vitamin", "nootropic", "protein"], key: "supplements" },
  { keywords: ["pet", "dog", "cat"], key: "pet" },
  { keywords: ["kid", "baby", "toddler", "nursery"], key: "kids" },
  { keywords: ["cbd", "hemp", "cannabis"], key: "cbd" },
  { keywords: ["health", "medical", "wellness"], key: "health" },
];

export function classifyNiche(rawNiche: string): NicheKey {
  const n = rawNiche.toLowerCase();
  for (const { keywords, key } of NICHE_MATCH) {
    if (keywords.some((k) => n.includes(k))) return key;
  }
  return "generic";
}

export function getBenchmark(rawNiche: string): Benchmark {
  const niche = classifyNiche(rawNiche);
  const [cpm_low, cpm_high] = PER_NICHE_CPM[niche];
  return {
    niche,
    cpm_low,
    cpm_high,
    ecom_cpm_median: 12.79,
    ecom_roas_median: 2.19,
    ecom_roas_advantage_plus: 4.52,
    ecom_roas_retargeting: 3.61,
    ecom_cpa_median: 23.74,
    concept_count_critical: 2,
    concept_count_poor: 4,
    concept_count_acceptable: 7,
    concept_count_good: 12,
  };
}

// Q4 inflation multipliers vs September baseline.
// Returns the multiplier for today's date; 1.0 means no inflation.
export function q4InflationMultiplier(today: Date = new Date()): {
  multiplier: number;
  label: string;
  in_q4: boolean;
} {
  const m = today.getUTCMonth(); // 0 = Jan
  const d = today.getUTCDate();
  if (m === 9) return { multiplier: 1.3, label: "October (1.20–1.40× September baseline)", in_q4: true };
  if (m === 10 && d <= 20) return { multiplier: 1.4, label: "November pre-BFCM (1.30–1.50×)", in_q4: true };
  if ((m === 10 && d >= 21) || (m === 11 && d <= 5)) return { multiplier: 1.8, label: "Black Friday / Cyber Week (1.60–2.00×)", in_q4: true };
  if (m === 11 && d <= 20) return { multiplier: 1.4, label: "Mid-December (1.30–1.50×)", in_q4: true };
  if (m === 11 && d >= 26) return { multiplier: 0.95, label: "Late December (0.85–1.05×)", in_q4: true };
  if (m === 0) return { multiplier: 0.78, label: "Post-holiday January (0.70–0.85×)", in_q4: false };
  return { multiplier: 1.0, label: "Off-peak baseline", in_q4: false };
}
