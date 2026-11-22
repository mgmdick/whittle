"use client";

import { useEffect, useMemo, useState } from "react";
import BodyFigure from "./BodyFigure";
import {
  RED_FLAGS,
  assess,
  likelihoodLabel,
  type Intake,
  type Urgency,
} from "@/lib/diagnose";
import type { AiAssessment } from "@/lib/assessment";
import { usePersistentState } from "@/lib/storage";
import { EMPTY_INTAKE } from "@/lib/diagnose";
import type { Movement, PainMarker } from "@/lib/types";

type Props = {
  markers: PainMarker[];
  movements: Movement[];
  onGoTo: (tab: "body" | "dummy") => void;
};

const URGENCY_META: Record<Urgency, { label: string; icon: string }> = {
  emergency: { label: "Emergency", icon: "!" },
  urgent: { label: "Same day", icon: "◆" },
  doctor: { label: "See a doctor", icon: "+" },
  selfcare: { label: "Self-care", icon: "✓" },
};

const QUESTIONS: {
  key: "duration" | "onset" | "age" | "sex";
  label: string;
  options: [string, string][];
}[] = [
  { key: "duration", label: "How long has it hurt?", options: [["days", "Days"], ["weeks", "Weeks"], ["months", "Months+"]] },
  {
    key: "onset",
    label: "How did it start?",
    options: [["injury", "Injury / strain"], ["sudden", "Suddenly"], ["gradual", "Gradually"], ["woke", "Woke up with it"]],
  },
  { key: "age", label: "Age", options: [["u18", "Under 18"], ["18-39", "18–39"], ["40-59", "40–59"], ["60+", "60+"]] },
  { key: "sex", label: "Sex (optional)", options: [["female", "Female"], ["male", "Male"]] },
];

