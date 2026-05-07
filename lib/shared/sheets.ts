import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const TAB = "Sheet1";

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

let cachedClient: JWT | null = null;

function getClient(): JWT {
  if (cachedClient) return cachedClient;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  if (!b64) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON_B64");
  const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  cachedClient = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
  });
  return cachedClient;
}

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const client = getClient();
  const { token } = await client.getAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function sheetId(): string {
  const id = process.env.LEAD_TRACKER_SHEET_ID;
  if (!id) throw new Error("Missing LEAD_TRACKER_SHEET_ID");
  return id;
}

export async function appendNewLead(row: LeadRow): Promise<void> {
  const values = [[
    row.date_sent,
    row.first_name,
    row.last_name,
    row.email,
    row.company,
    row.website,
    row.facebook_url,
    row.report_url,
    row.slug,
    row.category,
    row.smartlead_campaign,
    "",
    "",
    "Sent",
    "",
    "",
  ]];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${TAB}!A:P:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await authedFetch(url, {
    method: "POST",
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`appendNewLead ${res.status}: ${await res.text()}`);
}

export async function bumpOpenPing(slug: string, ts: string): Promise<void> {
  const slugColUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${TAB}!I:M`;
  const res = await authedFetch(slugColUrl);
  if (!res.ok) throw new Error(`bumpOpenPing read ${res.status}`);
  const { values } = (await res.json()) as { values?: string[][] };
  if (!values) return;

  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if ((values[i][0] || "").trim() === slug) {
      rowIdx = i;
      break;
    }
  }
  if (rowIdx === -1) return;

  const sheetRow = rowIdx + 1;
  const prevCount = parseInt((values[rowIdx][4] || "0").trim(), 10) || 0;
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${TAB}!L${sheetRow}:M${sheetRow}?valueInputOption=USER_ENTERED`;
  const upRes = await authedFetch(updateUrl, {
    method: "PUT",
    body: JSON.stringify({ values: [[ts, prevCount + 1]] }),
  });
  if (!upRes.ok) throw new Error(`bumpOpenPing write ${upRes.status}: ${await upRes.text()}`);
}
