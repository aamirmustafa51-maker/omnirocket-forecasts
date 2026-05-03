# 01 — Scope and Cardinal Rules

This is the most important file. Re-read it before every run.

## What you have

| Source | What you get |
|---|---|
| Apify Meta Ad Library scrape | Every currently-running ad (FB + IG): primary text, headline, description, CTA, creative URL (image or video), landing URL, first-seen / last-seen dates, platforms placed, page id |
| Brand website (homepage + top LPs + product pages) | Headlines, offers, copy, trust signals, form structure, page weight (proxy), mobile responsiveness (proxy) |
| Instagram | Bio, post cadence, comment count on recent posts, account age |
| Operator-provided | Niche, country, optional AOV bracket, optional offer details |

## What you do **not** have

You will be tempted to imply otherwise. Do not.

| Metric | Have? | Say what instead |
|---|---|---|
| Impressions | ❌ | "Estimated reach: based on number of distinct creatives × days running, this campaign has had time to fatigue / not yet" |
| CTR | ❌ | "Hook-rate proxy: first 3 seconds of video lacks pattern interrupt" |
| CPM | ❌ | "Q4 inflation typically pushes CPM 60–100% above September baseline — see 08" |
| CPC | ❌ | Don't estimate. Don't even mention. |
| ROAS | ❌ | "Break-even ROAS for your AOV/margin is X" — only if AOV+margin provided. Otherwise omit. |
| Frequency | ❌ | "Days since first-seen × number of distinct concepts is your fatigue exposure proxy" |
| Spend | ❌ | EU public Ad Library shows spend ranges for *political/social* ads only — not e-com. Don't claim spend numbers. |
| Audience | ❌ | "Your ad copy implies the buyer persona is X" — describe; don't quantify. |
| EMQ / Pixel health | ❌ | Skip Pixel/CAPI sections entirely in the lead-magnet report. They become talking points on the call. |
| Conversion-rate by ad / LP | ❌ | Heuristic-only ("LP form has 7 fields — research shows ≤3 fields lift CVR 10–20%") |

## Cardinal rules

### Rule 1 — Never claim a metric you can't measure

❌ "Your CTR on the hero ad is dropping ~12% week-over-week."
✅ "The hero ad has been running unchanged for 47 days with the same headline. At your spend velocity, hero creatives in beauty typically need refresh every 14–21 days under Andromeda."

### Rule 2 — Every finding has a name attached

❌ "Some headlines are weak."
✅ "The headline `Discover Your Best Self` (ad first seen 2026-03-19) is generic — no specificity, no benefit, no proof. Compare to your IG-ad headline `From frizzy to glass-hair in one shower`, which lands a transformation."

### Rule 3 — Niche-aware *before* generic

Run the niche policy file. The general "no personal-attribute targeting" rule means very different things for a supplements brand vs. an apparel brand. See `niches/`.

### Rule 4 — Public-data leverage > private-data theatre

Your competitive advantage in the cold-email is that you can tell them things their agency hasn't, *without* needing access. Lean into:
- Concept diversity (how many *distinct* angles vs. how many ads)
- Copy duplication across creatives
- Landing-page mismatch
- Niche-policy walking-the-line content
- Days-running for hero creatives
- Format mix (any 9:16? any video? any UGC-style?)
- Headline hook patterns vs. category benchmarks

### Rule 5 — Recommend the call, not the playbook

The point of the report is "you have a problem we can solve" — not "here is exactly how to solve it". Every finding ends with an *action shape* ("you need to refresh creative every 21 days at your scale") rather than the actual solution ("here's the prompt to generate it"). The actual solutions live behind the sales call.

### Rule 6 — Never mention the brand by name in a way that would embarrass them

Treat the report like the ICP version of "your annual physical." Tone is concerned senior practitioner, not a hot take. No screenshots cropped to look bad. No bolded snark. No "this is a disaster."

### Rule 7 — Always footnote 2025–2026 context

If you cite a "best practice" that was true in 2023 but is dead in 2026 (e.g., "narrow targeting", "creative refresh every 6 weeks", "before/after weight-loss imagery"), you lose credibility. Read `14-andromeda-and-platform-changes.md` and apply.

### Rule 8 — Stop before fabricating

If you cannot find evidence for a finding in the public data, **delete it from the report**. A short report with 6 sharp findings beats a long one with 14 padded ones. The QA gate in `09-scoring-rubric.md` enforces this.

## What "passes the bar" looks like

A passing finding has:
1. **A name** — specific ad / page / quote
2. **A signal** — what you actually saw
3. **A heuristic** — the rule from this KB it violates
4. **A consequence** — what this costs the brand (in shape, not in dollars unless AOV+margin given)
5. **An action shape** — what kind of fix is needed (refresh, restructure, replace, certify, etc.)

Example:
> **Hero static is 47 days old.** "From dull to dewy in 7 days" (ad id 23857...) has been running unchanged since 2026-03-19. Under Andromeda's 2025 retrieval clustering, beauty creatives in your spend bracket need fresh *concepts* every 14–21 days — not minor edits. Continuing this ad past day 30 typically means rising CPM and falling CTR, even when the underlying offer still converts. Action: ship a fresh concept (different visual hook, different angle), not a re-cut of the same one.
