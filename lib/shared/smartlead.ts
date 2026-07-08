// Smartlead API helpers. Kept tiny and dependency-free so magnet webhooks can
// write back to a lead after the magnet is generated.
const SMARTLEAD_API = "https://server.smartlead.ai/api/v1";

// Upsert custom fields onto an existing Smartlead lead (matched by email) in a
// given campaign. Used to stash post-yes magnet links (magnet_link,
// brand_playbook_link) so the follow-up subsequence can render them via merge
// tags like {{magnet_link}} / {{brand_playbook_link}}.
//
// POST /campaigns/{id}/leads upserts by email — for a lead already in the
// campaign it merges the provided custom_fields and does NOT create a duplicate
// or restart the sequence. Best-effort by design: returns false on any failure
// instead of throwing, so callers can fire it after the magnet is already
// delivered without risking the main flow.
export async function writeLeadCustomFields(
  campaignId: string | number,
  email: string,
  customFields: Record<string, string>,
): Promise<boolean> {
  const apiKey = process.env.SMARTLEAD_API_KEY;
  if (!apiKey) {
    console.error("[smartlead] SMARTLEAD_API_KEY not set — skipping custom-field write");
    return false;
  }
  if (!campaignId || !email) {
    console.error("[smartlead] missing campaignId or email — skipping custom-field write");
    return false;
  }
  try {
    const res = await fetch(
      `${SMARTLEAD_API}/campaigns/${campaignId}/leads?api_key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_list: [{ email, custom_fields: customFields }] }),
      },
    );
    if (!res.ok) {
      console.error(`[smartlead] custom-field write failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[smartlead] custom-field write error:", e);
    return false;
  }
}
