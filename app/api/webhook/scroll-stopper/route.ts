// Notifier for the Scroll-Stopper magnet. Smartlead "Lead Category Updated"
// fires here when Amir flips a positive-reply lead into the `Scroll_Stopper`
// category. This route does exactly one thing: tell Amir in Slack to go build
// the report.
//
// It does NOT generate anything. Reports are built exclusively through the
// `/scroll-stopper` skill (scripts/scroll-stopper-manual.ts), from Kyle's own
// hand-picked clean product photos. Two earlier approaches were removed:
//
//   1. Auto-generation from /products.json — picked the wrong products on
//      wholesale and thin catalogs.
//   2. The /scroll-stopper-new intake form — replaced by the skill, deleted
//      2026-08-05 along with the ~300 lines of generation code that only it
//      could reach.
//
// So the publishing side of this magnet (site scrape, playbook, kie.ai image
// generation, GitHub commit, lead-sheet row, and the GHL CRM post) all lives in
// scripts/scroll-stopper-manual.ts now. Deliberately nothing here posts to GHL:
// the GHL intake workflow ends in an SMS to Kyle that renders
// {{contact.magnet_link}}, and at flip time there is no report to link to. The
// lead enters the CRM when the skill publishes, which is when that SMS is true.
import { NextRequest, NextResponse } from "next/server";
import { postSlack } from "@/lib/shared/publish";

export const runtime = "nodejs";

// Route this magnet's Slack notifications to its own #scroll-stopper channel
// (falls back to the default channel until that webhook env var is set).
const SLACK_KEY = "SLACK_WEBHOOK_URL_SCROLL_STOPPER";

type WebhookPayload = {
  lead_email: string;
  lead_first_name: string;
  lead_last_name: string;
  lead_company: string;
  website_url: string | null;
  category: string;
  campaign_name?: string;
};

function normalizeSmartleadPayload(raw: unknown): WebhookPayload {
  const r = (raw ?? {}) as Record<string, unknown>;
  const leadData = (r.lead_data ?? {}) as Record<string, unknown>;
  const cf = (leadData.custom_fields ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const cfGet = (...keys: string[]): string => {
    for (const k of keys) if (typeof cf[k] === "string" && cf[k]) return cf[k] as string;
    return "";
  };

  return {
    lead_email: str(r.lead_email) || str(leadData.email),
    lead_first_name: str(leadData.first_name) || str(r.lead_name),
    lead_last_name: str(leadData.last_name),
    lead_company: str(leadData.company_name),
    website_url: optStr(leadData.website) ?? null,
    category: cfGet("Category", "category"),
    campaign_name: optStr(r.campaign_name) || optStr(r.sequence_name),
  };
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const payload = normalizeSmartleadPayload(rawBody);

  if (!payload.lead_company) {
    console.log("[scroll-stopper] missing lead_company. Raw:", JSON.stringify(rawBody));
    return NextResponse.json({ error: "missing lead_company" }, { status: 400 });
  }

  const site = payload.website_url ? `\n🌐 ${payload.website_url}` : "";
  await postSlack(
    `🟡 *${payload.lead_company}* flipped to Scroll_Stopper.\n📧 ${payload.lead_email}\n👤 ${payload.lead_first_name}${site}\n\nBuild it with the \`/scroll-stopper\` skill (2-3 hand-picked product photos). The lead is already enrolled in the follow-up subsequence.`,
    SLACK_KEY,
  );

  return NextResponse.json({ ok: true, status: "manual_required" });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "POST a Smartlead Lead_Category_Updated payload. Notify-only — reports are built via the /scroll-stopper skill.",
  });
}
