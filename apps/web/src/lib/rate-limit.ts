/**
 * In-process sliding window rate limiter for public/abuse-prone routes.
 * Suitable for single-instance / sticky deploys; not a distributed limiter.
 */

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Max requests in the window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
  /** Optional fixed now for tests. */
  now?: number;
};

/** Client IP from proxy headers (Fly / common reverse proxies). */
export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fly = request.headers.get("fly-client-ip")?.trim();
  if (fly) return fly;
  return "unknown";
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = options.now ?? Date.now();
  const windowStart = now - options.windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);
  if (bucket.timestamps.length >= options.limit) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + options.windowMs - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }
  bucket.timestamps.push(now);
  return {
    ok: true,
    remaining: Math.max(0, options.limit - bucket.timestamps.length),
  };
}

/** Test helper — clear all buckets. */
export function resetRateLimitBuckets(): void {
  buckets.clear();
}
