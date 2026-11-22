"use client";

import { useState } from "react";
import type { Muscle, MuscleHit } from "@/lib/muscles";

export function MuscleDetails({ muscle, label }: { muscle: Muscle; label?: string }) {
  return (
    <div className="muscle-details">
      {label && <h4>{label}</h4>}
      <div className="md-group">{muscle.group}</div>
      <dl>
        <dt>What it does</dt>
        <dd>{muscle.action}</dd>
        <dt>How it hurts</dt>
        <dd>{muscle.pain}</dd>
        <dt>Usually from</dt>
        <dd>{muscle.causes}</dd>
        <dt>What helps</dt>
        <dd>{muscle.relief}</dd>
      </dl>
    </div>
  );
}

/** Expandable list of the muscles under a spot. */
export function MusclesHere({ hits, title = "Muscles here" }: { hits: MuscleHit[]; title?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!hits.length) return null;
  return (
    <div className="field muscles-here">
      <div className="field-label">
        {title} <span className="muted">· tap for info</span>
      </div>
      <div className="chips">
        {hits.map((h) => (
          <button
            key={h.muscle.id}
            className={"chip muscle-chip" + (open === h.muscle.id ? " on" : "") + (h.deep ? " deep" : "")}
            aria-expanded={open === h.muscle.id}
            onClick={() => setOpen(open === h.muscle.id ? null : h.muscle.id)}
          >
            <span className="mc-dot" aria-hidden />
            {h.label}
            {h.deep && <span className="muted"> (deep)</span>}
          </button>
        ))}
      </div>
      {open && (() => {
        const h = hits.find((x) => x.muscle.id === open);
        return h ? <MuscleDetails muscle={h.muscle} label={h.label} /> : null;
      })()}
    </div>
  );
}
