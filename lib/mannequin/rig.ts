import { Euler, MathUtils, Quaternion, Vector3 } from "three";

// Skeleton of a wooden artist's mannequin. Y is up, the figure faces +Z, so
// its own LEFT side is +X. Each joint's rotation is relative to its parent
// and to the rest pose (standing, arms by the sides).

export type JointName =
  | "pelvis"
  | "waist"
  | "neck"
  | "shoulderL"
  | "elbowL"
  | "wristL"
  | "shoulderR"
  | "elbowR"
  | "wristR"
  | "hipL"
  | "kneeL"
  | "ankleL"
  | "hipR"
  | "kneeR"
  | "ankleR";

type Range = [number, number];
type JointDef = {
  parent: JointName | null;
  offset: [number, number, number];
  limits: { x: Range; y: Range; z: Range };
};

const deg = MathUtils.degToRad;
const L = (x: Range, y: Range, z: Range) => ({ x, y, z });

export const ORDER = "XZY" as const;

// Signs: negative X = limb swings forward (towards +Z) for arms, hips and
// elbows; positive X bends the knee backwards and the trunk/neck forwards.
// For the left side positive Z lifts the limb out sideways; mirrored on the right.
export const JOINTS: Record<JointName, JointDef> = {
  pelvis: { parent: null, offset: [0, 0, 0], limits: L([-30, 30], [-180, 180], [-20, 20]) },
  waist: { parent: "pelvis", offset: [0, 0.085, 0], limits: L([-30, 90], [-45, 45], [-40, 40]) },
  neck: { parent: "waist", offset: [0, 0.37, 0], limits: L([-55, 70], [-75, 75], [-45, 45]) },
  shoulderL: { parent: "waist", offset: [0.178, 0.305, -0.005], limits: L([-180, 60], [-90, 90], [-35, 175]) },
  elbowL: { parent: "shoulderL", offset: [0, -0.285, 0], limits: L([-150, 0], [-80, 80], [0, 0]) },
  wristL: { parent: "elbowL", offset: [0, -0.255, 0], limits: L([-70, 70], [-10, 10], [-25, 35]) },
  shoulderR: { parent: "waist", offset: [-0.178, 0.305, -0.005], limits: L([-180, 60], [-90, 90], [-175, 35]) },
  elbowR: { parent: "shoulderR", offset: [0, -0.285, 0], limits: L([-150, 0], [-80, 80], [0, 0]) },
  wristR: { parent: "elbowR", offset: [0, -0.255, 0], limits: L([-70, 70], [-10, 10], [-35, 25]) },
  hipL: { parent: "pelvis", offset: [0.092, -0.06, 0], limits: L([-125, 30], [-45, 45], [-25, 55]) },
  kneeL: { parent: "hipL", offset: [0, -0.425, 0], limits: L([0, 150], [0, 0], [0, 0]) },
  ankleL: { parent: "kneeL", offset: [0, -0.41, 0], limits: L([-30, 45], [-15, 15], [-20, 20]) },
  hipR: { parent: "pelvis", offset: [-0.092, -0.06, 0], limits: L([-125, 30], [-45, 45], [-55, 25]) },
  kneeR: { parent: "hipR", offset: [0, -0.425, 0], limits: L([0, 150], [0, 0], [0, 0]) },
  ankleR: { parent: "kneeR", offset: [0, -0.41, 0], limits: L([-30, 45], [-15, 15], [-20, 20]) },
};

export const JOINT_ORDER: JointName[] = [
  "pelvis",
  "waist",
  "neck",
  "shoulderL",
  "elbowL",
  "wristL",
  "shoulderR",
  "elbowR",
  "wristR",
  "hipL",
  "kneeL",
  "ankleL",
  "hipR",
  "kneeR",
  "ankleR",
];

export const REST_PELVIS_Y = 0.985;
export const FLOOR_Y = 0.06; // top of the plinth

export type Pose = { joints: Record<JointName, Quaternion>; yaw: number };
export type WorldPose = Record<JointName, { pos: Vector3; quat: Quaternion }>;

export function restPose(): Pose {
  const joints = {} as Record<JointName, Quaternion>;
  for (const j of JOINT_ORDER) joints[j] = new Quaternion();
  return { joints, yaw: 0 };
}

export function clonePose(p: Pose): Pose {
  const joints = {} as Record<JointName, Quaternion>;
  for (const j of JOINT_ORDER) joints[j] = p.joints[j].clone();
  return { joints, yaw: p.yaw };
}

