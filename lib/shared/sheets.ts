import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Worksheet (tab) names within the tracker spreadsheet. NOTE: names contain
// spaces, so any A1 range must be single-quoted AND url-encoded (see valuesUrl).
// "Lead Forecast" was formerly "Sheet1" — renamed in the sheet 2026-07-05.
const FORECAST_TAB = "Lead Forecast";
const SCROLL_TAB = "Scroll Stopper";
const BRAND_TAB = "Brand Playbook";

type LeadRow = {
  date_sent: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  website: string;
  facebook_url: string;
  report_url: string;
  slug: string;
  category: string;
  smartlead_campaign: string;
};

// Scroll-Stopper tracks two artifacts (playbook + report) and two open-types,
// so it carries both URLs and two open-count column pairs.
type ScrollLeadRow = {
  date_sent: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  website: string;
  playbook_url: string;
  report_url: string;
  slug: string;
  category: string;
  smartlead_campaign: string;
};

const SCROLL_HEADER = [
  "Date Sent", "First Name", "Last Name", "Email", "Company", "Website",
  "Playbook URL", "Report URL", "Slug", "Category", "Smartlead Campaign",
  "Playbook Last Opened", "Playbook Opens", "Report Last Opened", "Report Opens",
  "Follow-Up Status", "Next Follow-Up Date", "Notes",
];

// Standalone Brand Playbook magnet (one artifact, one open-type).
type BrandLeadRow = {
  date_sent: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  website: string;
  playbook_url: string;
  slug: string;
  category: string;
  smartlead_campaign: string;
};

const BRAND_HEADER = [
  "Date Sent", "First Name", "Last Name", "Email", "Company", "Website",
  "Playbook URL", "Slug", "Category", "Smartlead Campaign",
  "Playbook Last Opened", "Playbook Opens", "Follow-Up Status", "Next Follow-Up Date", "Notes",
];

let cachedClient: JWT | null = null;

function getClient(): JWT {
  if (cachedClient) return cachedClient;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  if (!b64) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON_B64");
  const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  cachedClient = new JWT({ email: creds.client_email, key: creds.private_key, scopes: SCOPES });
  return cachedClient;
}

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const client = getClient();
  const { token } = await client.getAccessToken();
  return fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

function sheetId(): string {
  const id = process.env.LEAD_TRACKER_SHEET_ID;
  if (!id) throw new Error("Missing LEAD_TRACKER_SHEET_ID");
  return id;
}

// Build a values-API URL for a tab range. Quotes the tab name (required for
// names with spaces) and url-encodes the whole range.
function valuesUrl(tab: string, a1: string, suffix = "", query = ""): string {
  const range = encodeURIComponent(`'${tab}'!${a1}`);
  return `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${range}${suffix}${query ? `?${query}` : ""}`;
}

// ── Fatigue Forecast (Lead Forecast tab) ───────────────────────────────────

export async function appendNewLead(row: LeadRow): Promise<void> {
  const values = [[
    row.date_sent, row.first_name, row.last_name, row.email, row.company, row.website,
    row.facebook_url, row.report_url, row.slug, row.category, row.smartlead_campaign,
    "", "", "Sent", "", "",
  ]];
  const url = valuesUrl(FORECAST_TAB, "A:P", ":append", "valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS");
  const res = await authedFetch(url, { method: "POST", body: JSON.stringify({ values }) });
  if (!res.ok) throw new Error(`appendNewLead ${res.status}: ${await res.text()}`);
}

export async function bumpOpenPing(slug: string, ts: string): Promise<void> {
  const res = await authedFetch(valuesUrl(FORECAST_TAB, "I:M"));
  if (!res.ok) throw new Error(`bumpOpenPing read ${res.status}`);
  const { values } = (await res.json()) as { values?: string[][] };
  if (!values) return;

  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if ((values[i][0] || "").trim() === slug) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return;

  const sheetRow = rowIdx + 1;
  const prevCount = parseInt((values[rowIdx][4] || "0").trim(), 10) || 0;
  const upRes = await authedFetch(valuesUrl(FORECAST_TAB, `L${sheetRow}:M${sheetRow}`, "", "valueInputOption=USER_ENTERED"), {
    method: "PUT",
    body: JSON.stringify({ values: [[ts, prevCount + 1]] }),
  });
  if (!upRes.ok) throw new Error(`bumpOpenPing write ${upRes.status}: ${await upRes.text()}`);
}

// ── Scroll-Stopper + Brand Playbook (Scroll Stopper tab) ────────────────────

