import type { PoseView } from "./types";

// A 2D articulated dummy. Angles are absolute, in degrees: 0 points straight
// down, 90 points to the viewer's right (or "forward" in side view), 180 up.
// Rotating a segment also rotates everything attached below it.

export type SegId =
  | "torso"
  | "head"
  | "upperArmL"
  | "forearmL"
  | "upperArmR"
  | "forearmR"
  | "thighL"
  | "shinL"
  | "thighR"
  | "shinR";

export const SEGMENTS: SegId[] = [
  "torso",
  "head",
  "upperArmL",
  "forearmL",
  "upperArmR",
  "forearmR",
  "thighL",
  "shinL",
  "thighR",
  "shinR",
];

export const CHILDREN: Record<SegId, SegId[]> = {
  torso: ["head", "upperArmL", "upperArmR"],
  head: [],
  upperArmL: ["forearmL"],
  forearmL: [],
  upperArmR: ["forearmR"],
  forearmR: [],
  thighL: ["shinL"],
  shinL: [],
  thighR: ["shinR"],
  shinR: [],
};

export const LENGTH: Record<SegId, number> = {
  torso: 82,
  head: 12, // neck length; head circle sits at its end
  upperArmL: 46,
  forearmL: 44,
  upperArmR: 46,
  forearmR: 44,
  thighL: 62,
  shinL: 60,
  thighR: 62,
  shinR: 60,
};

export const WIDTH: Record<SegId, number> = {
  torso: 40,
  head: 12,
  upperArmL: 15,
  forearmL: 13,
  upperArmR: 15,
  forearmR: 13,
  thighL: 20,
  shinL: 16,
  thighR: 20,
  shinR: 16,
};

export const HEAD_R = 18;

// Pain targets: segments plus joints.
export type JointId =
  | "neck"
  | "shoulderL"
  | "shoulderR"
  | "elbowL"
  | "elbowR"
  | "handL"
  | "handR"
  | "hipL"
  | "hipR"
  | "kneeL"
  | "kneeR"
  | "footL"
  | "footR"
  | "lowBack";

// Which segment rotates when you drag a joint. Joints that are the pivot of
// their own limb (shoulder, neck) bend the torso instead; hips are tap-only.
export const JOINT_DRIVES: Partial<Record<JointId, SegId>> = {
  neck: "torso",
  shoulderL: "torso",
  shoulderR: "torso",
  elbowL: "upperArmL",
  elbowR: "upperArmR",
  handL: "forearmL",
  handR: "forearmR",
  kneeL: "thighL",
  kneeR: "thighR",
  footL: "shinL",
  footR: "shinR",
  lowBack: "torso",
};

// Angle shown while dragging: how far a segment is from its resting
// direction relative to its parent.
export function displayAngle(angles: Record<string, number>, seg: SegId): number {
  const a = (s: SegId) => angles[s] ?? 0;
  const parentDown: Partial<Record<SegId, number>> = {
    head: a("torso"),
    upperArmL: a("torso") + 180,
    upperArmR: a("torso") + 180,
    forearmL: a("upperArmL"),
    forearmR: a("upperArmR"),
    thighL: 0,
    thighR: 0,
    shinL: a("thighL"),
    shinR: a("thighR"),
    torso: 180,
  };
  return Math.round(Math.abs(norm(a(seg) - (parentDown[seg] ?? 0))));
}

export type Pt = { x: number; y: number };

export type Layout = {
  start: Record<SegId, Pt>;
  end: Record<SegId, Pt>;
  joints: Record<JointId, Pt>;
  headCenter: Pt;
  pelvis: Pt;
  hips: { L: Pt; R: Pt };
};

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (a: number): Pt => ({ x: Math.sin(rad(a)), y: Math.cos(rad(a)) });
const add = (p: Pt, v: Pt, k = 1): Pt => ({ x: p.x + v.x * k, y: p.y + v.y * k });

