# 11 — Home Goods / Furniture / Decor

Permissive vertical. Most issues are creative-architecture, not policy.

## Hard rules

❌ Banned:
- Counterfeit furniture (cheap-replica framing)
- "Made in USA" / "Solid wood" / "100% real leather" claims that aren't true (FTC enforcement)
- Aggressive price-comparison to specific competitors with stale data
- Drop-ship logos lifted from manufacturer images without rights

⚠️ Restricted:
- "Lifetime warranty" / "lifetime guarantee" — needs substantiation
- "Free assembly" / "free delivery" — region-specific shipping policy
- Imagery showing dangerous / unsafe assembly or use

✅ Allowed:
- Most furniture / decor / kitchen ads
- Lifestyle imagery / room-styling
- Comparison to "outdated alternatives"
- Subscription / refresh-cycle framing

## FTC concerns (US)

- "Made in USA" — must be "all or virtually all" US-made
- "Genuine leather" / "solid wood" — must be true
- "$X off" — needs a real reference price
- "MSRP" claims must reflect a genuine price somewhere

## Public-scraping red flags

| Red flag | Severity |
|---|---|
| "Up to 70% off" without showing the basis | Medium |
| "Made in USA" claim on a clearly drop-shipped item | High (FTC, then Meta) |
| Stock manufacturer photos used without attribution / rights | Medium (copyright) |
| Aggressive scarcity ("only 3 left!") on infinite-stock item | Medium |
| "Lifetime warranty" with no warranty page | Medium |
| Faux luxury framing ("looks like Restoration Hardware") | Medium-High (counterfeit-adjacent) |

## Landing-page checks

| Element | Required for |
|---|---|
| Dimensions (W × D × H, in clear units) | All furniture |
| Materials list (specific, not "premium") | All |
| Weight capacity (chairs, beds, shelving) | All applicable |
| Shipping / delivery time | All (US: large furniture often 4–8 weeks) |
| Assembly required / not | All |
| Returns policy (large items: clear restocking fees) | All |
| Warranty page | If claimed |
| Country of origin | "Made in" claims |
| Sustainability certs | If claimed (FSC, GreenGuard, etc.) |

## Creative norms that work

- Room-styled lifestyle imagery (the product *in context*)
- Time-lapse assembly / unboxing (10–30s video)
- "How it ships" / "how it fits" mechanism content (modular / flat-pack brands)
- Founder / craft storytelling for premium brands
- Comparison vs. mainstream alternatives (price + quality on premium brands)
- Bundle / room-set framing
- Designer collaboration / endorsement (with rights)
- 360° product video
- "Day in the life" with the product

## What doesn't work / gets killed

- Pure white-background catalog shots in feed (low engagement)
- Aggressive scarcity / countdown overlays
- Drop-ship imagery from supplier — Meta's image-hash detection clusters these as duplicates of competing brands
- "Bestseller" / "top pick" without basis (US FTC tightening)
- Generic stock-photo lifestyle (human-detection algorithms penalize stock)

## Drop-ship-specific (large segment of this niche)

If you can detect the brand is a drop-shipper (the Apify ad's image perceptual-hash matches multiple unrelated brands' ads), call it out with diplomacy:

> Two of your hero images appear to be supplier stock photography also used by N other brands we've audited recently. Meta's Andromeda clustering treats these as effectively duplicate creative, suppressing all of them. The fix: even if the product is sourced, the imagery shouldn't be — original lifestyle photography (room-styled, 1–3 hour shoots) wins this category.

## Sample-report wording template

> **Compliance — Home Goods**
> One creative-architecture issue and one FTC issue:
> - Five of your eight active ads are white-background product shots. The home-goods category rewards lifestyle / room-styled imagery — Meta's relevance scoring weights product-in-context over isolated-product when the buyer's mental model is "how will this look in my space."
> - Three ads include the phrase `Made in USA` on a product whose materials list shows `Sourced internationally; assembled in [state]` — FTC's "all or virtually all" standard means the Made-in-USA claim is non-compliant; assembled-in-[state] is the safe alternative.

## Sources

- FTC Made-in-USA: https://www.ftc.gov/business-guidance/blog/2021/07/made-usa-final-rule-its-here
- Meta Counterfeit policy: https://transparency.meta.com/policies/ad-standards/products-services/counterfeit/
