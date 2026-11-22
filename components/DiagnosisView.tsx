"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DETAILS,
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
import { MUSCLE_BY_ID } from "@/lib/muscles";
import { exercisesFor } from "@/lib/exercises";
import { ANSWERS, AREA_BY_ID } from "@/lib/movementCheck";
import type { ExercisePlan } from "./ExercisePlayer";

type Props = {
  /** Saved movement checks, oldest first. */
  checks: Movement[];
  /** Recent free-pose movements (used only if there are no checks). */
  poses: Movement[];
  onStart: () => void;
  onExercises: (plan: ExercisePlan) => void;
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
  { key: "duration", label: "How long", options: [["days", "Days"], ["weeks", "Weeks"], ["months", "Months+"]] },
  { key: "onset", label: "Started", options: [["injury", "Injury"], ["sudden", "Suddenly"], ["gradual", "Gradually"], ["woke", "On waking"]] },
  { key: "age", label: "Age", options: [["u18", "<18"], ["18-39", "18–39"], ["40-59", "40–59"], ["60+", "60+"]] },
  { key: "sex", label: "Sex", options: [["female", "F"], ["male", "M"]] },
];

const firstSentence = (t: string) => {
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
};

export default function DiagnosisView({ checks, poses, onStart, onExercises }: Props) {
  const [intake, setIntake] = usePersistentState<Intake>("bodymap.intake.v1", EMPTY_INTAKE);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [more, setMore] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const recentChecks = checks.slice(-5);
  const selected = recentChecks.find((c) => c.id === pickedId) ?? recentChecks[recentChecks.length - 1] ?? null;
  const movements = useMemo(() => (selected ? [selected] : poses), [selected, poses]);
  const { findings, results, triage } = useMemo(() => assess([], movements, intake), [movements, intake]);

  const set = <K extends keyof Intake>(k: K, v: Intake[K]) =>
    setIntake((p) => ({ ...p, [k]: p[k] === v ? null : v }));
  const toggleFlag = (id: string) =>
    setIntake((p) => ({ ...p, flags: p.flags.includes(id) ? p.flags.filter((f) => f !== id) : [...p.flags, id] }));

  if (findings.length === 0) {
    return (
      <div className="panel empty">
        <h2>Nothing to assess yet</h2>
        <p className="muted">Do a quick movement check on the mannequin first.</p>
        <button className="btn primary" onClick={onStart}>
          Start a movement check
        </button>
      </div>
    );
  }

  const answered = QUESTIONS.filter((q) => intake[q.key]).length + intake.flags.filter((f) => DETAILS.some((d) => d.id === f)).length;
  const shown = showAll ? results : results.slice(0, 3);
  const urgentNow = triage.level === "emergency" || triage.level === "urgent";
  const checkSide = selected?.check?.side ?? null;
  const short = (m: Movement) => m.label.replace(/^Movement check — /, "");
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const when = (t: number) => {
    const d = new Date(t);
    const sameDay = recentChecks.some((c) => c.createdAt !== t && new Date(c.createdAt).toDateString() === d.toDateString());
    const today = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (today) return sameDay ? `today ${time}` : "today";
    return sameDay ? `${day(t)} ${time}` : day(t);
  };

  const share = async () => {
    const lines: string[] = ["Whittle pain summary", ""];
    if (selected?.check) {
      const c = selected.check;
      const area = AREA_BY_ID[c.area];
      lines.push(`${cap(short(selected))} (${day(selected.createdAt)}) — ${(area.spots.find((x) => x.id === c.spot)?.label ?? "").toLowerCase()}`);
      for (const t of area.tests) {
        const ans = c.answers[t.id];
        if (!ans) continue;
        const lbl = t.question ? (ans === "hurts" ? "Yes" : "No") : ANSWERS.find((x) => x.id === ans)?.label;
        lines.push(`• ${t.title}: ${lbl}`);
      }
      if (c.mechanical !== null) lines.push(`• Movement changes the pain: ${c.mechanical ? "Yes" : "No"}`);
      if (c.types.length) lines.push(`• Feels: ${c.types.join(", ")}`);
    }
    const flags = RED_FLAGS.filter((f) => intake.flags.includes(f.id)).map((f) => f.label);
    if (flags.length) lines.push(`• Warning signs: ${flags.join("; ")}`);
    lines.push("", `Suggested: ${triage.title}`, `Possible causes: ${results.slice(0, 3).map((r) => r.condition.name).join("; ")}`, "", "(Self-check from the Whittle app — not a diagnosis.)");
    const text = lines.join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "My pain summary", text });
        return;
      }
    } catch {
      /* cancelled — fall back to copy */
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      window.prompt("Copy your summary:", text);
    }
  };

  return (
    <div className="panel">
      {recentChecks.length > 1 && (
        <div className="chips based-chips" aria-label="Choose which check">
          {[...recentChecks].reverse().map((c) => (
            <button key={c.id} className={"chip" + (selected?.id === c.id ? " on" : "")} onClick={() => setPickedId(c.id)}>
              {cap(short(c))} · {when(c.createdAt)}
            </button>
          ))}
        </div>
      )}

      <section className={`triage triage-${triage.level}`} aria-live="polite">
        {selected?.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="triage-thumb" src={selected.thumb} alt="Your mannequin in the painful position" />
        ) : (
          <div className="triage-icon" aria-hidden>
            {URGENCY_META[triage.level].icon}
          </div>
        )}
        <div className="grow">
          <div className="triage-kicker">
            {URGENCY_META[triage.level].icon} {URGENCY_META[triage.level].label}
            {selected && ` · ${short(selected)}`}
          </div>
          <h2>{triage.title}</h2>
          <p>{triage.reasons[0] ?? triage.message}</p>
        </div>
      </section>


      <section>
        <div className="section-title">
          <h3>Likely causes</h3>
        </div>
        {results.length === 0 ? (
          <div className="card muted">No clear pattern yet — answer a few questions below.</div>
        ) : (
          <ol className="results">
            {shown.map((r, i) => {
              const isOpen = open === r.condition.id || (open === null && i === 0);
              return (
                <li key={r.condition.id} className={"card result" + (isOpen ? " open" : "")}>
                  <button className="result-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : r.condition.id)}>
                    <span className="rank">{i + 1}</span>
                    <span className="grow">
                      <span className="result-name">{r.condition.name}</span>
                      <span className="fit" aria-label={`${likelihoodLabel(r.pct)}, fit ${r.pct}%`}>
                        <span className="fit-bar" style={{ width: `${Math.max(8, r.pct)}%` }} />
                      </span>
                    </span>
                    <span className={`urg urg-${r.condition.urgency}`}>{URGENCY_META[r.condition.urgency].label}</span>
                  </button>
                  {isOpen && (
                    <div className="result-body">
                      <p>{firstSentence(r.condition.about)}</p>
                      {r.why.length > 1 && (
                        <ul className="why">
                          {r.why.slice(1, 4).map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      )}
                      {(urgentNow || exercisesFor(r.condition.id).length === 0 || r.condition.urgency === "urgent" || r.condition.urgency === "emergency") && (
                        <>
                          <div className="sub">Try</div>
                          <ul className="tips">
                            {r.condition.selfCare.slice(0, 2).map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {!urgentNow && r.condition.urgency !== "emergency" && r.condition.urgency !== "urgent" && exercisesFor(r.condition.id).length > 0 && (
                        <button
                          className="btn accent full ex-btn"
                          onClick={() =>
                            onExercises({ title: r.condition.name, side: checkSide, ids: exercisesFor(r.condition.id).map((e) => e.id) })
                          }
                        >
                          ▶ Show me the exercises ({exercisesFor(r.condition.id).length})
                        </button>
                      )}
                      <div className="see-doc">
                        <span aria-hidden>🩺 </span>{firstSentence(r.condition.seeDoctor)}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {results.length > 3 && (
          <button className="btn ghost small more-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show ${results.length - 3} more`}
          </button>
        )}
      </section>

      <section className="card flags-card">
        <div className="card-head">
          <h3>Warning signs? Tap any you have</h3>
          {intake.flags.some((f) => RED_FLAGS.some((r) => r.id === f)) && <span className="pill warn">!</span>}
        </div>
        <div className="chips">
          {RED_FLAGS.map((f) => (
            <button
              key={f.id}
              title={f.label}
              className={"chip flag-chip" + (intake.flags.includes(f.id) ? " on" : "")}
              aria-pressed={intake.flags.includes(f.id)}
              aria-label={f.label}
              onClick={() => toggleFlag(f.id)}
            >
              {f.short}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <button className="acc-head" aria-expanded={more} onClick={() => setMore(!more)}>
          <span>
            <strong>Sharpen the result</strong>
            <span className="muted small-text"> {answered ? `· ${answered} answered` : "· optional"}</span>
          </span>
          <span aria-hidden>{more ? "−" : "+"}</span>
        </button>
        {more && (
          <div className="acc-body">
            {QUESTIONS.map((q) => (
              <div key={q.key} className="q-inline">
                <span className="q-label">{q.label}</span>
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
            <div className="q-label mt">Also…</div>
            <div className="chips">
              {DETAILS.map((f) => (
                <button
                  key={f.id}
                  title={f.label}
                  className={"chip" + (intake.flags.includes(f.id) ? " on" : "")}
                  aria-pressed={intake.flags.includes(f.id)}
                  onClick={() => toggleFlag(f.id)}
                >
                  {f.short}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <AiPanel markers={[]} movements={movements} intake={intake} ruleBased={results.map((r) => r.condition.name)} findings={findings} />

      <button className="btn ghost full" onClick={share}>
        {shared ? "✓ Copied — paste it into a message" : "Share with my physio or GP"}
      </button>

      <p className="disclaimer">Not a diagnosis. If you&apos;re worried or it&apos;s getting worse, see a clinician.</p>
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
            label: (
              f.label +
              (f.muscles.length ? ` (over: ${f.muscles.slice(0, 3).map((id) => MUSCLE_BY_ID[id]?.name).filter(Boolean).join(", ")})` : "") +
              (f.medial ? ", inner side" : f.lateral ? ", outer side" : "")
            ).slice(0, 160),
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
            flags: [...RED_FLAGS, ...DETAILS].filter((f) => intake.flags.includes(f.id)).map((f) => f.label),
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
          <p className="muted small-text">Claude reviews your answers. No name is sent.</p>
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

