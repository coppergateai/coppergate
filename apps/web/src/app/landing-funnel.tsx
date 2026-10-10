"use client";

import { useEffect } from "react";

/** Fire PRODUCT §13 landing_visit once per browser session. */
export function LandingFunnelBeacon() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("cg_funnel_landing")) return;
      sessionStorage.setItem("cg_funnel_landing", "1");
    } catch {
      /* private mode — still emit */
    }
    void fetch("/api/analytics/funnel", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "landing_visit" }),
    }).catch(() => {
      /* best-effort */
    });
  }, []);
  return null;
}
