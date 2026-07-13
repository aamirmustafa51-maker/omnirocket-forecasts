// What OmniRocket does for a client, in the words Kyle can say out loud.
//
// This is deliberately STATIC and not written by Claude. It's the same story on
// every call, it must never drift, and it must never overclaim - so it is copy
// we control, reviewed once, reused forever. Claude tailors the brand analysis
// elsewhere in the pack; it does not get to reinvent what the agency sells.
//
// House style: no em dashes, sixth-to-seventh grade English, zero technical
// jargon. The reader on the other end of the call is a brand owner, not an
// engineer. Never say "agent", "pipeline", "LLM", "Claude" or "automation" out
// loud on these calls - say what the client GETS, not how it is made.

export type Capability = {
  name: string;
  // One line: what the client actually receives.
  what_they_get: string;
  // Why they should care. Framed as the problem it removes.
  why_it_matters: string;
  // "Live" = we do this today. "Almost ready" = weeks away, say so honestly.
  status: "Live" | "Almost ready";
};

export const CAPABILITIES: Capability[] = [
  {
    name: "Brand Bible",
    what_they_get:
      "A single document that captures how the brand talks, who it sells to, what it can and cannot claim, and the real numbers behind the business.",
    why_it_matters:
      "Most brands keep this in someone's head. Once it is written down, every ad we make sounds like them instead of sounding like an agency wrote it.",
    status: "Live",
  },
  {
    name: "Account Audit",
    what_they_get:
      "A full check of the ad account with a score and a ranked list of what is broken, from most costly to least.",
    why_it_matters:
      "It shows exactly where money is leaking before we spend a dollar more. They see the problems in week one, not month three.",
    status: "Live",
  },
  {
    name: "Strategy",
    what_they_get:
      "A written plan with the campaigns we would run, how the budget gets split, and what we expect back.",
    why_it_matters:
      "They approve the plan before anything goes live. No surprises, and they always know what we are testing and why.",
    status: "Live",
  },
  {
    name: "Creative Briefs",
    what_they_get:
      "Ad concepts written out before anything is made: the hook, who it speaks to, the words, and what the picture should show.",
    why_it_matters:
      "Creative is where most brands stall. They get concepts to react to instead of a blank page.",
    status: "Live",
  },
  {
    name: "Creative Production",
    what_they_get:
      "Finished ads, produced in volume every week, built from the approved briefs.",
    why_it_matters:
      "Ads wear out. The only real fix is a steady supply of fresh ones, and most brands cannot make them fast enough to keep up.",
    status: "Live",
  },
  {
    name: "Campaign Builds",
    what_they_get:
      "The campaigns built and ready to launch, matching the plan they approved.",
    why_it_matters:
      "Nothing sits waiting on someone to find time to set it up. The gap between deciding and launching goes to near zero.",
    status: "Live",
  },
  {
    name: "Client Dashboard",
    what_they_get:
      "One login where they see everything: the plan, the ads, the approvals, and how the account is performing right now.",
    why_it_matters:
      "They stop chasing updates over email. They can look, any time, and see exactly where things stand.",
    status: "Almost ready",
  },
  {
    name: "Competitor Tracking",
    what_they_get:
      "An ongoing read on what the brands they compete with are running.",
    why_it_matters:
      "They stop guessing what is working in their category and start seeing it.",
    status: "Live",
  },
];

// The honest framing for the dashboard when it comes up on a call. Kyle asked
// for it to be presented as nearly done, so this is the exact wording: it
// promises nothing about a date.
export const DASHBOARD_NOTE =
  "The dashboard is built and in testing right now. Everything else on this list is already how we work today, so nothing waits on it.";
