"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ANSWERS,
  AREAS,
  AREA_BY_ID,
  areaForPart,
  fillSide,
  summarizeCheck,
  type Answer,
  type AreaId,
  type CamView,
  type CheckResult,
} from "@/lib/movementCheck";
import { poseFromAngles, type Pose } from "@/lib/mannequin/rig";
import { PAIN_TYPES, intensityColor, uid, type Movement } from "@/lib/types";

export type CheckApi = {
  playMove: (frames: Pose[], speed?: number) => void;
  stopMove: () => void;
  showPose: (p: Pose) => void;
  setFocus: (parts: string[], tone?: "select" | "pain") => void;
  setTapHandler: (fn: ((part: string) => void) | null) => void;
  setView: (v: CamView) => void;
  snapshot: () => string;
};

type Phase = "area" | "side" | "spot" | "test" | "follow" | "mechanical" | "feel" | "summary";

type Props = {
  api: () => CheckApi | null;
  ready: boolean;
  onSave: (m: Movement) => void;
  onAssess: () => void;
};

const partsFor = (area: AreaId, side: "L" | "R" | null) => {
  const a = AREA_BY_ID[area];
  if (!a.sided) return a.parts;
  const sides = side ? [side] : ["L", "R"];
  return a.parts.flatMap((p) => sides.map((s) => `${p}${s}`));
};

