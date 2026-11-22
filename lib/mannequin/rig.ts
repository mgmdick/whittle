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
 * Cyclic-coordinate-descent IK: rotate each joint in `chain` so the effector
 * point moves towards `target`. Joints are solved shoulder/hip first so the
 * whole limb swings before the elbow/knee bends — closer to how people move —
 * and long-axis twist is gently damped to avoid corkscrew solutions.
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
      clampJoint(j, next.normalize());
      if (/^(shoulder|hip)/.test(j)) {
        _e.setFromQuaternion(next, ORDER);
        _e.y *= 0.85;
        next.setFromEuler(_e);
      }
      pose.joints[j].copy(next);
    }
  }
}

// ------------------------------------------------------------ presets

type E3 = [number, number, number]; // x, y, z in degrees
const q = ([x, y, z]: E3) => new Quaternion().setFromEuler(new Euler(deg(x), deg(y), deg(z), ORDER));

export type PresetGroup = "Arms" | "Trunk" | "Legs" | "Neck";
/** One-sided presets are authored for the RIGHT side and mirrored for the left. */
export type Preset = { name: string; group: PresetGroup | null; sided?: boolean; joints: Partial<Record<JointName, E3>> };

const relaxed: Partial<Record<JointName, E3>> = {
  shoulderL: [0, 0, 6],
  shoulderR: [0, 0, -6],
  elbowL: [-10, 0, 0],
  elbowR: [-10, 0, 0],
  hipL: [0, 0, 3],
  hipR: [0, 0, -3],
};

export const PRESETS: Preset[] = [
  { name: "Standing", group: null, joints: relaxed },
  // Arms
  {
    name: "Arms overhead",
    group: "Arms",
    joints: { ...relaxed, shoulderL: [-170, 0, 8], shoulderR: [-170, 0, -8], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0] },
  },
  { name: "Arms out", group: "Arms", joints: { ...relaxed, shoulderL: [0, 0, 90], shoulderR: [0, 0, -90], elbowL: [0, 0, 0], elbowR: [0, 0, 0] } },
  { name: "Reach forward", group: "Arms", joints: { ...relaxed, shoulderL: [-90, 0, 4], shoulderR: [-90, 0, -4], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0] } },
  { name: "Raise arm", group: "Arms", sided: true, joints: { ...relaxed, shoulderR: [-165, 0, -10], elbowR: [-5, 0, 0] } },
  { name: "Arm out to side", group: "Arms", sided: true, joints: { ...relaxed, shoulderR: [0, 0, -95], elbowR: [0, 0, 0] } },
  { name: "Reach behind back", group: "Arms", sided: true, joints: { ...relaxed, shoulderR: [45, -70, -20], elbowR: [-110, 0, 0], wristR: [20, 0, 0] } },
  { name: "Reach across body", group: "Arms", sided: true, joints: { ...relaxed, shoulderR: [-90, 0, 35], elbowR: [-10, 0, 0] } },
  // Trunk
  {
    name: "Bend forward",
    group: "Trunk",
    joints: { ...relaxed, pelvis: [28, 0, 0], waist: [60, 0, 0], neck: [15, 0, 0], shoulderL: [-80, 0, 4], shoulderR: [-80, 0, -4], hipL: [-28, 0, 3], hipR: [-28, 0, -3] },
  },
  { name: "Lean back", group: "Trunk", joints: { ...relaxed, waist: [-25, 0, 0], neck: [-25, 0, 0] } },
  { name: "Side bend", group: "Trunk", sided: true, joints: { ...relaxed, waist: [0, 0, 30], neck: [0, 0, 10], shoulderR: [0, 0, -12], shoulderL: [0, 0, 30] } },
  { name: "Twist", group: "Trunk", sided: true, joints: { ...relaxed, waist: [0, -40, 0], neck: [0, -20, 0], shoulderR: [-40, 0, -10], elbowR: [-90, 0, 0], shoulderL: [-30, 0, 10], elbowL: [-90, 0, 0] } },
  // Legs
  {
    name: "Squat",
    group: "Legs",
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
    group: "Legs",
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
    group: "Legs",
    sided: true,
    joints: { shoulderR: [20, 0, -6], shoulderL: [-25, 0, 6], hipR: [-80, 0, -3], kneeR: [85, 0, 0], hipL: [15, 0, 3], kneeL: [70, 0, 0], ankleL: [25, 0, 0] },
  },
  { name: "Lift knee", group: "Legs", sided: true, joints: { ...relaxed, shoulderL: [0, 0, 30], shoulderR: [0, 0, -30], hipR: [-70, 0, -4], kneeR: [90, 0, 0] } },
  { name: "Kick back", group: "Legs", sided: true, joints: { ...relaxed, hipR: [25, 0, -3], kneeR: [100, 0, 0] } },
  // Neck
  { name: "Look down", group: "Neck", joints: { ...relaxed, neck: [55, 0, 0] } },
  { name: "Look up", group: "Neck", joints: { ...relaxed, neck: [-45, 0, 0] } },
  { name: "Turn head", group: "Neck", sided: true, joints: { ...relaxed, neck: [0, -70, 0] } },
  { name: "Tilt head", group: "Neck", sided: true, joints: { ...relaxed, neck: [0, 0, 40] } },
];

export const PRESET_GROUPS: PresetGroup[] = ["Arms", "Trunk", "Legs", "Neck"];

const swapSide = (j: JointName): JointName =>
  (j.endsWith("L") ? j.slice(0, -1) + "R" : j.endsWith("R") ? j.slice(0, -1) + "L" : j) as JointName;

