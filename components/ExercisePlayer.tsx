"use client";

import { useEffect, useState } from "react";
import { EXERCISES, type Exercise } from "@/lib/exercises";
import { AREAS, AREA_BY_ID, type AreaId, type CamView } from "@/lib/movementCheck";
import { poseFromAngles, type Pose } from "@/lib/mannequin/rig";
import type { MoveOpts } from "./Mannequin3D";

export type PlayerApi = {
  playMove: (frames: Pose[], speed?: number, opts?: MoveOpts) => void;
  stopMove: () => void;
  setFocus: (parts: string[], tone?: "select" | "pain") => void;
  setView: (v: CamView) => void;
};

export type ExercisePlan = { title: string; side: "L" | "R" | null; ids: string[] };

type Props = {
  active?: boolean;
  api: () => PlayerApi | null;
  ready: boolean;
  plan: ExercisePlan | null;
  onClearPlan: () => void;
};

const focusParts = (area: AreaId, side: "L" | "R") => {
  const a = AREA_BY_ID[area];
  return a.sided ? a.parts.map((p) => `${p}${side}`) : a.parts;
};

export default function ExercisePlayer({ active = true, api, ready, plan, onClearPlan }: Props) {
  const [browseArea, setBrowseArea] = useState<AreaId>("shoulder");
  const [side, setSide] = useState<"L" | "R">(plan?.side ?? "R");
  const list: Exercise[] = plan
    ? plan.ids.map((id) => EXERCISES.find((e) => e.id === id)).filter((e): e is Exercise => !!e)
    : EXERCISES.filter((e) => e.area === browseArea);
  const [i, setI] = useState(0);
  const [reps, setReps] = useState(0);
  const [playing, setPlaying] = useState(true);
  const ex = list[Math.min(i, list.length - 1)];

  useEffect(() => {
    if (plan?.side) setSide(plan.side);
    setI(0);
  }, [plan]);

  useEffect(() => setI(0), [browseArea]);

  useEffect(() => {
    const m = api();
    if (!m || !ready || !ex || !active) return;
    setReps(0);
    m.setView(ex.view);
    m.setFocus(focusParts(ex.area, side));
    if (!playing) {
      m.stopMove();
      return;
    }
    const s = ex.sided ? side : "R";
    m.playMove(
      ex.frames.map((f) => poseFromAngles(f, s)),
      ex.speed,
      {
        base: ex.base ? poseFromAngles(ex.base, s) : undefined,
        hold: ex.hold,
        cycle: ex.hold === 0 && ex.frames.length > 2,
        onLoop: () => setReps((r) => r + 1),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex?.id, side, playing, ready, active]);


  if (!ex) return null;
  const isCycle = ex.hold === 0 && ex.frames.length > 2;

  return (
    <div className="card qa player" aria-live="polite">
      {plan ? (
        <div className="player-plan">
          <div>
            <div className="eyebrow">Exercises for</div>
            <h2 className="qa-q">{plan.title}</h2>
          </div>
          <button className="btn ghost small" onClick={onClearPlan}>
            Browse all
          </button>
        </div>
      ) : (
        <>
          <div className="eyebrow">Exercises</div>
          <div className="chips player-areas">
            {AREAS.map((a) => (
              <button key={a.id} className={"chip" + (browseArea === a.id ? " on" : "")} onClick={() => setBrowseArea(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="player-tabs" role="tablist">
        {list.map((e, k) => (
          <button key={e.id} role="tab" aria-selected={k === i} className={"ptab" + (k === i ? " on" : "")} onClick={() => setI(k)}>
            <span className="ptab-n">{k + 1}</span>
            {e.name}
          </button>
        ))}
      </div>

      <div className="qa-step" key={`${ex.id}-${side}`}>
        <div className="player-head">
          <span className={`kind kind-${ex.kind.toLowerCase()}`}>{ex.kind}</span>
          {ex.sided && (
            <div className="seg small" role="tablist" aria-label="Side">
              {(["L", "R"] as const).map((s) => (
                <button key={s} role="tab" aria-selected={side === s} className={side === s ? "on" : ""} onClick={() => setSide(s)}>
                  {s === "L" ? "Left" : "Right"}
                </button>
              ))}
            </div>
          )}
        </div>
        <h3 className="player-name">{ex.name}</h3>
        <div className="player-dose">{ex.dose}</div>
        <ol className="player-steps">
          {ex.steps.map((st) => (
            <li key={st}>{st}</li>
          ))}
        </ol>
        <div className="player-bar">
          <button className="btn primary small" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <span className="reps" aria-label={`${reps} ${isCycle ? "circles" : "reps"} shown`}>
            {isCycle ? "Circle" : "Rep"} <strong>{reps + 1}</strong>
          </span>
          <div className="row-gap">
            <button className="icon-btn" aria-label="Previous exercise" disabled={i === 0} onClick={() => setI(i - 1)}>
              ‹
            </button>
            <button className="icon-btn" aria-label="Next exercise" disabled={i >= list.length - 1} onClick={() => setI(i + 1)}>
              ›
            </button>
          </div>
        </div>
        <p className="player-safety">A gentle stretch or effort is fine. Stop if the pain turns sharp or gets worse.</p>
      </div>
    </div>
  );
}
