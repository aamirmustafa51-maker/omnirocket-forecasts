# 13 — Anti-Patterns (cut these from the report)

A finding that hits any of these is bad. Cut, rewrite, or replace before the report ships.

## Anti-pattern 1 — Private-metric claims dressed up as public

❌ "Your CTR is dropping" — you can't see CTR.
❌ "Your CPM is too high" — same.
❌ "Your ROAS is below break-even" — only OK if AOV+margin were provided AND footnoted as estimated.
❌ "Frequency is ~4.5 on this ad" — you cannot see frequency.

✅ Replace with: days-running × spend-bracket, hook-rate-proxy, concept count, copy duplication.

## Anti-pattern 2 — Generic "this is bad" without a name

❌ "Some headlines are weak."
✅ "Headline `<verbatim ≤15 words>` (ad `<id>`) scores 1/5 on the rubric — generic, no number, no benefit, no hook."

## Anti-pattern 3 — Action that gives away the playbook

❌ "Replace your hero ad with this UGC concept: [exact prompt + copy]."
✅ "Ship a fresh concept in the next 14 days. The shape we'd take is a UGC-style review with a customer's hands on the product — happy to walk through the full angle on a call."

## Anti-pattern 4 — "We see you're losing $X / month"

❌ "You're losing approximately $4,200/month on this ad set."
You don't know.
✅ "Continuing this hero past day 30 typically means rising CPM and falling CTR even when the offer still converts; the cost shape is paid impressions burning on a creative the algorithm has stopped surfacing."

## Anti-pattern 5 — Snark or condescension

❌ "Your agency clearly doesn't know what they're doing."
❌ "Whoever wrote this copy didn't run it past anyone."
✅ Tone is *concerned senior practitioner.* No name-shaming, no implied expertise gap. "We see [pattern]. The 2025 reality is [rule]. The shape of the fix is [action shape]."

## Anti-pattern 6 — Outdated best practices

❌ "Your audiences are too broad — you should narrow your interest targeting."
Reality (2025–2026): Meta favors broad targeting with creative-led optimization.
❌ "Refresh creative every 6 weeks."
Reality: 14–21 days for Meta in 2025–2026.
❌ "Use detailed-targeting exclusions to clean up your audience."
Reality: detailed-targeting exclusions removed Jan 2026.
❌ "Use Offline Conversions API for in-store events."
Reality: discontinued May 2025.

If you cite a "best practice", confirm it's still 2025–2026-current via `14-andromeda-and-platform-changes.md`.

## Anti-pattern 7 — Niche-blind compliance findings

❌ "Add an FDA disclaimer to your LP." — only relevant for supplements / health-adjacent.
❌ "Your alcohol ad is missing an age gate." — only relevant for alcohol.
❌ "Use the LegitScript badge." — only relevant for CBD.

Apply the niche file before flagging compliance findings.

## Anti-pattern 8 — Findings that don't appear in the public data

❌ "Your Pixel is misfiring."
❌ "Your event match quality is below 7."
❌ "Your CAPI is incorrectly deduplicated."

These are great talking points for the *call*, but they require ad-account access. Don't put them in the report.

## Anti-pattern 9 — Misuse of Meta-reported vs. ground truth

❌ "Your ROAS is 3.2× — that's below benchmark."
You don't have ROAS.
✅ Drop the claim. Frame as "Meta-reported ROAS in 2025 e-com benchmarks is 2.19× across all advertisers; Advantage+ Sales accounts hit ~4.52× — the spread is where the leverage is for accounts at your scale."

## Anti-pattern 10 — Padding the report

❌ A 12-finding report when 5 are sharp.
The report is a magnet — every weak finding dilutes the strong ones. Cut hard.

If after cutting you have <4 findings, the audit isn't ready to send. Either:
- Re-examine the niche-file checks more carefully
- Look for Andromeda diversity issues (almost always present)
- Reject the audit and queue for manual review

## Anti-pattern 11 — Assuming the brand uses a specific tool or platform

❌ "Your Klaviyo flows aren't synced with Meta."
❌ "Your Triple Whale dashboard is showing..."
You don't know what tools they use.

## Anti-pattern 12 — Citing the brand name in a way that embarrasses

❌ "GlowCo's ads are textbook examples of what not to do."
✅ Reference the brand once at the top, then use second-person ("you", "your active set"). Never put the brand in a sarcastic context.

## Anti-pattern 13 — Forecasting

❌ "If you continue, you'll be down 30% by Q4."
You can't forecast spend, CPM, or seasonality at the brand level.

✅ "Q4 e-com CPMs typically inflate 60–100% above September baseline. Entering that with stale hero creative compounds the cost — the shape is more spend buying fewer impressions of a fatigued ad."

## Anti-pattern 14 — Including ad-account-only mockup detail

❌ "Generate a Lookalike from your past-365-day purchasers and target them with this creative."
You don't know if they have purchasers data, list size, etc.

✅ The mockup is a creative concept + copy + image. The audience strategy belongs on the call.

## Anti-pattern 15 — The "you should hire us" beat

❌ "Hire us, we're the best at this."
✅ "Three options: fix it in-house, work with us, or book a call to walk the deck." Let the work earn the meeting.
