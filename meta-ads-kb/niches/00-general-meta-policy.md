# 00 — General Meta Ad Policy (applies to every niche)

These rules apply on top of any niche file. Re-read before flagging anything as a "policy" issue.

## The personal-attribute rule (most-violated)

Meta does not allow ad copy that **implies you know something personal about the viewer**. The line is:

✅ Allowed: describe the *offering*. "A diet plan with 50K members." "An anxiety tracker designed for shift workers."
❌ Not allowed: imply the *viewer's* attribute. "Are you struggling with weight?" "Do you suffer from anxiety?" "Tired of being overweight?"

This is a delivery-suppression policy in addition to a takedown one — even when ads pass review, copy that sounds personal-attribute-ish gets soft-throttled.

How to flag in the report: quote the offending line verbatim and replace it with a compliant rewrite. Example:

> Ad `2381...` opens with `Tired of looking 10 years older?` That's a personal-attribute prompt and depresses delivery. A compliant rewrite is `A retinol that's gentle on skin under 35.`

## Sensational health / income claims

❌ Banned phrases (delivery-killers across niches):
- "Cures [condition]"
- "Eliminates [condition]"
- "Treats [medical condition]"
- "Guaranteed weight loss / income / results"
- "Lose [X] lbs in [Y] days"
- "Make $X in [time]"
- "Doctors hate this"

Even when the ad isn't disapproved, these phrases compress reach.

## Before / after imagery (key 2025–2026 update)

Meta heavily restricts before/after imagery for:
- Weight loss (banned for products / supplements; allowed for fitness *services* only)
- Cosmetic procedures
- Body-image transformations

Allowed:
- Skincare before/after where the "after" is realistic
- Hair (frizz to smooth, breakage to length)
- Home / pet / decor before/after (no body-image issue)

Always check the niche file for the brand's vertical before flagging or recommending before/after.

## Special Ad Categories (restricted-targeting categories)

If the brand is in any of these, **standard targeting is illegal** (no age targeting, no detailed-targeting layers, no Lookalikes, no ZIP):
- Housing
- Employment
- Credit
- **Financial Products** (added January 2025)

A finding worth raising: a brand in one of these categories running standard ads. You can spot it from the Ad Library — Special Ad Category status is sometimes shown, but more reliably you infer it from the *vertical* + lack of category disclosure. If you can't be sure, skip the finding (don't fabricate).

## Detailed targeting exclusions (removed)

As of Jan 15, 2026, **detailed targeting exclusions are gone** from all ad sets. Older campaigns using exclusions stopped delivering. If the brand's ad copy assumes audience exclusions ("Not for the casual gym-goer"), call out that the exclusion-based architecture is dead and the audience-shaping has to happen in creative.

## Andromeda, January 2026 attribution removal

Major Q1 2026 platform shifts to know:
- **Andromeda (Oct 2025):** clusters semantically similar ads; <5 distinct concepts is now a hard performance ceiling.
- **Attribution windows (Jan 2026):** 7-day and 28-day view-through windows were removed. Default is 7-day click + 1-day view (7DC1DV). Don't reference removed windows.
- **Offline Conversions API (May 2025):** discontinued. CAPI with `action_source="physical_store"` is the replacement. Don't recommend OCA.
- **Link clicks redefinition (Feb 2025):** "Link clicks" excludes social engagement clicks now. Brands comparing pre/post Feb 2025 see apparent CTR drops; that's a metric change, not a performance one.
- **Meta Shops native checkout phase-out (Jun–Aug 2025):** redirects to website now.
- **Detailed-targeting exclusions removed (Mar 2025 → fully Jan 2026):** see above.

If your finding rests on any of these, footnote the date.

## CTA-button policy

Meta's predefined CTAs are the only allowed ones. The CTA button can't be customized per ad text — it pulls from a fixed list. A brand that uses a CTA wildly mismatched to the ad's funnel position (e.g., "Apply Now" for a $19 candle) is making a structural mistake.

## Branded-content / influencer rules

If the brand uses paid partnerships, the "Paid Partnership with [Brand]" tag must appear. From public Ad Library you can see whether the tag is present. Missing tag on what's clearly an influencer ad is a policy issue (and a tax-disclosure issue in many regions).

## Disclosure / disclaimer requirements (cross-niche)

| Niche | Disclaimer needed |
|---|---|
| Supplements | "These statements have not been evaluated by the FDA…" (US) |
| CBD | "Not for use by pregnant or nursing women" + state-specific |
| Health-adjacent | "Not a substitute for professional medical advice" |
| Finance / loans | APR + fee + state-specific licensing |
| Crypto | "High risk of loss" + license disclosure |
| Alcohol | Age verification + drink-responsibly mark in some regions |

The audit reports missing disclaimers as compliance findings *only when* the niche file applies. Don't blanket-flag every site for missing FDA language — it's only relevant for supplements/health-adjacent.

## Sources

- Meta Advertising Standards: https://transparency.meta.com/policies/ad-standards/
- Restricted goods & services: https://transparency.meta.com/policies/ad-standards/restricted-goods-services/
- Personal health policy: https://www.facebook.com/business/help/2489235377779939
