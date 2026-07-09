"use client";
import { useState } from "react";

type Result = { report_url?: string; playbook_url?: string | null; slug?: string };

export default function ScrollStopperIntake() {
  const [secret, setSecret] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [urls, setUrls] = useState(["", "", ""]);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const setUrl = (i: number, v: string) =>
    setUrls((u) => u.map((x, j) => (j === i ? v : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const product_urls = urls.map((u) => u.trim()).filter(Boolean);
    if (!firstName || !email || !company) {
      setStatus("error");
      setMessage("First name, email, and company are required.");
      return;
    }
    if (product_urls.length < 1) {
      setStatus("error");
      setMessage("Add at least one product link (2-3 recommended).");
      return;
    }
    setStatus("working");
    setMessage("Generating the ads + playbook. This takes about 2 minutes - keep this tab open.");
    setResult(null);
    try {
      const res = await fetch("/api/webhook/scroll-stopper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          lead_first_name: firstName,
          lead_email: email,
          lead_company: company,
          logo_url: logoUrl.trim() || undefined,
          product_urls,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setMessage(
          res.status === 401
            ? "Wrong passcode."
            : data.error || data.status || "Generation failed - check the product links and try again.",
        );
        return;
      }
      setStatus("done");
      setResult(data);
      setMessage("Done. Links are below and were also posted to your Slack channel.");
    } catch {
      setStatus("error");
      setMessage("Network error or timeout. Check Slack - it may still have completed.");
    }
  }

  const working = status === "working";

  return (
    <main style={S.wrap}>
      <div style={S.card}>
        <h1 style={S.h1}>Scroll-Stopper - New Report</h1>
        <p style={S.sub}>
          Paste the lead&rsquo;s info and 2-3 product links from their real store. The ads and brand
          playbook are built from exactly those products.
        </p>

        <form onSubmit={submit}>
          <label style={S.label}>Passcode</label>
          <input style={S.input} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="intake passcode" />

          <div style={S.row}>
            <div style={S.col}>
              <label style={S.label}>First name</label>
              <input style={S.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Pete" />
            </div>
            <div style={S.col}>
              <label style={S.label}>Company</label>
              <input style={S.input} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Bulk Jerky" />
            </div>
          </div>

          <label style={S.label}>Lead email</label>
          <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pete@brand.com" />

          <label style={S.label}>Logo URL (optional - paste only if the auto logo looks wrong)</label>
          <input style={S.input} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://brand.com/.../logo.png" />

          <label style={S.label}>Product links (2-3, from their real store)</label>
          {urls.map((u, i) => (
            <input
              key={i}
              style={S.input}
              value={u}
              onChange={(e) => setUrl(i, e.target.value)}
              placeholder={`https://brand.com/products/... ${i === 2 ? "(optional)" : ""}`}
            />
          ))}

          <button style={{ ...S.btn, opacity: working ? 0.6 : 1 }} disabled={working} type="submit">
            {working ? "Generating..." : "Generate report"}
          </button>
        </form>

        {status !== "idle" && (
          <div style={{ ...S.note, ...(status === "error" ? S.err : status === "done" ? S.ok : S.info) }}>
            {message}
          </div>
        )}

        {result && (
          <div style={S.links}>
            {(() => {
              const reportClean = result.report_url;
              const playbookClean = result.playbook_url || null;
              const reportTracked = reportClean ? `${reportClean}?ref=email&magnet=scroll-stopper` : null;
              const playbookTracked = playbookClean ? `${playbookClean}?ref=email&magnet=playbook` : null;
              return (
                <>
                  <div style={S.section}>
                    <div style={S.sectionH}>Internal</div>
                    <div style={S.sectionSub}>Open these to eyeball the reports. No tracking fires.</div>
                    {playbookClean && (
                      <a style={S.openBtn} href={playbookClean} target="_blank" rel="noopener">
                        Open brand playbook
                      </a>
                    )}
                    {reportClean && (
                      <a style={S.openBtn} href={reportClean} target="_blank" rel="noopener">
                        Open scroll-stopper report
                      </a>
                    )}
                  </div>

                  <div style={S.section}>
                    <div style={S.sectionH}>For client</div>
                    <div style={S.sectionSub}>Copy these into your email. Do not open - a click fires the tracking.</div>
                    {playbookTracked && <CopyRow label="Brand playbook" url={playbookTracked} />}
                    {reportTracked && <CopyRow label="Scroll-stopper report" url={reportTracked} />}
                  </div>
                </>
              );
            })()}
            <p style={S.tiny}>Give it ~1 min to finish deploying if a link 404s at first.</p>
          </div>
        )}
      </div>
    </main>
  );
}

// A tracked (client) link: shown as raw, selectable text that copies on
// double-click or via the Copy button. Never rendered as an anchor, so a stray
// click can't fire the open-tracking pixel.
function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older/insecure contexts: fall back to a hidden textarea + execCommand.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={S.copyRow}>
      <div style={S.copyLabel}>{label}</div>
      <div style={S.copyBox}>
        <span
          style={S.copyUrl}
          onDoubleClick={doCopy}
          title="Double-click to copy"
        >
          {url}
        </span>
        <button type="button" style={S.copyBtn} onClick={doCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", background: "#0f1115", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "48px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  card: { width: "100%", maxWidth: 520, background: "#181b22", border: "1px solid #262a33", borderRadius: 14, padding: 28, color: "#e7e9ee" },
  h1: { margin: "0 0 6px", fontSize: 22, fontWeight: 700 },
  sub: { margin: "0 0 20px", fontSize: 14, lineHeight: 1.5, color: "#9aa0ac" },
  label: { display: "block", fontSize: 12, fontWeight: 600, margin: "14px 0 6px", color: "#b7bcc7" },
  input: { width: "100%", boxSizing: "border-box", background: "#0f1115", border: "1px solid #2b3038", borderRadius: 8, padding: "10px 12px", color: "#e7e9ee", fontSize: 14, marginBottom: 6 },
  row: { display: "flex", gap: 12 },
  col: { flex: 1 },
  btn: { width: "100%", marginTop: 18, background: "#6d5efc", color: "#fff", border: "none", borderRadius: 8, padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  note: { marginTop: 16, padding: "10px 12px", borderRadius: 8, fontSize: 13, lineHeight: 1.5 },
  info: { background: "#1c2330", color: "#a9c7ff", border: "1px solid #2b3b57" },
  ok: { background: "#16241b", color: "#9be5b4", border: "1px solid #2c4a37" },
  err: { background: "#2a1a1c", color: "#f2a3ab", border: "1px solid #4d2b30" },
  links: { marginTop: 16, display: "flex", flexDirection: "column", gap: 18 },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionH: { fontSize: 13, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#b7bcc7" },
  sectionSub: { fontSize: 12, color: "#7d838f", margin: "-2px 0 4px" },
  openBtn: { display: "inline-block", background: "#20252f", border: "1px solid #333a46", borderRadius: 8, padding: "9px 12px", color: "#c7bcff", fontSize: 14, fontWeight: 600, textDecoration: "none" },
  copyRow: { display: "flex", flexDirection: "column", gap: 4 },
  copyLabel: { fontSize: 12, fontWeight: 600, color: "#b7bcc7" },
  copyBox: { display: "flex", alignItems: "stretch", gap: 8 },
  copyUrl: { flex: 1, minWidth: 0, background: "#0f1115", border: "1px solid #2b3038", borderRadius: 8, padding: "9px 12px", color: "#e7e9ee", fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all", userSelect: "all", cursor: "copy", lineHeight: 1.4 },
  copyBtn: { flexShrink: 0, background: "#6d5efc", color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tiny: { fontSize: 12, color: "#7d838f", margin: "4px 0 0" },
};
