// Lookup tools the model must use for every number. Each reads the map's own data files and returns
// figures pre-formatted the way the map shows them ("display" strings), so answers can quote them exactly.
import { fmtMass, fmtN, fmtPct, fmtT, SCENARIO_LABEL, SCENARIOS, STATES } from "./data.js";

const scenarioProp = {
  type: "string",
  enum: SCENARIOS,
  description: "Lifetime scenario. Use AU_RES (the map's default) unless the person names another one.",
};
const yearProp = { type: "integer", description: "Calendar year, 2015-2035 for retirements (2026-2035 for sites)." };

/** Tool definitions sent to the API. All properties are required; strict mode keeps arguments schema-valid. */
export const TOOL_DEFS = [
  {
    name: "national_forecast",
    description:
      "National panel waste forecast for a scenario: tonnes retiring in each year 2015-2035, the total over 2015-2035, " +
      "the comparison with reported national figures, and recoverable materials 2026-2035. Use for any Australia-wide number.",
    input_schema: { type: "object", properties: { scenario: scenarioProp }, required: ["scenario"], additionalProperties: false },
  },
  {
    name: "postcode_profile",
    description:
      "Everything PanelPath knows about one postcode: state, houses, systems installed by year, tonnes retiring each year " +
      "2015-2035, waste per km2, rank among postcodes, recoverable materials 2026-2035 and its nearest chosen collection site.",
    input_schema: {
      type: "object",
      properties: {
        postcode: { type: "string", description: "Australian postcode, 3 or 4 digits, e.g. 2765 or 0800." },
        scenario: scenarioProp,
        year: yearProp,
      },
      required: ["postcode", "scenario", "year"],
      additionalProperties: false,
    },
  },
  {
    name: "rank_postcodes",
    description: "Postcodes ranked by panel waste retiring in a year, nationally or within one state.",
    input_schema: {
      type: "object",
      properties: {
        year: yearProp,
        scenario: scenarioProp,
        measure: { type: "string", enum: ["tonnes", "kg_per_km2"], description: "Total tonnes, or waste density." },
        state: { type: "string", enum: ["ALL", ...STATES], description: "ALL for national, or a state code." },
        order: { type: "string", enum: ["highest", "lowest"] },
        limit: { type: "integer", description: "How many postcodes to return, 1-20." },
      },
      required: ["year", "scenario", "measure", "state", "order", "limit"],
      additionalProperties: false,
    },
  },
  {
    name: "state_totals",
    description: "Panel waste retiring in a year for every state and territory, with each one's share of the national total.",
    input_schema: {
      type: "object",
      properties: { year: yearProp, scenario: scenarioProp },
      required: ["year", "scenario"],
      additionalProperties: false,
    },
  },
  {
    name: "collection_sites",
    description:
      "The 100 chosen collection sites for a scenario: name, place, facility type, tonnes and panels collected in a year " +
      "and postcodes served. Filter by state and by a text query on name or suburb (empty string for no filter).",
    input_schema: {
      type: "object",
      properties: {
        scenario: scenarioProp,
        year: yearProp,
        state: { type: "string", enum: ["ALL", ...STATES] },
        query: { type: "string", description: "Case-insensitive match on site name or suburb; empty string for all." },
        limit: { type: "integer", description: "How many sites to return, 1-20, largest first." },
      },
      required: ["scenario", "year", "state", "query", "limit"],
      additionalProperties: false,
    },
  },
  {
    name: "site_coverage",
    description:
      "How well the 100 optimised sites cover panel waste retiring 2026-2030 (share within 30 km, mean distance) " +
      "compared with sites limited to capital cities, plus the exact-optimum check and sites per state.",
    input_schema: { type: "object", properties: { scenario: scenarioProp }, required: ["scenario"], additionalProperties: false },
  },
  {
    name: "lifetime_fit",
    description:
      "How PanelPath measured panel lifetimes from postcodes with more installs than houses: the fitted lifetime, " +
      "sensitivity runs, the replacement-share cross-check by state, and the caveats.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "method_and_sources",
    description: "PanelPath's method, assumptions, data sources and licences, limitations, and references.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["scenarios", "panel_mass", "materials", "data_sources", "limitations", "settings", "references"],
        },
      },
      required: ["topic"],
      additionalProperties: false,
    },
  },
].map((t) => ({ ...t, strict: true }));

class ToolInputError extends Error {}
const need = (ok, msg) => { if (!ok) throw new ToolInputError(msg); };
const scenarioOf = (s) => { need(SCENARIOS.includes(s), `Unknown scenario ${s}.`); return s; };
const clampLimit = (v) => Math.min(20, Math.max(1, Number.isInteger(v) ? v : 5));

