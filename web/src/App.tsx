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
  const unit = metric === "density" ? "kg per km²" : "t";

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

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>PanelPath</h1>
          <Nav page={page} />
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
            <input type="search" inputMode="numeric" maxLength={4} placeholder="Find a postcode, e.g. 2765"
              aria-label="Postcode" value={query} onChange={(e) => { setQuery(e.target.value); setSearchMsg(""); }} />
            <button type="submit">Find</button>
          </form>
          {searchMsg && <p className="search-msg" role="status">{searchMsg}</p>}
          <p>Where and when Australia's rooftop solar panels come off roofs, and where {data.coverage.settings.n_sites} collection sites would catch the most waste.</p>
        </header>

        <fieldset className="scenarios">
          <legend>Panel lifetime scenario</legend>
          {SCENARIOS.map((s) => (
            <label key={s} className={s === scenario ? "on" : ""}>
              <input type="radio" name="scenario" value={s} checked={s === scenario} onChange={() => setScenario(s)} />
              <span>{SCENARIO_LABEL[s]}</span>
              <small>{s === data.assumptions.default_scenario ? "default · " : ""}β {beta(s)} yr</small>
            </label>
          ))}
        </fieldset>

        <div className="year">
          <label htmlFor="year">Year <strong>{year}</strong></label>
          <div className="year-row">
            <button
              onClick={() => {
                if (!playing && year === last) setYear(first);
                setPlaying(!playing);
              }}
              aria-label={playing ? "Pause" : "Play through the years"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <input id="year" type="range" min={first} max={last} step={1} value={year}
              onChange={(e) => { setPlaying(false); setYear(Number(e.target.value)); }} />
          </div>
        </div>

        <section className="cards">
          <div className="card">
            <p className="label">Panel waste retiring in {year}</p>
            <p className="big">{fmt(national)} t</p>
          </div>
          <div className="card">
            <p className="label">{demand_years[0]}–{demand_years[1]} waste within {radius_km} km of a site</p>
            <div className="compare">
              <div><p className="big">{fmt(cov.optimised.covered_pct, 1)}%</p><p className="sub">{cov.optimised.sites} optimised sites</p></div>
              <div><p className="big dim">{fmt(cov.capitals_only.covered_pct, 1)}%</p><p className="sub">{cov.capitals_only.sites} capital-city sites</p></div>
            </div>
            <p className="sub">Mean distance to nearest site {fmt(cov.optimised.mean_distance_km)} km vs {fmt(cov.capitals_only.mean_distance_km)} km</p>
          </div>
        </section>

        <section className="legend" aria-label="Legend">
          <div className="legend-head">
            <p className="label">Shade by</p>
            <div className="seg" role="group" aria-label="Shade postcodes by">
              <button aria-pressed={metric === "density"} onClick={() => setMetric("density")}>Per km²</button>
              <button aria-pressed={metric === "total"} onClick={() => setMetric("total")}>Total t</button>
            </div>
          </div>
          <p className="label">{metric === "density" ? "Panel waste per km²" : "Tonnes retiring per postcode"} in {year}</p>
          <ul>
            {[0, ...breaks].map((b, i) => (
              <li key={b}>
                <span className="swatch" style={{ background: RAMP[i] }} />
                {i < breaks.length ? `${fmtClass(b)} – ${fmtClass(breaks[i])} ${unit}` : `${fmtClass(b)} ${unit} and over`}
              </li>
            ))}
            <li><span className="dot" style={{ background: SITE_COLOR }} />Collection site, area = tonnes that year</li>
          </ul>
          <p className="sub">Classes are quantiles over {first}–{last}, fixed so you can watch the waste grow.</p>
        </section>

        <footer>
          Data: Clean Energy Regulator, ABS and Geoscience Australia (CC BY 4.0). Straight-line distances. Panels installed after{" "}
          {new Date(`${data.assumptions.qa.last_install_month}-01T00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" })} are not included.
        </footer>
      </aside>

      <main className="main">
        <MapView data={data} scenario={scenario} year={year} values={byYear[String(year)] ?? {}} breaks={breaks}
          selection={selection} onSelect={setSelection} focus={focus} />
        {selection && <Panel data={data} scenario={scenario} year={year} selection={selection} onSelect={setSelection} />}
      </main>
    </div>
  );
}
