# 09 — Beauty / Skincare / Cosmetics

Allowed but health-claim-adjacent. The line between "cosmetic claim" and "drug claim" is the most-violated boundary.

## The cosmetic vs. drug claim line (US FTC + Meta enforcement)

✅ Cosmetic claim — allowed:
- "Brightens" / "evens skin tone"
- "Reduces appearance of fine lines"
- "Hydrates" / "moisturizes"
- "Improves skin texture"
- "Visibly firms"

❌ Drug claim — banned (changes biological function):
- "Treats / cures / heals"
- "Stops aging" / "reverses aging"
- "Eliminates wrinkles"
- "Fixes acne"
- "Restores collagen production" (without clinical evidence + drug-claim filing)
- "Treats rosacea / eczema / psoriasis"

This is the single most-common policy violation in beauty.

## Time-promise traps

Meta scrutinizes "by [time]" promises:
- ✅ "Results in 4–6 weeks of consistent use" (realistic + cosmetic)
- ⚠️ "Results in 7 days" (often flagged as unrealistic)
- ❌ "Instant relief" / "overnight transformation" / "results in 24 hours"

## Personal-attribute imagery

Imagery showing close-ups of skin "problems" (acne, wrinkles, dark spots) framed as a problem to fix can trigger personal-attribute review.

✅ Safer: ingredient close-ups, texture / formulation shots, lifestyle.
❌ Riskier: close-up of a "before" face problem with text overlay.

## Before / after — special rules

- Before/after on skincare is **allowed** if realistic (no extreme contrast / lighting changes / makeup tricks)
- Before/after on cosmetic procedures (med spa, plastic surgery, cosmetic dentistry) is heavily restricted
- Cosmetic procedures have separate Meta rules — most procedure ads are heavily flagged

## Banned phrases (skincare / cosmetics)

❌ Always disapproved-prone:
- "Cure / treat / heal"
- "Reverse aging" / "stop aging" / "anti-aging cure"
- "Eliminate wrinkles / acne / scars"
- "Medical-grade results"
- "Doctor-formulated [for X condition]" (when the brand isn't medical-licensed)
- "Better than Botox" (comparing to Rx claims)
- "Plump / fill / lift" (often flagged in injectable-adjacent context)

## Targeting

- 18+ (mandatory for cosmetic procedures, recommended elsewhere)
- 2025–2026 trend: avoid age-targeting that implies the user is "old" or "young" — that's getting flagged as personal-attribute
- Removal of detailed-targeting exclusions (Jan 2026) — exclusions architecture is dead

## Public-scraping red flags

| Red flag | Severity |
|---|---|
| Drug-claim phrasing in copy | Critical |
| Time-promise <30 days for skincare | High |
| Close-up of skin "problem" imagery as "before" | Medium-High |
| "Doctor formulated" without named, credentialed doctor | High |
| "Reverse aging" / "stop aging" framing | Critical |
| Cosmetic-procedure ad with before/after | High |
| Comparison to medical Rx ("better than [drug name]") | Critical |
| Personal-attribute prompts ("Hate your wrinkles?") | High |

## Landing-page checks

| Element | Required? |
|---|---|
| Ingredient list (INCI on cosmetics; full-disclosure on skincare) | Yes |
| Allergen / sensitivity disclosures | Yes (recommended) |
| Patch-test guidance | Yes (recommended) |
| Cruelty-free / vegan / clean-beauty certifications (if claimed) | Match what's claimed |
| FDA disclaimer for OTC drug claims | Yes (if making any drug-adjacent claim) |
| "Results may vary" / "consult dermatologist" | Yes (for active-ingredient products) |

## Creative norms that work

- Ingredient-led content (15-second explainers on actives)
- Texture / formulation shots (cream, serum, oil — beauty-aesthetic)
- Founder / chemist storytelling
- Before/after (when honest, realistic, and lifestyle-allowed)
- UGC reviews from real customers
- Routine / "your skincare order" educational content
- Skin-type segmentation ("if you have oily skin") — this is allowed; it's *describing the product*, not the user
- Comparison to alternatives (when factually true)

## What doesn't work / gets killed

- "Botox in a bottle"
- "Reverse aging" copy
- Anti-wrinkle "cures"
- Stock dermatologist imagery without named credentials
- Influencer content with unsubstantiated effect claims
- Aggressive "your skin is ruined" framing

## Sample-report wording template

> **Compliance — Beauty / Skincare**
> Three creative-claim issues:
> - Ad `<id>` headline `Reverse aging in 14 days` is a drug-claim phrasing under FDA cosmetic guidance and triggers Meta's strictest review. Compliant rewrite: `Visibly firmer skin in 4–6 weeks of consistent use.`
> - Ad `<id>` claims `Doctor-formulated` without naming the doctor — the brand needs to attach the credentialing dermatologist's name + credentials, or remove the claim.
> - Two ads in the active set use a "before" photo with text overlay calling out the user's skin problem — that's a personal-attribute prompt and depresses delivery even when the ad isn't formally disapproved.

## Sources

- Meta Health & Wellness: https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness/
- Meta personal health: https://www.facebook.com/business/help/2489235377779939
- AdAmigo — unapproved health claims: https://www.adamigo.ai/blog/meta-ads-policy-unapproved-health-claims-explained
- Meta cosmetic-procedures guide (Pracxcel): https://pracxcel.com/meta-ads-compliance-for-cosmetic-medicine-advertising-aesthetic-procedures-without-policy-violations/
- FTC cosmetic vs. drug claim guidance: https://www.fda.gov/cosmetics/cosmetics-laws-regulations/it-cosmetic-drug-or-both-or-it-soap
