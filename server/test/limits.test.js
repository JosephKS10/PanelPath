import assert from "node:assert/strict";
import test from "node:test";
import { createLimiter } from "../src/limits.js";

test("per-minute, per-day and daily cap limits", () => {
  let t = Date.UTC(2026, 9, 3, 10);
  const lim = createLimiter({ perMinute: 2, perDay: 3, dailyCap: 4, now: () => t });
  assert.ok(lim.check("a").ok);
  assert.ok(lim.check("a").ok);
  assert.equal(lim.check("a").reason, "per_minute");
  t += 61_000;
  assert.ok(lim.check("a").ok);
  t += 61_000;
  assert.equal(lim.check("a").reason, "per_day");
  assert.ok(lim.check("b").ok); // 4th accepted request today
  assert.equal(lim.check("c").reason, "daily_cap");
  t = Date.UTC(2026, 9, 4, 0, 0, 1); // next UTC day resets everything
  assert.ok(lim.check("c").ok);
});