const _e = new Euler(0, 0, 0, ORDER);

/** Clamp a joint rotation to its anatomical limits. */
export function clampJoint(j: JointName, q: Quaternion): Quaternion {
  const lim = JOINTS[j].limits;
  _e.setFromQuaternion(q, ORDER);
  _e.set(
    MathUtils.clamp(_e.x, deg(lim.x[0]), deg(lim.x[1])),
    MathUtils.clamp(_e.y, deg(lim.y[0]), deg(lim.y[1])),
    MathUtils.clamp(_e.z, deg(lim.z[0]), deg(lim.z[1])),
    ORDER
  );
  return q.setFromEuler(_e);
}

export function eulerDeg(q: Quaternion): { x: number; y: number; z: number } {
  _e.setFromQuaternion(q, ORDER);
  return { x: MathUtils.radToDeg(_e.x), y: MathUtils.radToDeg(_e.y), z: MathUtils.radToDeg(_e.z) };
}

/** World transform of every joint, with the pelvis at `rootPos`. */
export function forward(pose: Pose, rootPos: Vector3): WorldPose {
  const out = {} as WorldPose;
  const yawQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
  for (const j of JOINT_ORDER) {
    const def = JOINTS[j];
    if (!def.parent) {
      out[j] = { pos: rootPos.clone(), quat: yawQ.clone().multiply(pose.joints[j]) };
      continue;
    }
    const p = out[def.parent];
    const pos = new Vector3(...def.offset).applyQuaternion(p.quat).add(p.pos);
    out[j] = { pos, quat: p.quat.clone().multiply(pose.joints[j]) };
  }
  return out;
}

const HEEL = new Vector3(0, -0.075, -0.05);
const TOE = new Vector3(0, -0.075, 0.17);

/** Lowest point of the soles, used to stand the figure on the plinth. */
export function lowestSole(w: WorldPose): number {
  let m = Infinity;
  for (const a of ["ankleL", "ankleR"] as JointName[]) {
    for (const p of [HEEL, TOE]) m = Math.min(m, p.clone().applyQuaternion(w[a].quat).add(w[a].pos).y);
  }
  return m;
}

/** Pelvis position that puts the lowest foot on the floor. */
export function groundedRoot(pose: Pose): Vector3 {
  const probe = new Vector3(0, REST_PELVIS_Y, 0);
  const w = forward(pose, probe);
  return new Vector3(0, REST_PELVIS_Y + (FLOOR_Y - lowestSole(w)), 0);
}

const _v1 = new Vector3();
const _v2 = new Vector3();
const _d = new Quaternion();
const _pInv = new Quaternion();

/**
 * Cyclic-coordinate-descent IK: rotate each joint in `chain` (nearest the
 * effector first) so the effector point moves towards `target`.
 */
export function solveIK(
  pose: Pose,
  rootPos: Vector3,
  chain: JointName[],
  effectorJoint: JointName,
  effectorLocal: Vector3,
  target: Vector3,
  iterations = 12
) {
  for (let it = 0; it < iterations; it++) {
    for (const j of chain) {
      const w = forward(pose, rootPos);
      const eff = effectorLocal.clone().applyQuaternion(w[effectorJoint].quat).add(w[effectorJoint].pos);
      const pivot = w[j].pos;
      _v1.subVectors(eff, pivot);
      _v2.subVectors(target, pivot);
      if (_v1.lengthSq() < 1e-6 || _v2.lengthSq() < 1e-6) continue;
      _v1.normalize();
      _v2.normalize();
      _d.setFromUnitVectors(_v1, _v2);
      const parent = JOINTS[j].parent;
      const parentQ = parent ? w[parent].quat : new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.yaw);
      _pInv.copy(parentQ).invert();
      // local' = parent⁻¹ · D · parent · local
      const next = _pInv.clone().multiply(_d).multiply(parentQ).multiply(pose.joints[j]);
      pose.joints[j].copy(clampJoint(j, next.normalize()));
    }
  }
}

// ------------------------------------------------------------ presets

type E3 = [number, number, number]; // x, y, z in degrees
const q = ([x, y, z]: E3) => new Quaternion().setFromEuler(new Euler(deg(x), deg(y), deg(z), ORDER));

export type Preset = { name: string; joints: Partial<Record<JointName, E3>>; yaw?: number };