export function layout(angles: Record<string, number>, view: PoseView, pelvis: Pt): Layout {
  const a = (s: SegId) => angles[s] ?? 0;
  const lateral = view === "front" ? 1 : 0;
  const start = {} as Record<SegId, Pt>;
  const end = {} as Record<SegId, Pt>;

  // Torso grows up from the pelvis.
  start.torso = pelvis;
  end.torso = add(pelvis, dir(a("torso")), LENGTH.torso);
  const td = dir(a("torso"));
  const perp = { x: -td.y, y: td.x }; // viewer's right when upright = dummy's left
  const shoulderBase = add(pelvis, td, LENGTH.torso - 8);
  const shL = add(shoulderBase, perp, 24 * lateral);
  const shR = add(shoulderBase, perp, -24 * lateral);

  start.head = end.torso;
  end.head = add(end.torso, dir(a("head")), LENGTH.head);
  const headCenter = add(end.head, dir(a("head")), HEAD_R - 2);

  const arm = (u: SegId, f: SegId, sh: Pt) => {
    start[u] = sh;
    end[u] = add(sh, dir(a(u)), LENGTH[u]);
    start[f] = end[u];
    end[f] = add(end[u], dir(a(f)), LENGTH[f]);
  };
  arm("upperArmL", "forearmL", shL);
  arm("upperArmR", "forearmR", shR);

  const hipL = { x: pelvis.x + 12 * lateral, y: pelvis.y };
  const hipR = { x: pelvis.x - 12 * lateral, y: pelvis.y };
  const leg = (t: SegId, s: SegId, hip: Pt) => {
    start[t] = hip;
    end[t] = add(hip, dir(a(t)), LENGTH[t]);
    start[s] = end[t];
    end[s] = add(end[t], dir(a(s)), LENGTH[s]);
  };
  leg("thighL", "shinL", hipL);
  leg("thighR", "shinR", hipR);

  const joints: Record<JointId, Pt> = {
    neck: end.torso,
    shoulderL: shL,
    shoulderR: shR,
    elbowL: end.upperArmL,
    elbowR: end.upperArmR,
    handL: add(end.forearmL, dir(a("forearmL")), 6),
    handR: add(end.forearmR, dir(a("forearmR")), 6),
    hipL,
    hipR,
    kneeL: end.thighL,
    kneeR: end.thighR,
    footL: end.shinL,
    footR: end.shinR,
    lowBack: add(pelvis, td, 18),
  };

  return { start, end, joints, headCenter, pelvis, hips: { L: hipL, R: hipR } };
}

export function bounds(l: Layout) {
  let minX = Infinity, maxX = -Infinity;
  for (const s of SEGMENTS) {
    minX = Math.min(minX, l.start[s].x, l.end[s].x);
    maxX = Math.max(maxX, l.start[s].x, l.end[s].x);
  }
  minX = Math.min(minX, l.headCenter.x - HEAD_R);
  maxX = Math.max(maxX, l.headCenter.x + HEAD_R);
  return { minX, maxX, maxY: lowestY(l) };
}

// Pelvis position that stands the dummy on the ground, centred horizontally.
export function groundedPelvis(angles: Record<string, number>, view: PoseView, width: number, groundY: number): Pt {
  const b = bounds(layout(angles, view, { x: 0, y: 0 }));
  return { x: width / 2 - (b.minX + b.maxX) / 2, y: groundY - b.maxY };
}

export function lowestY(l: Layout): number {
  let m = -Infinity;
  for (const s of SEGMENTS) m = Math.max(m, l.start[s].y, l.end[s].y);
  m = Math.max(m, l.headCenter.y + HEAD_R);
  return m + 6; // foot thickness
}

export function rotateTree(
  angles: Record<string, number>,
  seg: SegId,
  newAbs: number
): Record<string, number> {
  const delta = newAbs - (angles[seg] ?? 0);
  const next = { ...angles };
  const walk = (s: SegId) => {
    next[s] = norm((next[s] ?? 0) + delta);
    CHILDREN[s].forEach(walk);
  };
  walk(seg);
  return next;
}

export function norm(a: number) {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
}

