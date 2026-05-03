# 14 — Andromeda + 2025–2026 Platform Changes

Mandatory read before producing any report. The Meta platform of 2026 is materially different from the platform of 2023.

## Andromeda (October 2025) — the dominant 2026 lever

What it is: Meta's new AI retrieval engine. It evaluates **10,000× more ad variants** in parallel than the prior system but **clusters semantically similar creatives** and surfaces the cluster's strongest. The implications:

1. **Creative diversity at the *concept* level is the #1 performance lever** — outranks audience targeting, bidding, and budget structure.
2. **100 minor variations of one ad are functionally one ad** for retrieval scoring.
3. **Creative Similarity Score >60% across an ad set triggers retrieval suppression** — the cluster gets less serving.
4. Research findings: 25 *diverse* creatives = 17% more conversions at 16% lower cost compared to 25 minor variations of the same concept.
5. **Creative lifespan compressed to 2–4 weeks** (was 6–8 weeks pre-Andromeda).

What this means for the audit:
- The concept-count finding is *almost always present* (most brands have <5 distinct concepts).
- The "100 variants of one concept" anti-pattern is the most-common Andromeda issue.
- "Refresh every 6 weeks" advice from older agencies is now wrong by 2× — it should be every 2–3 weeks at higher spend brackets.

## Attribution-window removal (January 2026)

- **7-day view-through** and **28-day view-through** windows were **removed** in January 2026.
- Default is now **7-day click + 1-day view (7DC1DV)**.
- Available options: 1-day click, 7-day click, 1-day click + 1-day view, 7-day click + 1-day view.
- View-through windows ≥1 day are no longer offered for new ad sets in some objectives.

What this means for the audit:
- Don't reference removed windows.
- If the brand's site has copy comparing past-period vs. recent ROAS, the gap may be the attribution change, not performance — but you can't see this from public data, so don't speculate.

## Detailed targeting exclusions removal (final phase Jan 15, 2026)

- Phased out from new ad sets March 31, 2025
- Phased out from boosted posts June 10, 2025
- Existing campaigns with old exclusions stopped delivering January 15, 2026
- Meta cited 22.6% lower median cost per conversion *without* exclusions

What this means for the audit:
- "Add audience exclusions" is dead advice — don't recommend.
- Audience-shaping moves to creative ("creative-led targeting").

## Special Ad Category — Financial Products (January 2025)

Financial products joined Housing/Employment/Credit as a Special Ad Category. Standard targeting (age, ZIP, Lookalikes, detailed) is no longer permitted for these categories.

If the brand is in finance/insurance/lending/crypto and isn't running with the category declared, that's a Critical structural finding.

## Offline Conversions API discontinued (May 2025)

Replaced by CAPI with `action_source = "physical_store"`. Don't recommend OCA. (You won't see this from public data anyway, but if the brand's website mentions it on a tech-stack or careers page, that's a tell.)

## "Link clicks" redefinition (Feb 2025)

Meta redefined "link clicks" to **exclude social engagement clicks** (likes, comments, shares). Brands comparing pre-Feb-2025 and post-Feb-2025 CTR see apparent drops — that's a metric change, not a performance one.

What this means: don't talk about "CTR drops" in the report at all. You can't see CTR; even if you could, the metric definition has changed.

## Meta Shops native checkout phase-out (Jun–Aug 2025)

Native in-app checkout was phased out; all checkout flows now redirect to advertiser website.

What this means: if the brand's IG bio still says "Shop now in-app", that's outdated — minor finding.

## Andromeda + Advantage+ Sales (renamed from ASC, Feb 2025)

- Advantage+ Shopping → Advantage+ Sales
- Existing-customer budget cap eliminated Feb 2025
- Performance: 22% higher ROAS, 11.7% CPA improvement vs. manual prospecting (per Meta)

If the brand isn't running Advantage+ Sales (you can sometimes infer this from ad-set naming patterns visible in the Ad Library), that's a structural finding for any e-com brand spending >$500/day implied.

## Flexible Ads (mid-2024)

A format that auto-tests up to 10 images/videos per ad set. Meta optimizes per placement. If the brand has >50 ads, half could probably be consolidated into Flexible Ads, freeing the operator from running variant tests manually.

## Meta Incremental Attribution (April 2025)

AI-powered holdout testing for measuring real causal lift. Available for accounts >$5K/month. If the brand's likely budget supports it (>$5K/month implied), and you don't see signs they're using it, *don't* surface this as a public-audit finding — it's a sales-call beat.

## Threads placement (GA Jan 2026)

Threads went GA as an ad placement in January 2026. ~400M MAU, but ~0.04% of ad spend in Q3 2025. Lower CPMs but small share. Worth a brief mention in the "what's next" section if the brand seems exploration-friendly.

## Privacy Sandbox is dead (October 2025)

Google retired Privacy Sandbox; third-party cookies remain in Chrome (~67% browser share). Safari and Firefox already block them.

What this means: post-iOS-14 reality is durable — CAPI is still essential (account-side), and modeled conversions still inflate Meta-reported numbers vs. true platform numbers by typically 20–40%.

## Consent Mode v2 (mandatory for EU/EEA, tightened Jul 2025)

Required for EU/EEA traffic. Without proper implementation: 90–95% metric drops; with Advanced Mode: 30–50% recovery. ~31% global cookie acceptance rate.

## US state privacy (20 active state laws by Jan 2026)

CA / TX / VA / CO / etc. State-level enforcement actions are real (TX AG: $1.4B settlement). For most US-only brands this matters less *for the audit* — but in the "what's next" section, if the brand has weak privacy infra (no CCPA Do-Not-Sell link visible), it's a small finding.

## Summary table — what to flag, what to skip

| Topic | In the report? |
|---|---|
| Andromeda diversity | Almost always YES (most brands have <5 concepts) |
| Attribution removal | Footnote only when relevant to a benchmark |
| Detailed-targeting exclusions removal | Don't recommend exclusions; don't dwell |
| Special Ad Category misclassification | YES, as Critical, when applicable (finance / housing / employment / credit) |
| OCA discontinued | NO (private-data only) |
| Link clicks redefinition | NO (private metric) |
| Meta Shops checkout phase-out | Minor finding if they say "shop in-app" on site |
| Adv+ Sales not used | YES if implied spend justifies, structural finding |
| Flexible Ads not used | NO unless very obvious from ad-set patterns |
| Incremental Attribution | NO (sales-call beat) |
| Threads placement | "What's next" optional mention |
| Privacy Sandbox | Background context only |
| Consent Mode v2 (EU) | YES if brand has EU traffic and visible LP issues |
| US state privacy | YES if visible LP gap (no Do-Not-Sell link in CA-targeted ads) |