// Write the header row if the tab is empty. Lets Amir just create a blank tab.
async function ensureScrollHeader(): Promise<void> {
  const res = await authedFetch(valuesUrl(SCROLL_TAB, "A1:R1"));
  if (!res.ok) throw new Error(`ensureScrollHeader read ${res.status}`);
  const { values } = (await res.json()) as { values?: string[][] };
  const hasHeader = values && values[0] && (values[0][0] || "").trim().length > 0;
  if (hasHeader) return;
  const up = await authedFetch(valuesUrl(SCROLL_TAB, "A1:R1", "", "valueInputOption=USER_ENTERED"), {
    method: "PUT",
    body: JSON.stringify({ values: [SCROLL_HEADER] }),
  });
  if (!up.ok) throw new Error(`ensureScrollHeader write ${up.status}: ${await up.text()}`);
}

export async function appendScrollStopperLead(row: ScrollLeadRow): Promise<void> {
  await ensureScrollHeader();
  const values = [[
    row.date_sent, row.first_name, row.last_name, row.email, row.company, row.website,
    row.playbook_url, row.report_url, row.slug, row.category, row.smartlead_campaign,
    "", "", "", "", "Sent", "", "",
  ]];
  const url = valuesUrl(SCROLL_TAB, "A:R", ":append", "valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS");
  const res = await authedFetch(url, { method: "POST", body: JSON.stringify({ values }) });
  if (!res.ok) throw new Error(`appendScrollStopperLead ${res.status}: ${await res.text()}`);
}

// which = "playbook" bumps cols L:M, "report" bumps cols N:O.
export async function bumpScrollStopperOpen(
  slug: string,
  which: "playbook" | "report",
  ts: string,
): Promise<void> {
  const res = await authedFetch(valuesUrl(SCROLL_TAB, "I:O"));
  if (!res.ok) throw new Error(`bumpScrollStopperOpen read ${res.status}`);
  const { values } = (await res.json()) as { values?: string[][] };
  if (!values) return;

  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if ((values[i][0] || "").trim() === slug) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return;

  const sheetRow = rowIdx + 1;
  // I:O -> [I=slug(0), J(1), K(2), L(3), M(4), N(5), O(6)]
  const countCol = which === "playbook" ? 4 : 6;
  const prevCount = parseInt((values[rowIdx][countCol] || "0").trim(), 10) || 0;
  const cols = which === "playbook" ? `L${sheetRow}:M${sheetRow}` : `N${sheetRow}:O${sheetRow}`;
  const upRes = await authedFetch(valuesUrl(SCROLL_TAB, cols, "", "valueInputOption=USER_ENTERED"), {
    method: "PUT",
    body: JSON.stringify({ values: [[ts, prevCount + 1]] }),
  });
  if (!upRes.ok) throw new Error(`bumpScrollStopperOpen write ${upRes.status}: ${await upRes.text()}`);
}

// ── Standalone Brand Playbook (Brand Playbook tab) ──────────────────────────

async function ensureBrandHeader(): Promise<void> {
  const res = await authedFetch(valuesUrl(BRAND_TAB, "A1:O1"));
  if (!res.ok) throw new Error(`ensureBrandHeader read ${res.status}`);
  const { values } = (await res.json()) as { values?: string[][] };
  const hasHeader = values && values[0] && (values[0][0] || "").trim().length > 0;
  if (hasHeader) return;
  const up = await authedFetch(valuesUrl(BRAND_TAB, "A1:O1", "", "valueInputOption=USER_ENTERED"), {
    method: "PUT",
    body: JSON.stringify({ values: [BRAND_HEADER] }),
  });
  if (!up.ok) throw new Error(`ensureBrandHeader write ${up.status}: ${await up.text()}`);
}

export async function appendBrandPlaybookLead(row: BrandLeadRow): Promise<void> {
  await ensureBrandHeader();
  const values = [[
    row.date_sent, row.first_name, row.last_name, row.email, row.company, row.website,
    row.playbook_url, row.slug, row.category, row.smartlead_campaign,
    "", "", "Sent", "", "",
  ]];
  const url = valuesUrl(BRAND_TAB, "A:O", ":append", "valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS");
  const res = await authedFetch(url, { method: "POST", body: JSON.stringify({ values }) });
  if (!res.ok) throw new Error(`appendBrandPlaybookLead ${res.status}: ${await res.text()}`);
}

