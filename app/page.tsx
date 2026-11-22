"use client";

import { useState } from "react";
import BodyMap from "@/components/BodyMap";
import PoseDummy from "@/components/PoseDummy";
import LogView from "@/components/LogView";
import { usePersistentState } from "@/lib/storage";
import { uid, type LogEntry, type PainMarker } from "@/lib/types";

type Tab = "body" | "dummy" | "log";

export default function Home() {
  const [tab, setTab] = useState<Tab>("body");
  const [markers, setMarkers] = usePersistentState<PainMarker[]>("bodymap.markers.v1", []);
  const [log, setLog] = usePersistentState<LogEntry[]>("bodymap.log.v1", []);
  const [flash, setFlash] = useState<string | null>(null);

  const notify = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1800);
  };

  return (
    <div className="app">
      <header className="top">
        <h1>
          <span className="logo" aria-hidden>
            ●
          </span>{" "}
          Where it hurts
        </h1>
      </header>

      <main className="main">
        {tab === "body" && (
          <BodyMap
            markers={markers}
            setMarkers={(fn) => setMarkers(fn)}
            onSaveToLog={(note) => {
              setLog((l) => [...l, { kind: "map", id: uid(), createdAt: Date.now(), markers, note }]);
              notify("Saved to your log");
            }}
          />
        )}
        {tab === "dummy" && <PoseDummy onSave={(m) => setLog((l) => [...l, { kind: "movement", ...m }])} />}
        {tab === "log" && <LogView log={log} setLog={(fn) => setLog(fn)} />}
      </main>

      {flash && <div className="toast global ok">{flash}</div>}

      <nav className="tabs" aria-label="Sections">
        <TabBtn active={tab === "body"} onClick={() => setTab("body")} label="Body" icon={<BodyIcon />} />
        <TabBtn active={tab === "dummy"} onClick={() => setTab("dummy")} label="Dummy" icon={<DummyIcon />} />
        <TabBtn
          active={tab === "log"}
          onClick={() => setTab("log")}
          label="Log"
          icon={<LogIcon />}
          badge={log.length || undefined}
        />
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

const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function BodyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...s}>
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M7 9h10M12 8v7M12 15l-3 6M12 15l3 6M7 9l-2 6M17 9l2 6" />
      <circle cx="15.5" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
function DummyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...s}>
      <circle cx="12" cy="4" r="2.3" />
      <path d="M12 7v7M12 9l-4-3M12 9l5 1M12 14l-3 3 1 4M12 14l4 2 1 5" />
      <circle cx="8" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}
function LogIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...s}>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}
