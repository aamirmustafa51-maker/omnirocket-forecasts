// Canonical 90-Day Game Plan data contract. Shared by the page route and the
// template so both agree on shape. This magnet is the fulfillment of the "want
// the 90-day game plan?" CTA already teased on the scroll-stopper and brand
// playbook pages: it turns the playbook (the brain) into a written, staged plan
// (the revenue path). No Meta-ads data required; personalized from the brand's
// own playbook + a real, decision-led case study. Deliberately delivered in
// writing so a strategy-first buyer can evaluate on their own time.

// One pillar of the account architecture (the "three jobs" structure).
export type ArchPillar = { name: string; job: string; detail: string };

// A phase of the 90-day timeline, each with an explicit decision gate.
export type PlanPhase = {
  window: string; // "Days 1-30"
  name: string; // "Signal"
  goal: string;
  spend: string; // starting daily budget range for this phase
  running: string[]; // what we launch/run in this phase
  reading: string[]; // the metrics that decide the next move
  gate: string; // the decision gate to graduate to the next phase
};

// One layer of the testing framework (angle -> hook -> format), with the actual
// slate we'd start Briar Road on so it reads as a real plan, not a template.
export type TestLayer = { layer: string; question: string; slate: string[] };

// Price-ladder row with the role each product plays in the plan.
export type LadderRow = { title: string; role: string; price: number | null; note: string };

// A real case study, structured so the DECISION is the hero, not the number.
export type CaseDecision = { decision: string; rationale: string };
export type CaseMetric = { label: string; value: string };
export type CaseRamp = { month: string; value: string };
export type CaseStudy = {
  name: string;
  vertical: string;
  situation: string;
  decisions: CaseDecision[];
  result: string;
  metrics: CaseMetric[];
  ramp: CaseRamp[];
};

// Modeled targets. Framed as aims grounded in the case pattern, never promises.
export type TargetRow = { window: string; focus: string; aim: string };

export type PlanData = {
  lead_company: string;
  lead_first_name: string;
  website: string;
  prospect_logo_url?: string; // optional manual logo override (direct image URL)
  currency: string;
  playbook_url: string;
  scroll_stopper_url: string;
  intro: string;
  architecture: ArchPillar[];
  phases: PlanPhase[];
  testing: TestLayer[];
  products_ladder: LadderRow[];
  case_study: CaseStudy;
  targets: { basis: string; rows: TargetRow[] };
  generated_at: string;
};
