import { useState } from "react";
import { fmt, fmtMass, fmtT, MATERIAL_LABEL, type Data, type Scenario } from "./data";
import { RAMP, SITE_COLOR } from "./MapView";

export type Selection = { kind: "poa"; code: string } | { kind: "site"; id: string };

interface Props {
  data: Data;
  scenario: Scenario;
  year: number;
  selection: Selection;
  onSelect: (s: Selection | null) => void;
}

/** "E-WASTE DROP-OFF FACILITY" -> "E-waste drop-off facility" */
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function Panel({ data, scenario, year, selection, onSelect }: Props) {
  return (
    <aside className="panel" aria-label="Details">
      <button className="close" onClick={() => onSelect(null)} aria-label="Close details">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {selection.kind === "poa" ? (
        <PoaDetails data={data} scenario={scenario} year={year} code={selection.code} onSelect={onSelect} />
      ) : (
        <SiteDetails data={data} scenario={scenario} year={year} id={selection.id} />
      )}
    </aside>
  );
}

function PoaDetails({ data, scenario, year, code, onSelect }:
  { data: Data; scenario: Scenario; year: number; code: string; onSelect: (s: Selection) => void }) {
  const state = data.poa.features.find((f) => f.properties.poa_code === code)?.properties.state ?? "";
  const years = Object.keys(data.retirements[scenario]).map(Number);
  const tonnes = years.map((y) => data.retirements[scenario][String(y)]?.[code] ?? 0);
  const installs = data.cohorts.installs[code] ?? data.cohorts.years.map(() => 0);
  const site = data.sites[scenario].features.find((f) => f.properties.poas.includes(code));
  const provisionalYear = Number(data.cohorts.provisional_from.slice(0, 4));
  return (
    <>
      <header className="panel-head">
        <p className="kicker">Postcode</p>
        <h2>{code}</h2>
        <p className="meta">{state} · {fmt(data.cohorts.houses[code] ?? 0)} separate houses (2021 Census)</p>
      </header>
      <dl className="figures">
        <div><dt>Retiring in {year}</dt><dd>{fmtT(data.retirements[scenario][String(year)]?.[code] ?? 0)}<small>t</small></dd></div>
        <div><dt>Systems installed</dt><dd>{fmt(installs.reduce((a, b) => a + b, 0))}</dd></div>
      </dl>
      <section>
        <div className="rowline stack">
          <span className="k">Nearest chosen site</span>
          {site
            ? <button className="link" onClick={() => onSelect({ kind: "site", id: site.properties.id })}>{site.properties.name}</button>
            : <span>None within {data.coverage.settings.radius_km} km</span>}
        </div>
      </section>
      <section>
        <BarChart title="Panel waste retiring each year" unit="t" years={years} values={tonnes} color={RAMP[4]} highlight={year} />
      </section>
      <section>
        <BarChart title="Solar systems installed each year" unit="systems" years={data.cohorts.years} values={installs}
          color="#a5a29c" faintFrom={provisionalYear}
          note={`Registrations from ${data.cohorts.provisional_from} are still arriving, so the latest years are incomplete.`} />
      </section>
      <UrbanMine data={data} values={data.materials.poa[scenario][code]} />
    </>
  );
}

function SiteDetails({ data, scenario, year, id }: { data: Data; scenario: Scenario; year: number; id: string }) {
  const sites = data.sites[scenario];
  const site = sites.features.find((f) => f.properties.id === id)?.properties;
  if (!site) return <header className="panel-head"><p className="meta">This site is not in the {scenario} plan.</p></header>;
  const i = sites.years.indexOf(year);
  const place = [site.suburb, site.state].filter(Boolean).join(", ");
  return (
    <>
      <header className="panel-head">
        <p className="kicker">Collection site</p>
        <h2>{site.name}</h2>
        <p className="meta">
          {place}{site.owner && site.owner !== site.name ? ` · ${site.owner}` : ""}<br />
          {site.type.split("; ").map(sentence).join(", ")}
        </p>
      </header>
      <dl className="figures">
        <div><dt>Collects in {year}</dt><dd>{fmtT(site.tonnes[i])}<small>t</small></dd></div>
        <div><dt>Panels in {year}</dt><dd>{fmt(site.panels[i])}</dd></div>
        <div><dt>Postcodes served</dt><dd>{site.poas.length}</dd></div>
        <div><dt>In a capital city</dt><dd>{site.in_capital ? "Yes" : "No"}</dd></div>
      </dl>
      <section>
        <BarChart title="Panel waste reaching this site" unit="t" years={sites.years} values={site.tonnes}
          color={SITE_COLOR} highlight={year} extra={{ label: "panels", values: site.panels }} />
      </section>
      <UrbanMine data={data} values={data.materials.sites[scenario]?.[site.id]} />
    </>
  );
}