function retirementYear(d, year) {
  need(Number.isInteger(year) && d.retirementYears.includes(year),
    `Retirement forecasts cover ${d.retirementYears[0]}-${d.retirementYears.at(-1)}.`);
  return String(year);
}
function siteYear(d, year) {
  need(Number.isInteger(year) && d.siteYears.includes(year), `Site figures cover ${d.siteYears[0]}-${d.siteYears.at(-1)}.`);
  return d.siteYears.indexOf(year);
}
// National totals come from the pipeline's exact series (validation.json), as on the map and the validation page.
const nationalTonnes = (d, scenario, year) => {
  const s = d.validation.series[scenario];
  return s.tonnes[s.years.indexOf(year)] ?? 0;
};
const materialsRow = (d, values) => Object.fromEntries(d.materials.keys.map((k, i) => [k, fmtMass(values[i])]));
const scenarioInfo = (d, s) => ({
  scenario: s,
  label: SCENARIO_LABEL[s],
  typical_lifetime_years: d.assumptions.scenarios.find((x) => x.name === s)?.beta,
  is_map_default: s === d.defaultScenario,
});

const TOOLS = {
  national_forecast(d, { scenario }) {
    const s = scenarioOf(scenario);
    const byYear = Object.fromEntries(d.retirementYears.map((y) => [y, fmtT(nationalTonnes(d, s, y))]));
    const total = d.retirementYears.reduce((a, y) => a + nationalTonnes(d, s, y), 0);
    const v = d.validation.scenarios[s];
    return {
      source: `National forecast · ${s}`,
      result: {
        ...scenarioInfo(d, s),
        tonnes_retiring_by_year: byYear,
        total_2015_2035: fmtT(total),
        against_reported_figures: v.targets.map((t) => ({
          reported: `${t.label} ${t.source}`, model: t.metric === "cumulative_panels" ? `${fmtN(t.model)} panels` : fmtT(t.model),
          ratio_to_reported: `${t.ratio.toFixed(2)}x`,
        })),
        closest_scenario_to_reported_figures: d.validation.closest,
        recoverable_materials_2026_2035: materialsRow(d, d.materials.national[s]),
        note: "Small-scale (rooftop) systems only. Totals are sums over postcodes, as on the map.",
      },
    };
  },

  postcode_profile(d, { postcode, scenario, year }) {
    const s = scenarioOf(scenario);
    const y = retirementYear(d, year);
    need(typeof postcode === "string" && /^\d{3,4}$/.test(postcode.trim()), "Postcodes are 3 or 4 digits.");
    const code = postcode.trim().padStart(4, "0");
    if (!d.poaState[code]) {
      return { source: `Postcode ${code}`, result: { postcode: code, found: false,
        note: "No postal area for this postcode. PO box and business-only postcodes are not mapped." } };
    }
    const t = d.retirements[s][y]?.[code] ?? 0;
    const values = Object.entries(d.retirements[s][y]).sort((a, b) => b[1] - a[1]);
    const rank = values.findIndex(([c]) => c === code) + 1;
    const installs = d.cohorts.installs[code] ?? [];
    const site = d.sites[s].features.find((f) => f.properties.poas.includes(code))?.properties;
    return {
      source: `Postcode ${code} · ${s} · ${year}`,
      result: {
        postcode: code, found: true, state: d.poaState[code], ...scenarioInfo(d, s),
        separate_houses_2021_census: fmtN(d.cohorts.houses[code] ?? 0),
        area_km2: fmtN(Math.round(d.poaArea[code] * 10) / 10),
        systems_installed_to_date: fmtN(installs.reduce((a, b) => a + b, 0)),
        systems_installed_by_year: Object.fromEntries(d.cohorts.years.map((yy, i) => [yy, fmtN(installs[i] ?? 0)])),
        registrations_provisional_from: d.cohorts.provisional_from,
        year, tonnes_retiring_in_year: fmtT(t),
        waste_kg_per_km2_in_year: fmtN(Math.round((1000 * t) / d.poaArea[code])),
        national_rank_by_tonnes_in_year: rank > 0 ? `${rank} of ${values.length}` : "not ranked (no retirements)",
        tonnes_retiring_by_year: Object.fromEntries(d.retirementYears.map((yy) => [yy, fmtT(d.retirements[s][String(yy)]?.[code] ?? 0)])),
        recoverable_materials_2026_2035: d.materials.poa[s][code] ? materialsRow(d, d.materials.poa[s][code]) : null,
        nearest_chosen_site: site
          ? { name: site.name, suburb: site.suburb, state: site.state,
            distance: `within ${d.coverage.settings.radius_km} km of the postcode's centre (straight line); exact distances aren't in the data` }
          : `none within ${d.coverage.settings.radius_km} km`,
      },
    };
  },

  rank_postcodes(d, { year, scenario, measure, state, order, limit }) {
    const s = scenarioOf(scenario);
    const y = retirementYear(d, year);
    need(["tonnes", "kg_per_km2"].includes(measure), "measure is tonnes or kg_per_km2.");
    need(state === "ALL" || STATES.includes(state), "Unknown state.");
    const rows = Object.entries(d.retirements[s][y])
      .filter(([c]) => state === "ALL" || d.poaState[c] === state)
      .map(([c, t]) => [c, measure === "tonnes" ? t : (1000 * t) / d.poaArea[c]])
      .sort((a, b) => (order === "lowest" ? a[1] - b[1] : b[1] - a[1]))
      .slice(0, clampLimit(limit));
    return {
      source: `Postcodes ranked by ${measure === "tonnes" ? "tonnes" : "waste per km²"} · ${state} · ${s} · ${year}`,
      result: {
        ...scenarioInfo(d, s), year, measure, state, order,
        postcodes: rows.map(([c, v], i) => ({ rank: i + 1, postcode: c, state: d.poaState[c],
          value: measure === "tonnes" ? fmtT(v) : `${fmtN(Math.round(v))} kg per km²` })),
        note: "Only postcodes with retirements in that year are ranked.",
      },
    };
  },

  state_totals(d, { year, scenario }) {
    const s = scenarioOf(scenario);
    const y = retirementYear(d, year);
    const totals = {};
    for (const [c, t] of Object.entries(d.retirements[s][y])) totals[d.poaState[c]] = (totals[d.poaState[c]] ?? 0) + t;
    const all = nationalTonnes(d, s, year);
    return {
      source: `State totals · ${s} · ${year}`,
      result: {
        ...scenarioInfo(d, s), year, national_total: fmtT(all),
        note: "State figures add up per-postcode values, so they can differ from the national total by a tonne or two of rounding.",
        states: Object.entries(totals).sort((a, b) => b[1] - a[1])
          .map(([st, t]) => ({ state: st, tonnes: fmtT(t), share_of_national: fmtPct((100 * t) / all) })),
      },
    };
  },

  collection_sites(d, { scenario, year, state, query, limit }) {
    const s = scenarioOf(scenario);
    const i = siteYear(d, year);
    need(state === "ALL" || STATES.includes(state), "Unknown state.");
    const q = String(query ?? "").trim().toLowerCase();
    const sites = d.sites[s].features.map((f) => f.properties)
      .filter((p) => (state === "ALL" || p.state === state) &&
        (!q || p.name.toLowerCase().includes(q) || (p.suburb ?? "").toLowerCase().includes(q)));
    return {
      source: `Collection sites · ${state}${q ? ` · "${q}"` : ""} · ${s} · ${year}`,
      result: {
        ...scenarioInfo(d, s), year, matching_sites: sites.length,
        sites: sites.sort((a, b) => b.tonnes[i] - a.tonnes[i]).slice(0, clampLimit(limit)).map((p) => ({
          name: p.name, suburb: p.suburb, state: p.state,
          facility_type: p.type.split("; ").map((x) => x.charAt(0) + x.slice(1).toLowerCase()).join(", "),
          in_capital_city: p.in_capital, tonnes_in_year: fmtT(p.tonnes[i]), panels_in_year: fmtN(p.panels[i]),
          tonnes_2026_2035: fmtT(p.tonnes.reduce((a, b) => a + b, 0)), postcodes_served: p.poas.length,
        })),
        note: "Each covered postcode is assigned to its nearest chosen site within 30 km (straight line).",
      },
    };
  },

  site_coverage(d, { scenario }) {
    const s = scenarioOf(scenario);
    const c = d.coverage[s];
    const set = (x) => ({ sites: x.sites, share_of_waste_within_radius: fmtPct(x.covered_pct),
      tonnes_within_radius: fmtT(x.covered_tonnes), mean_distance_to_nearest_site: `${fmtN(Math.round(x.mean_distance_km))} km` });
    return {
      source: `Site coverage · ${s}`,
      result: {
        ...scenarioInfo(d, s),
        demand: `Panel waste retiring ${d.coverage.settings.demand_years.join("-")}: ${fmtT(c.demand_tonnes)}`,
        radius: `${d.coverage.settings.radius_km} km, straight line`,
        optimised_100_sites: set(c.optimised),
        capital_cities_only: set(c.capitals_only),
        exact_optimum: { share_of_waste_within_radius: fmtPct(c.exact.covered_pct),
          greedy_reaches_share_of_optimum: fmtPct(c.exact.greedy_vs_exact_pct) },
        candidate_facilities: fmtN(d.coverage.settings.candidates),
        minimum_sites_per_state: d.coverage.settings.min_sites_per_state,
      },
    };
  },

  lifetime_fit(d) {
    const f = d.fit;
    const latest = Math.max(...f.cross_check.map((c) => c.year));
    const census = f.sensitivity.find((r) => r.cutoff.startsWith("2021"));
    return {
      source: "Lifetime fit",
      result: {
        method: "Where a postcode has more solar installs than houses, the excess is read as replacements; the Weibull " +
          "scale (typical lifetime) is fitted so modelled replacements match that excess. Shape held at the UNSW value.",
        fitted_typical_lifetime_years: f.beta, shape_alpha: f.alpha, postcodes_used: f.n_poas, postcodes_by_state: f.states,
        installs_counted_to: f.cutoff, share_retired_by_age_15: fmtPct(100 * f.f15, 0),
        sensitivity_runs: f.sensitivity.map((r) => ({ run: r.name, postcodes: r.n_poas, lifetime_years: r.beta })),
        replacement_share_of_installs: f.cross_check.filter((c) => c.year === latest).map((c) => ({
          state: c.state === "AUS" ? "National" : c.state, year: c.year,
          fitted: fmtPct(100 * c.share_FITTED, 0), au_res: fmtPct(100 * c.share_AU_RES, 0) })),
        industry_report: "Over a third of new installs in some states are replacements [12].",
        caveats: [
          `Only ${census?.n_poas ?? "a few"} postcodes were full by Census night 2021, so the main fit counts installs to ${f.cutoff}; homes built since 2021 then push the lifetime down.`,
          "Houses that never got solar, and panels removed without a new install, push the lifetime up, so it is an upper-end estimate.",
          "The fit uses full postcodes only and is applied nationally. The map defaults to AU_RES because it matches reported national waste.",
        ],
      },
    };
  },

  method_and_sources(d, { topic }) {
    const a = d.assumptions;
    const qa = a.qa;
    const topics = {
      scenarios: a.scenarios.map((s) => ({ ...s, label: SCENARIO_LABEL[s.name] })),
      panel_mass: a.panel_table,
      materials: { share_of_panel_mass: Object.fromEntries(Object.entries(d.materials.shares).map(([k, v]) => [k, fmtPct(100 * v, 2)])),
        silver_share_of_material_value: fmtPct(100 * d.materials.silver_value_share, 0), source: d.materials.source },
      data_sources: a.data_sources.map(({ name, publisher, licence, used_for }) => ({ name, publisher, licence, used_for })),
      limitations: [
        "Only small-scale systems (up to 100 kW) are counted; solar farms are not in the Clean Energy Regulator postcode data.",
        "Mass per kW by install year is a starting estimate and the biggest assumption after lifetime.",
        `${qa.unmatched_postcodes} CER postcodes (PO boxes and similar) have no postal area; they hold ${fmtN(qa.unmatched_installs)} installs, ${qa.unmatched_kw_pct}% of national kW.`,
        `Registrations from ${d.cohorts.provisional_from} are provisional; panels installed after ${qa.last_install_month} are not modelled.`,
        "Distances are straight lines from postcode centroids, not road distances; sites have no capacity limit.",
        `${fmtN(qa.candidate_sites_town_centre)} of ${fmtN(qa.candidate_sites)} candidate sites are located only to their town centre.`,
        "Every panel is assumed to be crystalline silicon.",
      ],
      settings: a.settings,
      references: a.references,
    };
    need(topic in topics, "Unknown topic.");
    return { source: `Method and sources · ${topic.replace("_", " ")}`, result: { topic, content: topics[topic] } };
  },
};

/** Run one tool call. Returns { content, source, isError } ready for a tool_result block. */
export function runTool(d, name, input) {
  const tool = TOOLS[name];
  if (!tool) return { content: JSON.stringify({ error: `Unknown tool ${name}.` }), source: null, isError: true };
  try {
    const { source, result } = tool(d, input && typeof input === "object" ? input : {});
    return { content: JSON.stringify(result), source, isError: false };
  } catch (e) {
    if (e instanceof ToolInputError) return { content: JSON.stringify({ error: e.message }), source: null, isError: true };
    throw e;
  }
}
