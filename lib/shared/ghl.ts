// GoHighLevel intake. One POST to the "Lead Intake (Cold Email)" workflow's
// inbound webhook, fired the moment a lead flips to a magnet category. GHL
// upserts the contact on email, tags it by magnet type, and drops an
// opportunity into the New Lead stage of the OR Cold Email Pipeline.
//
// Two rules this file exists to enforce:
//
//  1. Send the RAW Smartlead category (`Lead_Forecast` / `Scroll_Stopper`),
//     never a pre-mapped GHL tag name. The mapping lives in the GHL workflow's
//     condition, so an unknown/typo'd value falls into the None branch and
//     alerts, instead of silently creating a junk tag here.
//     GHL's `Is` comparison is CASE-SENSITIVE.
//
//  2. Best-effort, exactly like writeLeadCustomFields: returns false on any
//     failure instead of throwing. The magnet is already delivered by the time
//     this runs; a CRM hiccup must never break the lead-facing flow.
//
// Safe to call more than once for the same lead — GHL upserts on email, so a
// later fire with a real magnet_link overwrites an earlier empty one.

export type GHLLead = {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name: string;
  website?: string;
  /** RAW Smartlead category. Do not map to a tag name here. */
  magnet_type: string;
  /** May be "" — the Scroll-Stopper flip has no link yet; a later fire upserts it. */
  magnet_link?: string;
};

export async function postLeadToGHL(lead: GHLLead): Promise<boolean> {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) {
    // The exact shape of the old SMARTLEAD_API_KEY bug: set locally, missing in
    // Vercel, failing silently for weeks. Logged loudly so it shows in Vercel logs.
    console.error("[ghl] GHL_WEBHOOK_URL not set — skipping CRM post");
    return false;
  }
  if (!lead.email || !lead.company_name) {
    console.error("[ghl] missing email or company_name — skipping CRM post");
    return false;
  }
  if (!lead.magnet_type) {
    console.error("[ghl] missing magnet_type — skipping CRM post");
    return false;
  }

  const body = {
    email: lead.email,
    first_name: lead.first_name || "",
    last_name: lead.last_name || "",
    company_name: lead.company_name,
    website: lead.website || "",
    magnet_type: lead.magnet_type,
    magnet_link: lead.magnet_link || "",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[ghl] post failed: ${res.status} ${await res.text()}`);
      return false;
    }
    console.log(`[ghl] posted ${lead.company_name} (${lead.email}) as ${lead.magnet_type}`);
    return true;
  } catch (e) {
    console.error("[ghl] post error:", e);
    return false;
  }
}
