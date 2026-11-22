"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

const Mannequin3D = dynamic(() => import("@/components/Mannequin3D"), {
  ssr: false,
  loading: () => (
    <div className="panel">
      <div className="figure-wrap stage3d">
        <div className="stage-loading">Carving your mannequin…</div>
      </div>
    </div>
  ),
});
import LogView from "@/components/LogView";
import DiagnosisView from "@/components/DiagnosisView";
import { usePersistentState } from "@/lib/storage";
import type { LogEntry, Movement } from "@/lib/types";

type Tab = "dummy" | "assess" | "log";

const SUBTITLE: Record<Tab, string> = {
  dummy: "Show me where it hurts",
  assess: "What it could be",
  log: "Your history",
};

const MONTH = 30 * 24 * 60 * 60 * 1000;

export default function Home() {
  const [tab, setTab] = useState<Tab>("dummy");
  const [log, setLog] = usePersistentState<LogEntry[]>("bodymap.log.v1", []);


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
            <svg viewBox="0 0 32 32" width="30" height="30">
              <defs>
                <linearGradient id="lg-wood" x1="0" x2="1">
                  <stop offset="0" stopColor="#a8723b" />
                  <stop offset="0.5" stopColor="#f0cf9c" />
                  <stop offset="1" stopColor="#a8723b" />
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="9" fill="#5b3a22" />
              <ellipse cx="16" cy="7.2" rx="3" ry="3.6" fill="url(#lg-wood)" />
              <path d="M11.6 12.4c2.8-1.3 6-1.3 8.8 0l-1.2 7.4h-6.4z" fill="url(#lg-wood)" />
              <rect x="8.1" y="12.6" width="2.4" height="8.6" rx="1.2" transform="rotate(12 9.3 12.6)" fill="url(#lg-wood)" />
              <rect x="21.5" y="12.6" width="2.4" height="8.6" rx="1.2" transform="rotate(-12 22.7 12.6)" fill="url(#lg-wood)" />
              <rect x="12.6" y="20.4" width="2.6" height="8.6" rx="1.3" fill="url(#lg-wood)" />
              <rect x="16.8" y="20.4" width="2.6" height="8.6" rx="1.3" fill="url(#lg-wood)" />
              <circle cx="21" cy="13" r="2.6" fill="#ff5a4f" stroke="#5b3a22" strokeWidth="1" />
            </svg>
          </span>
          <div>
            <h1>Whittle</h1>
            <p className="tagline">{SUBTITLE[tab]}</p>
          </div>
        </div>
      </header>

      <main className="main" key={tab}>
        {tab === "dummy" && (
          <Mannequin3D
            onSave={(m) => {
              setLog((l) => [...l, { kind: "movement", ...m }]);
            }}
            onAssess={() => go("assess")}
          />
        )}
        {tab === "assess" && <DiagnosisView movements={recentMovements} onStart={() => go("dummy")} />}
        {tab === "log" && <LogView log={log} setLog={(fn) => setLog(fn)} />}
      </main>


      <nav className="tabs" aria-label="Sections">
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
