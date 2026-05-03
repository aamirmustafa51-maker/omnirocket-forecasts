# 13 — Health / Medical-adjacent (telehealth, wellness, devices)

Heavily restricted. Telehealth and medical devices are own-category; wellness/self-care is the bigger gray zone.

## Sub-categories

| Sub-niche | Restriction level |
|---|---|
| Telehealth (Hims, Ro, Curology, etc.) | High (Special Ad Category-adjacent + medical claims) |
| Medical devices (CGMs, hearing aids, sleep masks) | High (FDA-cleared status matters) |
| Wellness / self-care (sleep, anxiety-reducing without claim) | Medium |
| Period / menstrual products | Medium (gender-targeting changes; tightened 2024–2026) |
| Mental wellness / meditation apps | Medium-High |
| Reproductive / fertility | High (region-specific enforcement) |
| Hair-loss treatment (Rx-adjacent) | High |

## Hard rules across the category

❌ Banned:
- "Cure / treat / heal [condition]" without FDA approval
- Personal-attribute prompts ("Are you depressed?")
- Custom audiences from health events (Meta tightened 2025)
- Targeting based on health condition
- Specific outcome promises ("get pregnant in 30 days")
- Lookalikes from health-condition users

⚠️ Restricted:
- Branded prescription drugs (own rules — DTC pharma in US has its own framework)
- Mental health framing (depression, anxiety) — must be supportive-tone, not promise-of-relief
- Reproductive / abortion / fertility (varies by region)
- "Doctor-recommended" without named credentialed doctors
- Gender-targeting around period products (changed 2024)

✅ Allowed (with care):
- Telehealth services with proper certifications + 18+ + region-restricted
- FDA-cleared device ads with the FDA-cleared statement visible
- Wellness ads with mechanism-led copy (no condition claim)
- Period products targeted at "all who menstruate" framing
- Mental wellness apps with supportive (not promise-of-cure) framing

## Public-scraping red flags

| Red flag | Severity |
|---|---|
| Personal-attribute prompts ("Are you anxious?") | Critical |
| "Cures / treats" in copy | Critical |
| Implied diagnosis ("you might have ADHD") | Critical |
| Hair-loss before/after | Critical |
| Reproductive copy in restricted regions | Critical |
| FDA-cleared claim without disclosure | High |
| "Doctor-recommended" without credentialed name | High |
| Influencer Rx promotion without paid-partnership tag | High |
| Gender-locked period-product targeting | High (2024 change) |

## Landing-page checks

| Element | Required for |
|---|---|
| FDA clearance / 510(k) reference | Medical devices |
| HSA/FSA-eligible disclosure | Devices, telehealth |
| Doctor / medical advisor credentialing | Telehealth, supplements |
| Risk disclosure | Rx-adjacent, fertility |
| Privacy / HIPAA notice | Telehealth, devices |
| Prescription requirements | Rx-adjacent |
| State-by-state availability | Telehealth |

## Creative norms that work

- Educational mechanism content
- Founder-as-patient story (powerful for telehealth)
- Doctor / expert with named credentials on screen
- Supportive (not promise-of-cure) framing for mental health
- "Talk to a [licensed professional]" CTA
- Privacy + simplicity messaging for telehealth
- FDA-cleared callouts (when accurate)
- Subscription / convenience framing

## What doesn't work / gets killed

- "Cures depression / anxiety / [condition]"
- Personal-attribute prompts
- Before/after for hair / weight / skin (in this category)
- Stock "white-coat doctor" imagery
- Aggressive emotional manipulation
- "Symptoms of [condition]?" listicle copy

## Sample-report wording template

> **Compliance — Health-adjacent**
> The category is the strictest non-finance vertical on Meta. Three issues:
> - Ad `<id>` opens `Are you struggling with chronic fatigue?` — direct personal-attribute prompt; this exact pattern is in Meta's most-flagged set for the health-adjacent category.
> - Ad `<id>` claims `Cures gut issues in 14 days` — drug-claim phrasing on a wellness product; this triggers takedown and (with repeated violations) account-level restriction.
> - Your LP at `<url>` features `Dr. Smith` as the medical advisor without naming credentials; Meta's review increasingly demands name + degree + license-state for medical authority claims.

## Sources

- Meta Health & Wellness: https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness/
- Meta personal health: https://www.facebook.com/business/help/2489235377779939
- FDA cosmetic vs. drug: https://www.fda.gov/cosmetics/cosmetics-laws-regulations/it-cosmetic-drug-or-both-or-it-soap
