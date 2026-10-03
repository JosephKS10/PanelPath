import assert from "node:assert/strict";
import test from "node:test";
import { loadData } from "../src/data.js";
import { runTool, TOOL_DEFS } from "../src/tools.js";

const d = loadData();
const call = (name, input) => {
  const r = runTool(d, name, input);
  return { ...r, result: JSON.parse(r.content) };
};

test("every tool schema is strict with all properties required", () => {
  assert.equal(TOOL_DEFS.length, 8);
  for (const t of TOOL_DEFS) {
    assert.equal(t.strict, true);
    assert.equal(t.input_schema.additionalProperties, false);
    assert.deepEqual([...t.input_schema.required].sort(), Object.keys(t.input_schema.properties).sort(), t.name);
  }
});

test("figures match what the map shows", () => {
  assert.equal(call("national_forecast", { scenario: "AU_RES" }).result.tonnes_retiring_by_year["2030"], "75,563 t");
  const p = call("postcode_profile", { postcode: "2765", scenario: "AU_RES", year: 2030 }).result;
  assert.equal(p.tonnes_retiring_in_year, "283 t");
  assert.equal(p.nearest_chosen_site.name, "Penrith Waste Services Pty Ltd");
  const c = call("site_coverage", { scenario: "AU_RES" }).result;
  assert.equal(c.optimised_100_sites.share_of_waste_within_radius, "88.4%");
  assert.equal(c.capital_cities_only.share_of_waste_within_radius, "62.8%");
  assert.equal(call("lifetime_fit", {}).result.fitted_typical_lifetime_years, 26.25);
});

test("state totals add up to the national total", () => {
  const r = call("state_totals", { year: 2030, scenario: "AU_RES" }).result;
  const sum = r.states.reduce((a, s) => a + Number(s.tonnes.replace(/[^\d.]/g, "")), 0);
  assert.equal(r.national_total, "75,563 t");
  assert.ok(Math.abs(sum - 75563) <= r.states.length, `${sum}`); // per-state rounding only
});

test("ranking and site search respect their filters and limits", () => {
  const r = call("rank_postcodes", { year: 2030, scenario: "AU_RES", measure: "tonnes", state: "SA", order: "highest", limit: 50 }).result;
  assert.equal(r.postcodes.length, 20);
  assert.ok(r.postcodes.every((p) => p.state === "SA"));
  const s = call("collection_sites", { scenario: "AU_RES", year: 2030, state: "ALL", query: "penrith", limit: 5 }).result;
  assert.equal(s.sites[0].panels_in_year, "83,141");
});

test("unknown postcodes and bad input come back as plain answers or tool errors", () => {
  assert.equal(call("postcode_profile", { postcode: "800", scenario: "AU_RES", year: 2030 }).result.postcode, "0800");
  assert.equal(call("postcode_profile", { postcode: "2001", scenario: "AU_RES", year: 2030 }).result.found, false);
  assert.equal(call("postcode_profile", { postcode: "abc", scenario: "AU_RES", year: 2030 }).isError, true);
  assert.equal(call("state_totals", { year: 2040, scenario: "AU_RES" }).isError, true);
  assert.equal(call("state_totals", { year: 2030, scenario: "NOPE" }).isError, true);
  assert.equal(call("no_such_tool", {}).isError, true);
});