/** Mirror a set of joint angles across the body's midline. */
function mirrorJoints(joints: Partial<Record<JointName, E3>>): Partial<Record<JointName, E3>> {
  const out: Partial<Record<JointName, E3>> = {};
  for (const [j, [x, y, z]] of Object.entries(joints) as [JointName, E3][]) out[swapSide(j)] = [x, -y, -z];
  return out;
}

/** Display name for a preset on a given side. */
export function presetLabel(p: Preset, side: "L" | "R"): string {
  if (!p.sided) return p.name;
  const s = side === "L" ? "left" : "right";
  const map: Record<string, string> = {
    "Raise arm": `Raise ${s} arm`,
    "Arm out to side": `${s[0].toUpperCase() + s.slice(1)} arm out`,
    "Reach behind back": `Reach behind back (${s})`,
    "Reach across body": `Reach across (${s} arm)`,
    "Side bend": `Side bend to the ${s}`,
    Twist: `Twist to the ${s}`,
    Lunge: `Lunge (${s} leg forward)`,
    "Lift knee": `Lift ${s} knee`,
    "Kick back": `Kick ${s} leg back`,
    "Turn head": `Turn head ${s}`,
    "Tilt head": `Tilt head ${s}`,
  };
  return map[p.name] ?? `${p.name} (${s})`;
}

export function presetPose(p: Preset, yaw = 0, side: "L" | "R" = "R"): Pose {
  const pose = restPose();
  const joints = p.sided && side === "L" ? mirrorJoints(p.joints) : p.joints;
  for (const [j, e] of Object.entries(joints) as [JointName, E3][]) pose.joints[j] = clampJoint(j, q(e));
  pose.yaw = yaw;
  return pose;
}

// ------------------------------------------------------------ sliders

export type Slider = { label: string; axis: "x" | "y" | "z"; sign: 1 | -1; min: number; max: number; ends: [string, string] };

/**
 * Plain-language sliders for each joint, in degrees. `sign` maps the slider to
 * the Euler axis so that moving right means the second label in `ends`.
 */
export function slidersFor(j: JointName): Slider[] {
  const lim = JOINTS[j].limits;
  const R = j.endsWith("R");
  const mk = (label: string, axis: "x" | "y" | "z", sign: 1 | -1, ends: [string, string]): Slider => {
    const [a, b] = lim[axis];
    const lo = sign === 1 ? a : -b;
    const hi = sign === 1 ? b : -a;
    return { label, axis, sign, min: Math.round(lo), max: Math.round(hi), ends };
  };
  const base = j.replace(/[LR]$/, "");
  const out: 1 | -1 = R ? -1 : 1; // +Z lifts the left limb outwards, −Z the right
  switch (base) {
    case "shoulder":
      return [
        mk("Raise", "x", -1, ["Back", "Forward / up"]),
        mk("Sideways", "z", out, ["Across body", "Out to side"]),
        mk("Rotate", "y", out, ["Inward", "Outward"]),
      ];
    case "elbow":
      return [mk("Elbow", "x", -1, ["Straight", "Bent"])];
    case "wrist":
      return [mk("Wrist", "x", 1, ["Up", "Down"])];
    case "hip":
      return [
        mk("Leg", "x", -1, ["Back", "Forward / up"]),
        mk("Sideways", "z", out, ["Across", "Out to side"]),
        mk("Rotate", "y", out, ["Inward", "Outward"]),
      ];
    case "knee":
      return [mk("Knee", "x", 1, ["Straight", "Bent"])];
    case "ankle":
      return [mk("Foot", "x", 1, ["Toes up", "Toes down"])];
    case "waist":
      return [
        mk("Bend", "x", 1, ["Back", "Forward"]),
        mk("Side bend", "z", 1, ["Left", "Right"]),
        mk("Twist", "y", -1, ["Left", "Right"]),
      ];
    case "neck":
      return [
        mk("Nod", "x", 1, ["Up", "Down"]),
        mk("Turn", "y", -1, ["Left", "Right"]),
        mk("Tilt", "z", 1, ["Left", "Right"]),
      ];
    case "pelvis":
      return [mk("Pelvis", "x", 1, ["Tip back", "Tip forward"])];
    default:
      return [];
  }
}

export function getAxis(pose: Pose, j: JointName, s: Slider): number {
  return Math.round(eulerDeg(pose.joints[j])[s.axis] * s.sign);
}

export function setAxis(pose: Pose, j: JointName, s: Slider, value: number) {
  _e.setFromQuaternion(pose.joints[j], ORDER);
  _e[s.axis] = deg(value * s.sign);
  pose.joints[j] = clampJoint(j, new Quaternion().setFromEuler(_e));
}

/** The joint a tapped part controls. */
export function jointForPart(part: string): JointName {
  const s = part.endsWith("L") ? "L" : part.endsWith("R") ? "R" : "";
  const base = part.replace(/[LR]$/, "");
  const map: Record<string, string> = {
    upperArm: "shoulder",
    shoulder: "shoulder",
    forearm: "elbow",
    elbow: "elbow",
    hand: "wrist",
    thigh: "hip",
    hip: "hip",
    shin: "knee",
    knee: "knee",
    foot: "ankle",
  };
  if (map[base]) return `${map[base]}${s}` as JointName;
  if (base === "chest" || base === "lowBack") return "waist";
  if (base === "head" || base === "neck") return "neck";
  return "pelvis";
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
