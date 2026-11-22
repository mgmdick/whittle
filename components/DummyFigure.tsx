"use client";

import { forwardRef } from "react";
import {
  HEAD_R,
  WIDTH,
  layout,
  type JointId,
  type Layout,
  type Pt,
  type SegId,
} from "@/lib/pose";
import type { PoseView } from "@/lib/types";

export const DUMMY_VIEWBOX = { w: 300, h: 360 };
export const GROUND_Y = 346;

type Props = {
  angles: Record<string, number>;
  view: PoseView;
  pelvis: Pt;
  painParts: string[];
  painColor?: string;
  activeSeg?: SegId | null;
  interactive?: boolean;
  className?: string;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<SVGSVGElement>) => void;
};

const JOINTS_BY_SIDE: Record<"L" | "R" | "C", JointId[]> = {
  L: ["shoulderL", "elbowL", "handL", "hipL", "kneeL", "footL"],
  R: ["shoulderR", "elbowR", "handR", "hipR", "kneeR", "footR"],
  C: ["neck", "lowBack"],
};

const DummyFigure = forwardRef<SVGSVGElement, Props>(function DummyFigure(
  { angles, view, pelvis, painParts, painColor = "#e5484d", activeSeg, interactive, className, ...handlers },
  ref
) {
  const L: Layout = layout(angles, view, pelvis);
  const pain = new Set(painParts);

  const seg = (id: SegId, far = false) => {
    const s = L.start[id];
    const e = L.end[id];
    const hurt = pain.has(id);
    return (
      <line
        key={id}
        x1={s.x}
        y1={s.y}
        x2={e.x}
        y2={e.y}
        strokeWidth={WIDTH[id]}
        strokeLinecap="round"
        data-seg={id}
        className={
          "dseg" + (far ? " far" : "") + (hurt ? " hurt" : "") + (activeSeg === id ? " active" : "")
        }
        style={hurt ? { stroke: painColor } : undefined}
      />
    );
  };

  const joint = (id: JointId, far = false) => {
    const p = L.joints[id];
    const hurt = pain.has(id);
    const r = id === "lowBack" ? 6 : id.startsWith("hand") ? 6.5 : 5.5;
    return (
      <g key={id}>
        {hurt && <circle cx={p.x} cy={p.y} r={r + 7} className="jpulse" style={{ fill: painColor }} pointerEvents="none" />}
        {interactive && <circle cx={p.x} cy={p.y} r={13} fill="transparent" data-joint={id} />}
        <circle
          cx={p.x}
          cy={p.y}
          r={hurt ? r + 1.5 : r}
          data-joint={id}
          className={"djoint" + (far ? " far" : "") + (hurt ? " hurt" : "")}
          style={hurt ? { fill: painColor } : undefined}
        />
      </g>
    );
  };

  const headHurt = pain.has("head");
  const head = (
    <g key="head">
      {seg("head")}
      <circle
        cx={L.headCenter.x}
        cy={L.headCenter.y}
        r={HEAD_R}
        data-seg="head"
        className={"dhead" + (headHurt ? " hurt" : "") + (activeSeg === "head" ? " active" : "")}
        style={headHurt ? { fill: painColor } : undefined}
      />
      {view === "side" && (
        <circle
          cx={L.headCenter.x + Math.cos(((angles.head ?? 180) * Math.PI) / 180) * -7}
          cy={L.headCenter.y + Math.sin(((angles.head ?? 180) * Math.PI) / 180) * 7}
          r="2"
          className="deye"
          pointerEvents="none"
        />
      )}
    </g>
  );

  const pelvisBlock = (
    <line
      key="pelvis"
      x1={L.hips.L.x}
      y1={L.hips.L.y}
      x2={L.hips.R.x}
      y2={L.hips.R.y}
      strokeWidth={view === "front" ? 26 : 30}
      strokeLinecap="round"
      className="dseg pelvis"
      pointerEvents="none"
    />
  );

  // In side view the dummy faces right, so its right side is nearest to you.
  const body =
    view === "side" ? (
      <>
        {seg("upperArmL", true)}
        {seg("forearmL", true)}
        {seg("thighL", true)}
        {seg("shinL", true)}
        {JOINTS_BY_SIDE.L.map((j) => joint(j, true))}
        {pelvisBlock}
        {seg("torso")}
        {head}
        {seg("thighR")}
        {seg("shinR")}
        {seg("upperArmR")}
        {seg("forearmR")}
        {[...JOINTS_BY_SIDE.R, ...JOINTS_BY_SIDE.C].map((j) => joint(j))}
      </>
    ) : (
      <>
        {seg("thighL")}
        {seg("shinL")}
        {seg("thighR")}
        {seg("shinR")}
        {pelvisBlock}
        {seg("torso")}
        {head}
        {seg("upperArmL")}
        {seg("forearmL")}
        {seg("upperArmR")}
        {seg("forearmR")}
        {[...JOINTS_BY_SIDE.L, ...JOINTS_BY_SIDE.R, ...JOINTS_BY_SIDE.C].map((j) => joint(j))}
      </>
    );

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${DUMMY_VIEWBOX.w} ${DUMMY_VIEWBOX.h}`}
      className={className}
      role={interactive ? "application" : "img"}
      aria-label="Posable dummy"
      {...handlers}
    >
      <line x1="20" y1={GROUND_Y} x2={DUMMY_VIEWBOX.w - 20} y2={GROUND_Y} className="ground" />
      {view === "front" && (
        <>
          <text x="14" y="22" className="side-label">R</text>
          <text x={DUMMY_VIEWBOX.w - 14} y="22" textAnchor="end" className="side-label">L</text>
        </>
      )}
      {view === "side" && (
        <text x={DUMMY_VIEWBOX.w - 14} y="22" textAnchor="end" className="side-label">facing →</text>
      )}
      {body}
    </svg>
  );
});

export default DummyFigure;
