"use client";

import { useEffect, useRef, useState } from "react";
import BodyFigure, { FULL_VIEWBOX, type ViewBox } from "./BodyFigure";
import PainSheet from "./PainSheet";
import { MuscleDetails, MusclesHere } from "./MuscleInfo";
import { hitTest } from "@/lib/regions";
import { musclesAt, type MuscleHit } from "@/lib/muscles";
import { usePersistentState } from "@/lib/storage";
import { intensityColor, uid, type PainMarker, type View } from "@/lib/types";

type Props = {
  markers: PainMarker[];
  setMarkers: (fn: (m: PainMarker[]) => PainMarker[]) => void;
  onSaveToLog: (note: string) => void;
  onAssess: () => void;
};

type NewSpot = { view: View; x: number; y: number; regionId: string; region: string };
type Pending = ({ mode: "new" } & NewSpot) | { mode: "edit"; marker: PainMarker };
type Inspect = NewSpot & { hits: MuscleHit[]; index: number };

const MIN_W = 34;
const ASPECT = FULL_VIEWBOX.h / FULL_VIEWBOX.w;

function clampVb(v: ViewBox): ViewBox {
  const w = Math.min(FULL_VIEWBOX.w, Math.max(MIN_W, v.w));
  const h = w * ASPECT;
  const x = Math.min(FULL_VIEWBOX.w - w, Math.max(0, v.x));
  const y = Math.min(FULL_VIEWBOX.h - h, Math.max(0, v.y));
  return { x, y, w, h };
}

type Gesture =
  | { mode: "tap" | "pan"; sx: number; sy: number; vb0: ViewBox }
  | { mode: "pinch"; d0: number; fx: number; fy: number; ax: number; ay: number; vb0: ViewBox; mx0: number; my0: number }
  | { mode: "done" };

