"use client";

import { forwardRef, useId } from "react";
import { HEAD_R, bounds, layout, type JointId, type Layout, type Pt, type SegId } from "@/lib/pose";
import { painShade } from "@/lib/types";
import { smoothClosed } from "@/lib/silhouette";
import type { PoseView } from "@/lib/types";

export const DUMMY_VIEWBOX = { w: 300, h: 360 };
export const GROUND_Y = 342;

type Props = {
  angles: Record<string, number>;
  view: PoseView;
  pelvis: Pt;
  painParts: string[];
  intensity?: number;
  activeSeg?: SegId | null;
  interactive?: boolean;
  compact?: boolean;
  className?: string;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<SVGSVGElement>) => void;
};

// Half-widths at the start and end of each segment (tapered limbs).
const HALF: Record<PoseView, Record<SegId, [number, number]>> = {
  front: {
    torso: [15, 22],
    head: [5, 5],
    upperArmL: [8, 6.2],
    upperArmR: [8, 6.2],
    forearmL: [6, 4.4],
    forearmR: [6, 4.4],
    thighL: [10.5, 7.2],
    thighR: [10.5, 7.2],
    shinL: [7.2, 4.6],
    shinR: [7.2, 4.6],
  },
  side: {
    torso: [13, 15.5],
    head: [5, 5],
    upperArmL: [7.5, 6],
    upperArmR: [7.5, 6],
    forearmL: [5.8, 4.3],
    forearmR: [5.8, 4.3],
    thighL: [10.5, 7.2],
    thighR: [10.5, 7.2],
    shinL: [7.2, 4.6],
    shinR: [7.2, 4.6],
  },
};

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Pt) => Math.hypot(v.x, v.y) || 1;

/** Closed path for a tapered capsule from s (radius r1) to e (radius r2). */
function capsule(s: Pt, e: Pt, r1: number, r2: number): string {
  const v = sub(e, s);
  const L = len(v);
  const d = { x: v.x / L, y: v.y / L };
  // Tangent angle correction for unequal radii.
  const k = Math.max(-0.9, Math.min(0.9, (r1 - r2) / L));
  const c = Math.sqrt(1 - k * k);
  const nL = { x: -d.y * c + d.x * k, y: d.x * c + d.y * k };
  const nR = { x: d.y * c + d.x * k, y: -d.x * c + d.y * k };
  const a1 = { x: s.x + nL.x * r1, y: s.y + nL.y * r1 };
  const a2 = { x: e.x + nL.x * r2, y: e.y + nL.y * r2 };
  const b2 = { x: e.x + nR.x * r2, y: e.y + nR.y * r2 };
  const b1 = { x: s.x + nR.x * r1, y: s.y + nR.y * r1 };
  const f = (n: number) => n.toFixed(2);
  return (
    `M${f(a1.x)} ${f(a1.y)} L${f(a2.x)} ${f(a2.y)} ` +
    `A${f(r2)} ${f(r2)} 0 ${k < 0 ? 1 : 0} 0 ${f(b2.x)} ${f(b2.y)} ` +
    `L${f(b1.x)} ${f(b1.y)} ` +
    `A${f(r1)} ${f(r1)} 0 ${k > 0 ? 1 : 0} 0 ${f(a1.x)} ${f(a1.y)}Z`
  );
}

// Chest block in torso-local coordinates: u runs up the spine from the
// pelvis, v runs sideways (front view) or front/back (side view).
const CHEST: Record<PoseView, [number, number][]> = {
  front: [
    [15, 0], [18, -11], [34, -14.5], [52, -18.5], [66, -20.5], [76, -19], [81, -11], [82, 0],
    [81, 11], [76, 19], [66, 20.5], [52, 18.5], [34, 14.5], [18, 11],
  ],
  side: [
    [15, 0], [18, -9.5], [36, -10.5], [56, -11.5], [72, -10.5], [80, -5], [81.5, 2], [78, 9.5],
    [68, 14.5], [56, 14.5], [42, 12], [28, 10], [18, 9],
  ],
};