/** Recoverable materials in panels retiring over the materials window, and silver's mass vs value share. */
function UrbanMine({ data, values }: { data: Data; values?: number[] }) {
  const m = data.materials;
  if (!values) return null;
  return (
    <section>
      <p className="chart-title">Recoverable materials, {m.years.join("–")}</p>
      <table className="mat">
        <tbody>
          {m.keys.map((k, i) => <tr key={k}><td>{MATERIAL_LABEL[k] ?? k}</td><td>{fmtMass(values[i])}</td></tr>)}
        </tbody>
      </table>
      <div className="versus">
        <span>Silver, share of panel mass</span><b>{fmt(100 * m.shares.silver, 2)}%</b>
        <span className="track"><i style={{ width: `${100 * m.shares.silver}%` }} /></span>
        <span>Silver, share of material value</span><b>{fmt(100 * m.silver_value_share)}%</b>
        <span className="track"><i style={{ width: `${100 * m.silver_value_share}%` }} /></span>
      </div>
      <p className="source">Composition from a published table for crystalline-silicon panels; value share from IRENA and IEA-PVPS (2016).</p>
    </section>
  );
}

interface ChartProps {
  title: string;
  unit: string;
  years: number[];
  values: number[];
  color: string;
  highlight?: number;
  faintFrom?: number;
  note?: string;
  extra?: { label: string; values: number[] };
}

/** Column chart with a hover readout and a table view, so no value is hover-only. */
function BarChart({ title, unit, years, values, color, highlight, faintFrom, note, extra }: ChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300, H = 104, left = 2, bottom = 15;
  const max = Math.max(...values, 1e-9);
  const step = (W - left) / years.length;
  const shown = hover ?? (highlight !== undefined ? years.indexOf(highlight) : values.length - 1);
  const value = (i: number) => (unit === "t" ? fmtT(values[i]) : fmt(values[i]));
  const readout = (i: number) => `${years[i]}: ${value(i)} ${unit}` + (extra ? ` · ${fmt(extra.values[i])} ${extra.label}` : "");
  const n = years.length;
  const hi = highlight !== undefined ? years.indexOf(highlight) : -1;
  // End labels anchor inwards; the highlighted year is labelled only when clear of them.
  const ticks: [number, "start" | "middle" | "end"][] = [[0, "start"], [n - 1, "end"],
    ...(hi > 2 && hi < n - 3 ? [[hi, "middle"] as [number, "middle"]] : [])];
  return (
    <figure className="chart">
      <p className="chart-title">{title}</p>
      <p className="readout" aria-live="polite">{shown >= 0 ? readout(shown) : ""}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${years[0]} to ${years[n - 1]}`}
        onMouseLeave={() => setHover(null)}>
        <line x1={left} x2={W} y1={H - bottom + 0.5} y2={H - bottom + 0.5} className="axis" />
        {values.map((v, i) => {
          const h = (v / max) * (H - bottom - 6);
          const x = left + i * step;
          const faint = faintFrom !== undefined && years[i] >= faintFrom;
          return (
            <g key={years[i]} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={0} width={step} height={H - bottom} fill="transparent" />
              <rect x={x + step * 0.18} y={H - bottom - h} width={Math.max(step * 0.64, 1)} height={h} rx={1}
                fill={color} opacity={faint ? 0.35 : i === shown ? 1 : 0.55} />
            </g>
          );
        })}
        {ticks.map(([i, anchor]) => (
          <text key={i} x={anchor === "start" ? left : anchor === "end" ? W : left + i * step + step / 2} y={H - 3}
            textAnchor={anchor} className="tick">{years[i]}</text>
        ))}
      </svg>
      {note && <p className="note">{note}</p>}
      <details>
        <summary className="text-btn">Show table</summary>
        <table className="mini-table">
          <thead><tr><th>Year</th><th>{unit}</th>{extra && <th>{extra.label}</th>}</tr></thead>
          <tbody>
            {years.map((y, i) => <tr key={y}><td>{y}</td><td>{value(i)}</td>{extra && <td>{fmt(extra.values[i])}</td>}</tr>)}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
