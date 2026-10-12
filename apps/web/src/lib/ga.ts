type GtagWindow = Window & {
  gtag?: (
    command: "event",
    action: string,
    params?: Record<string, unknown>,
  ) => void;
};

/**
 * Send a GA4 custom event. No-ops on the server or before GA has loaded.
 */
export function track(action: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const gtag = (window as GtagWindow).gtag;
  if (typeof gtag !== "function") return;
  gtag("event", action, params);
}

/** GA4 measurement id — override with NEXT_PUBLIC_GA_MEASUREMENT_ID. */
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "G-R7MX20G0DF";
