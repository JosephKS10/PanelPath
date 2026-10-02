import { LineChart, ScatterChart } from "./charts";
import { fmt, fmtMass, MATERIAL_LABEL, SCENARIO_COLOR, SCENARIO_LABEL, SCENARIOS, type Data, type Scenario, type Target } from "./data";

// Every model number on these pages is read from web/public/data/ (validation.json, fit_report.json,
// coverage.json, assumptions.json, cohorts.json). Reported figures carry their reference number.

const kt = (t: number) => `${fmt(t / 1000, t < 100_000 ? 1 : 0)} kt`;
const mt = (t: number) => `${fmt(t / 1e6, 2)} Mt`;
const mPanels = (n: number) => `${fmt(n / 1e6, 1)}M panels`;
const ratio = (r: number) => `${fmt(r, 2)}×`;
const pct = (v: number, d = 0) => `${fmt(100 * v, d)}%`;
/** "2026-08" -> "August 2026"; "2025-09-01" -> "1 September 2025". */
const month = (ym: string) => new Date(`${ym.slice(0, 7)}-01T00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
const day = (d: string) => new Date(`${d}T00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
/** A reported figure written short: "~59 kt", ">91 kt", "~1 Mt", "~50M panels". */
const reported = (t: Target) => `${t.lower_bound ? ">" : "~"}${t.metric === "annual_tonnes" ? `${fmt(t.value / 1000)} kt`
  : t.metric === "cumulative_tonnes" ? `${fmt(t.value / 1e6)} Mt` : `${fmt(t.value / 1e6)}M panels`}`;
const fmtTarget = (t: Target, v: number) =>
  t.metric === "annual_tonnes" ? kt(v) : t.metric === "cumulative_tonnes" ? mt(v) : mPanels(v);

function Ref({ n, data }: { n: string; data: Data }) {
  const r = data.assumptions.references[n];
  return r ? <a href={r.url} target="_blank" rel="noreferrer" title={r.title}>[{n}]</a> : <>[{n}]</>;
}

/** "[7][8]" -> linked reference numbers. */
function Refs({ source, data }: { source: string; data: Data }) {
  return <>{[...source.matchAll(/\[(\d+)\]/g)].map((m) => <Ref key={m[1]} n={m[1]} data={data} />)}</>;
}

export function ValidationPage({ data }: { data: Data }) {
  const v = data.validation, f = data.fit;
  const beta = (s: Scenario) => data.assumptions.scenarios.find((x) => x.name === s)?.beta;
  const best = v.scenarios[v.closest].targets;
  const get = (rows: typeof best, metric: Target["metric"], year: number) =>
    rows.find((r) => r.metric === metric && r.year === year)!;
  const annual = best.filter((r) => r.metric === "annual_tonnes");
  const others = SCENARIOS.filter((s) => s !== v.closest).flatMap((s) => v.scenarios[s].targets.map((r) => r.ratio));
  const cum = get(best, "cumulative_tonnes", 2035), panels = get(best, "cumulative_panels", 2035);

  const runs = f.sensitivity.filter((r) => r.beta !== null);
  const census = f.sensitivity.find((r) => r.cutoff.startsWith("2021"));
  const lastYear = Math.max(...f.cross_check.map((c) => c.year));
  const states = f.cross_check.filter((c) => c.state !== "AUS" && c.year === lastYear);
  const span = (k: "share_FITTED" | "share_AU_RES") =>
    `${pct(Math.min(...states.map((c) => c[k])))} to ${pct(Math.max(...states.map((c) => c[k])))}`;
  const crossYears = [...new Set(f.cross_check.map((c) => c.year))].sort();
  const minRmse = Math.min(...f.grid.rmse);
  const flatFrom = f.grid.beta[f.grid.rmse.findIndex((r) => r <= 1.1 * minRmse)];

  return (
    <article className="prose">
      <h1>Validation</h1>
      <p className="lede">Two checks against reality: national waste against figures reported to parliament and government,
        and a panel lifetime measured from our own install and housing data.</p>

      <h2>National waste against reported figures</h2>
      <LineChart
        ariaLabel="National tonnes of panels retired per year, 2015 to 2035, by lifetime scenario, with reported figures"
        series={SCENARIOS.map((s) => ({ key: s, label: s, color: SCENARIO_COLOR[s], x: v.series[s].years,
          y: v.series[s].tonnes.map((t) => t / 1000) }))}
        markers={v.targets.filter((t) => t.metric === "annual_tonnes").map((t) => ({ x: t.year, y: t.value / 1000,
          triangle: t.lower_bound, label: `Reported ${t.lower_bound ? ">" : "~"}${fmt(t.value / 1000)} kt` }))}
        xLabel="Calendar year" yLabel="Panels retired per year (kt)" fmtY={(y) => fmt(y, y < 10 && y > 0 ? 1 : 0)} />
      <p>
        Of the four lifetime scenarios, <strong>{SCENARIO_LABEL[v.closest]}</strong> ({v.closest}, β {beta(v.closest)} years)
        lands closest. By the end of 2035 it retires {mt(cum.model)} and {mPanels(panels.model)}, against the reported
        {" "}{reported(cum)} and {reported(panels)} <Refs source={cum.source} data={data} />
        {" "}({ratio(cum.ratio)} and {ratio(panels.ratio)}). Its yearly tonnes run below the reported figures:
        {" "}{annual.map((r, i) => (
          <span key={r.year}>{i ? " and " : ""}{kt(r.model)} in {r.year} ({ratio(r.ratio)} the reported {reported(r)})</span>
        ))} <Refs source={annual[0].source} data={data} />{annual.every((r) => r.ratio < 1) ? ", so if anything the forecast is conservative" : ""}.
        The other curves assume longer lives and land at {ratio(Math.min(...others))} to {ratio(Math.max(...others))} the
        reported figures. Nothing was tuned to hit these numbers.
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Reported</th>{SCENARIOS.map((s) => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>
            {v.targets.map((t, i) => (
              <tr key={i}>
                <td>{t.label} <Refs source={t.source} data={data} /></td>
                {SCENARIOS.map((s) => {
                  const r = v.scenarios[s].targets[i];
                  return <td key={s} className={s === v.closest ? "hl" : ""}>{fmtTarget(t, r.model)} <span className="muted">{ratio(r.ratio)}</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Lifetime measured from the data</h2>
      <p>
        Where a postcode has more solar installs than houses, the excess is mostly replacements. We fit the Weibull scale β
        so that modelled replacements match that excess, holding the shape at α {f.alpha}. Counting installs up to
        {" "}{day(f.cutoff)} against 2021 Census houses gives {f.n_poas} full postcodes
        ({Object.entries(f.states).map(([s, n]) => `${n} ${s}`).join(", ")}) and <strong>β = {f.beta} years</strong>,
        so {pct(f.f15)} of a cohort is retired by age 15. Every sensitivity run lands between {Math.min(...runs.map((r) => r.beta!))} and
        {" "}{Math.max(...runs.map((r) => r.beta!))} years.
      </p>
      <ScatterChart
        ariaLabel={`Observed excess installs against modelled replacements for ${f.n_poas} postcodes`}
        x={f.poas.modelled} y={f.poas.excess} ids={f.poas.poa_code} fmt={(n) => fmt(n)}
        xLabel={`Modelled replacements at β ${f.beta} (systems)`} yLabel="Installs minus houses (systems)"
        describe={(i) => `Postcode ${f.poas.poa_code[i]}: ${fmt(f.poas.excess[i])} more installs than houses; model ${fmt(f.poas.modelled[i])}`} />
      <LineChart
        ariaLabel="Fit error across Weibull scale values"
        series={[{ key: "rmse", label: "RMSE", color: "#0b0b0b", x: f.grid.beta, y: f.grid.rmse }]}
        vlines={[
          { x: beta("AU_RES")!, label: `AU_RES β ${beta("AU_RES")}`, color: SCENARIO_COLOR.AU_RES },
          { x: f.beta, label: `FITTED β ${f.beta}`, color: SCENARIO_COLOR.FITTED },
          { x: beta("INTL_EARLY")!, label: `INTL β ${beta("INTL_EARLY")}`, color: SCENARIO_COLOR.INTL_EARLY },
        ]}
        xTicks={[10, 15, 20, 25, 30, 35]} fmtX={(b) => `β ${b}`}
        xLabel="Weibull scale β (years)" yLabel="RMSE (systems per postcode)" fmtY={(y) => fmt(y)} />
      <p>
        The error stays within 10% of the best fit for every β from {flatFrom} years up, so the data rules out short
        lifetimes more firmly than it pins down one value. As a cross-check, β {f.beta} implies replacements make up {span("share_FITTED")} of {lastYear} installs
        by state, while UNSW's β {beta("AU_RES")} implies {span("share_AU_RES")}. Industry reports over a third in some
        states <Ref n="12" data={data} />, which puts the true lifetime between the two. The national map defaults to
        {" "}{data.assumptions.default_scenario} because it matches reported national waste.
      </p>

      <h3>Sensitivity runs</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Run</th><th>Installs to</th><th>Denominator</th><th>Max mean size</th><th>Postcodes</th><th>β</th><th>F(15)</th></tr></thead>
          <tbody>
            {f.sensitivity.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td>{r.cutoff}</td><td>{r.denominator}</td><td>{r.max_mean_kw} kW</td>
                <td>{r.n_poas}</td><td>{r.beta ?? "—"}</td><td>{r.f15 === null ? "—" : pct(r.f15)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Replacement share of installs by state</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>State</th>{crossYears.map((y) => <th key={y} colSpan={2}>{y}</th>)}</tr>
            <tr><th />{crossYears.map((y) => [<th key={`${y}f`}>FITTED</th>, <th key={`${y}a`}>AU_RES</th>])}</tr></thead>
          <tbody>
            {[...new Set(f.cross_check.map((c) => c.state))].map((s) => (
              <tr key={s} className={s === "AUS" ? "total" : ""}><td>{s === "AUS" ? "National" : s}</td>
                {crossYears.map((y) => {
                  const c = f.cross_check.find((x) => x.state === s && x.year === y)!;
                  return [<td key={`${y}f`}>{pct(c.share_FITTED)}</td>, <td key={`${y}a`}>{pct(c.share_AU_RES)}</td>];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">{lastYear} includes provisional months from {month(data.cohorts.provisional_from)}, when registrations are still arriving.</p>

      <h3>Caveats</h3>
      <ul>
        <li>The method was designed to count installs to Census night 2021, but only {census?.n_poas ?? "a few"} postcodes
          were full by then, so the main fit counts installs up to {day(f.cutoff)}. Homes built since 2021 then add to the excess,
          which pushes β down.</li>
        <li>Even full postcodes have houses that never got solar, and panels removed without a new install (demolition,
          storm damage, single-panel swaps) are invisible. Both push β up, so the fitted lifetime is an upper-end estimate.</li>
        <li>Second systems and small business systems inflate counts. Postcodes averaging over {f.filters.max_mean_kw} kW in
          {" "}{f.filters.mean_kw_years.join("–")} are excluded, and postcodes need at least {f.filters.min_dwellings} houses.</li>
        <li>The fit comes from full postcodes only and is applied nationally.</li>
      </ul>
    </article>
  );
}

export function MethodPage({ data }: { data: Data }) {
  const a = data.assumptions, qa = a.qa, cov = data.coverage, set = cov.settings as typeof cov.settings &
    { min_sites_per_state: number; candidates: number; capital_candidates: number };
  const def = cov[a.default_scenario];
  const show = (v: unknown) => (Array.isArray(v) ? v.join(v.every((x) => typeof x === "number") ? "–" : "; ") : String(v));
  return (
    <article className="prose">
      <h1>Method and sources</h1>

      <h2>How it works</h2>
      <ol>
        <li><strong>Install cohorts.</strong> Clean Energy Regulator registrations give the number of small-scale solar
          systems and their kW in every postcode each month, from {month(qa.first_install_month)} to {month(qa.last_install_month)}.
          Each postcode-month is a cohort, aged from the middle of its install month.</li>
        <li><strong>Panels and tonnes.</strong> kW becomes panels and tonnes through the install-year table below. Newer
          panels carry fewer kilograms per kW, so a single ratio would overstate recent installs.</li>
        <li><strong>Retirement.</strong> The share of a cohort retired by age t is F(t) = 1 − exp(−(t/β)<sup>α</sup>).
          Tonnes retiring in a year are the cohort's tonnes times the rise in F over that year.</li>
        <li><strong>Siting.</strong> Demand is each postcode's tonnes retiring {set.demand_years.join("–")}. From
          {" "}{fmt(set.candidates)} candidate facilities, a greedy covering algorithm picks {set.n_sites} sites, at
          least {set.min_sites_per_state} per state, to put the most tonnes within {set.radius_km} km of a site. An exact
          solver confirms greedy reaches {fmt(def.exact.greedy_vs_exact_pct, 1)}% of the optimum. The baseline runs the
          same algorithm on the {fmt(set.capital_candidates)} candidates inside capital cities.</li>
      </ol>

      <h2>Assumptions</h2>
      <h3>Lifetime scenarios</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Scenario</th><th>β (years)</th><th>α</th><th>F(15)</th><th className="left">Source</th></tr></thead>
          <tbody>
            {a.scenarios.map((s) => (
              <tr key={s.name} className={s.name === a.default_scenario ? "hl" : ""}>
                <td>{s.name}</td><td>{s.beta}</td><td>{s.alpha}</td><td>{pct(1 - Math.exp(-((15 / s.beta) ** s.alpha)))}</td>
                <td className="left">{s.source.replace(/\s*\[\d+\]/g, "")} <Refs source={s.source} data={data} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Panel size and mass by install year</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Install years</th><th>Watts per panel</th><th>kg per panel</th><th>kg per kW</th></tr></thead>
          <tbody>
            {a.panel_table.rows.map((r) => (
              <tr key={r.from_year}><td>{r.from_year === 2001 ? `up to ${r.to_year}` : r.to_year ? `${r.from_year}–${r.to_year}` : `${r.from_year} onward`}</td>
                <td>{r.watts_per_panel}</td><td>{r.kg_per_panel}</td><td>{r.kg_per_kw}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">{a.panel_table.source.replace(/\s*\[\d+\]/g, "")} <Refs source={a.panel_table.source} data={data} /></p>
      <h3>Panel materials</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Material</th><th>Share of panel mass</th></tr></thead>
          <tbody>
            {Object.entries(data.materials.shares).map(([k, v]) => (
              <tr key={k}><td>{MATERIAL_LABEL[k] ?? k}</td><td>{(100 * v).toLocaleString("en-AU", { maximumFractionDigits: 2 })}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Silver is {pct(data.materials.silver_value_share)} of a panel's material value <Ref n="13" data={data} />.
        Under {a.default_scenario}, panels retiring {data.materials.years.join("–")} hold about {(() => {
          const n = data.materials.national[a.default_scenario], k = data.materials.keys;
          const t = (key: string) => `${fmtMass(n[k.indexOf(key)])} of ${(MATERIAL_LABEL[key] ?? key).toLowerCase()}`;
          return `${t("glass")}, ${t("aluminium")}, ${t("silicon")} and ${t("copper")}, plus ${t("silver")} and ${t("tin_lead")}`;
        })()}. Composition is column [40] of the table in <Ref n="21" data={data} />; aluminium combines frame and cell,
        polymer combines encapsulant, backing film and junction-box plastic, and every panel is assumed to be crystalline silicon.
      </p>
      <h3>Settings</h3>
      <div className="table-wrap">
        <table className="data-table">
          <tbody>
            {a.settings.map((s) => <tr key={s.name}><td className="left">{s.name}</td><td className="left">{show(s.value)}</td><td className="left muted">{s.source}</td></tr>)}
          </tbody>
        </table>
      </div>

      <h2>Data sources</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Dataset</th><th className="left">Used for</th><th className="left">Licence</th></tr></thead>
          <tbody>
            {a.data_sources.map((d) => (
              <tr key={d.name}>
                <td className="left"><a href={d.url} target="_blank" rel="noreferrer">{d.name}</a><br /><span className="muted">{d.publisher}</span></td>
                <td className="left">{d.used_for}</td>
                <td className="left">{d.licence}<br /><span className="muted">{d.attribution}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Base map: OpenFreeMap, © OpenMapTiles, data from OpenStreetMap.</p>

      <h2>Prior work, and what's new</h2>
      <p>A 2019 study projected about 0.8 Mt of cumulative waste by 2047 from installs up to 2018 <Ref n="24" data={data} />,
        and UNSW has published national projections for 2022 to 2050 (Tan, Deng and Egan, 2024). A South Australian study
        forecast panel waste by postcode and optimised a collection network for that state <Ref n="23" data={data} />.
        Private firms also sell postcode projection reports to councils.</p>
      <p>PanelPath is national and postcode-level, open, and can be refreshed each month from CER data. It measures
        lifetimes from data rather than only assuming them, it is built around the siting decision the national pilot
        faces, and it shows its validation on screen.</p>

      <h2>Limitations</h2>
      <ul>
        <li>Only small-scale systems (up to 100 kW) are counted; solar farms are not in the CER postcode data.</li>
        <li>Mass per kW is the biggest single assumption after lifetime, and the table above is a starting estimate.</li>
        <li>{qa.unmatched_postcodes} CER postcodes (PO boxes and similar) have no postal area. They hold
          {" "}{fmt(qa.unmatched_installs)} installs, {fmt(qa.unmatched_kw_pct, 3)}% of national kW, and are left out.</li>
        <li>Registrations from {month(data.cohorts.provisional_from)} are provisional, and panels installed after
          {" "}{month(qa.last_install_month)} are not modelled, so late-2030s tonnes are slightly low.</li>
        <li>Distances are straight lines between postcode centroids and sites, not road distances.</li>
        <li>Sites have no capacity limit, so one metropolitan site can serve a whole city within {set.radius_km} km.</li>
        <li>{fmt(qa.candidate_sites_town_centre)} of {fmt(qa.candidate_sites)} candidate sites are located only to their town
          centre in the Geoscience Australia data.</li>
        <li>The fitted lifetime has its own caveats, listed on the validation page.</li>
      </ul>

      <h2>References</h2>
      <ol className="refs">
        {Object.entries(a.references).map(([n, r]) => (
          <li key={n} value={Number(n)}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></li>
        ))}
      </ol>
    </article>
  );
}
