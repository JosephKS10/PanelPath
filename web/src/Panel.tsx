import { useState } from "react";
import { fmt, fmtT, type Data, type Scenario } from "./data";
import { RAMP, SITE_COLOR } from "./MapView";

export type Selection = { kind: "poa"; code: string } | { kind: "site"; id: string };

interface Props {
  data: Data;
  scenario: Scenario;
  year: number;
  selection: Selection;
  onSelect: (s: Selection | null) => void;
}

export default function Panel({ data, scenario, year, selection, onSelect }: Props) {
  return (
    <aside className="panel" aria-label="Details">
      <button className="close" onClick={() => onSelect(null)} aria-label="Close details">×</button>
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
      <p className="eyebrow">Postcode</p>
      <h2>{code}</h2>
      <dl className="facts">
        <div><dt>State</dt><dd>{state}</dd></div>
        <div><dt>Separate houses (2021)</dt><dd>{fmt(data.cohorts.houses[code] ?? 0)}</dd></div>
        <div><dt>Retiring in {year}</dt><dd>{fmtT(data.retirements[scenario][String(year)]?.[code] ?? 0)} t</dd></div>
        <div><dt>Systems installed to date</dt><dd>{fmt(installs.reduce((a, b) => a + b, 0))}</dd></div>
      </dl>
      <p className="collected">
        {site ? (
          <>Nearest chosen site: <button className="link" onClick={() => onSelect({ kind: "site", id: site.properties.id })}>
            {site.properties.name}</button></>
        ) : (
          <>No chosen site within {data.coverage.settings.radius_km} km.</>
        )}
      </p>
      <BarChart title="Panel waste retiring each year" unit="t" years={years} values={tonnes} color={RAMP[4]}
        highlight={year} />
      <UrbanMine data={data} values={data.materials.poa[scenario][code]} />
      <BarChart title="Solar systems installed each year" unit="systems" years={data.cohorts.years} values={installs}
        color="#7a7975" faintFrom={provisionalYear}
        note={`From ${data.cohorts.provisional_from} registrations are still arriving, so recent years are incomplete.`} />
    </>
  );
}

function SiteDetails({ data, scenario, year, id }: { data: Data; scenario: Scenario; year: number; id: string }) {
  const sites = data.sites[scenario];
  const site = sites.features.find((f) => f.properties.id === id)?.properties;
  if (!site) return <p>This site is not in the {scenario} plan.</p>;
  const i = sites.years.indexOf(year);
  return (
    <>
      <p className="eyebrow">Collection site #{site.rank}</p>
      <h2>{site.name}</h2>
      <p className="muted">{[site.owner, site.suburb, site.state].filter(Boolean).join(" · ")}</p>
      <p className="tags">{site.type.split("; ").map((t) => <span key={t}>{t.toLowerCase()}</span>)}</p>
      <dl className="facts">
        <div><dt>Collects in {year}</dt><dd>{fmtT(site.tonnes[i])} t</dd></div>
        <div><dt>Panels in {year}</dt><dd>{fmt(site.panels[i])}</dd></div>
        <div><dt>Postcodes served</dt><dd>{site.poas.length}</dd></div>
        <div><dt>Capital city</dt><dd>{site.in_capital ? "Yes" : "No"}</dd></div>
      </dl>
      <BarChart title="Panel waste reaching this site" unit="t" years={sites.years} values={site.tonnes}
        color={SITE_COLOR} highlight={year} extra={{ label: "panels", values: site.panels }} />
      <UrbanMine data={data} values={data.materials.sites[scenario]?.[site.id]} />
    </>
  );
}

const MATERIAL_LABEL: Record<string, string> = {
  glass: "Glass", polymer: "Polymer", aluminium: "Aluminium", silicon: "Silicon", copper: "Copper",
};

/** Recoverable materials in panels retiring over the materials window, and silver's mass vs value share. */
function UrbanMine({ data, values }: { data: Data; values?: number[] }) {
  const m = data.materials;
  if (!values) return null;
  const [y0, y1] = m.years;
  const silver = [values[m.keys.indexOf("silver_kg_low")], values[m.keys.indexOf("silver_kg_high")]];
  const metals = Object.keys(m.shares);
  return (
    <section className="mine">
      <p className="mine-title">Rooftop urban mine, {y0}–{y1}</p>
      <table>
        <tbody>
          {metals.map((k) => (
            <tr key={k}><td>{MATERIAL_LABEL[k] ?? k}</td><td>{fmtT(values[m.keys.indexOf(k)])} t</td></tr>
          ))}
          <tr className="silver"><td>Silver</td><td>{fmt(silver[0])}–{fmt(silver[1])} kg</td></tr>
        </tbody>
      </table>
      <div className="silver-compare" aria-label="Silver share of panel mass against share of material value">
        <div><span className="bar"><i style={{ width: "0.1%" }} /></span>Silver is {m.silver_mass_share} of panel mass</div>
        <div><span className="bar"><i style={{ width: `${100 * m.silver_value_share}%` }} /></span>
          but {fmt(100 * m.silver_value_share)}% of its material value</div>
      </div>
      <p className="note">Composition and silver from IRENA and IEA-PVPS (2016), assuming crystalline-silicon panels.</p>
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

/** Column chart with a hover/focus readout and a table view, so no value is hover-only. */
function BarChart({ title, unit, years, values, color, highlight, faintFrom, note, extra }: ChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300, H = 110, left = 4, bottom = 16;
  const max = Math.max(...values, 1e-9);
  const step = (W - left) / years.length;
  const shown = hover ?? (highlight !== undefined ? years.indexOf(highlight) : values.length - 1);
  const readout = (i: number) =>
    `${years[i]}: ${unit === "t" ? fmtT(values[i]) : fmt(values[i])} ${unit}` +
    (extra ? ` · ${fmt(extra.values[i])} ${extra.label}` : "");
  const n = years.length;
  const hi = highlight !== undefined ? years.indexOf(highlight) : -1;
  // End labels anchor inwards; the highlighted year is labelled only when clear of them.
  const ticks: [number, "start" | "middle" | "end"][] = [[0, "start"], [n - 1, "end"],
    ...(hi > 2 && hi < n - 3 ? [[hi, "middle"] as [number, "middle"]] : [])];
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <p className="readout" aria-live="polite">{shown >= 0 ? readout(shown) : ""}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${years[0]} to ${years[years.length - 1]}`}
        onMouseLeave={() => setHover(null)}>
        <line x1={left} x2={W} y1={H - bottom} y2={H - bottom} className="axis" />
        {values.map((v, i) => {
          const h = (v / max) * (H - bottom - 6);
          const x = left + i * step;
          const faint = faintFrom !== undefined && years[i] >= faintFrom;
          const active = i === shown;
          return (
            <g key={years[i]} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={0} width={step} height={H - bottom} fill="transparent" />
              <rect x={x + 1} y={H - bottom - h} width={Math.max(step - 2, 1)} height={h} rx={1.5}
                fill={color} opacity={faint ? 0.4 : active ? 1 : 0.75} />
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
        <summary>Table</summary>
        <table>
          <thead><tr><th>Year</th><th>{unit}</th>{extra && <th>{extra.label}</th>}</tr></thead>
          <tbody>
            {years.map((y, i) => (
              <tr key={y}><td>{y}</td><td>{unit === "t" ? fmtT(values[i]) : fmt(values[i])}</td>
                {extra && <td>{fmt(extra.values[i])}</td>}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
