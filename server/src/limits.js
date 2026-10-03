// Abuse guards kept in memory (one instance on Render): per-visitor rate limits and a daily cap for everyone.
// ponytail: in-memory state resets on restart and isn't shared across instances; move to Redis if you scale out.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * check(key) -> { ok: true } or { ok: false, reason, retryAfterSec }.
 * perMinute and perDay apply to each key (visitor IP); dailyCap applies to all keys together per UTC day.
 */
export function createLimiter({ perMinute, perDay, dailyCap, now = Date.now }) {
  const hits = new Map(); // key -> timestamps within the last day
  let day = Math.floor(now() / DAY);
  let dayCount = 0;

  return {
    check(key) {
      const t = now();
      const today = Math.floor(t / DAY);
      if (today !== day) { day = today; dayCount = 0; hits.clear(); }
      if (dayCount >= dailyCap) {
        return { ok: false, reason: "daily_cap", retryAfterSec: Math.ceil(((today + 1) * DAY - t) / 1000) };
      }
      const recent = (hits.get(key) ?? []).filter((x) => t - x < DAY);
      const lastMinute = recent.filter((x) => t - x < MINUTE);
      if (lastMinute.length >= perMinute) {
        return { ok: false, reason: "per_minute", retryAfterSec: Math.ceil((lastMinute[0] + MINUTE - t) / 1000) };
      }
      if (recent.length >= perDay) {
        return { ok: false, reason: "per_day", retryAfterSec: Math.ceil((recent[0] + DAY - t) / 1000) };
      }
      recent.push(t);
      hits.set(key, recent);
      dayCount += 1;
      return { ok: true };
    },
  };
}