const relaxed: Partial<Record<JointName, E3>> = {
  shoulderL: [0, 0, 6],
  shoulderR: [0, 0, -6],
  elbowL: [-10, 0, 0],
  elbowR: [-10, 0, 0],
  hipL: [0, 0, 3],
  hipR: [0, 0, -3],
};

export const PRESETS: Preset[] = [
  { name: "Standing", joints: relaxed },
  {
    name: "Arms overhead",
    joints: { ...relaxed, shoulderL: [-170, 0, 8], shoulderR: [-170, 0, -8], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0] },
  },
  { name: "Arms out", joints: { ...relaxed, shoulderL: [0, 0, 90], shoulderR: [0, 0, -90], elbowL: [0, 0, 0], elbowR: [0, 0, 0] } },
  { name: "Reach forward", joints: { ...relaxed, shoulderL: [-90, 0, 4], shoulderR: [-90, 0, -4], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0] } },
  { name: "Raise one arm", joints: { ...relaxed, shoulderR: [-165, 0, -10], elbowR: [-5, 0, 0] } },
  {
    name: "Reach behind back",
    joints: { ...relaxed, shoulderR: [45, -70, -20], elbowR: [-110, 0, 0], wristR: [20, 0, 0] },
  },
  {
    name: "Bend forward",
    joints: { ...relaxed, pelvis: [28, 0, 0], waist: [60, 0, 0], neck: [15, 0, 0], shoulderL: [-80, 0, 4], shoulderR: [-80, 0, -4], hipL: [-28, 0, 3], hipR: [-28, 0, -3] },
  },
  { name: "Lean back", joints: { ...relaxed, waist: [-25, 0, 0], neck: [-25, 0, 0] } },
  { name: "Side bend", joints: { ...relaxed, waist: [0, 0, 30], neck: [0, 0, 10], shoulderR: [0, 0, -40], shoulderL: [0, 0, 2] } },
  { name: "Twist", joints: { ...relaxed, waist: [0, 40, 0], neck: [0, 20, 0], shoulderL: [-40, 0, 10], elbowL: [-90, 0, 0], shoulderR: [-30, 0, -10], elbowR: [-90, 0, 0] } },
  {
    name: "Squat",
    joints: {
      waist: [35, 0, 0],
      neck: [-20, 0, 0],
      shoulderL: [-85, 0, 6],
      shoulderR: [-85, 0, -6],
      elbowL: [-5, 0, 0],
      elbowR: [-5, 0, 0],
      hipL: [-110, 0, 12],
      hipR: [-110, 0, -12],
      kneeL: [125, 0, 0],
      kneeR: [125, 0, 0],
      ankleL: [-20, 0, 0],
      ankleR: [-20, 0, 0],
    },
  },
  {
    name: "Sitting",
    joints: {
      shoulderL: [-20, 0, 6],
      shoulderR: [-20, 0, -6],
      elbowL: [-70, 0, 0],
      elbowR: [-70, 0, 0],
      hipL: [-90, 0, 4],
      hipR: [-90, 0, -4],
      kneeL: [90, 0, 0],
      kneeR: [90, 0, 0],
    },
  },
  {
    name: "Lunge",
    joints: {
      shoulderL: [20, 0, 6],
      shoulderR: [-25, 0, -6],
      hipL: [-80, 0, 3],
      kneeL: [85, 0, 0],
      hipR: [15, 0, -3],
      kneeR: [70, 0, 0],
      ankleR: [25, 0, 0],
    },
  },
  {
    name: "Stand on one leg",
    joints: { ...relaxed, shoulderL: [0, 0, 30], shoulderR: [0, 0, -30], hipL: [-70, 0, 4], kneeL: [90, 0, 0] },
  },
  { name: "Look down", joints: { ...relaxed, neck: [55, 0, 0] } },
  { name: "Turn head", joints: { ...relaxed, neck: [0, 70, 0] } },
  { name: "Tilt head", joints: { ...relaxed, neck: [0, 0, -40] } },
];

export function presetPose(p: Preset, yaw = 0): Pose {
  const pose = restPose();
  for (const [j, e] of Object.entries(p.joints) as [JointName, E3][]) pose.joints[j] = clampJoint(j, q(e));
  pose.yaw = p.yaw ?? yaw;
  return pose;
}

// ------------------------------------------------------------ analysis

const SIDE_NAME = { L: "Left", R: "Right" };

