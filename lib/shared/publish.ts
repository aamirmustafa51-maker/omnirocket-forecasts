// Shared publishing helpers for magnet webhooks: GitHub commit (the outputs/
// JSON that Vercel serves), Slack notifications, slug/env utilities, and
// Claude JSON extraction. Factored out so multiple webhooks (scroll-stopper,
// the future standalone brand-playbook route, etc.) reuse one implementation
// instead of copy-pasting. The competitor-teardown route keeps its own copies
// for now; new routes should import from here.

export const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
};

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Enforce the OmniRocket no-em-dash convention even if Claude slips one in.
export const cleanCopy = (s: string): string =>
  (s ?? "").replace(/\s*[—–]\s*/g, " - ").replace(/[ \t]{2,}/g, " ").trim();

// Post to Slack. `webhookEnvKey` lets a magnet route its notifications to its
// own channel (e.g. SLACK_WEBHOOK_URL_SCROLL_STOPPER); if that var isn't set,
// it falls back to the default SLACK_WEBHOOK_URL so nothing breaks before the
// new channel's incoming webhook exists.
export async function postSlack(text: string, webhookEnvKey = "SLACK_WEBHOOK_URL"): Promise<void> {
  const url = process.env[webhookEnvKey] || process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.error(`Slack post skipped: no ${webhookEnvKey} or SLACK_WEBHOOK_URL`);
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("Slack post failed:", e);
  }
}

export async function githubGetSha(filePath: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/contents/${filePath}?ref=main`,
    {
      headers: {
        Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${filePath} failed: ${res.status}`);
  const json = (await res.json()) as { sha?: string };
  return json.sha ?? null;
}

export async function githubPut(
  filePath: string,
  contentBase64: string,
  message: string,
): Promise<void> {
  const sha = await githubGetSha(filePath);
  const body: Record<string, string> = { message, branch: "main", content: contentBase64 };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`GitHub PUT ${filePath} failed: ${res.status} ${await res.text()}`);
}

export function putJson(filePath: string, data: unknown, message: string): Promise<void> {
  const base64 = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  return githubPut(filePath, base64, message);
}

// Read a JSON artifact we committed earlier (a forecast, a playbook, a
// scroll-stopper sheet) back out of the repo.
//
// Reads from GitHub rather than the local filesystem on purpose: the running
// Vercel instance only has the files that existed at ITS build, so an artifact
// committed after that deploy is invisible to fs. GitHub is always current.
// Returns null when the file isn't there, which is a normal case (the lead may
// simply never have received that magnet).
export async function githubGetJson<T>(filePath: string): Promise<T | null> {
  const res = await fetch(
    `https://api.github.com/repos/${env("GITHUB_OWNER")}/${env("GITHUB_REPO")}/contents/${filePath}?ref=main`,
    {
      headers: {
        Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${filePath} failed: ${res.status}`);
  const json = (await res.json()) as { content?: string };
  if (!json.content) return null;
  return JSON.parse(Buffer.from(json.content, "base64").toString("utf8")) as T;
}

// Pull the first JSON object out of a Claude text response, tolerating code
// fences and surrounding prose.
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in Claude response");
  return JSON.parse(candidate.slice(start, end + 1));
}

export function brandDomainFromWebsite(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  }
}
