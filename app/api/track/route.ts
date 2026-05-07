import { NextRequest, NextResponse } from "next/server";
import { bumpOpenPing } from "@/lib/shared/sheets";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { slug, ref, ua } = await req.json();
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (!webhook) return NextResponse.json({ ok: true });

    const source = ref === "email" ? "via email" : "direct/preview";
    const url = `https://omnirocket-forecasts.vercel.app/forecast/${slug}`;
    const text = `📖 Forecast opened — *${slug}* (${source})\n${url}${ua ? `\n_${ua}_` : ""}`;

    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

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
