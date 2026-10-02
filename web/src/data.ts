import type { FeatureCollection, Geometry, Point } from "geojson";

// Schemas are documented in the README ("Web data"); files are written by `python -m pipeline.run --stage export`.

export const SCENARIOS = ["AU_RES", "FITTED", "INTL_EARLY", "INTL_REGULAR"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface SiteProps {
  rank: number;
  id: string;
  name: string;
  owner: string | null;
  type: string;
  state: string;
  suburb: string | null;
  in_capital: boolean;
  tonnes: number[];
  panels: number[];
  poas: string[];
}
export type Sites = FeatureCollection<Point, SiteProps> & { years: number[] };

export interface CoverageSet {
  sites: number;
  covered_tonnes: number;
  covered_pct: number;
  covered_poas: number;
  mean_distance_km: number;
}
export interface ScenarioCoverage {
  demand_tonnes: number;
  optimised: CoverageSet;
  capitals_only: CoverageSet;
  exact: CoverageSet & { greedy_vs_exact_pct: number };
}
export type Coverage = Record<Scenario, ScenarioCoverage> & {
  settings: { n_sites: number; radius_km: number; demand_years: [number, number] };
};

export interface Cohorts {
  years: number[];
  provisional_from: string;
  installs: Record<string, number[]>;
  houses: Record<string, number>;
}

export interface Assumptions {
  scenarios: { name: Scenario; beta: number; alpha: number; source: string }[];
  default_scenario: Scenario;
  panel_table: { source: string; rows: { from_year: number; to_year: number | null; watts_per_panel: number;
    kg_per_panel: number; kg_per_kw: number }[] };
  settings: { name: string; value: number | string | (number | string)[]; source: string }[];
  data_sources: { name: string; publisher: string; url: string; licence: string; attribution: string; used_for: string }[];
  references: Record<string, { title: string; url: string }>;
  qa: { unmatched_postcodes: number; unmatched_installs: number; unmatched_kw_pct: number; candidate_sites: number;
    candidate_sites_town_centre: number; first_install_month: string; last_install_month: string };
}

export interface Target {
  metric: "annual_tonnes" | "cumulative_tonnes" | "cumulative_panels";
  year: number;
  value: number;
  label: string;
  source: string;
  lower_bound?: boolean;
}
export interface Validation {
  targets: Target[];
  scenarios: Record<Scenario, { targets: (Target & { model: number; ratio: number })[]; mean_abs_log_ratio: number }>;
  closest: Scenario;
  series: Record<Scenario, { years: number[]; tonnes: number[]; cumulative_tonnes: number[] }>;
}

interface FitRun { name: string; cutoff: string; n_poas: number; beta: number | null; rmse: number | null;
  f15: number | null; denominator: string; max_mean_kw: number }
export interface FitReport {
  beta: number;
  alpha: number;
  n_poas: number;
  rmse: number;
  f15: number;
  cutoff: string;
  states: Record<string, number>;
  filters: { min_dwellings: number; max_mean_kw: number; mean_kw_years: [number, number] };
  grid: { beta: number[]; rmse: number[] };
  sensitivity: FitRun[];
  cross_check: { state: string; year: number; installs: number; share_FITTED: number; share_AU_RES: number }[];
  poas: { poa_code: string[]; excess: number[]; modelled: number[] };
}

/** Material tonnes in panels retiring over `years`; arrays follow `keys`. */
export interface Materials {
  years: [number, number];
  source: string;
  shares: Record<string, number>;
  silver_value_share: number;
  keys: string[];
  national: Record<Scenario, number[]>;
  poa: Record<Scenario, Record<string, number[]>>;
  sites: Record<Scenario, Record<string, number[]>>;
}

/** scenario -> year -> poa_code -> tonnes; a missing postcode means 0. */
export type Retirements = Record<Scenario, Record<string, Record<string, number>>>;

export interface Data {
  poa: FeatureCollection<Geometry, { poa_code: string; state: string; area_km2: number }>;
  /** poa_code -> area in km2, from poa.geojson. */
  area: Record<string, number>;
  retirements: Retirements;
  sites: Record<Scenario, Sites>;
  coverage: Coverage;
  cohorts: Cohorts;
  assumptions: Assumptions;
  validation: Validation;
  fit: FitReport;
  materials: Materials;
}

async function get<T>(name: string): Promise<T> {
  const res = await fetch(`data/${name}`);
  if (!res.ok) throw new Error(`Could not load data/${name} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function loadData(): Promise<Data> {
  const [poa, retirements, coverage, cohorts, assumptions, validation, fit, materials, ...sites] = await Promise.all([
    get<Data["poa"]>("poa.geojson"),
    get<Retirements>("retirements.json"),
    get<Coverage>("coverage.json"),
    get<Cohorts>("cohorts.json"),
    get<Assumptions>("assumptions.json"),
    get<Validation>("validation.json"),
    get<FitReport>("fit_report.json"),
    get<Materials>("materials.json"),
    ...SCENARIOS.map((s) => get<Sites>(`sites_${s}.geojson`)),
  ] as const);
  return {
    poa: poa as Data["poa"],
    area: Object.fromEntries((poa as Data["poa"]).features.map((f) => [f.properties.poa_code, f.properties.area_km2])),
    retirements: retirements as Retirements,
    coverage: coverage as Coverage,
    cohorts: cohorts as Cohorts,
    assumptions: assumptions as Assumptions,
    validation: validation as Validation,
    fit: fit as FitReport,
    materials: materials as Materials,
    sites: Object.fromEntries(SCENARIOS.map((s, i) => [s, sites[i] as Sites])) as Record<Scenario, Sites>,
  };
}

export const fmt = (v: number, digits = 0) =>
  v.toLocaleString("en-AU", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Tonnes with sensible precision: 0.4 t, 12 t, 1,234 t. */
export const fmtT = (v: number) => fmt(v, v > 0 && v < 10 ? 1 : 0);

/** Two significant figures below 10 (0.0042, 3.1), whole numbers above. */
export const fmtSig = (v: number) =>
  v >= 10 || v === 0 ? fmt(v) : v.toLocaleString("en-AU", { maximumSignificantDigits: 2 });

/** Line colours per scenario; the same as SCENARIO_COLORS in pipeline/config.py (validated categorical slots). */
export const SCENARIO_COLOR: Record<Scenario, string> = {
  AU_RES: "#2a78d6", INTL_EARLY: "#eb6834", INTL_REGULAR: "#1baf7a", FITTED: "#eda100",
};

export const SCENARIO_LABEL: Record<Scenario, string> = {
  AU_RES: "Australian residential",
  FITTED: "Fitted from our data",
  INTL_EARLY: "International, early loss",
  INTL_REGULAR: "International, regular loss",
};

export const MATERIAL_LABEL: Record<string, string> = {
  glass: "Glass", aluminium: "Aluminium", polymer: "Polymer", silicon: "Silicon", copper: "Copper",
  tin_lead: "Tin and lead", silver: "Silver",
};

/** Material tonnes for display: kilograms below 10 t (silver, tin and lead), tonnes above. */
export const fmtMass = (t: number) => (t < 10 ? `${fmt(t * 1000)} kg` : `${fmt(t)} t`);
