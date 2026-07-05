// Category -> ad-compliance rules, injected into the Brand Playbook prompt so
// the "banned claims" section is grounded in real regulation (FTC Green Guides,
// FDA structure/function limits, cosmetic-vs-drug lines) rather than
// hallucinated. Detection is a lightweight keyword match against the store's
// product types + homepage text; falls back to a general FTC-substantiation
// baseline that applies to every ecom brand.

export type ClaimCategory =
  | "supplements"
  | "beauty"
  | "food_bev"
  | "apparel"
  | "general";

type Rule = { label: string; rules: string };

const RULES: Record<ClaimCategory, Rule> = {
  supplements: {
    label: "Supplements / wellness",
    rules: [
      "Regulated as dietary supplements. Structure/function claims are OK (e.g. 'supports focus', 'promotes calm') but MUST avoid disease claims.",
      "BANNED: any claim to treat, cure, prevent, or diagnose a disease or condition (e.g. 'cures anxiety', 'treats insomnia', 'lowers blood pressure').",
      "BANNED: guaranteed results, specific timelines to a health outcome, or 'clinically proven' without a cited study.",
      "Testimonials that imply a disease benefit are treated as disease claims.",
    ].join(" "),
  },
  beauty: {
    label: "Beauty / skincare / cosmetics",
    rules: [
      "Cosmetics may claim to cleanse, beautify, moisturize, or improve appearance. They may NOT claim to alter structure or function of the body (that makes it an unapproved drug).",
      "BANNED: 'anti-aging' framed as reversing aging, 'repairs/heals skin', 'treats acne/eczema/rosacea', 'boosts collagen production', 'clinically proven' without a study.",
      "Prefer appearance language: 'looks firmer', 'appears brighter', 'feels smoother'.",
    ].join(" "),
  },
  food_bev: {
    label: "Food & beverage",
    rules: [
      "Health claims are tightly limited. BANNED: disease-treatment claims, unqualified 'detox', 'boosts immunity', 'burns fat'.",
      "Nutrient-content claims ('low sugar', 'high protein') must match the actual label. 'Natural' and 'clean' are vague and risky as headline claims.",
    ].join(" "),
  },
  apparel: {
    label: "Apparel / footwear / accessories",
    rules: [
      "Lowest medical risk, but sustainability claims are heavily policed by the FTC Green Guides.",
      "BANNED: unqualified 'sustainable', 'eco-friendly', 'zero impact', '100% recycled', or 'carbon neutral' without specific, verifiable backing.",
      "BANNED: medical/orthopedic claims ('relieves foot pain', 'corrects posture', 'fixes plantar fasciitis').",
      "Prefer specific, provable statements ('made with X% recycled polyester', 'carbon footprint labeled').",
    ].join(" "),
  },
  general: {
    label: "General ecommerce",
    rules: [
      "FTC substantiation applies: every objective claim must be truthful and provable.",
      "BANNED: unqualified superlatives ('the best in the world', '#1'), fake urgency, invented review counts or endorsements, guaranteed results.",
      "Testimonials must reflect typical results, not cherry-picked outliers.",
    ].join(" "),
  },
};

const CATEGORY_KEYWORDS: Array<{ cat: ClaimCategory; re: RegExp }> = [
  { cat: "supplements", re: /supplement|gummies|vitamin|capsule|nootropic|probiotic|collagen|adaptogen|wellness|tincture|mushroom/i },
  { cat: "beauty", re: /skincare|serum|moisturizer|cosmetic|makeup|beauty|cream|cleanser|lotion|hair care|fragrance/i },
  { cat: "food_bev", re: /coffee|tea|snack|beverage|drink|protein|food|chocolate|sauce|granola|bar\b/i },
  { cat: "apparel", re: /apparel|clothing|footwear|shoe|sneaker|dress|jacket|denim|activewear|swimwear|accessor|bag|jewelry|fashion/i },
];

export function detectClaimCategory(signal: string): ClaimCategory {
  const s = signal.toLowerCase();
  for (const { cat, re } of CATEGORY_KEYWORDS) {
    if (re.test(s)) return cat;
  }
  return "general";
}

export function claimRulesFor(category: ClaimCategory): { label: string; rules: string } {
  return RULES[category];
}
