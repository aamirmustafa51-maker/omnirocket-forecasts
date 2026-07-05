import { NextRequest, NextResponse } from "next/server";
import { bumpOpenPing, bumpScrollStopperOpen } from "@/lib/shared/sheets";
import { postSlack } from "@/lib/shared/publish";

export const runtime = "nodejs";

const BASE = "https://omnirocket-forecasts.vercel.app";
const SCROLL_SLACK = "SLACK_WEBHOOK_URL_SCROLL_STOPPER";

export async function POST(req: NextRequest) {
  try {
    const { slug, ref, ua, magnet } = await req.json();
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const source = ref === "email" ? "via email" : "direct/preview";
    const uaLine = ua ? `\n_${ua}_` : "";

    // Scroll-Stopper family (playbook + report) → its own channel + tab.
    if (magnet === "playbook" || magnet === "scroll-stopper") {
      const path = magnet === "playbook" ? "playbook" : "scroll-stopper";
      const label = magnet === "playbook" ? "🧠 Playbook opened" : "🖼️ Ads opened";
      await postSlack(`${label} — *${slug}* (${source})\n${BASE}/${path}/${slug}${uaLine}`, SCROLL_SLACK);
      if (ref === "email") {
        try {
          await bumpScrollStopperOpen(slug, magnet === "playbook" ? "playbook" : "report", new Date().toISOString());
        } catch (e) {
          console.error("Scroll-stopper sheet bump failed:", e);
        }
      }
      return NextResponse.json({ ok: true });
    }

    // Default: Fatigue Forecast → default channel + Lead Forecast tab.
    await postSlack(`📖 Forecast opened — *${slug}* (${source})\n${BASE}/forecast/${slug}${uaLine}`);
    if (ref === "email") {
      try {
        await bumpOpenPing(slug, new Date().toISOString());
      } catch (e) {
        console.error("Sheet bump failed:", e);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("track failed:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