export function angleTo(from: Pt, to: Pt): number {
  return (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
}

// Human labels. "L"/"R" here are the dummy's own left/right: the figure faces
// you in front view, so its left side is on your right.
export const PART_LABEL: Record<string, string> = {
  torso: "Torso / back",
  head: "Head",
  upperArmL: "Left upper arm",
  forearmL: "Left forearm",
  upperArmR: "Right upper arm",
  forearmR: "Right forearm",
  thighL: "Left thigh",
  shinL: "Left lower leg",
  thighR: "Right thigh",
  shinR: "Right lower leg",
  neck: "Neck",
  shoulderL: "Left shoulder",
  shoulderR: "Right shoulder",
  elbowL: "Left elbow",
  elbowR: "Right elbow",
  handL: "Left hand / wrist",
  handR: "Right hand / wrist",
  hipL: "Left hip",
  hipR: "Right hip",
  kneeL: "Left knee",
  kneeR: "Right knee",
  footL: "Left ankle / foot",
  footR: "Right ankle / foot",
  lowBack: "Lower back",
};

type Angles = Record<SegId, number>;

// In front view the dummy faces you: its right arm ("R") is on the viewer's
// left, so it hangs at a small negative angle.
const base: Angles = {
  torso: 180,
  head: 180,
  upperArmR: -8,
  forearmR: -5,
  upperArmL: 8,
  forearmL: 5,
  thighR: -2,
  shinR: -1,
  thighL: 2,
  shinL: 1,
};

const sideBase: Angles = {
  torso: 180,
  head: 180,
  upperArmR: 4,
  forearmR: 10,
  upperArmL: -4,
  forearmL: 6,
  thighR: 2,
  shinR: 0,
  thighL: -2,
  shinL: -2,
};

export type Preset = { name: string; view: PoseView; angles: Angles };

export const PRESETS: Preset[] = [
  { name: "Standing", view: "front", angles: base },
  {
    name: "Arms overhead",
    view: "front",
    angles: { ...base, upperArmR: -168, forearmR: -175, upperArmL: 168, forearmL: 175 },
  },
  {
    name: "Arms out",
    view: "front",
    angles: { ...base, upperArmR: -90, forearmR: -90, upperArmL: 90, forearmL: 90 },
  },
  {
    name: "Raise one arm",
    view: "front",
    angles: { ...base, upperArmR: -165, forearmR: -172 },
  },
  {
    name: "Side bend",
    view: "front",
    angles: { ...base, torso: 158, head: 160, upperArmR: -30, forearmR: -28, upperArmL: -12, forearmL: -10 },
  },
  {
    name: "Head tilt",
    view: "front",
    angles: { ...base, head: 150 },
  },
  {
    name: "Wide stance",
    view: "front",
    angles: { ...base, thighR: -22, shinR: -18, thighL: 22, shinL: 18 },
  },
  { name: "Standing (side)", view: "side", angles: sideBase },
  {
    name: "Bend forward",
    view: "side",
    angles: { ...sideBase, torso: 105, head: 95, thighR: -10, shinR: -2, thighL: -12, shinL: -4, upperArmR: 0, forearmR: 0, upperArmL: 6, forearmL: 4 },
  },
  {
    name: "Reach forward",
    view: "side",
    angles: { ...sideBase, upperArmR: 90, forearmR: 90, upperArmL: 85, forearmL: 88 },
  },
  {
    name: "Squat",
    view: "side",
    angles: { ...sideBase, torso: 150, head: 168, thighR: 80, shinR: -25, thighL: 76, shinL: -28, upperArmR: 70, forearmR: 85, upperArmL: 66, forearmL: 82 },
  },
  {
    name: "Sitting",
    view: "side",
    angles: { ...sideBase, torso: 176, thighR: 90, shinR: 4, thighL: 86, shinL: 0, upperArmR: 20, forearmR: 80, upperArmL: 16, forearmL: 76 },
  },
  {
    name: "Lean back",
    view: "side",
    angles: { ...sideBase, torso: -158, head: -160, upperArmR: -10, forearmR: -8, upperArmL: -14, forearmL: -12 },
  },
  {
    name: "Step / lunge",
    view: "side",
    angles: { ...sideBase, thighR: 60, shinR: -5, thighL: -30, shinL: -60, upperArmR: -25, forearmR: -10, upperArmL: 25, forearmL: 40 },
  },
  {
    name: "Look down",
    view: "side",
    angles: { ...sideBase, head: 130 },
  },
];
