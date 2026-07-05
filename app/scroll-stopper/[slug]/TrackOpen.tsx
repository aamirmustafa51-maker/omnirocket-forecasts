"use client";

import { useEffect } from "react";

export default function TrackOpen({ slug }: { slug: string }) {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref") || "";
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ref, ua: navigator.userAgent, magnet: "scroll-stopper" }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);

  return null;
}
