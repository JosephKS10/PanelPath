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
}

/** scenario -> year -> poa_code -> tonnes; a missing postcode means 0. */
export type Retirements = Record<Scenario, Record<string, Record<string, number>>>;

export interface Data {
  poa: FeatureCollection<Geometry, { poa_code: string; state: string }>;
  retirements: Retirements;
  sites: Record<Scenario, Sites>;
  coverage: Coverage;
  cohorts: Cohorts;
  assumptions: Assumptions;
}

async function get<T>(name: string): Promise<T> {
  const res = await fetch(`data/${name}`);
  if (!res.ok) throw new Error(`Could not load data/${name} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function loadData(): Promise<Data> {
  const [poa, retirements, coverage, cohorts, assumptions, ...sites] = await Promise.all([
    get<Data["poa"]>("poa.geojson"),
    get<Retirements>("retirements.json"),
    get<Coverage>("coverage.json"),
    get<Cohorts>("cohorts.json"),
    get<Assumptions>("assumptions.json"),
    ...SCENARIOS.map((s) => get<Sites>(`sites_${s}.geojson`)),
  ] as const);
  return {
    poa: poa as Data["poa"],
    retirements: retirements as Retirements,
    coverage: coverage as Coverage,
    cohorts: cohorts as Cohorts,
    assumptions: assumptions as Assumptions,
    sites: Object.fromEntries(SCENARIOS.map((s, i) => [s, sites[i] as Sites])) as Record<Scenario, Sites>,
  };
}

export const fmt = (v: number, digits = 0) =>
  v.toLocaleString("en-AU", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Tonnes with sensible precision: 0.4 t, 12 t, 1,234 t. */
export const fmtT = (v: number) => fmt(v, v > 0 && v < 10 ? 1 : 0);
