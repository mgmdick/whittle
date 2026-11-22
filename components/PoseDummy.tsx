"use client";

import { useMemo, useRef, useState } from "react";
import DummyFigure, { DUMMY_VIEWBOX, GROUND_Y } from "./DummyFigure";
import PainSheet from "./PainSheet";
import {
  JOINT_DRIVES,
  PART_LABEL,
  PRESETS,
  angleTo,
  displayAngle,
  groundedPelvis,
  layout,
  rotateTree,
  type JointId,
  type Pt,
  type SegId,
} from "@/lib/pose";
import { intensityColor, uid, type Movement, type PoseView } from "@/lib/types";

type Props = { onSave: (m: Movement) => void };

type Drag = {
  pointerId: number;
  startClient: Pt;
  target: { kind: "seg"; id: SegId } | { kind: "joint"; id: JointId };
  drive: SegId | null;
  grabOffset: number;
  moved: boolean;
};

export default function PoseDummy({ onSave }: Props) {
  const [view, setView] = useState<PoseView>("front");
  const [angles, setAngles] = useState<Record<string, number>>({ ...PRESETS[0].angles });
  const [presetName, setPresetName] = useState("Standing");
  const [painParts, setPainParts] = useState<string[]>([]);
  const [intensity, setIntensity] = useState(6);
  const [frozenPelvis, setFrozenPelvis] = useState<Pt | null>(null);
  const [activeSeg, setActiveSeg] = useState<SegId | null>(null);
  const [readout, setReadout] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const history = useRef<Record<string, number>[]>([]);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const pelvis = useMemo(() => frozenPelvis ?? groundedPelvis(angles, view, DUMMY_VIEWBOX.w, GROUND_Y), [frozenPelvis, angles, view]);

  const toSvg = (cx: number, cy: number): Pt => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const applyPreset = (name: string) => {
    const p = PRESETS.find((x) => x.name === name)!;
    history.current.push(angles);
    setView(p.view);
    setAngles({ ...p.angles });
    setPresetName(p.name);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = e.target as Element;
    const segId = el.getAttribute("data-seg") as SegId | null;
    const jointId = el.getAttribute("data-joint") as JointId | null;
    if (!segId && !jointId) return;
    e.preventDefault();
    const drive: SegId | null = segId ?? JOINT_DRIVES[jointId!] ?? null;
    const L = layout(angles, view, pelvis);
    const p = toSvg(e.clientX, e.clientY);
    const grabOffset = drive ? angleTo(L.start[drive], p) - (angles[drive] ?? 0) : 0;
    drag.current = {
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      target: segId ? { kind: "seg", id: segId } : { kind: "joint", id: jointId! },
      drive,
      grabOffset,
      moved: false,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !d.drive) return;
    const dist = Math.hypot(e.clientX - d.startClient.x, e.clientY - d.startClient.y);
    if (!d.moved) {
      if (dist < 6) return;
      d.moved = true;
      history.current.push(angles);
      setFrozenPelvis(pelvis);
      setActiveSeg(d.drive);
      setPresetName("Custom");
    }
    const L = layout(angles, view, frozenPelvis ?? pelvis);
    const pivot = L.start[d.drive];
    const p = toSvg(e.clientX, e.clientY);
    if (Math.hypot(p.x - pivot.x, p.y - pivot.y) < 8) return;
    const next = rotateTree(angles, d.drive, angleTo(pivot, p) - d.grabOffset);
    setAngles(next);
    setReadout(`${PART_LABEL[d.drive]} · ${displayAngle(next, d.drive)}°`);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      const id = d.target.id;
      setPainParts((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));
    }
    setFrozenPelvis(null);
    setActiveSeg(null);
    window.setTimeout(() => setReadout(null), 900);
  };

  const undo = () => {
    const prev = history.current.pop();
    if (prev) setAngles(prev);
  };

  const presets = PRESETS.filter((p) => p.view === view);

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Dummy view">
          {(["front", "side"] as PoseView[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? "on" : ""}
              onClick={() => applyPreset(v === "front" ? "Standing" : "Standing (side)")}
            >
              {v === "front" ? "Front" : "Side"}
            </button>
          ))}
        </div>
        <div className="row-gap">
          <button className="btn ghost small" onClick={undo} disabled={history.current.length === 0}>
            ↶ Undo
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              applyPreset(view === "front" ? "Standing" : "Standing (side)");
              setPainParts([]);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <p className="instruction">
        <strong>Drag</strong> an arm, leg, head or torso into the position that hurts. <strong>Tap</strong> a part or
        joint to mark it sore.
      </p>

      <div className="figure-wrap dummy">
        <DummyFigure
          ref={svgRef}
          angles={angles}
          view={view}
          pelvis={pelvis}
          painParts={painParts}
          painColor={intensityColor(intensity)}
          activeSeg={activeSeg}
          interactive
          className="dummy-svg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {readout && <div className="toast">{readout}</div>}
        {savedFlash && <div className="toast ok">Saved to your log</div>}
      </div>

      <div className="presets" aria-label="Starting poses">
        {presets.map((p) => (
          <button key={p.name} className={"chip" + (presetName === p.name ? " on" : "")} onClick={() => applyPreset(p.name)}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Sore parts</h3>
          <span className="muted small-text">{painParts.length ? "tap to remove" : "none marked yet"}</span>
        </div>
        {painParts.length > 0 && (
          <div className="chips">
            {painParts.map((p) => (
              <button
                key={p}
                className="chip on hurt"
                style={{ ["--c" as string]: intensityColor(intensity) }}
                onClick={() => setPainParts((ps) => ps.filter((x) => x !== p))}
              >
                {PART_LABEL[p]} ✕
              </button>
            ))}
          </div>
        )}
        <button
          className="btn primary full"
          disabled={painParts.length === 0}
          onClick={() => {
            setLabel(presetName !== "Custom" && !presetName.startsWith("Standing") ? presetName : "");
            setSaving(true);
          }}
        >
          Save this painful movement
        </button>
      </div>

      {saving && (
        <PainSheet
          title="Painful movement"
          subtitle={painParts.map((p) => PART_LABEL[p]).join(", ")}
          initial={{ intensity, types: [], note: "" }}
          saveLabel="Save to log"
          extra={
            <div className="field">
              <label className="field-label" htmlFor="mv-label">
                What were you doing?
              </label>
              <input
                id="mv-label"
                placeholder="e.g. Reaching for a high shelf"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          }
          onClose={() => setSaving(false)}
          onSave={(d) => {
            setIntensity(d.intensity);
            onSave({
              id: uid(),
              createdAt: Date.now(),
              view,
              angles,
              painParts,
              intensity: d.intensity,
              label: label.trim() || presetName,
              note: [d.types.join(", "), d.note].filter(Boolean).join(" — "),
            });
            setSaving(false);
            setSavedFlash(true);
            window.setTimeout(() => setSavedFlash(false), 1600);
          }}
        />
      )}
    </div>
  );
}
