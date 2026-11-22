"use client";

import { useRef, useState } from "react";
import BodyFigure from "./BodyFigure";
import PainSheet from "./PainSheet";
import { intensityColor, uid, type PainMarker, type View } from "@/lib/types";

type Props = {
  markers: PainMarker[];
  setMarkers: (fn: (m: PainMarker[]) => PainMarker[]) => void;
  onSaveToLog: (note: string) => void;
};

type Pending =
  | { mode: "new"; view: View; x: number; y: number; regionId: string; region: string }
  | { mode: "edit"; marker: PainMarker };

export default function BodyMap({ markers, setMarkers, onSaveToLog }: Props) {
  const [view, setView] = useState<View>("front");
  const [zoom, setZoom] = useState(1);
  const [pending, setPending] = useState<Pending | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    const markerEl = target.closest("[data-marker]");
    if (markerEl) {
      const m = markers.find((x) => x.id === markerEl.getAttribute("data-marker"));
      if (m) setPending({ mode: "edit", marker: m });
      return;
    }
    const regionId = target.getAttribute("data-region");
    if (!regionId) {
      setHint("Tap on the body itself");
      window.setTimeout(() => setHint(null), 1400);
      return;
    }
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    setPending({
      mode: "new",
      view,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      regionId,
      region: target.getAttribute("data-name") ?? "Body",
    });
  };

  const counts = { front: 0, back: 0 };
  markers.forEach((m) => counts[m.view]++);
  const sorted = [...markers].sort((a, b) => b.intensity - a.intensity);

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Body side">
          {(["front", "back"] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
              {v === "front" ? "Front" : "Back"}
              {counts[v] > 0 && <span className="badge">{counts[v]}</span>}
            </button>
          ))}
        </div>
        <button className="btn ghost small" onClick={() => setZoom((z) => (z === 1 ? 1.8 : 1))} aria-pressed={zoom > 1}>
          {zoom > 1 ? "− Zoom out" : "+ Zoom in"}
        </button>
      </div>

      <p className="instruction">Tap exactly where it hurts. Tap a dot to change or remove it.</p>

      <div className={"figure-wrap" + (zoom > 1 ? " zoomed" : "")}>
        <div className="figure-inner" style={{ width: `${zoom * 100}%` }}>
          <BodyFigure
            ref={svgRef}
            view={view}
            markers={markers}
            interactive
            showLabels
            className="body-svg"
            onSvgClick={handleClick}
          />
        </div>
        {hint && <div className="toast">{hint}</div>}
      </div>

      {markers.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>Where it hurts</h3>
            <button
              className="btn ghost small"
              onClick={() => {
                if (confirm("Clear all spots from the map?")) setMarkers(() => []);
              }}
            >
              Clear
            </button>
          </div>
          <ul className="pain-list">
            {sorted.map((m) => (
              <li key={m.id}>
                <button
                  className="pain-row"
                  onClick={() => {
                    setView(m.view);
                    setPending({ mode: "edit", marker: m });
                  }}
                >
                  <span className="dot" style={{ background: intensityColor(m.intensity) }}>
                    {m.intensity}
                  </span>
                  <span className="grow">
                    <strong>{m.region}</strong>
                    {(m.types.length > 0 || m.note) && (
                      <span className="muted small-text">
                        {[m.types.join(", "), m.note].filter(Boolean).join(" — ")}
                      </span>
                    )}
                  </span>
                  <span className="muted small-text">{m.view}</span>
                </button>
              </li>
            ))}
          </ul>
          <SaveRow onSave={onSaveToLog} />
        </div>
      )}

      {pending && (
        <PainSheet
          title={pending.mode === "new" ? pending.region : pending.marker.region}
          subtitle={pending.mode === "new" ? "New sore spot" : "Edit sore spot"}
          initial={
            pending.mode === "edit"
              ? { intensity: pending.marker.intensity, types: pending.marker.types, note: pending.marker.note }
              : { intensity: 5, types: [], note: "" }
          }
          onClose={() => setPending(null)}
          onDelete={
            pending.mode === "edit"
              ? () => {
                  setMarkers((ms) => ms.filter((x) => x.id !== pending.marker.id));
                  setPending(null);
                }
              : undefined
          }
          onSave={(d) => {
            if (pending.mode === "new") {
              const { mode: _m, ...rest } = pending;
              setMarkers((ms) => [...ms, { id: uid(), ...rest, ...d }]);
            } else {
              setMarkers((ms) => ms.map((x) => (x.id === pending.marker.id ? { ...x, ...d } : x)));
            }
            setPending(null);
          }}
        />
      )}
    </div>
  );
}

function SaveRow({ onSave }: { onSave: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="save-row">
      <input placeholder="Overall note for today (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className="btn primary"
        onClick={() => {
          onSave(note);
          setNote("");
        }}
      >
        Save to log
      </button>
    </div>
  );
}
