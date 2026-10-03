import { useEffect, useMemo, useState } from "react";
import { fmt, fmtSig, fmtT, loadData, SCENARIO_LABEL, SCENARIOS, type Data, type Scenario } from "./data";
import MapView, { quantileBreaks, RAMP, shadeValues, SITE_COLOR, type Metric } from "./MapView";
import Panel, { type Selection } from "./Panel";
import { MethodPage, ValidationPage } from "./Pages";

const PAGES = [["map", "Map"], ["validation", "Validation"], ["method", "Method and sources"]] as const;
type Page = (typeof PAGES)[number][0];
const readPage = (): Page => (PAGES.find(([id]) => `#${id}` === window.location.hash)?.[0] ?? "map");

function Nav({ page }: { page: Page }) {
  return (
    <nav className="nav" aria-label="Pages">
      {PAGES.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={page === id ? "page" : undefined}>{label}</a>)}
    </nav>
  );
}


export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>("AU_RES");
  const [year, setYear] = useState(2030);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [metric, setMetric] = useState<Metric>("density");
  const [page, setPage] = useState<Page>(readPage);
  const [focus, setFocus] = useState<{ code: string; seq: number } | null>(null);
  const [query, setQuery] = useState("");
  const [searchMsg, setSearchMsg] = useState("");

  useEffect(() => {
    const onHash = () => { setPage(readPage()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    loadData()
      .then((d) => {
        setData(d);
        setScenario(d.assumptions.default_scenario);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const years = data?.sites[scenario].years ?? [];
  const [first, last] = [years[0], years[years.length - 1]];

  // Play steps through the years once, then stops.
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => (year < last ? setYear(year + 1) : setPlaying(false)), 900);
    return () => clearTimeout(t);
  }, [playing, year, last]);

  // Shaded values for every slider year, so class breaks stay fixed while the year changes.
  const byYear = useMemo(
    () => (data ? Object.fromEntries(years.map((y) => [String(y), shadeValues(data, scenario, y, metric)])) : {}),
    [data, scenario, metric, years],
  );
  const breaks = useMemo(() => quantileBreaks(byYear, years), [byYear, years]);
  const fmtClass = metric === "density" ? fmtSig : fmtT;
  const unit = metric === "density" ? "kg per km²" : "tonnes";

  if (error) return <div className="status error">Could not load PanelPath data: {error}</div>;
  if (!data) return <div className="status">Loading data…</div>;

  if (page !== "map") {
    return (
      <div className="page-shell">
        <header className="topbar"><a className="brand" href="#map">PanelPath</a><Nav page={page} /></header>
        <main className="page">{page === "validation" ? <ValidationPage data={data} /> : <MethodPage data={data} />}</main>
      </div>
    );
  }

  const national = Object.values(data.retirements[scenario][String(year)] ?? {}).reduce((a, b) => a + b, 0);
  const cov = data.coverage[scenario];
  const { radius_km, demand_years } = data.coverage.settings;
  const beta = (s: Scenario) => data.assumptions.scenarios.find((x) => x.name === s)?.beta;

  const classes = breaks.length + 1;
  const tick = (v: number) => (v >= 1000 ? `${+(v / 1000).toPrecision(2)}k` : fmtClass(v));
  const months = (ym: string) => new Date(`${ym}-01T00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-row">
          <h1 className="wordmark">PanelPath</h1>
          <Nav page={page} />
        </div>

        <div className="block">
          <form className="search" role="search" onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (!/^\d{3,4}$/.test(q)) return setSearchMsg("Enter a 3 or 4 digit postcode.");
            const code = q.padStart(4, "0");
            if (!data.area[code]) return setSearchMsg(`No postal area for ${code}. PO box and business-only postcodes aren't mapped.`);
            setSearchMsg("");
            setSelection({ kind: "poa", code });
            setFocus({ code, seq: (focus?.seq ?? 0) + 1 });
          }}>
            <input type="search" inputMode="numeric" maxLength={4} placeholder="Search a postcode, e.g. 2765"
              aria-label="Postcode" value={query} onChange={(e) => { setQuery(e.target.value); setSearchMsg(""); }} />
            <button type="submit">Find</button>
          </form>
          {searchMsg && <p className="search-msg" role="status">{searchMsg}</p>}
        </div>

        <div className="block year">
          <label className="kicker" htmlFor="year">Year</label>
          <div className="year-head">
            <span className="year-value">{year}</span>
            <button className="icon-btn" aria-label={playing ? "Pause" : "Play through the years"}
              onClick={() => {
                if (!playing && year === last) setYear(first);
                setPlaying(!playing);
              }}>
              {playing
                ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx=".5" fill="currentColor" /><rect x="7" y="1.5" width="3" height="9" rx=".5" fill="currentColor" /></svg>
                : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor" /></svg>}
            </button>
          </div>
          <input id="year" type="range" min={first} max={last} step={1} value={year} aria-valuetext={`${year}, range ${first} to ${last}`}
            onChange={(e) => { setPlaying(false); setYear(Number(e.target.value)); }} />
        </div>

        <div className="block">
          <p className="kicker">Panel waste retiring in {year}</p>
          <p className="stat">{fmt(national)}<small>tonnes</small></p>
          <div className="compare">
            <p className="kicker">Waste retiring {demand_years[0]}–{demand_years[1]} within {radius_km} km of a site</p>
            <div className="compare-row">
              <span className="pct">{fmt(cov.optimised.covered_pct, 1)}%</span>
              <span className="track"><i style={{ width: `${cov.optimised.covered_pct}%` }} /></span>
              <span className="compare-label">{cov.optimised.sites} optimised sites</span>
            </div>
            <div className="compare-row dim">
              <span className="pct">{fmt(cov.capitals_only.covered_pct, 1)}%</span>
              <span className="track"><i style={{ width: `${cov.capitals_only.covered_pct}%` }} /></span>
              <span className="compare-label">{cov.capitals_only.sites} sites in capital cities only</span>
            </div>
          </div>
          <p className="footnote">Mean distance to nearest site: {fmt(cov.optimised.mean_distance_km)} km vs {fmt(cov.capitals_only.mean_distance_km)} km</p>
        </div>

        <div className="block">
          <p className="kicker" id="scenario-label">Panel lifetime</p>
          <fieldset className="options" aria-labelledby="scenario-label">
            {SCENARIOS.map((s) => (
              <label key={s} className={`option${s === scenario ? " on" : ""}`}>
                <input type="radio" name="scenario" value={s} checked={s === scenario} onChange={() => setScenario(s)} />
                <span>{SCENARIO_LABEL[s]}{s === data.assumptions.default_scenario ? " (default)" : ""}</span>
                <small>{beta(s)} yr</small>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="block">
          <div className="legend-head">
            <p className="kicker">{metric === "density" ? "Waste per km²" : "Tonnes per postcode"}, {year}</p>
            <div className="toggle" role="group" aria-label="Shade postcodes by">
              <button aria-pressed={metric === "density"} onClick={() => setMetric("density")}>Per km²</button>
              <button aria-pressed={metric === "total"} onClick={() => setMetric("total")}>Total</button>
            </div>
          </div>
          <div className="ramp" aria-hidden="true">{RAMP.slice(0, classes).map((c) => <span key={c} style={{ background: c }} />)}</div>
          <div className="ramp-ticks" aria-hidden="true">
            {breaks.map((b, i) => <span key={b} style={{ left: `${((i + 1) / classes) * 100}%` }}>{tick(b)}</span>)}
          </div>
          <p className="legend-unit">{unit}, classes fixed across {first}–{last}</p>
          <p className="sr-only">
            {[0, ...breaks].map((b, i) => (i < breaks.length ? `${fmtClass(b)} to ${fmtClass(breaks[i])} ${unit}` : `${fmtClass(b)} ${unit} and over`)).join("; ")}
          </p>
          <p className="site-key"><span className="site-dot" style={{ background: SITE_COLOR }} />Collection site, sized by tonnes that year</p>
        </div>

        <p className="foot">
          Data: Clean Energy Regulator, ABS and Geoscience Australia (CC BY 4.0). Straight-line distances. Panels installed
          after {months(data.assumptions.qa.last_install_month)} are not included.
        </p>
      </aside>

      <main className="main">
        <MapView data={data} scenario={scenario} year={year} values={byYear[String(year)] ?? {}} breaks={breaks}
          selection={selection} onSelect={setSelection} focus={focus} />
        {selection && <Panel data={data} scenario={scenario} year={year} selection={selection} onSelect={setSelection} />}
      </main>
    </div>
  );
}
