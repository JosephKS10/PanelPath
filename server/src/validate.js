// Validates the chat request body before anything reaches the model.
import { SCENARIOS } from "./data.js";

export const LIMITS = { maxMessages: 12, maxUserChars: 500, maxAssistantChars: 4000 };

/** Returns { ok: true, history, ctx } or { ok: false, error }. */
export function validateChatRequest(body, years) {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object." };
  const { messages, context } = body;
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, error: "messages must be a non-empty array." };
  const history = messages.slice(-LIMITS.maxMessages);
  for (const m of history) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) {
      return { ok: false, error: "Each message needs a role (user or assistant) and non-empty text." };
    }
    const max = m.role === "user" ? LIMITS.maxUserChars : LIMITS.maxAssistantChars;
    if (m.content.length > max) return { ok: false, error: `Messages are limited to ${max} characters.` };
  }
  if (history[0].role !== "user") history.shift(); // the window must start with a question
  if (history.length === 0 || history.at(-1).role !== "user") return { ok: false, error: "The last message must be the question." };

  let ctx = null;
  if (context != null) {
    const { scenario, year, postcode } = context;
    if (!SCENARIOS.includes(scenario) || !Number.isInteger(year) || !years.includes(year)) {
      return { ok: false, error: "Invalid map context." };
    }
    if (postcode != null && !/^\d{4}$/.test(postcode)) return { ok: false, error: "Invalid map context." };
    ctx = { scenario, year, postcode: postcode ?? null };
  }
  return { ok: true, history: history.map((m) => ({ role: m.role, content: m.content.trim() })), ctx };
}