/** How far a limb (pointing down at rest) is raised, and towards where. */
export function limbElevation(q: Quaternion, side: "L" | "R" | "") {
  const d = new Vector3(0, -1, 0).applyQuaternion(q);
  const raised = MathUtils.radToDeg(Math.acos(MathUtils.clamp(-d.y, -1, 1)));
  const out = side === "R" ? -d.x : d.x; // towards the limb's own side
  const dir =
    raised < 12 ? "" : Math.abs(d.z) >= Math.abs(out) ? (d.z > 0 ? "forward" : "behind") : out > 0 ? "out to the side" : "across the body";
  return { raised, dir };
}

/** Human-readable angle for the joint being dragged. */
export function describeJoint(j: JointName, pose: Pose): string {
  const e = eulerDeg(pose.joints[j]);
  const side = j.endsWith("L") ? SIDE_NAME.L : j.endsWith("R") ? SIDE_NAME.R : "";
  const r = (n: number) => Math.round(Math.abs(n));
  if (j.startsWith("shoulder") || j.startsWith("hip")) {
    const { raised, dir } = limbElevation(pose.joints[j], j.endsWith("R") ? "R" : "L");
    const name = j.startsWith("shoulder") ? "shoulder" : "hip";
    return `${side} ${name} · raised ${r(raised)}°${dir ? ` ${dir}` : ""}`;
  }
  if (j.startsWith("elbow")) return `${side} elbow · bent ${r(e.x)}°`;
  if (j.startsWith("wrist")) return `${side} wrist · ${e.x < 0 ? "up" : "down"} ${r(e.x)}°`;
  if (j.startsWith("knee")) return `${side} knee · bent ${r(e.x)}°`;
  if (j.startsWith("ankle")) return `${side} ankle · ${e.x < 0 ? "toes up" : "toes down"} ${r(e.x)}°`;
  if (j === "waist") return `Trunk · ${e.x >= 0 ? "forward" : "back"} ${r(e.x)}° · side ${r(e.z)}° · twist ${r(e.y)}°`;
  if (j === "neck") return `Neck · ${e.x >= 0 ? "down" : "up"} ${r(e.x)}° · turn ${r(e.y)}° · tilt ${r(e.z)}°`;
  return "Body";
}

/** Movement tags used by the symptom checker. */
export function poseTags(pose: Pose): string[] {
  const t = new Set<string>();
  const e = (j: JointName) => eulerDeg(pose.joints[j]);
  for (const s of ["L", "R"] as const) {
    const sh = e(`shoulder${s}`);
    const el = limbElevation(pose.joints[`shoulder${s}`], s);
    if (el.raised > 75 && e("waist").x < 45) t.add("overhead");
    if (el.dir === "behind" || Math.abs(sh.y) > 50) t.add("twist");
    if (e(`knee${s}`).x > 60) t.add("kneeLoad");
    const hp = limbElevation(pose.joints[`hip${s}`], s);
    if (hp.raised > 50 && hp.dir === "forward") t.add("hipFlex");
  }
  const w = e("waist");
  if (w.x > 25) t.add("flexion");
  if (w.x < -12) t.add("extension");
  if (Math.abs(w.z) > 12) t.add("sidebend");
  if (Math.abs(w.y) > 15) t.add("twist");
  const n = e("neck");
  if (Math.abs(n.x) > 15 || Math.abs(n.y) > 20 || Math.abs(n.z) > 15) t.add("neckMove");
  const hl = -e("hipL").x;
  const hr = -e("hipR").x;
  if (Math.abs(hl - hr) > 50) t.add("stride");
  return [...t];
}

export function serializePose(p: Pose): { j: Record<string, number[]>; yaw: number } {
  const j: Record<string, number[]> = {};
  for (const k of JOINT_ORDER) j[k] = p.joints[k].toArray().map((n) => Math.round(n * 1e4) / 1e4);
  return { j, yaw: p.yaw };
}

export function deserializePose(s: { j: Record<string, number[]>; yaw: number } | null | undefined): Pose | null {
  if (!s?.j) return null;
  const pose = restPose();
  for (const k of JOINT_ORDER) {
    const a = s.j[k];
    if (Array.isArray(a) && a.length === 4) pose.joints[k].fromArray(a).normalize();
  }
  pose.yaw = typeof s.yaw === "number" ? s.yaw : 0;
  return pose;
}
