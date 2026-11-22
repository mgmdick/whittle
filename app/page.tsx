"use client";

import { useMemo, useState } from "react";
import BodyMap from "@/components/BodyMap";
import PoseDummy from "@/components/PoseDummy";
import LogView from "@/components/LogView";
import DiagnosisView from "@/components/DiagnosisView";
import { usePersistentState } from "@/lib/storage";
import { uid, type LogEntry, type Movement, type PainMarker } from "@/lib/types";

type Tab = "body" | "dummy" | "assess" | "log";

const SUBTITLE: Record<Tab, string> = {
  body: "Tap where you're sore",
  dummy: "Show the movement that hurts",
  assess: "What it could be & what to do",
  log: "Your history",
};

const MONTH = 30 * 24 * 60 * 60 * 1000;

export default function Home() {
  const [tab, setTab] = useState<Tab>("body");
  const [markers, setMarkers] = usePersistentState<PainMarker[]>("bodymap.markers.v1", []);
  const [log, setLog] = usePersistentState<LogEntry[]>("bodymap.log.v1", []);
  const [flash, setFlash] = useState<string | null>(null);

  const notify = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1800);
  };

  const recentMovements = useMemo(() => {
    const now = Date.now();
    return log.filter((e): e is { kind: "movement" } & Movement => e.kind === "movement" && now - e.createdAt < MONTH);
  }, [log]);

  const go = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <circle cx="12" cy="12" r="11" fill="var(--accent)" />
              <circle cx="12" cy="7.2" r="2.4" fill="var(--accent-ink)" />
              <path d="M8 11.5h8l-1.3 6.5h-5.4z" fill="var(--accent-ink)" />
              <circle cx="15.6" cy="12.4" r="2.6" fill="#ff5a5f" stroke="var(--accent)" strokeWidth="1.2" />
            </svg>
          </span>
          <div>
            <h1>Where it hurts</h1>
            <p className="tagline">{SUBTITLE[tab]}</p>
          </div>
        </div>
      </header>

      <main className="main" key={tab}>
        {tab === "body" && (
          <BodyMap
            markers={markers}
            setMarkers={(fn) => setMarkers(fn)}
            onAssess={() => go("assess")}
            onSaveToLog={(note) => {
              setLog((l) => [...l, { kind: "map", id: uid(), createdAt: Date.now(), markers, note }]);
              notify("Saved to your log");
            }}
          />
        )}
        {tab === "dummy" && (
          <PoseDummy
            onSave={(m) => {
              setLog((l) => [...l, { kind: "movement", ...m }]);
            }}
            onAssess={() => go("assess")}
          />
        )}
        {tab === "assess" && <DiagnosisView markers={markers} movements={recentMovements} onGoTo={go} />}
        {tab === "log" && <LogView log={log} setLog={(fn) => setLog(fn)} />}
      </main>

      {flash && <div className="toast global ok">{flash}</div>}

      <nav className="tabs" aria-label="Sections">
        <TabBtn active={tab === "body"} onClick={() => go("body")} label="Body" icon={<BodyIcon />} badge={markers.length || undefined} />
        <TabBtn active={tab === "dummy"} onClick={() => go("dummy")} label="Mannequin" icon={<DummyIcon />} />
        <TabBtn active={tab === "assess"} onClick={() => go("assess")} label="Assess" icon={<AssessIcon />} />
        <TabBtn active={tab === "log"} onClick={() => go("log")} label="Log" icon={<LogIcon />} badge={log.length || undefined} />
      </nav>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  icon,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}) {
  return (
    <button className={"tab" + (active ? " on" : "")} onClick={onClick} aria-current={active ? "page" : undefined}>
      <span className="tab-icon">
        {icon}
        {badge ? <span className="badge abs">{badge}</span> : null}
      </span>
      {label}
    </button>
  );
}

const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BodyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...s}>
      <circle cx="12" cy="4.2" r="2.2" />
      <path d="M8.5 8.5c1-.6 2.2-.9 3.5-.9s2.5.3 3.5.9l.6 5.5M8.5 8.5 7.9 14M10 8v6l-.8 7M14 8v6l.8 7" />
      <circle cx="15.8" cy="11.6" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
function DummyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...s}>
      <circle cx="12" cy="3.8" r="2" />
      <path d="M12 6.5v7M12 8.5 7.5 5.5M12 8.5l4.5 1.8M12 13.5l-3 3.2.6 4.3M12 13.5l3.5 2.2.6 4.8" />
      <circle cx="7.5" cy="5.5" r="1" fill="currentColor" />
      <circle cx="9" cy="16.7" r="1" fill="currentColor" />
    </svg>
  );
}
function AssessIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...s}>
      <path d="M6 3v5a4 4 0 0 0 8 0V3" />
      <path d="M10 12v2.5a4.5 4.5 0 0 0 9 0V12" />
      <circle cx="19" cy="10" r="2" />
    </svg>
  );
}
function LogIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...s}>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}
