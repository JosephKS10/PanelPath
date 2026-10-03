import assert from "node:assert/strict";
import test from "node:test";
import { loadData } from "../src/data.js";
import { createApp } from "../src/server.js";

const data = loadData();
const base = { port: 0, allowedOrigins: ["https://panelpath.example"], chatEnabled: true, hasKey: true, perMinute: 3, perDay: 10, dailyCap: 100 };
const quiet = { info() {}, error() {} };

async function withServer(config, answerFn, fn) {
  const server = createApp({ config: { ...base, ...config }, data, answerFn, log: quiet });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try { await fn(url); } finally { server.close(); }
}
const post = (url, body, headers = {}) => fetch(`${url}/api/chat`, { method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://panelpath.example", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body) });
const question = { messages: [{ role: "user", content: "How much in 2765?" }], context: { scenario: "AU_RES", year: 2030, postcode: "2765" } };

test("answers allowed origins and passes validated context through", async () => {
  let seen;
  await withServer({}, async (_d, history, ctx) => { seen = { history, ctx }; return { answer: "283 t", sources: ["Postcode 2765"] }; }, async (url) => {
    const r = await post(url, question);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("access-control-allow-origin"), "https://panelpath.example");
    assert.deepEqual(await r.json(), { answer: "283 t", sources: ["Postcode 2765"] });
    assert.deepEqual(seen.ctx, { scenario: "AU_RES", year: 2030, postcode: "2765" });
  });
});

test("rejects other origins, bad bodies and oversized input", async () => {
  await withServer({ perMinute: 100 }, async () => ({ answer: "x" }), async (url) => {
    assert.equal((await post(url, question, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await post(url, "{not json")).status, 400);
    assert.equal((await post(url, { messages: [] })).status, 400);
    assert.equal((await post(url, { messages: [{ role: "user", content: "x".repeat(501) }] })).status, 400);
    assert.equal((await post(url, { messages: [{ role: "system", content: "hi" }] })).status, 400);
    assert.equal((await post(url, { ...question, context: { scenario: "AU_RES", year: 1999 } })).status, 400);
    assert.equal((await post(url, JSON.stringify({ pad: "x".repeat(20_000) }))).status, 413);
  });
});

test("rate limits per visitor and handles CORS preflight", async () => {
  await withServer({ perMinute: 2 }, async () => ({ answer: "ok", sources: [] }), async (url) => {
    const pre = await fetch(`${url}/api/chat`, { method: "OPTIONS", headers: { Origin: "https://panelpath.example" } });
    assert.equal(pre.status, 204);
    assert.equal((await post(url, question)).status, 200);
    assert.equal((await post(url, question)).status, 200);
    const limited = await post(url, question);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
  });
});

test("kill switch and missing key return 503; health reports it", async () => {
  await withServer({ chatEnabled: false }, async () => ({ answer: "x" }), async (url) => {
    assert.equal((await post(url, question)).status, 503);
    assert.deepEqual(await (await fetch(`${url}/health`)).json(), { ok: true, chat: false });
  });
  await withServer({ hasKey: false }, async () => ({ answer: "x" }), async (url) => {
    assert.equal((await post(url, question)).status, 503);
  });
});

test("model errors become a generic 502 without leaking details", async () => {
  await withServer({}, async () => { throw new Error("secret internal detail"); }, async (url) => {
    const r = await post(url, question);
    assert.equal(r.status, 502);
    assert.doesNotMatch(JSON.stringify(await r.json()), /secret/);
  });
});
