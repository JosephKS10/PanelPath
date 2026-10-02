import { useState, type MouseEvent } from "react";

const INK = "#0b0b0b", MUTED = "#7a7975", GRID = "#e4e3df", SURFACE = "#fcfcfb";

/** Up to ~6 round tick values from 0 to at least max. */
function niceTicks(max: number): number[] {
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => max / s <= 6) ?? 10 * mag;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => +(i * step).toPrecision(12));
}

/** Pointer x in viewBox units. */
function svgX(e: MouseEvent<SVGElement>, width: number): number {
  const r = (e.currentTarget.ownerSVGElement ?? (e.currentTarget as SVGSVGElement)).getBoundingClientRect();
  return ((e.clientX - r.left) * width) / r.width;
}

export interface Series { key: string; label: string; color: string; x: number[]; y: number[] }
export interface Marker { x: number; y: number; label: string; triangle?: boolean }
export interface VLine { x: number; label: string; color: string }

interface LineProps {
  series: Series[];
  markers?: Marker[];
  vlines?: VLine[];
  xLabel: string;
  yLabel: string;
  fmtY: (v: number) => string;
  fmtX?: (v: number) => string;
  xTicks?: number[];
  ariaLabel: string;
}

/** Multi-series line chart: one axis, end labels, and a crosshair readout listing every series at the hovered x. */
export function LineChart({ series, markers = [], vlines = [], xLabel, yLabel, fmtY, fmtX = String, xTicks, ariaLabel }: LineProps) {
  const W = 680, H = 300, m = { l: 56, r: series.length > 1 ? 120 : 20, t: 14, b: 40 };
  const xs = series.flatMap((s) => s.x);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const yTicks = niceTicks(Math.max(...series.flatMap((s) => s.y), ...markers.map((p) => p.y)) * 1.05);
  const yMax = yTicks[yTicks.length - 1];
  const px = (x: number) => m.l + ((x - x0) / (x1 - x0)) * (W - m.l - m.r);
  const py = (y: number) => H - m.b - (y / yMax) * (H - m.t - m.b);
  const [hover, setHover] = useState<number | null>(null);
  const grid = series[0].x;
  const ticks = xTicks ?? grid.filter((x) => x % 5 === 0);

  // End labels, nudged apart so they never overlap.
  const ends = series.map((s) => ({ s, y: py(s.y[s.y.length - 1]) })).sort((a, b) => a.y - b.y);
  ends.forEach((e, i) => { if (i > 0 && e.y - ends[i - 1].y < 13) e.y = ends[i - 1].y + 13; });

  const hx = hover === null ? null : grid[hover];
  return (
    <figure className="figure">
      <p className="readout" aria-live="polite">
        {hx === null ? <span className="hint">Hover the chart to read every series</span> : (
          <><strong>{fmtX(hx)}</strong>{series.map((s) => (
            <span key={s.key} className="key"><i style={{ background: s.color }} />{fmtY(s.y[s.x.indexOf(hx)])} {s.label}</span>
          ))}</>
        )}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}
        onMouseMove={(e) => {
          const x = x0 + ((svgX(e, W) - m.l) / (W - m.l - m.r)) * (x1 - x0);
          let best = 0;
          grid.forEach((g, i) => { if (Math.abs(g - x) < Math.abs(grid[best] - x)) best = i; });
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={py(t)} y2={py(t)} stroke={GRID} />
            <text x={m.l - 8} y={py(t)} dy="0.32em" textAnchor="end" className="tick">{fmtY(t)}</text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} x={px(t)} y={H - m.b + 16} textAnchor="middle" className="tick">{fmtX(t)}</text>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" className="axis-label">{xLabel}</text>
        <text transform={`translate(13 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">{yLabel}</text>
        {vlines.map((v) => (
          <g key={v.label}>
            <line x1={px(v.x)} x2={px(v.x)} y1={m.t} y2={H - m.b} stroke={v.color} strokeWidth={2} />
            <text x={px(v.x) + 4} y={m.t + 4} transform={`rotate(90 ${px(v.x) + 4} ${m.t + 4})`} className="tick ink">{v.label}</text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.key} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round"
            d={s.x.map((x, i) => `${i ? "L" : "M"}${px(x).toFixed(1)},${py(s.y[i]).toFixed(1)}`).join("")} />
        ))}
        {series.length > 1 && ends.map(({ s, y }) => (
          <text key={s.key} x={W - m.r + 8} y={y} dy="0.32em" className="tick ink">{s.label}</text>
        ))}
        {markers.map((p) => (
          <g key={p.label}>
            {p.triangle
              ? <path d={`M${px(p.x)},${py(p.y) - 6}l6,10.5h-12z`} fill={INK} stroke={SURFACE} strokeWidth={1.5} />
              : <circle cx={px(p.x)} cy={py(p.y)} r={5} fill={INK} stroke={SURFACE} strokeWidth={1.5} />}
            <text x={px(p.x) - 9} y={py(p.y)} dy="0.32em" textAnchor="end" className="tick ink">{p.label}</text>
          </g>
        ))}
        {hx !== null && (
          <g pointerEvents="none">
            <line x1={px(hx)} x2={px(hx)} y1={m.t} y2={H - m.b} stroke={MUTED} strokeDasharray="3 3" />
            {series.map((s) => (
              <circle key={s.key} cx={px(hx)} cy={py(s.y[s.x.indexOf(hx)])} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
    </figure>
  );
}

interface ScatterProps {
  x: number[];
  y: number[];
  ids: string[];
  xLabel: string;
  yLabel: string;
  fmt: (v: number) => string;
  describe: (i: number) => string;
  ariaLabel: string;
}

/** Scatter with a 1:1 reference line; hovering reads the nearest point. */
export function ScatterChart({ x, y, ids, xLabel, yLabel, fmt, describe, ariaLabel }: ScatterProps) {
  const W = 680, H = 300, m = { l: 56, r: 20, t: 14, b: 40 };
  const ticks = niceTicks(Math.max(...x, ...y) * 1.03);
  const max = ticks[ticks.length - 1];
  const px = (v: number) => m.l + (v / max) * (W - m.l - m.r);
  const py = (v: number) => H - m.b - (v / max) * (H - m.t - m.b);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <figure className="figure">
      <p className="readout" aria-live="polite">
        {hover === null ? <span className="hint">Hover a point to read it</span> : <strong>{describe(hover)}</strong>}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const [mx, my] = [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
          let best = 0, d = Infinity;
          x.forEach((_, i) => { const di = (px(x[i]) - mx) ** 2 + (py(y[i]) - my) ** 2; if (di < d) { d = di; best = i; } });
          setHover(d < 400 ? best : null);
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={py(t)} y2={py(t)} stroke={GRID} />
            <text x={m.l - 8} y={py(t)} dy="0.32em" textAnchor="end" className="tick">{fmt(t)}</text>
            <text x={px(t)} y={H - m.b + 16} textAnchor="middle" className="tick">{fmt(t)}</text>
          </g>
        ))}
        <line x1={px(0)} y1={py(0)} x2={px(max)} y2={py(max)} stroke={MUTED} strokeDasharray="4 4" />
        <text x={px(max) - 4} y={py(max) + 14} textAnchor="end" className="tick">1:1</text>
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" className="axis-label">{xLabel}</text>
        <text transform={`translate(13 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">{yLabel}</text>
        {x.map((_, i) => (
          <circle key={ids[i]} cx={px(x[i])} cy={py(y[i])} r={i === hover ? 6 : 4.5} fill={INK}
            fillOpacity={i === hover ? 1 : 0.7} stroke={SURFACE} strokeWidth={1} />
        ))}
      </svg>
    </figure>
  );
}