export async function bumpBrandPlaybookOpen(slug: string, ts: string): Promise<void> {
  const res = await authedFetch(valuesUrl(BRAND_TAB, "H:L"));
  if (!res.ok) throw new Error(`bumpBrandPlaybookOpen read ${res.status}`);
  const { values } = (await res.json()) as { values?: string[][] };
  if (!values) return;

  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if ((values[i][0] || "").trim() === slug) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return;

  const sheetRow = rowIdx + 1;
  // H:L -> [H=slug(0), I(1), J(2), K(3), L=opens(4)]
  const prevCount = parseInt((values[rowIdx][4] || "0").trim(), 10) || 0;
  const upRes = await authedFetch(valuesUrl(BRAND_TAB, `K${sheetRow}:L${sheetRow}`, "", "valueInputOption=USER_ENTERED"), {
    method: "PUT",
    body: JSON.stringify({ values: [[ts, prevCount + 1]] }),
  });
  if (!upRes.ok) throw new Error(`bumpBrandPlaybookOpen write ${upRes.status}: ${await upRes.text()}`);
}

// ── Lookup by email (Call Prep Pack) ────────────────────────────────────────
//
// When a lead books a call we know their email and nothing else. The tracker is
// what tells us which magnet they got, its slug, and how hard they engaged with
// it - so we search every tab for the email and report back what we find.
//
// Unlike the writers above, this resolves columns BY HEADER NAME, never by fixed
// letter. Amir reorders columns in this sheet, and a lookup that silently reads
// the wrong column would put the wrong brand in front of Kyle on a live call.

export type MagnetKind = "forecast" | "scroll-stopper" | "brand-playbook";

export type TrackerLead = {
  magnet: MagnetKind;
  slug: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  website: string;
  smartlead_campaign: string;
  date_sent: string;
  // Untracked (internal) links - safe for Kyle to click without inflating opens.
  report_url: string;
  playbook_url: string;
  // Engagement, as an intent signal on the call ("they opened it 6 times").
  report_opens: number;
  playbook_opens: number;
  last_opened_at: string;
};

// Strip the tracking params so Kyle can open a link without firing a beacon.
// The sheet stores the tracked (?ref=email) form for Scroll-Stopper rows and the
// untracked form for Forecast rows, so normalize both to untracked.
function untracked(url: string): string {
  const clean = (url || "").trim();
  if (!clean) return "";
  const q = clean.indexOf("?");
  return q === -1 ? clean : clean.slice(0, q);
}

function toInt(v: string | undefined): number {
  return parseInt((v || "0").trim(), 10) || 0;
}

// Read a whole tab and hand back rows as header-keyed lookups.
async function readTab(tab: string): Promise<Array<(header: string) => string>> {
  const res = await authedFetch(valuesUrl(tab, "A:Z"));
  if (!res.ok) throw new Error(`readTab ${tab} ${res.status}`);
  const { values } = (await res.json()) as { values?: string[][] };
  if (!values || values.length < 2) return [];

  const headers = (values[0] || []).map((h) => (h || "").trim().toLowerCase());
  return values.slice(1).map((row) => (header: string): string => {
    const idx = headers.indexOf(header.trim().toLowerCase());
    return idx === -1 ? "" : (row[idx] || "").trim();
  });
}

// Find a lead across all three magnet tabs by email.
//
// Returns EVERY match, newest tab-order last, because a lead can legitimately
// appear twice (got the Forecast in March, the Scroll-Stopper in July). The
// caller decides which one the call is about.
export async function findLeadByEmail(email: string): Promise<TrackerLead[]> {
  const target = email.trim().toLowerCase();
  if (!target) return [];

  const tabs: Array<{ tab: string; magnet: MagnetKind }> = [
    { tab: FORECAST_TAB, magnet: "forecast" },
    { tab: SCROLL_TAB, magnet: "scroll-stopper" },
    { tab: BRAND_TAB, magnet: "brand-playbook" },
  ];

  const found: TrackerLead[] = [];

  for (const { tab, magnet } of tabs) {
    let rows: Array<(header: string) => string>;
    try {
      rows = await readTab(tab);
    } catch (e) {
      // A missing/renamed tab must not sink the lookup on the other tabs.
      console.error(`[sheets] could not read tab "${tab}":`, e);
      continue;
    }

    for (const get of rows) {
      if (get("Email").toLowerCase() !== target) continue;

      found.push({
        magnet,
        slug: get("Slug"),
        first_name: get("First Name"),
        last_name: get("Last Name"),
        email: get("Email"),
        company: get("Company"),
        website: get("Website"),
        smartlead_campaign: get("Smartlead Campaign"),
        date_sent: get("Date Sent"),
        report_url: untracked(get("Report URL")),
        playbook_url: untracked(get("Playbook URL")),
        // The Forecast tab has one open-count column ("Open Count"); the
        // Scroll-Stopper tab splits it into "Report Opens" / "Playbook Opens".
        report_opens: toInt(get("Report Opens") || get("Open Count")),
        playbook_opens: toInt(get("Playbook Opens")),
        last_opened_at:
          get("Last Opened At") || get("Report Last Opened") || get("Playbook Last Opened"),
      });
    }
  }

  return found;
}
