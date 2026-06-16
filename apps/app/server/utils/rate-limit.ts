/**
 * Dead-simple in-process rate limiter (fixed window). Good enough to blunt
 * brute-force / abuse on unauthenticated token endpoints; it is per-process,
 * so it resets on redeploy and isn't shared across instances — pair it with an
 * unguessable token, never rely on it as the only defense.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Returns true when the caller is WITHIN the limit (allowed), false when they
 * have exceeded `max` hits in the `windowMs` window for this key.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    }
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

/** Best-effort client IP from common proxy headers, falling back to the socket. */
export function clientIp(event: import("h3").H3Event): string {
  const xff = getRequestHeader(event, "x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return getRequestHeader(event, "x-real-ip") || event.node.req.socket?.remoteAddress || "unknown";
}
