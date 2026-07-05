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
