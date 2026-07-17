"use client";

import { useEffect } from "react";

export default function TrackOpen({ slug }: { slug: string }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") || "";
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ref, ua: navigator.userAgent, magnet: "game-plan" }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);

  return null;
}