export default function MovementCheck({ api, ready, onSave, onAssess }: Props) {
  const [phase, setPhase] = useState<Phase>("area");
  const [area, setArea] = useState<AreaId | null>(null);
  const [side, setSide] = useState<"L" | "R" | null>(null);
  const [spot, setSpot] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [follow, setFollow] = useState<Record<string, string>>({});
  const [mechanical, setMechanical] = useState<boolean | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const A = area ? AREA_BY_ID[area] : null;
  const test = A ? A.tests[idx] : null;
  const result: CheckResult | null =
    area && spot ? { area, side, spot, answers, follow, mechanical, types } : null;
  const summary = useMemo(() => (result ? summarizeCheck(result) : null), [result]);

  const chooseArea = (id: AreaId, s: "L" | "R" | null) => {
    setArea(id);
    setAnswers({});
    setFollow({});
    setIdx(0);
    setSpot(null);
    setSaved(false);
    const sided = AREA_BY_ID[id].sided;
    setSide(sided ? s : null);
    setPhase(sided && !s ? "side" : "spot");
  };

  // Drive the mannequin for each step of the conversation.
  useEffect(() => {
    const m = api();
    if (!m || !ready) return;
    if (phase === "area") {
      m.stopMove();
      m.setFocus([]);
      m.setView("angle");
      m.setTapHandler((part) => {
        const r = areaForPart(part);
        chooseArea(r.area, r.side);
      });
      return () => m.setTapHandler(null);
    }
    m.setTapHandler(null);
    if (!A) return;
    if (phase === "side" || phase === "spot") {
      m.stopMove();
      m.setFocus(partsFor(A.id, side));
      m.setView(A.id === "lowBack" || A.id === "upperBack" ? "back" : "angle");
    } else if ((phase === "test" || phase === "follow") && test) {
      m.setFocus(partsFor(A.id, side));
      m.setView(test.view);
      if (test.keyframes) m.playMove(test.keyframes.map((k) => poseFromAngles(k, side ?? "R")), test.speed ?? 1.1);
      else m.stopMove();
    } else if (phase === "mechanical" || phase === "feel") {
      m.stopMove();
      m.setFocus(partsFor(A.id, side));
    } else if (phase === "summary" && summary) {
      const worst = summary.painful.find((t) => answers[t.id] === "severe" || answers[t.id] === "cant") ?? summary.painful[0];
      if (worst?.keyframes) m.showPose(poseFromAngles(worst.keyframes[worst.keyframes.length - 1], side ?? "R"));
      else m.stopMove();
      m.setFocus(partsFor(A.id, side), "pain");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx, area, side, ready]);

  useEffect(() => () => api()?.setTapHandler(null), [api]);

  const nextTest = () => {
    if (!A) return;
    if (idx + 1 < A.tests.length) {
      setIdx(idx + 1);
      setPhase("test");
    } else setPhase("mechanical");
  };

  const answer = (a: Answer) => {
    if (!test) return;
    setAnswers((p) => ({ ...p, [test.id]: a }));
    if ((a === "hurts" || a === "severe") && test.followUp) setPhase("follow");
    else nextTest();
  };

  const back = () => {
    if (phase === "side" || (phase === "spot" && !A?.sided)) return setPhase("area");
    if (phase === "spot") return setPhase(side && A?.sided ? "area" : "side");
    if (phase === "test") return idx > 0 ? setIdx(idx - 1) : setPhase("spot");
    if (phase === "follow") return setPhase("test");
    if (phase === "mechanical") {
      setIdx((A?.tests.length ?? 1) - 1);
      return setPhase("test");
    }
    if (phase === "feel") return setPhase("mechanical");
    if (phase === "summary") return setPhase("feel");
  };

  const restart = () => {
    setArea(null);
    setSide(null);
    setSpot(null);
    setPhase("area");
  };

  const save = (thenAssess: boolean) => {
    if (!result || !summary || !A) return;
    const m = api();
    const sideWord = side === "L" ? "left " : side === "R" ? "right " : "";
    onSave({
      id: uid(),
      createdAt: Date.now(),
      view: "3d",
      angles: {},
      tags: summary.tags,
      thumb: m?.snapshot(),
      painParts: partsFor(A.id, side),
      intensity: summary.intensity,
      label: `Movement check — ${sideWord}${A.label.toLowerCase()}`,
      note: summary.painful.length ? `Hurts: ${summary.painful.map((t) => t.title.toLowerCase()).join(", ")}` : "No movement made it hurt",
      check: result,
    });
    setSaved(true);
    if (thenAssess) onAssess();
  };

  const total = A?.tests.length ?? 0;
  const stepKey = `${phase}-${idx}-${area}`;

  return (
    <div className="card qa" aria-live="polite">
      {phase !== "area" && (
        <div className="qa-top">
          <button className="icon-btn" onClick={back} aria-label="Back">
            ←
          </button>
          {phase === "test" || phase === "follow" ? (
            <div className="qa-dots" aria-label={`Movement ${idx + 1} of ${total}`}>
              {A?.tests.map((t, i) => (
                <span
                  key={t.id}
                  className={
                    "dotp" +
                    (i === idx ? " now" : "") +
                    (answers[t.id] ? ` a-${answers[t.id]}` : "")
                  }
                />
              ))}
            </div>
          ) : (
            <div className="qa-crumb">{A ? `${side ? (side === "L" ? "Left " : "Right ") : ""}${A.label}` : ""}</div>
          )}
          <button className="btn ghost small" onClick={restart}>
            Start over
          </button>
        </div>
      )}

      <div className="qa-step" key={stepKey}>
        {phase === "area" && (
          <>
            <div className="eyebrow">Movement check</div>
            <h2 className="qa-q">Where does it hurt?</h2>
            <p className="muted qa-sub">Tap the mannequin, or choose below. Then I&apos;ll show you some movements to try.</p>
            <div className="chips qa-choices">
              {AREAS.map((a) => (
                <button key={a.id} className="chip big" onClick={() => chooseArea(a.id, null)}>
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}

        {phase === "side" && A && (
          <>
            <h2 className="qa-q">Which {A.label.toLowerCase()}?</h2>
            <div className="qa-answers two">
              <button className="ans" onClick={() => (setSide("L"), setPhase("spot"))}>
                Left
              </button>
              <button className="ans" onClick={() => (setSide("R"), setPhase("spot"))}>
                Right
              </button>
            </div>
          </>
        )}

        {phase === "spot" && A && (
          <>
            <h2 className="qa-q">Where exactly?</h2>
            <div className="qa-list">
              {A.spots.map((sp) => (
                <button
                  key={sp.id}
                  className={"ans row" + (spot === sp.id ? " on" : "")}
                  onClick={() => {
                    setSpot(sp.id);
                    setIdx(0);
                    setPhase("test");
                  }}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </>
        )}

        {(phase === "test" || phase === "follow") && test && (
          <>
            <div className="eyebrow">
              {test.question ? "Quick question" : `Try this · ${idx + 1} of ${total}`}
            </div>
            <h2 className="qa-q">{test.title}</h2>
            <p className="qa-prompt">{fillSide(test.prompt, side)}</p>
            {phase === "test" &&
              (test.question ? (
                <div className="qa-answers two">
                  <button className="ans tone-mid" onClick={() => answer("hurts")}>
                    Yes
                  </button>
                  <button className="ans tone-ok" onClick={() => answer("none")}>
                    No
                  </button>
                </div>
              ) : (
                <div className="qa-answers">
                  {ANSWERS.map((a) => (
                    <button
                      key={a.id}
                      className={`ans tone-${a.tone}` + (answers[test.id] === a.id ? " on" : "")}
                      onClick={() => answer(a.id)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              ))}
            {phase === "follow" && test.followUp && (
              <div className="qa-follow">
                <div className="qa-followq">{test.followUp.question}</div>
                <div className="qa-list">
                  {test.followUp.options.map((o) => (
                    <button
                      key={o.id}
                      className="ans row"
                      onClick={() => {
                        setFollow((p) => ({ ...p, [test.id]: o.id }));
                        nextTest();
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {phase === "mechanical" && (
          <>
            <div className="eyebrow">Almost done</div>
            <h2 className="qa-q">Does moving change the pain?</h2>
            <p className="muted qa-sub">Think about any movement or position — does anything make it better or worse?</p>
            <div className="qa-list">
              <button className="ans row" onClick={() => (setMechanical(true), setPhase("feel"))}>
                Yes — some movements or positions change it
              </button>
              <button className="ans row" onClick={() => (setMechanical(false), setPhase("feel"))}>
                No — it&apos;s the same whatever I do
              </button>
              <button className="ans row" onClick={() => (setMechanical(null), setPhase("feel"))}>
                Not sure
              </button>
            </div>
          </>
        )}

        {phase === "feel" && (
          <>
            <h2 className="qa-q">What does it feel like?</h2>
            <p className="muted qa-sub">Pick any that fit.</p>
            <div className="chips">
              {PAIN_TYPES.map((t) => (
                <button
                  key={t}
                  className={"chip" + (types.includes(t) ? " on" : "")}
                  aria-pressed={types.includes(t)}
                  onClick={() => setTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
                >
                  {t}
                </button>
              ))}
            </div>
            <button className="btn primary full" onClick={() => setPhase("summary")}>
              {types.length ? "See my results" : "Skip"}
            </button>
          </>
        )}

        {phase === "summary" && summary && A && (
          <>
            <div className="eyebrow">Your movement check</div>
            <h2 className="qa-q">
              {side ? (side === "L" ? "Left " : "Right ") : ""}
              {A.label.toLowerCase()} · {summary.spot.label.toLowerCase()}
            </h2>
            <ul className="qa-results">
              {A.tests.map((t) => {
                const a = answers[t.id];
                const lbl = t.question ? (a === "hurts" ? "Yes" : a ? "No" : "—") : ANSWERS.find((x) => x.id === a)?.label ?? "—";
                const f = follow[t.id] && t.followUp?.options.find((o) => o.id === follow[t.id])?.label;
                return (
                  <li key={t.id}>
                    <span className={`res-dot a-${t.question ? (a === "hurts" ? "hurts" : "none") : a ?? "skip"}`} />
                    <span className="grow">
                      {t.title}
                      {f && <span className="muted small-text"> · {f}</span>}
                    </span>
                    <span className="muted small-text">{lbl}</span>
                  </li>
                );
              })}
              <li>
                <span className={`res-dot a-${mechanical === false ? "severe" : "none"}`} />
                <span className="grow">Movement changes the pain</span>
                <span className="muted small-text">{mechanical === null ? "Not sure" : mechanical ? "Yes" : "No"}</span>
              </li>
            </ul>
            <div className="qa-intensity">
              <span className="pill" style={{ background: intensityColor(summary.intensity) }}>
                {summary.painful.length ? `${summary.painful.length} movement${summary.painful.length === 1 ? "" : "s"} hurt` : "No movement hurt"}
              </span>
            </div>
            {saved ? (
              <p className="qa-saved">✓ Saved to your log</p>
            ) : (
              <>
                <button className="btn accent full" onClick={() => save(true)}>
                  Save &amp; see what it could be →
                </button>
                <button className="btn ghost full" onClick={() => save(false)}>
                  Just save it
                </button>
              </>
            )}
            <button className="btn ghost full" onClick={restart}>
              Check another area
            </button>
          </>
        )}
      </div>
    </div>
  );
}