export default function BodyMap({ markers, setMarkers, onSaveToLog, onAssess }: Props) {
  const [view, setView] = useState<View>("front");
  const [anatomy, setAnatomy] = usePersistentState("bodymap.anatomy.v1", false);
  const [vb, setVb] = useState<ViewBox>(FULL_VIEWBOX);
  const [pending, setPending] = useState<Pending | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 340, h: 600 });
  const svgRef = useRef<SVGSVGElement>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ mode: "done" });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel / trackpad zoom on desktop.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      setVb((v) => zoomAround(v, p.x, p.y, Math.exp(e.deltaY * 0.0022)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const pxPerUnit = Math.min(size.w / vb.w, size.h / vb.h);

  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  function zoomAround(v: ViewBox, ax: number, ay: number, factor: number): ViewBox {
    const w = Math.min(FULL_VIEWBOX.w, Math.max(MIN_W, v.w * factor));
    const fx = (ax - v.x) / v.w;
    const fy = (ay - v.y) / v.h;
    return clampVb({ x: ax - fx * w, y: ay - fy * w * ASPECT, w, h: w * ASPECT });
  }

  const zoomBy = (factor: number) =>
    setVb((v) => zoomAround(v, v.x + v.w / 2, v.y + v.h / 2, factor));

  const flash = (msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(null), 1400);
  };

  const handleTap = (clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY);
    const markerEl = target?.closest("[data-marker]");
    if (markerEl) {
      const m = markers.find((x) => x.id === markerEl.getAttribute("data-marker"));
      if (m) setPending({ mode: "edit", marker: m });
      return;
    }
    if (!target?.closest("[data-body]")) {
      flash("Tap on the body itself");
      return;
    }
    const p = toSvg(clientX, clientY);
    const region = hitTest(view, p.x, p.y);
    try {
      navigator.vibrate?.(8);
    } catch {
      /* not supported */
    }
    const spot: NewSpot = {
      view,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      regionId: region.id,
      region: region.name,
    };
    if (anatomy) {
      const hits = musclesAt(view, p.x, p.y);
      if (hits.length) {
        setInspect({ ...spot, hits, index: 0 });
        return;
      }
    }
    setPending({ mode: "new", ...spot });
  };

  // ---- pointer gestures: tap, pan when zoomed, pinch to zoom
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svgRef.current?.setPointerCapture(e.pointerId);
    if (ptrs.current.size === 1) {
      gesture.current = { mode: "tap", sx: e.clientX, sy: e.clientY, vb0: vb };
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const anchor = toSvg(mx, my);
      gesture.current = {
        mode: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        fx: (anchor.x - vb.x) / vb.w,
        fy: (anchor.y - vb.y) / vb.h,
        ax: anchor.x,
        ay: anchor.y,
        vb0: vb,
        mx0: mx,
        my0: my,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.mode === "pinch" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const w = Math.min(FULL_VIEWBOX.w, Math.max(MIN_W, (g.vb0.w * g.d0) / d));
      const ppu = Math.min(size.w / w, size.h / (w * ASPECT));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      setVb(
        clampVb({
          x: g.ax - g.fx * w - (mx - g.mx0) / ppu,
          y: g.ay - g.fy * w * ASPECT - (my - g.my0) / ppu,
          w,
          h: w * ASPECT,
        })
      );
    } else if ((g.mode === "tap" || g.mode === "pan") && ptrs.current.size === 1) {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (g.mode === "tap" && Math.hypot(dx, dy) > 8) gesture.current = { ...g, mode: "pan" };
      if (gesture.current.mode === "pan" && g.vb0.w < FULL_VIEWBOX.w) {
        const ppu = Math.min(size.w / g.vb0.w, size.h / g.vb0.h);
        setVb(clampVb({ ...g.vb0, x: g.vb0.x - dx / ppu, y: g.vb0.y - dy / ppu }));
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    ptrs.current.delete(e.pointerId);
    if (g.mode === "tap" && e.type === "pointerup") handleTap(e.clientX, e.clientY);
    if (ptrs.current.size === 0) gesture.current = { mode: "done" };
    else if (g.mode === "pinch") gesture.current = { mode: "done" };
  };

  const counts = { front: 0, back: 0 };
  markers.forEach((m) => counts[m.view]++);
  const sorted = [...markers].sort((a, b) => b.intensity - a.intensity);
  const zoomed = vb.w < FULL_VIEWBOX.w - 0.5;

  const spotForHighlight = pending?.mode === "new" ? pending : inspect;
  const highlightHits = inspect ? [inspect.hits[inspect.index]] : spotForHighlight ? musclesAt(spotForHighlight.view, spotForHighlight.x, spotForHighlight.y) : [];
  const top = highlightHits.find((h) => !h.deep);
  const highlight = top && spotForHighlight ? { id: top.muscle.id, side: (spotForHighlight.x > 100 ? "B" : "A") as "A" | "B" } : null;

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Body side">
          {(["front", "back"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? "on" : ""}
              onClick={() => setView(v)}
            >
              {v === "front" ? "Front" : "Back"}
              {counts[v] > 0 && <span className="badge">{counts[v]}</span>}
            </button>
          ))}
        </div>
        <div className="seg small" role="tablist" aria-label="Layer">
          <button role="tab" aria-selected={!anatomy} className={!anatomy ? "on" : ""} onClick={() => setAnatomy(false)}>
            Surface
          </button>
          <button role="tab" aria-selected={anatomy} className={anatomy ? "on" : ""} onClick={() => setAnatomy(true)}>
            Muscles
          </button>
        </div>
      </div>

      <p className="instruction">
        {anatomy
          ? "Tap a muscle to learn about it. Pinch or use + to zoom in for labels."
          : "Tap exactly where it hurts. Pinch to zoom. Tap a dot to change it."}
      </p>

      <div className="figure-wrap body-stage">
        <BodyFigure
          ref={svgRef}
          view={view}
          markers={markers}
          interactive
          showLabels
          anatomy={anatomy}
          highlight={highlight}
          viewBox={vb}
          pxPerUnit={pxPerUnit}
          className="body-svg"
          svgProps={{
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
          }}
        />
        <div className="zoom-ctrls">
          <button className="zoom-btn" aria-label="Zoom in" onClick={() => zoomBy(0.6)} disabled={vb.w <= MIN_W + 0.5}>
            +
          </button>
          <button className="zoom-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 0.6)} disabled={!zoomed}>
            −
          </button>
          {zoomed && (
            <button className="zoom-btn" aria-label="Reset zoom" onClick={() => setVb(FULL_VIEWBOX)}>
              ⤢
            </button>
          )}
        </div>
        {zoomed && <div className="zoom-badge">{(FULL_VIEWBOX.w / vb.w).toFixed(1)}×</div>}
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
            {sorted.map((m) => {
              const mus = musclesAt(m.view, m.x, m.y).find((h) => !h.deep);
              return (
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
                      <span className="muted small-text">
                        {[mus?.label, m.types.join(", "), m.note].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="muted small-text">{m.view}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="btn accent full" onClick={onAssess}>
            Assess my pain →
          </button>
          <SaveRow onSave={onSaveToLog} />
        </div>
      )}

      {inspect && (
        <MuscleSheet
          inspect={inspect}
          onPick={(i) => setInspect({ ...inspect, index: i })}
          onClose={() => setInspect(null)}
          onMark={() => {
            const { hits: _h, index: _i, ...spot } = inspect;
            setInspect(null);
            setPending({ mode: "new", ...spot });
          }}
        />
      )}

      {pending && (
        <PainSheet
          title={pending.mode === "new" ? pending.region : pending.marker.region}
          subtitle={pending.mode === "new" ? "New sore spot" : "Edit sore spot"}
          extra={
            <MusclesHere
              hits={
                pending.mode === "new"
                  ? musclesAt(pending.view, pending.x, pending.y)
                  : musclesAt(pending.marker.view, pending.marker.x, pending.marker.y)
              }
            />
          }
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

function MuscleSheet({
  inspect,
  onPick,
  onClose,
  onMark,
}: {
  inspect: Inspect;
  onPick: (i: number) => void;
  onClose: () => void;
  onMark: () => void;
}) {
  const hit = inspect.hits[inspect.index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={hit.label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <div>
            <div className="eyebrow">{hit.deep ? "Deep muscle" : "Muscle"} · {inspect.region}</div>
            <h2>{hit.label}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {inspect.hits.length > 1 && (
          <div className="chips layer-chips">
            {inspect.hits.map((h, i) => (
              <button key={h.muscle.id} className={"chip" + (i === inspect.index ? " on" : "")} onClick={() => onPick(i)}>
                {h.deep ? "Deeper: " : ""}
                {h.label}
              </button>
            ))}
          </div>
        )}
        <MuscleDetails muscle={hit.muscle} />
        <div className="sheet-actions">
          <button className="btn accent grow" onClick={onMark}>
            It hurts here
          </button>
        </div>
      </div>
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
        Save
      </button>
    </div>
  );
}
