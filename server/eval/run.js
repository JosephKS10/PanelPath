// Runs the eval questions through the real model and checks each answer against figures from the data.
// Costs real money (about 25 questions); needs ANTHROPIC_API_KEY in server/.env.
import { readFileSync } from "node:fs";
import { answer, MODEL } from "../src/chat.js";
import { loadData } from "../src/data.js";

// Claude Sonnet 5.5 list prices per million tokens: input $2, output $10, cache write x1.25, cache read $0.20.
const PRICE = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 };
const data = loadData();
const questions = JSON.parse(readFileSync(new URL("./questions.json", import.meta.url), "utf8"));
const only = process.argv[2];
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");
let failed = 0;
let cost = 0;

for (const q of questions.filter((x) => !only || x.id === only)) {
  const r = await answer(data, [{ role: "user", content: q.question }], q.context ?? null);
  const a = norm(r.answer);
  const problems = [
    ...(q.all ?? []).filter((x) => !a.includes(norm(x))).map((x) => `missing "${x}"`),
    ...(q.any && !q.any.some((x) => a.includes(norm(x))) ? [`none of ${JSON.stringify(q.any)}`] : []),
    ...(q.none ?? []).filter((x) => a.includes(norm(x))).map((x) => `should not contain "${x}"`),
  ];
  const u = r.usage;
  const c = (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + u.cache_creation_input_tokens * PRICE.cacheWrite
    + u.cache_read_input_tokens * PRICE.cacheRead) / 1e6;
  cost += c;
  if (problems.length) failed += 1;
  console.log(`${problems.length ? "FAIL" : "pass"}  ${q.id.padEnd(26)} $${c.toFixed(4)}  ${u.requests} req  ${problems.join("; ")}`);
  if (problems.length || process.env.SHOW) console.log(`      ${r.answer.replace(/\n/g, "\n      ")}\n      sources: ${r.sources.join(" | ")}`);
}
console.log(`\n${MODEL}: ${failed ? `${failed} failed` : "all passed"} · total cost about $${cost.toFixed(3)}`);
process.exit(failed ? 1 : 0);
