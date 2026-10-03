// Loads the same JSON files the map reads (web/public/data), so the chat can only quote what the map shows.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(here, "../../web/public/data");

export const SCENARIOS = ["AU_RES", "FITTED", "INTL_EARLY", "INTL_REGULAR"];
export const SCENARIO_LABEL = {
  AU_RES: "Australian residential",
  FITTED: "Fitted from PanelPath's own data",
  INTL_EARLY: "International, early loss",
  INTL_REGULAR: "International, regular loss",
};
export const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT", "OT"];

const read = (name) => JSON.parse(readFileSync(path.join(DATA_DIR, name), "utf8"));

/** Read every data file once at startup and build the lookups the tools need. */
export function loadData() {
  const poa = read("poa.geojson");
  const d = {
    retirements: read("retirements.json"),
    coverage: read("coverage.json"),
    validation: read("validation.json"),
    fit: read("fit_report.json"),
    cohorts: read("cohorts.json"),
    assumptions: read("assumptions.json"),
    materials: read("materials.json"),
    sites: Object.fromEntries(SCENARIOS.map((s) => [s, read(`sites_${s}.geojson`)])),
    poaState: {},
    poaArea: {},
  };
  for (const f of poa.features) {
    d.poaState[f.properties.poa_code] = f.properties.state;
    d.poaArea[f.properties.poa_code] = f.properties.area_km2;
  }
  d.defaultScenario = d.assumptions.default_scenario;
  d.retirementYears = Object.keys(d.retirements[d.defaultScenario]).map(Number).sort((a, b) => a - b);
  d.siteYears = d.sites[d.defaultScenario].years;
  return d;
}

// Number formats match the map: tonnes below 10 get one decimal, everything else whole numbers with commas.
const n = (v, digits = 0) => v.toLocaleString("en-AU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtT = (t) => `${n(t, t > 0 && t < 10 ? 1 : 0)} t`;
export const fmtN = (v) => n(v);
export const fmtPct = (v, digits = 1) => `${n(v, digits)}%`;
export const fmtMass = (t) => (t < 10 ? `${n(t * 1000)} kg` : `${n(t)} t`);
