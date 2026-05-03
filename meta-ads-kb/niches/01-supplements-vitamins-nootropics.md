# 01 — Supplements / Vitamins / Nootropics

Meta allows supplements but enforcement is one of the strictest niches in 2026.

## Hard policy lines

Banned phrases (immediate disapproval risk):
- "Lose [N] pounds in [N] days"
- "Cure / treat / heal [condition]"
- "Doctors hate this trick"
- "Guaranteed [outcome]"
- "FDA approved" (supplements aren't approved; they're regulated)
- "Boosts immune system" — depends on context; "supports immune health" is the safe rewrite
- "Reverses aging"
- "Burn fat while you sleep"

Restricted (delivery suppression even when not disapproved):
- Personal-attribute prompts: "Are you tired all the time?"
- Body-image prompts: "Hate how you look?"
- Income-style claims: "Save 30% on doctor visits"
- Shaming competitors / ingredients: "Other brands use [bad ingredient]"

## Targeting & creative restrictions

- Must target 18+
- No before/after imagery for weight loss supplements (allowed for some skincare-supplement crossovers, but high-risk)
- Body-part-focused imagery that implies shame is banned ("look at your stomach!" overlays = banned)
- No targeting users based on health conditions (Meta removed those interest categories years ago, but brands still imply targeting via copy)

## Landing-page checks (mandatory)

| Element | Required? |
|---|---|
| Supplement Facts panel | Yes |
| FDA disclaimer ("These statements have not been evaluated…") | Yes |
| Allergen warnings | If applicable |
| Manufacturing certifications (NSF, GMP, USP) | Recommended |
| "Consult your physician if pregnant/nursing/medication" | Yes |
| Refund policy | Yes (Meta requires) |
| Studies / citations | Optional but raises trust |

A supplements LP missing the FDA disclaimer is a Critical compliance finding.

## Public-scraping red flags (what to flag in the cold-audit report)

Read each ad and look for:

| Red flag in copy | Severity | Report wording |
|---|---|---|
| Specific weight-loss number | Critical | "`Lose 14 lbs in 30 days` — direct policy violation; this ad will be disapproved at scale and risks account-level review." |
| Personal-attribute prompt | High | "`Tired of being bloated all day?` is a personal-attribute prompt — Meta soft-throttles delivery." |
| Implied medical claim | High | "`Eliminates joint pain` — implied medical claim. Compliant rewrite: `Supports joint comfort`." |
| Doctor / authority misuse | High | "`Recommended by doctors` without a named, citable doctor is a takedown trigger." |
| Income / cost-saving claim | Medium | "`Save $300 on supplements you don't need` — Meta treats cost-saving claims like income claims in this niche." |
| Before/after | Critical | Quote the visual; recommend removal. |
| Missing FDA disclaimer on LP | Critical | "Your LP at `<url>` is missing the FDA disclaimer required for supplement claims." |
| Banned ingredient mentions (e.g., GLP-1 mimicry, kratom, ephedra) | Critical | Specific to the ingredient. |

## Niche-specific creative norms that work

✅ What works in 2026:
- Ingredient-led copy ("ashwagandha at clinically-studied doses")
- Founder/maker stories (small-brand authenticity)
- Mechanism-of-action explainers (60–90s video)
- UGC reviews (real customer, no script)
- Comparison to traditional alternatives ("vs. melatonin", "vs. coffee") — when factually true
- Pre/post-workout context (creatine, electrolytes — performance angle, not body-image)

❌ What doesn't work / gets killed:
- Stock "doctor in lab coat" imagery (delivery-suppressed)
- Overlay text with weight-loss numbers
- Stigmatizing language ("don't be that person who…")
- Direct-medical-condition copy

## Hook patterns that pass policy and convert

- Mechanism-led: "Magnesium glycinate vs. citrate — why it matters at 11pm."
- Ingredient claim with citation: "Ashwagandha at the dose used in [year] [journal] study."
- Founder confession: "I started this because doctors couldn't tell me why I was tired."
- Comparison: "If you take a multivitamin and still feel tired, here's the gap."

## Sample-report wording template

> **Compliance — Supplements ($vertical-specific)**
> Three of your active ads use language that historically triggers Meta's enforcement on supplement advertising:
> - Ad `<id>`: `<verbatim quote>` — implied medical claim. Compliant alt: `<rewrite>`.
> - Ad `<id>`: `<verbatim quote>` — personal-attribute prompt. Compliant alt: `<rewrite>`.
> - Your LP at `<url>` is missing the FDA "These statements have not been evaluated…" disclaimer required when a supplement claim appears on the same page as a CTA.

## Sources

- Meta Health & Wellness policy: https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness/
- Meta personal-health help: https://www.facebook.com/business/help/2489235377779939
- 2026 Health & Wellness rules guide (Audit Socials): https://www.auditsocials.com/blog/meta-health-wellness-restricted-ads-2026-supplements-body-image-medical-claim-rules
- Forge Digital — supplement compliance 2026: https://forgedigitalmarketing.com/how-to-advertise-supplements-on-meta/
