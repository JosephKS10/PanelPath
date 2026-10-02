import { Map as MLMap, NavigationControl, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 looks for its worker next to its own module, which Vite moves; point it at Vite's bundled worker.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import { fmtSig, fmtT, type Data, type Scenario } from "./data";
import type { Selection } from "./Panel";

// OpenFreeMap Positron: free, no key; its OpenStreetMap attribution is shown by MapLibre from the style.
const STYLE = "https://tiles.openfreemap.org/styles/positron";
setWorkerUrl(workerUrl);
const AUSTRALIA: [[number, number], [number, number]] = [[112, -44.5], [154.5, -9.5]];
/** Sequential blue, light -> dark (dataviz reference ramp, steps 100-700). */
export const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
export const SITE_COLOR = "#eb6834";

const twoSig = (v: number) => Number(v.toPrecision(2));

/** What the postcode shading shows: waste density (kg per km2) or total tonnes. */
export type Metric = "density" | "total";

/** poa_code -> shaded value for one scenario-year. */
export function shadeValues(data: Data, scenario: Scenario, year: number, metric: Metric): Record<string, number> {
  const tonnes = data.retirements[scenario][String(year)] ?? {};
  if (metric === "total") return tonnes;
  return Object.fromEntries(Object.entries(tonnes).map(([code, t]) => [code, (1000 * t) / (data.area[code] || Infinity)]));
}

/** Quantile class breaks over every postcode-year in `years`, so classes stay fixed as the year changes. */
export function quantileBreaks(byYear: Record<string, Record<string, number>>, years: number[]): number[] {
  const v = years.flatMap((y) => Object.values(byYear[String(y)] ?? {})).filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const raw = RAMP.slice(1).map((_, i) => twoSig(v[Math.floor(((i + 1) / RAMP.length) * (v.length - 1))]));
  return raw.filter((b, i) => b > 0 && (i === 0 || b > raw[i - 1])); // step needs strictly ascending stops
}

function fillColor(breaks: number[]): ExpressionSpecification {
  const t: ExpressionSpecification = ["coalesce", ["feature-state", "t"], 0];
  const step = ["step", t, RAMP[0], ...breaks.flatMap((b, i) => [b, RAMP[i + 1]])] as ExpressionSpecification;
  return ["case", ["<=", t, 0], "rgba(0,0,0,0)", step];
}

interface Props {
  data: Data;
  scenario: Scenario;
  year: number;
  /** poa_code -> shaded value for the selected year (see shadeValues). */
  values: Record<string, number>;
  breaks: number[];
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
}

export default function MapView({ data, scenario, year, values, breaks, selection, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; title: string; value: string } | null>(null);
  const latest = useRef({ data, scenario, year, onSelect });
  latest.current = { data, scenario, year, onSelect };

  useEffect(() => {
    const map = new MLMap({
      container: container.current!,
      style: STYLE,
      bounds: AUSTRALIA,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: false },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    // Re-fit Australia when the window resizes, until the user pans or zooms the map themselves.
    let userMoved = false;
    const moved = () => { userMoved = true; };
    map.on("dragstart", moved);
    map.on("zoomstart", (e) => { if (e.originalEvent) moved(); }); // buttons, double-click, keyboard
    map.getCanvasContainer().addEventListener("wheel", moved, { passive: true }); // scroll zoom has no originalEvent
    map.on("resize", () => { if (!userMoved) map.fitBounds(AUSTRALIA, { padding: 24, animate: false }); });

    map.on("load", () => {
      const { data } = latest.current;
      const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      map.addSource("poa", { type: "geojson", data: data.poa, promoteId: "poa_code" });
      map.addLayer({ id: "poa-fill", type: "fill", source: "poa", paint: { "fill-opacity": 0.78 } }, firstLabel);
      map.addLayer(
        {
          id: "poa-line",
          type: "line",
          source: "poa",
          paint: {
            "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#0b0b0b", "#ffffff"],
            "line-width": ["interpolate", ["linear"], ["zoom"],
              4, ["case", ["boolean", ["feature-state", "selected"], false], 2, 0.1],
              9, ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 0.8]],
          },
        },
        firstLabel,
      );
      map.addSource("sites", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "sites",
        type: "circle",
        source: "sites",
        paint: { "circle-color": SITE_COLOR, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5,
          "circle-opacity": 0.92 },
      });

      map.on("click", (e) => {
        const site = map.queryRenderedFeatures(e.point, { layers: ["sites"] })[0];
        if (site) return latest.current.onSelect({ kind: "site", id: String(site.properties.id) });
        const poa = map.queryRenderedFeatures(e.point, { layers: ["poa-fill"] })[0];
        latest.current.onSelect(poa ? { kind: "poa", code: String(poa.properties.poa_code) } : null);
      });
      map.on("mousemove", (e) => {
        const { data, scenario, year } = latest.current;
        const f = map.queryRenderedFeatures(e.point, { layers: ["sites", "poa-fill"] })[0];
        map.getCanvas().style.cursor = f ? "pointer" : "";
        if (!f) return setHover(null);
        if (f.layer.id === "sites") {
          const site = data.sites[scenario].features.find((s) => s.properties.id === f.properties.id);
          const t = site ? site.properties.tonnes[data.sites[scenario].years.indexOf(year)] : 0;
          return setHover({ x: e.point.x, y: e.point.y, title: String(f.properties.name), value: `${fmtT(t)} t in ${year}` });
        }
        const code = String(f.properties.poa_code);
        const t = data.retirements[scenario][String(year)]?.[code] ?? 0;
        setHover({ x: e.point.x, y: e.point.y, title: `Postcode ${code} · ${fmtSig((1000 * t) / (data.area[code] || Infinity))} kg per km²`,
          value: `${fmtT(t)} t in ${year}` });
      });
      map.on("mouseout", () => setHover(null));
      setReady(true);
    });
    return () => map.remove();
  }, []);

  // Shade postcodes with the selected scenario-year values.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const f of data.poa.features) {
      map.setFeatureState({ source: "poa", id: f.properties.poa_code }, { t: values[f.properties.poa_code] ?? 0 });
    }
  }, [ready, data, values]);

  useEffect(() => {
    if (ready) mapRef.current!.setPaintProperty("poa-fill", "fill-color", fillColor(breaks));
  }, [ready, breaks]);

  // Site pins: area proportional to tonnes in the selected year, scaled to the scenario's largest site-year.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const sites = data.sites[scenario];
    const i = sites.years.indexOf(year);
    const max = Math.max(...sites.features.flatMap((f) => f.properties.tonnes), 1);
    (map.getSource("sites") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: sites.features.map((f) => ({ ...f, properties: { id: f.properties.id, name: f.properties.name,
        t: f.properties.tonnes[i] } })),
    });
    map.setPaintProperty("sites", "circle-radius",
      ["interpolate", ["linear"], ["sqrt", ["get", "t"]], 0, 3, Math.sqrt(max), 17]);
  }, [ready, data, scenario, year]);

  // Outline the selected postcode.
  const selectedPoa = selection?.kind === "poa" ? selection.code : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selectedPoa) return;
    map.setFeatureState({ source: "poa", id: selectedPoa }, { selected: true });
    return () => {
      map.setFeatureState({ source: "poa", id: selectedPoa }, { selected: false });
    };
  }, [ready, selectedPoa]);

  return (
    <div className="map">
      <div ref={container} className="map-canvas" />
      {!ready && <div className="map-status">Loading map…</div>}
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{hover.value}</strong>
          <span>{hover.title}</span>
        </div>
      )}
    </div>
  );
}
