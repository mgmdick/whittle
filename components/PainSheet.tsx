"use client";

import { useEffect, useState } from "react";
import { PAIN_TYPES, intensityColor, intensityWord } from "@/lib/types";

export type PainDraft = { intensity: number; types: string[]; note: string };

type Props = {
  title: string;
  subtitle?: string;
  initial: PainDraft;
  showTypes?: boolean;
  extra?: React.ReactNode;
  saveLabel?: string;
  onSave: (d: PainDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export default function PainSheet({
  title,
  subtitle,
  initial,
  showTypes = true,
  extra,
  saveLabel = "Save",
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [d, setD] = useState<PainDraft>(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleType = (t: string) =>
    setD((p) => ({ ...p, types: p.types.includes(t) ? p.types.filter((x) => x !== t) : [...p.types, t] }));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {extra}

        <div className="field">
          <div className="field-label">
            How bad? <strong style={{ color: intensityColor(d.intensity) }}>{d.intensity}</strong>
            <span className="muted"> · {intensityWord(d.intensity)}</span>
          </div>
          <div className="scale" role="radiogroup" aria-label="Pain intensity">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={d.intensity === n}
                className={"scale-btn" + (d.intensity === n ? " on" : "")}
                style={{ ["--c" as string]: intensityColor(n) }}
                onClick={() => setD((p) => ({ ...p, intensity: n }))}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {showTypes && (
          <div className="field">
            <div className="field-label">What does it feel like?</div>
            <div className="chips">
              {PAIN_TYPES.map((t) => (
                <button
                  key={t}
                  className={"chip" + (d.types.includes(t) ? " on" : "")}
                  aria-pressed={d.types.includes(t)}
                  onClick={() => toggleType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="pain-note">
            Notes <span className="muted">(optional)</span>
          </label>
          <textarea
            id="pain-note"
            rows={2}
            placeholder="When it started, what makes it better or worse…"
            value={d.note}
            onChange={(e) => setD((p) => ({ ...p, note: e.target.value }))}
          />
        </div>

        <div className="sheet-actions">
          {onDelete && (
            <button className="btn danger" onClick={onDelete}>
              Remove
            </button>
          )}
          <button className="btn primary grow" onClick={() => onSave(d)}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