export default function DiagnosisView({ markers, movements, onGoTo }: Props) {
  const [intake, setIntake] = usePersistentState<Intake>("bodymap.intake.v1", EMPTY_INTAKE);
  const [open, setOpen] = useState<string | null>(null);
  const { findings, results, triage } = useMemo(() => assess(markers, movements, intake), [markers, movements, intake]);

  const set = <K extends keyof Intake>(k: K, v: Intake[K]) =>
    setIntake((p) => ({ ...p, [k]: p[k] === v ? null : v }));
  const toggleFlag = (id: string) =>
    setIntake((p) => ({ ...p, flags: p.flags.includes(id) ? p.flags.filter((f) => f !== id) : [...p.flags, id] }));

  if (findings.length === 0) {
    return (
      <div className="panel empty">
        <div className="empty-art" aria-hidden>
          <BodyFigure view="front" markers={[]} compact className="empty-body" />
        </div>
        <h2>Show me where it hurts first</h2>
        <p className="muted">
          Tap sore spots on the body map or pose the mannequin. Then come back here for an assessment of what might be
          going on and how urgently to get help.
        </p>
        <div className="row-gap">
          <button className="btn primary" onClick={() => onGoTo("body")}>
            Open body map
          </button>
          <button className="btn ghost" onClick={() => onGoTo("dummy")}>
            Pose mannequin
          </button>
        </div>
      </div>
    );
  }

  const hasFront = markers.some((m) => m.view === "front");
  const hasBack = markers.some((m) => m.view === "back");

  return (
    <div className="panel">
      <section className="card assess-head">
        <div className="assess-thumbs">
          {hasFront && <BodyFigure view="front" markers={markers} compact className="thumb lg" />}
          {hasBack && <BodyFigure view="back" markers={markers} compact className="thumb lg" />}
        </div>
        <div className="grow">
          <div className="eyebrow">Assessment</div>
          <h2 className="assess-title">
            {findings.length} finding{findings.length === 1 ? "" : "s"}
          </h2>
          <p className="muted small-text">
            {markers.length} sore spot{markers.length === 1 ? "" : "s"}
            {movements.length > 0 && ` · ${movements.length} painful movement${movements.length === 1 ? "" : "s"}`}. Answer
            below to sharpen the result.
          </p>
        </div>
      </section>

      <section className={`triage triage-${triage.level}`} aria-live="polite">
        <div className="triage-icon" aria-hidden>
          {URGENCY_META[triage.level].icon}
        </div>
        <div className="grow">
          <div className="triage-kicker">{URGENCY_META[triage.level].label}</div>
          <h2>{triage.title}</h2>
          <p>{triage.message}</p>
          {triage.reasons.length > 0 && (
            <ul className="triage-reasons">
              {triage.reasons.slice(0, 3).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Any of these right now?</h3>
          {intake.flags.length > 0 && <span className="pill warn">{intake.flags.length} selected</span>}
        </div>
        <div className="flag-grid">
          {RED_FLAGS.map((f) => (
            <button
              key={f.id}
              className={"flag" + (intake.flags.includes(f.id) ? " on" : "")}
              aria-pressed={intake.flags.includes(f.id)}
              onClick={() => toggleFlag(f.id)}
            >
              <span className="check" aria-hidden />
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="mb">A few quick questions</h3>
        {QUESTIONS.map((q) => (
          <div key={q.key} className="q-row">
            <div className="q-label">{q.label}</div>
            <div className="chips">
              {q.options.map(([v, label]) => (
                <button
                  key={v}
                  className={"chip" + (intake[q.key] === v ? " on" : "")}
                  aria-pressed={intake[q.key] === v}
                  onClick={() => set(q.key, v as never)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section>
        <div className="section-title">
          <h3>What it could be</h3>
          <span className="muted small-text">ranked by fit</span>
        </div>
        {results.length === 0 ? (
          <div className="card muted">
            No common pattern stands out from what you've marked. Add how it feels (sharp, aching…) to your spots, or
            ask the AI below.
          </div>
        ) : (
          <ol className="results">
            {results.map((r, i) => {
              const isOpen = open === r.condition.id || (open === null && i === 0);
              return (
                <li key={r.condition.id} className={"card result" + (isOpen ? " open" : "")}>
                  <button
                    className="result-head"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? "" : r.condition.id)}
                  >
                    <span className="rank">{i + 1}</span>
                    <span className="grow">
                      <span className="result-name">{r.condition.name}</span>
                      <span className="result-meta">
                        <span className={`urg urg-${r.condition.urgency}`}>{URGENCY_META[r.condition.urgency].label}</span>
                        <span className="muted">{r.condition.area}</span>
                      </span>
                      <span className="fit" aria-label={`${likelihoodLabel(r.pct)}, fit ${r.pct}%`}>
                        <span className="fit-bar" style={{ width: `${Math.max(8, r.pct)}%` }} />
                      </span>
                    </span>
                    <span className="fit-label">{likelihoodLabel(r.pct)}</span>
                  </button>
                  {isOpen && (
                    <div className="result-body">
                      {r.why.length > 0 && (
                        <>
                          <div className="sub">Why it fits</div>
                          <ul className="why">
                            {r.why.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      <div className="sub">What it is</div>
                      <p>{r.condition.about}</p>
                      <div className="sub">What helps</div>
                      <ul className="tips">
                        {r.condition.selfCare.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                      <div className="see-doc">
                        <strong>See a doctor:</strong> {r.condition.seeDoctor}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <AiPanel markers={markers} movements={movements} intake={intake} ruleBased={results.map((r) => r.condition.name)} findings={findings} />

      <p className="disclaimer">
        This is not a medical diagnosis. It suggests common possibilities based on what you entered, to help you decide
        what to do and talk to a clinician. If you're worried, or symptoms are severe or getting worse, seek medical
        help.
      </p>
    </div>
  );
}

function AiPanel({
  markers,
  movements,
  intake,
  ruleBased,
  findings,
}: {
  markers: PainMarker[];
  movements: Movement[];
  intake: Intake;
  ruleBased: string[];
  findings: ReturnType<typeof assess>["findings"];
}) {
  const [status, setStatus] = useState<{ enabled: boolean; needsCode: boolean } | null>(null);
  const [code, setCode] = usePersistentState("bodymap.aicode.v1", "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiAssessment | null>(null);

  useEffect(() => {
    fetch("/api/diagnose")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, needsCode: false }));
  }, []);

  if (!status?.enabled) return null;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findings: findings.slice(0, 40).map((f) => ({
            label: f.label.slice(0, 160),
            intensity: f.intensity,
            types: f.types.slice(0, 12).map((t) => t.slice(0, 40)),
            source: f.source,
          })),
          notes: [
            ...markers.filter((m) => m.note).map((m) => `${m.region}: ${m.note}`),
            ...movements.filter((m) => m.note).map((m) => `${m.label}: ${m.note}`),
          ]
            .slice(0, 20)
            .map((n) => n.slice(0, 400)),
          intake: {
            duration: intake.duration,
            onset: intake.onset,
            age: intake.age,
            sex: intake.sex,
            flags: RED_FLAGS.filter((f) => intake.flags.includes(f.id)).map((f) => f.label),
          },
          ruleBased: ruleBased.slice(0, 8),
          accessCode: status.needsCode ? code : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data.assessment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card ai">
      <div className="ai-head">
        <div className="ai-badge" aria-hidden>
          ✦
        </div>
        <div className="grow">
          <h3>AI second opinion</h3>
          <p className="muted small-text">Claude reviews everything you entered. Your name isn't sent.</p>
        </div>
      </div>
      {status.needsCode && !result && (
        <input
          className="mt"
          type="password"
          placeholder="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
        />
      )}
      {!result && (
        <button className="btn primary full" onClick={run} disabled={loading || (status.needsCode && !code)}>
          {loading ? (
            <span className="loading">
              <span className="spinner" aria-hidden /> Thinking it through…
            </span>
          ) : (
            "Get AI assessment"
          )}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="ai-result">
          <div className={`urg urg-${result.triage}`}>{URGENCY_META[result.triage].label}</div>
          <p className="ai-reason">{result.triage_reason}</p>
          <p>{result.summary}</p>
          <ol className="ai-list">
            {result.conditions.map((c) => (
              <li key={c.name}>
                <div className="ai-cond">
                  <strong>{c.name}</strong>
                  <span className={`lik lik-${c.likelihood}`}>{c.likelihood}</span>
                </div>
                <p className="small-text">{c.reasoning}</p>
                {c.self_care.length > 0 && (
                  <ul className="tips small-text">
                    {c.self_care.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
                <p className="small-text see-doc">
                  <strong>See a doctor if:</strong> {c.see_doctor_if}
                </p>
              </li>
            ))}
          </ol>
          {result.red_flags_to_watch.length > 0 && (
            <>
              <div className="sub">Get help urgently if</div>
              <ul className="why">
                {result.red_flags_to_watch.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {result.questions_for_clinician.length > 0 && (
            <>
              <div className="sub">Questions to ask your clinician</div>
              <ul className="tips">
                {result.questions_for_clinician.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          <button className="btn ghost small" onClick={() => setResult(null)}>
            Run again
          </button>
        </div>
      )}
    </section>
  );
}
