"use client";

import { useEffect } from "react";

export default function TrackOpen({ slug }: { slug: string }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") || "";
    // Standalone Brand Playbook flow tags its link with ?magnet=brand-playbook
    // so its opens route to that channel/tab; scroll-stopper's playbook link
    // uses magnet=playbook (the default).
    const magnet = params.get("magnet") === "brand-playbook" ? "brand-playbook" : "playbook";
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ref, ua: navigator.userAgent, magnet }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);

  return null;
}
