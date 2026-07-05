// Canonical Brand Playbook data contract. Shared by the generator, the webhook
// route, and the page template so all three agree on shape. Deterministic
// fields (products_ladder prices, brand_domain) are filled in code; the
// interpretive fields are written by Claude, each anchored to scraped evidence.

export type VoicePillar = { name: string; desc: string; quote: string };

export type Persona = { name: string; description: string };

export type LadderItem = { title: string; role: string; price: number | null };

export type AllowedClaim = { claim: string; source: string };
export type BannedClaim = { claim: string; why: string };

export type BrandDNA = {
  category: string;
  core_belief: string;
  proof_points: string[];
  positioning: string;
};

export type CustomerLanguage = {
  phrases: string[]; // verbatim customer quotes to echo in ads
  words: string[]; // single words / short terms that resonate
  avoid: string[]; // words to steer away from
};

export type PlaybookData = {
  lead_company: string;
  lead_first_name: string;
  website: string;
  brand_domain: string;
  currency: string;
  review_count: number;
  brand_dna: BrandDNA;
  voice_pillars: VoicePillar[];
  customer_language: CustomerLanguage;
  icp: string;
  personas: Persona[];
  products_ladder: LadderItem[];
  offers: string[];
  claims: { allowed: AllowedClaim[]; banned: BannedClaim[] };
  generated_at: string;
};

// The subset Claude is asked to produce (everything except the deterministic
// products_ladder, which the generator injects from real catalog data).
export type PlaybookCopy = Omit<
  PlaybookData,
  | "lead_company" | "lead_first_name" | "website" | "brand_domain"
  | "currency" | "review_count" | "products_ladder" | "generated_at"
>;
