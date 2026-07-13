// Smartlead API helpers. Kept tiny and dependency-free so magnet webhooks can
// write back to a lead after the magnet is generated, and (for the Call Prep
// Pack) read the full email thread back out.
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

// ── Thread reading (Call Prep Pack) ─────────────────────────────────────────
//
// Kyle has no Smartlead login, so the Call Prep Pack has to carry the entire
// back-and-forth with the lead onto the page. That means reading the thread out
// of Smartlead at build time.
//
// Smartlead's message-history payload is loosely typed and the field names drift
// between record types (a sent email uses `time`, a reply sometimes uses
// `sent_time`; bodies land in `email_body` OR `body`). Everything below reads
// defensively and normalizes into one shape rather than trusting any single key.

export type ThreadMessage = {
  // "sent" = from us (Kyle's inbox), "reply" = from the lead.
  direction: "sent" | "reply";
  from: string;
  to: string;
  subject: string;
  body_text: string;
  sent_at: string | null;
};

type LooseRecord = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

// Pick the first non-empty string among several candidate keys.
function pick(rec: LooseRecord, ...keys: string[]): string {
  for (const k of keys) {
    const v = str(rec[k]);
    if (v) return v;
  }
  return "";
}

// Smartlead email bodies are HTML. Kyle reads these on a web page, so collapse
// to clean text: keep paragraph/line breaks as newlines, drop everything else,
// and strip the quoted-reply tail so a 5-email thread doesn't render the same
// text 5 times.
export function htmlToText(html: string): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Cut the quoted history. Gmail/Outlook prefix it with one of these; anything
  // after the first hit is a copy of an earlier message already in the thread.
  const quoteMarkers = [
    /\nOn .{0,120}wrote:/i,
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\n_{5,}/,
    /\nFrom:\s.+\nSent:\s/i,
  ];
  let cut = text.length;
  for (const re of quoteMarkers) {
    const m = text.match(re);
    if (m?.index !== undefined && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut).trim();
}

// Resolve a lead's Smartlead id within a campaign, by email.
//
// Smartlead exposes a global `GET /leads/?email=` lookup, but the id it returns
// is only usable against a campaign the lead actually belongs to, so we verify
// membership by paginating the campaign's leads if the direct lookup misses.
async function resolveLeadId(
  apiKey: string,
  campaignId: string,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();

  try {
    const res = await fetch(
      `${SMARTLEAD_API}/leads/?api_key=${apiKey}&email=${encodeURIComponent(target)}`,
    );
    if (res.ok) {
      const json = (await res.json()) as LooseRecord;
      const id = json.id ?? (json.data as LooseRecord | undefined)?.id;
      if (id) return String(id);
    }
  } catch (e) {
    console.error("[smartlead] direct lead lookup failed, falling back to scan:", e);
  }

  // Fallback: page through the campaign's leads. Capped at 10k so a huge
  // campaign can't hang the webhook past its 300s budget.
  const limit = 100;
  for (let offset = 0; offset < 10000; offset += limit) {
    const res = await fetch(
      `${SMARTLEAD_API}/campaigns/${campaignId}/leads?api_key=${apiKey}&offset=${offset}&limit=${limit}`,
    );
    if (!res.ok) {
      console.error(`[smartlead] campaign lead scan failed: ${res.status}`);
      return null;
    }
    const json = (await res.json()) as LooseRecord;
    const batch = (json.data ?? json.leads ?? []) as LooseRecord[];
    if (!Array.isArray(batch) || batch.length === 0) return null;

    for (const entry of batch) {
      // Campaign-lead rows sometimes nest the lead under `lead`, sometimes not.
      const lead = ((entry.lead as LooseRecord) ?? entry) as LooseRecord;
      if (str(lead.email).trim().toLowerCase() === target) {
        const id = lead.id ?? entry.id;
        if (id) return String(id);
      }
    }
    if (batch.length < limit) return null;
  }
  return null;
}

// Fetch the full conversation with a lead, oldest message first.
//
// Best-effort: returns [] rather than throwing, because a missing thread should
// degrade the pack (Kyle loses the transcript section) not kill it - the brand
// deep dive and game plan are still worth having on the call.
export async function fetchLeadThread(
  campaignId: string | number,
  email: string,
): Promise<ThreadMessage[]> {
  const apiKey = process.env.SMARTLEAD_API_KEY;
  if (!apiKey) {
    console.error("[smartlead] SMARTLEAD_API_KEY not set — skipping thread fetch");
    return [];
  }
  if (!campaignId || !email) {
    console.error("[smartlead] missing campaignId or email — skipping thread fetch");
    return [];
  }

  try {
    const leadId = await resolveLeadId(apiKey, String(campaignId), email);
    if (!leadId) {
      console.error(`[smartlead] lead ${email} not found in campaign ${campaignId}`);
      return [];
    }

    const res = await fetch(
      `${SMARTLEAD_API}/campaigns/${campaignId}/leads/${leadId}/message-history?api_key=${apiKey}`,
    );
    if (!res.ok) {
      console.error(`[smartlead] message-history failed: ${res.status} ${await res.text()}`);
      return [];
    }

    const json = (await res.json()) as LooseRecord;
    const raw = (json.history ?? json.data ?? json) as LooseRecord[];
    if (!Array.isArray(raw)) return [];

    const messages: ThreadMessage[] = raw.map((m) => {
      // Inbound is flagged inconsistently across record types, so treat a record
      // as a reply if ANY of the known inbound markers say so. Defaulting to
      // "sent" is the safe error: mislabelling our own email as the lead's would
      // put words in the prospect's mouth on the page Kyle reads before the call.
      const type = pick(m, "type", "message_type", "direction").toUpperCase();
      const isReply = type === "REPLY" || type === "INBOUND" || m.is_reply === true;

      const body = pick(m, "email_body", "body", "body_text", "content");
      return {
        direction: isReply ? "reply" : "sent",
        from: pick(m, "from", "from_email", "sent_from"),
        to: pick(m, "to", "to_email", "sent_to"),
        subject: pick(m, "subject", "email_subject"),
        body_text: htmlToText(body),
        sent_at: pick(m, "time", "sent_time", "received_time", "created_at") || null,
      };
    });

    // Chronological. Records with no timestamp keep their API order at the end
    // rather than being dropped.
    return messages.sort((a, b) => {
      if (!a.sent_at) return 1;
      if (!b.sent_at) return -1;
      return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime();
    });
  } catch (e) {
    console.error("[smartlead] thread fetch error:", e);
    return [];
  }
}