function chestPath(pelvis: Pt, torsoAngle: number, view: PoseView): string {
  const t = (torsoAngle * Math.PI) / 180;
  const u = { x: Math.sin(t), y: Math.cos(t) };
  const v = { x: -u.y, y: u.x };
  return smoothClosed(
    CHEST[view].map(([a, b]) => [pelvis.x + u.x * a + v.x * b, pelvis.y + u.y * a + v.y * b] as [number, number])
  );
}

const SIDE_ORDER_FAR: SegId[] = ["upperArmL", "forearmL", "thighL", "shinL"];
const JOINTS_L: JointId[] = ["shoulderL", "elbowL", "hipL", "kneeL"];
const JOINTS_R: JointId[] = ["shoulderR", "elbowR", "hipR", "kneeR"];

const DummyFigure = forwardRef<SVGSVGElement, Props>(function DummyFigure(
  { angles, view, pelvis, painParts, intensity = 6, activeSeg, interactive, compact, className, ...handlers },
  ref
) {
  const uid = useId().replace(/:/g, "");
  const gid = (n: string) => `${n}-${uid}`;
  const L: Layout = layout(angles, view, pelvis);
  const pain = new Set(painParts);
  const half = HALF[view];
  const b = bounds(L);
  const a = (s: SegId) => angles[s] ?? 0;

  // Per-segment cross-lit gradients so each limb reads as a turned cylinder.
  const segGrad = (id: SegId, far: boolean) => {
    const s = L.start[id];
    const e = L.end[id];
    const v = sub(e, s);
    const l = len(v);
    const n = { x: -v.y / l, y: v.x / l };
    const r = id === "torso" ? 22 : half[id][0] + 2;
    const hurt = pain.has(id);
    const stops = hurt
      ? [painShade(intensity, 14), painShade(intensity, 4), painShade(intensity, -10), painShade(intensity, -22)]
      : far
        ? ["var(--wood-far-hi)", "var(--wood-far)", "var(--wood-far)", "var(--wood-far-lo)"]
        : ["var(--wood-hi)", "var(--wood-mid)", "var(--wood-mid)", "var(--wood-lo)"];
    return (
      <linearGradient
        key={id}
        id={gid(`g-${id}`)}
        gradientUnits="userSpaceOnUse"
        x1={s.x - n.x * r}
        y1={s.y - n.y * r}
        x2={s.x + n.x * r}
        y2={s.y + n.y * r}
      >
        <stop offset="0" style={{ stopColor: stops[0] }} />
        <stop offset="0.35" style={{ stopColor: stops[1] }} />
        <stop offset="0.7" style={{ stopColor: stops[2] }} />
        <stop offset="1" style={{ stopColor: stops[3] }} />
      </linearGradient>
    );
  };

  const isFar = (id: string) => view === "side" && id.endsWith("L");

  const seg = (id: SegId) =>
    id === "torso" ? (
      <path
        key={id}
        d={chestPath(pelvis, a("torso"), view)}
        fill={`url(#${gid("g-torso")})`}
        data-seg="torso"
        className={"dseg" + (activeSeg === "torso" ? " active" : "")}
      />
    ) : (
    <path
      key={id}
      d={capsule(L.start[id], L.end[id], half[id][0], half[id][1])}
      fill={`url(#${gid(`g-${id}`)})`}
      data-seg={id}
      className={"dseg" + (activeSeg === id ? " active" : "")}
    />
    );

  const ballFill = (id: string) => (pain.has(id) ? `url(#${gid("ball-pain")})` : `url(#${gid(isFar(id) ? "ball-far" : "ball")})`);

  const joint = (id: JointId, r: number) => {
    const p = L.joints[id];
    return (
      <g key={id}>
        {interactive && <circle cx={p.x} cy={p.y} r={Math.max(r + 6, 12)} fill="transparent" data-joint={id} />}
        <circle cx={p.x} cy={p.y} r={r} fill={ballFill(id)} data-joint={id} className="djoint" />
      </g>
    );
  };

  const glow = (id: string, p: Pt, r: number) =>
    pain.has(id) ? (
      <circle key={`glow-${id}`} cx={p.x} cy={p.y} r={r} fill={`url(#${gid("glow")})`} className="pain-glow" pointerEvents="none" />
    ) : null;

  const mid = (id: SegId): Pt => ({ x: (L.start[id].x + L.end[id].x) / 2, y: (L.start[id].y + L.end[id].y) / 2 });

  // Hands and feet.
  const hand = (side: "L" | "R") => {
    const f = side === "L" ? "forearmL" : "forearmR";
    const id = (side === "L" ? "handL" : "handR") as JointId;
    const p = L.joints[id];
    const ang = -a(f);
    return (
      <g key={id}>
        {interactive && <circle cx={p.x} cy={p.y} r={12} fill="transparent" data-joint={id} />}
        <ellipse
          cx={p.x}
          cy={p.y + 1}
          rx={5}
          ry={7.5}
          transform={`rotate(${ang} ${p.x} ${p.y})`}
          fill={ballFill(id)}
          data-joint={id}
          className="djoint"
        />
      </g>
    );
  };

  const foot = (side: "L" | "R") => {
    const s = side === "L" ? "shinL" : "shinR";
    const id = (side === "L" ? "footL" : "footR") as JointId;
    const ankle = L.end[s];
    if (view === "side") {
      const fa = a(s) + 90;
      const dir = { x: Math.sin((fa * Math.PI) / 180), y: Math.cos((fa * Math.PI) / 180) };
      const down = { x: Math.sin((a(s) * Math.PI) / 180), y: Math.cos((a(s) * Math.PI) / 180) };
      const heel = { x: ankle.x + down.x * 3 - dir.x * 3, y: ankle.y + down.y * 3 - dir.y * 3 };
      const toe = { x: heel.x + dir.x * 17, y: heel.y + dir.y * 17 };
      return (
        <g key={id}>
          {interactive && <circle cx={ankle.x} cy={ankle.y} r={12} fill="transparent" data-joint={id} />}
          <path d={capsule(heel, toe, 4.6, 3.6)} fill={ballFill(id)} data-joint={id} className="djoint" />
        </g>
      );
    }
    return (
      <g key={id}>
        {interactive && <circle cx={ankle.x} cy={ankle.y + 2} r={12} fill="transparent" data-joint={id} />}
        <ellipse cx={ankle.x} cy={ankle.y + 3} rx={6.5} ry={5} fill={ballFill(id)} data-joint={id} className="djoint" />
      </g>
    );
  };

  const headAngle = a("head");
  const headHurt = pain.has("head");
  const head = (
    <g key="head-group">
      <ellipse
        cx={L.headCenter.x}
        cy={L.headCenter.y}
        rx={HEAD_R * 0.82}
        ry={HEAD_R}
        transform={`rotate(${180 - headAngle} ${L.headCenter.x} ${L.headCenter.y})`}
        fill={headHurt ? `url(#${gid("ball-pain")})` : `url(#${gid("ball")})`}
        data-seg="head"
        className={"dseg" + (activeSeg === "head" ? " active" : "")}
      />
      {view === "side" && (
        <ellipse
          cx={L.headCenter.x - Math.cos((headAngle * Math.PI) / 180) * 13.5}
          cy={L.headCenter.y + Math.sin((headAngle * Math.PI) / 180) * 13.5 + 2}
          rx="2.4"
          ry="3.2"
          fill={headHurt ? `url(#${gid("ball-pain")})` : `url(#${gid("ball")})`}
          pointerEvents="none"
        />
      )}
    </g>
  );

  const pelvisShape = (
    <ellipse
      key="pelvis"
      cx={pelvis.x}
      cy={pelvis.y + 2}
      rx={view === "front" ? 19.5 : 14.5}
      ry={12.5}
      fill={`url(#${gid("ball")})`}
      className="dpelvis"
      pointerEvents="none"
    />
  );

  const shoulderR = view === "front" ? 8.5 : 8;

  const glows = (
    <>
      {(["torso", "upperArmL", "forearmL", "upperArmR", "forearmR", "thighL", "shinL", "thighR", "shinR"] as SegId[]).map((s) =>
        glow(s, mid(s), 30)
      )}
      {glow("head", L.headCenter, 32)}
      {(Object.keys(L.joints) as JointId[]).map((j) => glow(j, L.joints[j], 22))}
    </>
  );

  const body =
    view === "side" ? (
      <>
        {SIDE_ORDER_FAR.map(seg)}
        {hand("L")}
        {foot("L")}
        {JOINTS_L.map((j) => joint(j, j.startsWith("hip") ? 9 : j.startsWith("shoulder") ? shoulderR : 6))}
        {pelvisShape}
        {seg("torso")}
        {seg("head")}
        {joint("neck", 5.5)}
        {joint("lowBack", 8.5)}
        {head}
        {seg("thighR")}
        {seg("shinR")}
        {joint("hipR", 9)}
        {joint("kneeR", 7)}
        {foot("R")}
        {seg("upperArmR")}
        {seg("forearmR")}
        {joint("shoulderR", shoulderR)}
        {joint("elbowR", 6)}
        {hand("R")}
      </>
    ) : (
      <>
        {seg("thighL")}
        {seg("shinL")}
        {seg("thighR")}
        {seg("shinR")}
        {foot("L")}
        {foot("R")}
        {joint("kneeL", 7)}
        {joint("kneeR", 7)}
        {pelvisShape}
        {joint("hipL", 8)}
        {joint("hipR", 8)}
        {seg("torso")}
        {joint("lowBack", 9)}
        {seg("head")}
        {joint("neck", 5.5)}
        {head}
        {seg("upperArmL")}
        {seg("forearmL")}
        {seg("upperArmR")}
        {seg("forearmR")}
        {joint("shoulderL", shoulderR)}
        {joint("shoulderR", shoulderR)}
        {joint("elbowL", 6)}
        {joint("elbowR", 6)}
        {hand("L")}
        {hand("R")}
      </>
    );

  const shadowW = Math.max(30, (b.maxX - b.minX) * 0.55);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${DUMMY_VIEWBOX.w} ${DUMMY_VIEWBOX.h}`}
      className={className}
      role={interactive ? "application" : "img"}
      aria-label="Posable mannequin"
      {...handlers}
    >
      <defs>
        {(Object.keys(half) as SegId[]).map((s) => segGrad(s, isFar(s)))}
        <radialGradient id={gid("ball")} cx="0.36" cy="0.3" r="0.75">
          <stop offset="0" style={{ stopColor: "var(--wood-shine)" }} />
          <stop offset="0.45" style={{ stopColor: "var(--wood-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--wood-lo)" }} />
        </radialGradient>
        <radialGradient id={gid("ball-far")} cx="0.36" cy="0.3" r="0.75">
          <stop offset="0" style={{ stopColor: "var(--wood-far-hi)" }} />
          <stop offset="1" style={{ stopColor: "var(--wood-far-lo)" }} />
        </radialGradient>
        <radialGradient id={gid("ball-pain")} cx="0.36" cy="0.3" r="0.75">
          <stop offset="0" style={{ stopColor: painShade(intensity, 22) }} />
          <stop offset="0.45" style={{ stopColor: painShade(intensity, 0) }} />
          <stop offset="1" style={{ stopColor: painShade(intensity, -22) }} />
        </radialGradient>
        <radialGradient id={gid("glow")}>
          <stop offset="0" style={{ stopColor: painShade(intensity, 0), stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: painShade(intensity, 0), stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={gid("shadow")}>
          <stop offset="0" style={{ stopColor: "var(--floor-shadow)", stopOpacity: 0.5 }} />
          <stop offset="1" style={{ stopColor: "var(--floor-shadow)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      {!compact && <line x1="24" y1={GROUND_Y} x2={DUMMY_VIEWBOX.w - 24} y2={GROUND_Y} className="ground" />}
      <ellipse cx={(b.minX + b.maxX) / 2} cy={GROUND_Y + 1} rx={shadowW} ry={6} fill={`url(#${gid("shadow")})`} />

      {!compact && view === "front" && (
        <>
          <text x="16" y="24" className="side-label">R</text>
          <text x={DUMMY_VIEWBOX.w - 16} y="24" textAnchor="end" className="side-label">L</text>
        </>
      )}
      {!compact && view === "side" && (
        <text x={DUMMY_VIEWBOX.w - 16} y="24" textAnchor="end" className="side-label">
          FACING →
        </text>
      )}

      {glows}
      <g className="dbody">{body}</g>
    </svg>
  );
});

export default DummyFigure;
