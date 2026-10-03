// PanelPath chat server: POST /api/chat answers questions from the map's data; GET /health reports status.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { loadData } from "./data.js";
import { createLimiter } from "./limits.js";
import { validateChatRequest } from "./validate.js";

const MAX_BODY_BYTES = 16 * 1024;
const int = (v, fallback) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : fallback);

export function configFromEnv(env = process.env) {
  return {
    port: int(env.PORT, 8787),
    // Comma-separated site origins allowed to call the API, e.g. https://panelpath.netlify.app. Empty = any (local dev only).
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean),
    chatEnabled: env.CHAT_ENABLED !== "false",
    hasKey: Boolean(env.ANTHROPIC_API_KEY),
    perMinute: int(env.RATE_PER_MINUTE, 6),
    perDay: int(env.RATE_PER_DAY, 40),
    dailyCap: int(env.DAILY_CAP, 400),
  };
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", ...headers });
  res.end(JSON.stringify(body));
};

/** Client IP as seen by Render's proxy (first X-Forwarded-For entry), else the socket address. */
// ponytail: X-Forwarded-For can be spoofed, so per-IP limits are a speed bump; DAILY_CAP and the Anthropic
// Console spend limit are the hard ceilings.
const clientIp = (req) => (req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "unknown");

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request too large."), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Body must be valid JSON."), { status: 400 }); }
}

/** Build the HTTP server. `answerFn(data, history, ctx)` is injected so tests can run without the API. */
export function createApp({ config, data, answerFn, log = console }) {
  const limiter = createLimiter(config);
  const allowed = (origin) => config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin);

  return createServer(async (req, res) => {
    const started = Date.now();
    const origin = req.headers.origin;
    const cors = origin && allowed(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" };
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, chat: config.chatEnabled && config.hasKey }, cors);
    }
    if (url.pathname !== "/api/chat") return send(res, 404, { error: "Not found." }, cors);
    if (req.method === "OPTIONS") {
      if (!origin || !allowed(origin)) return send(res, 403, { error: "Origin not allowed." });
      res.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600" });
      return res.end();
    }
    if (req.method !== "POST") return send(res, 405, { error: "Use POST." }, { ...cors, Allow: "POST, OPTIONS" });
    if (config.allowedOrigins.length > 0 && !allowed(origin)) return send(res, 403, { error: "Origin not allowed." }, cors);
    if (!config.chatEnabled || !config.hasKey) return send(res, 503, { error: "The assistant is switched off right now." }, cors);
    if (!(req.headers["content-type"] ?? "").startsWith("application/json")) {
      return send(res, 415, { error: "Send JSON." }, cors);
    }

    const verdict = limiter.check(clientIp(req));
    if (!verdict.ok) {
      const message = verdict.reason === "daily_cap"
        ? "The assistant has answered as many questions as it can today. Please try again tomorrow."
        : "You're asking quickly. Please wait a moment and try again.";
      return send(res, 429, { error: message }, { ...cors, "Retry-After": String(verdict.retryAfterSec) });
    }

    let status = 200;
    try {
      const body = await readJson(req);
      const v = validateChatRequest(body, data.retirementYears);
      if (!v.ok) { status = 400; return send(res, 400, { error: v.error }, cors); }
      const result = await answerFn(data, v.history, v.ctx);
      log.info?.(JSON.stringify({ at: new Date().toISOString(), status, ms: Date.now() - started,
        sources: result.sources?.length ?? 0, usage: result.usage }));
      return send(res, 200, { answer: result.answer, sources: result.sources ?? [] }, cors);
    } catch (e) {
      status = e.status && e.status < 500 && !(e instanceof Anthropic.APIError) ? e.status : 502;
      if (e instanceof Anthropic.RateLimitError) status = 503;
      log.error?.(JSON.stringify({ at: new Date().toISOString(), status, ms: Date.now() - started,
        error: e instanceof Anthropic.APIError ? `anthropic ${e.status}` : e.message }));
      const message = status < 500 ? e.message : "The assistant couldn't answer just now. Please try again in a minute.";
      return send(res, status, { error: message }, cors);
    }
  });
}

// Started directly (node src/server.js): load data, wire the real Claude client, listen.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = configFromEnv();
  const data = loadData();
  const { answer, MODEL } = await import("./chat.js");
  const server = createApp({ config, data, answerFn: answer });
  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;
  server.listen(config.port, () => {
    console.log(`PanelPath chat on :${config.port} · model ${MODEL} · chat ${config.chatEnabled && config.hasKey ? "on" : "off"}` +
      ` · origins ${config.allowedOrigins.join(", ") || "any (set ALLOWED_ORIGINS in production)"}` +
      ` · limits ${config.perMinute}/min, ${config.perDay}/day per visitor, ${config.dailyCap}/day total`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
