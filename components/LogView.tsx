"use client";

import { useState } from "react";
import BodyFigure from "./BodyFigure";
import DummyFigure, { DUMMY_VIEWBOX, GROUND_Y } from "./DummyFigure";
import { PART_LABEL, groundedPelvis } from "@/lib/pose";
import type { CheckResult } from "@/lib/movementCheck";
import { intensityColor, intensityWord, type LogEntry } from "@/lib/types";

type Props = {
  onRecheck?: (check: CheckResult) => void;
  log: LogEntry[];
  setLog: (fn: (l: LogEntry[]) => LogEntry[]) => void;
};

const fmt = (t: number) =>
  new Date(t).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function summarize(entries: LogEntry[]): string {
  const lines: string[] = ["Pain log (from Whittle)", ""];
  for (const e of entries) {
    lines.push(fmt(e.createdAt));
    if (e.kind === "map") {
      const ms = [...e.markers].sort((a, b) => b.intensity - a.intensity);
      for (const m of ms) {
        const extra = [m.types.join(", "), m.note].filter(Boolean).join(" — ");
        lines.push(`  • ${m.region}: ${m.intensity}/10${extra ? ` (${extra})` : ""}`);
      }
      if (e.note) lines.push(`  Note: ${e.note}`);
    } else if (e.check) {
      lines.push(`  • ${e.label}: ${e.note}`);
    } else {
      lines.push(`  • Hurts when: ${e.label} — ${e.intensity}/10`);
      lines.push(`    Where: ${e.painParts.map((p) => PART_LABEL[p] ?? p).join(", ")}`);
      if (e.note) lines.push(`    ${e.note}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export default function LogView({ log, setLog, onRecheck }: Props) {
  const [copied, setCopied] = useState(false);
  const sorted = [...log].sort((a, b) => b.createdAt - a.createdAt);

  const share = async () => {
    const text = summarize(sorted);
    try {
      if (navigator.share) {
        await navigator.share({ title: "My pain log", text });
        return;
      }
    } catch {
      /* cancelled or unsupported — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      alert(text);
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="panel empty">
        <div className="empty-icon" aria-hidden>
          📋
        </div>
        <h2>No entries yet</h2>
        <p className="muted">
          Mark sore spots on the <strong>Body</strong> tab or pose the <strong>Dummy</strong>, then save them here. Your
          log stays on this device.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="toolbar">
        <h2 className="log-title">History</h2>
        <button className="btn primary small" onClick={share}>
          {copied ? "Copied ✓" : "Share with doctor"}
        </button>
      </div>
      <ul className="log-list">
        {sorted.map((e) => (
          <li key={e.id} className="card log-item">
            <div className="card-head">
              <span className="muted small-text">{fmt(e.createdAt)}</span>
              <button
                className="icon-btn"
                aria-label="Delete entry"
                onClick={() => {
                  if (confirm("Delete this entry?")) setLog((l) => l.filter((x) => x.id !== e.id));
                }}
              >
                🗑
              </button>
            </div>
            {e.kind === "map" ? <MapItem e={e} /> : <MoveItem e={e} onRecheck={onRecheck} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MapItem({ e }: { e: Extract<LogEntry, { kind: "map" }> }) {
  const hasFront = e.markers.some((m) => m.view === "front");
  const hasBack = e.markers.some((m) => m.view === "back");
  const worst = Math.max(...e.markers.map((m) => m.intensity), 0);
  return (
    <div className="log-body">
      <div className="thumbs">
        {hasFront && <BodyFigure view="front" markers={e.markers} className="thumb" />}
        {hasBack && <BodyFigure view="back" markers={e.markers} className="thumb" />}
      </div>
      <div className="grow">
        <div className="log-head">
          <strong>Sore spots</strong>
          <span className="pill" style={{ background: intensityColor(worst) }}>
            worst {worst}/10
          </span>
        </div>
        <ul className="mini-list">
          {[...e.markers]
            .sort((a, b) => b.intensity - a.intensity)
            .map((m) => (
              <li key={m.id}>
                <span className="dot sm" style={{ background: intensityColor(m.intensity) }} />
                {m.region} <span className="muted">· {m.intensity}</span>
                {m.types.length > 0 && <span className="muted"> · {m.types.join(", ")}</span>}
              </li>
            ))}
        </ul>
        {e.note && <p className="note">{e.note}</p>}
      </div>
    </div>
  );
}

function MoveItem({ e, onRecheck }: { e: Extract<LogEntry, { kind: "movement" }>; onRecheck?: (c: CheckResult) => void }) {
  const view2d = e.view === "3d" ? null : e.view;
  return (
    <div className="log-body">
      <div className="thumbs">
        {e.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.thumb} alt="Pose" className="thumb dummy-thumb photo" />
        ) : !view2d ? null : (
        <DummyFigure
          angles={e.angles}
          view={view2d}
          pelvis={groundedPelvis(e.angles, view2d, DUMMY_VIEWBOX.w, GROUND_Y)}
          painParts={e.painParts}
          intensity={e.intensity}
          compact
          className="thumb dummy-thumb"
        />
        )}
      </div>
      {e.check ? (
        <div className="grow">
          <div className="log-head">
            <strong>{e.label.replace(/^Movement check — /, "").replace(/^./, (c) => c.toUpperCase())}</strong>
            {(() => {
              const n = Object.entries(e.check.answers).filter(([, a]) => a !== "none").length;
              return (
                <span className="pill" style={{ background: n ? intensityColor(e.intensity) : "var(--t-selfcare-bg)" }}>
                  {n ? `${n} hurt` : "No pain"}
                </span>
              );
            })()}
          </div>
          {e.note && <p className="small-text muted">{e.note}</p>}
          {onRecheck && (
            <button className="btn ghost small recheck" onClick={() => onRecheck(e.check!)}>
              ↻ Re-check
            </button>
          )}
        </div>
      ) : (
      <div className="grow">
        <div className="log-head">
          <strong>Hurts when: {e.label}</strong>
          <span className="pill" style={{ background: intensityColor(e.intensity) }}>
            {e.intensity}/10 · {intensityWord(e.intensity)}
          </span>
        </div>
        <p className="small-text">{e.painParts.map((p) => PART_LABEL[p] ?? p).join(", ")}</p>
        {e.note && <p className="note">{e.note}</p>}
      </div>
      )}
    </div>
  );
}
