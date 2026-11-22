import {
  CanvasTexture,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  type BufferGeometry,
} from "three";
import { FLOOR_Y, type JointName } from "./rig";

// Procedurally built wooden artist's mannequin: turned (lathe) limbs with a
// grain texture that runs along each part, ball joints, a varnish clearcoat.

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function woodTexture(base: string, dark: string, light: string, seed: number, w = 256, h = 1024) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rand(seed);
  // Broad colour variation bands.
  for (let i = 0; i < 14; i++) {
    const x = r() * w;
    const bw = 10 + r() * 40;
    const grad = g.createLinearGradient(x - bw, 0, x + bw, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, r() > 0.5 ? `${dark}22` : `${light}26`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - bw, 0, bw * 2, h);
  }
  // Fine grain lines that wander along the length.
  for (let i = 0; i < 150; i++) {
    const x0 = r() * w;
    const amp = 1 + r() * 5;
    const freq = 0.002 + r() * 0.01;
    const ph = r() * Math.PI * 2;
    g.beginPath();
    for (let y = 0; y <= h; y += 8) {
      const x = x0 + Math.sin(y * freq + ph) * amp + Math.sin(y * freq * 3.1 + ph) * amp * 0.3;
      if (y === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    const a = 0.05 + r() * 0.2;
    g.strokeStyle = r() > 0.2 ? `rgba(90,52,20,${a})` : `rgba(255,236,200,${a * 0.8})`;
    g.lineWidth = 0.4 + r() * 1.8;
    g.stroke();
  }
  // Small pores / ray flecks.
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(70,40,15,${0.05 + r() * 0.12})`;
    g.fillRect(r() * w, r() * h, 0.8, 2 + r() * 5);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Radius along a part, from smooth control points, with rounded ends. */
function profile(len: number, ctrl: [number, number][], capTop: number, capBot: number, y0: number, dir: 1 | -1) {
  const N = 40;
  const pts: Vector2[] = [];
  // Smooth (cubic Hermite / Catmull-Rom) radius through the control points.
  const slope = (i: number) => {
    const a = ctrl[Math.max(0, i - 1)];
    const b = ctrl[Math.min(ctrl.length - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0] || 1);
  };
  const radiusAt = (t: number) => {
    let i = 0;
    while (i < ctrl.length - 2 && t > ctrl[i + 1][0]) i++;
    const [t0, r0] = ctrl[i];
    const [t1, r1] = ctrl[i + 1];
    const h = t1 - t0 || 1;
    const u = Math.min(1, Math.max(0, (t - t0) / h));
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
    const h10 = u ** 3 - 2 * u ** 2 + u;
    const h01 = -2 * u ** 3 + 3 * u ** 2;
    const h11 = u ** 3 - u ** 2;
    return h00 * r0 + h10 * h * slope(i) + h01 * r1 + h11 * h * slope(i + 1);
  };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r = radiusAt(t);
    const dTop = t * len;
    const dBot = (1 - t) * len;
    if (dTop < capTop) r *= Math.sqrt(Math.max(0, 1 - ((capTop - dTop) / capTop) ** 2));
    if (dBot < capBot) r *= Math.sqrt(Math.max(0, 1 - ((capBot - dBot) / capBot) ** 2));
    pts.push(new Vector2(Math.max(r, 0.0001), y0 + dir * t * len));
  }
  // Lathe wants points ordered bottom → top for outward-facing normals.
  if (dir === -1) pts.reverse();
  pts[0].x = 0.0001;
  pts[pts.length - 1].x = 0.0001;
  return pts;
}

function lathe(pts: Vector2[], segs = 40): BufferGeometry {
  const g = new LatheGeometry(pts, segs);
  g.computeVertexNormals();
  return g;
}

export type MannequinModel = {
  root: Group;
  groups: Record<JointName, Group>;
  pickables: Mesh[];
  rod: Mesh;
  plinth: Group;
  dispose: () => void;
};

const BALL_R: Partial<Record<JointName, number>> = {
  waist: 0.058,
  neck: 0.034,
  shoulderL: 0.047,
  shoulderR: 0.047,
  elbowL: 0.036,
  elbowR: 0.036,
  wristL: 0.027,
  wristR: 0.027,
  hipL: 0.056,
  hipR: 0.056,
  kneeL: 0.046,
  kneeR: 0.046,
  ankleL: 0.033,
  ankleR: 0.033,
};

const BALL_PART: Record<string, string> = {
  waist: "lowBack",
  neck: "neck",
  shoulderL: "shoulderL",
  shoulderR: "shoulderR",
  elbowL: "elbowL",
  elbowR: "elbowR",
  wristL: "handL",
  wristR: "handR",
  hipL: "hipL",
  hipR: "hipR",
  kneeL: "kneeL",
  kneeR: "kneeR",
  ankleL: "footL",
  ankleR: "footR",
};

export function buildMannequin(): MannequinModel {
  const wood = woodTexture("#d9ae76", "#7a4a1e", "#f6dcae", 7);
  const woodDark = woodTexture("#b98a55", "#5e3814", "#e7c48f", 13);
  const walnut = woodTexture("#5b3a22", "#2e1a0c", "#8a6040", 29, 512, 512);
  const geoms: BufferGeometry[] = [];
  const mats: (MeshPhysicalMaterial | MeshStandardMaterial)[] = [];

  const makeMat = (map: CanvasTexture) => {
    const m = new MeshPhysicalMaterial({
      map,
      roughness: 0.46,
      clearcoat: 0.45,
      clearcoatRoughness: 0.32,
      sheen: 0.25,
      sheenRoughness: 0.6,
      sheenColor: 0xffe2b8,
    });
    mats.push(m);
    return m;
  };

  const root = new Group();
  const groups = {} as Record<JointName, Group>;
  const pickables: Mesh[] = [];

  const add = (j: JointName, geo: BufferGeometry, part: string, map = wood) => {
    geoms.push(geo);
    const mesh = new Mesh(geo, makeMat(map));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.part = part;
    mesh.userData.joint = j;
    groups[j].add(mesh);
    pickables.push(mesh);
    return mesh;
  };

  const joints: JointName[] = [
    "pelvis", "waist", "neck", "shoulderL", "elbowL", "wristL", "shoulderR", "elbowR", "wristR",
    "hipL", "kneeL", "ankleL", "hipR", "kneeR", "ankleR",
  ];
  for (const j of joints) {
    const g = new Group();
    g.name = j;
    g.matrixAutoUpdate = true;
    groups[j] = g;
    root.add(g);
    const br = BALL_R[j];
    if (br) {
      const ball = add(j, new SphereGeometry(br, 32, 20), BALL_PART[j], woodDark);
      ball.userData.ball = true;
    }
  }

  // Pelvis block.
  const pelvis = lathe(profile(0.17, [[0, 0.088], [0.35, 0.138], [0.75, 0.132], [1, 0.094]], 0.035, 0.045, -0.105, 1));
  pelvis.scale(1, 1, 0.68);
  add("pelvis", pelvis, "pelvis");

  // Chest block: narrow waist widening to the shoulders.
  const chest = lathe(
    profile(0.36, [[0, 0.084], [0.28, 0.112], [0.6, 0.148], [0.84, 0.153], [1, 0.11]], 0.03, 0.055, 0.035, 1),
    48
  );
  chest.scale(1, 1, 0.6);
  add("waist", chest, "chest");

  // Neck and egg-shaped head.
  const neckGeo = new CylinderGeometry(0.027, 0.031, 0.09, 24);
  neckGeo.translate(0, 0.06, 0);
  add("neck", neckGeo, "neck");
  const headPts: Vector2[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48; // 0 = chin, 1 = crown
    const r = 0.1 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (0.84 + 0.24 * Math.sin((Math.PI * t) / 1.6));
    headPts.push(new Vector2(Math.max(r, 0.0001), 0.082 + t * 0.255));
  }
  const head = lathe(headPts, 48);
  head.scale(0.92, 1, 1);
  head.rotateX(-0.12);
  add("neck", head, "head");

  for (const s of ["L", "R"] as const) {
    const sx = s === "L" ? 1 : -1;
    // Upper arm, forearm, hand.
    add(`shoulder${s}`, lathe(profile(0.235, [[0, 0.04], [0.25, 0.044], [0.7, 0.036], [1, 0.031]], 0.03, 0.03, -0.03, -1)), `upperArm${s}`);
    add(`elbow${s}`, lathe(profile(0.21, [[0, 0.034], [0.25, 0.038], [1, 0.025]], 0.028, 0.025, -0.028, -1)), `forearm${s}`);
    const hand = lathe(profile(0.155, [[0, 0.022], [0.35, 0.036], [0.72, 0.034], [1, 0.018]], 0.02, 0.03, -0.022, -1));
    hand.scale(0.5, 1, 1);
    add(`wrist${s}`, hand, `hand${s}`);
    const thumb = lathe(profile(0.07, [[0, 0.012], [0.5, 0.014], [1, 0.01]], 0.012, 0.012, 0, -1), 16);
    thumb.rotateX(-0.5);
    thumb.rotateZ(sx * 0.15);
    thumb.translate(0, -0.05, 0.028);
    add(`wrist${s}`, thumb, `hand${s}`);
    // Thigh, shin, foot.
    add(`hip${s}`, lathe(profile(0.35, [[0, 0.068], [0.2, 0.071], [1, 0.044]], 0.04, 0.035, -0.04, -1)), `thigh${s}`);
    add(`knee${s}`, lathe(profile(0.345, [[0, 0.047], [0.28, 0.051], [1, 0.029]], 0.035, 0.03, -0.035, -1)), `shin${s}`);
    const foot = lathe(profile(0.235, [[0, 0.03], [0.3, 0.046], [0.75, 0.041], [1, 0.024]], 0.03, 0.03, 0, 1), 32);
    foot.scale(1, 1, 0.62);
    foot.rotateX(Math.PI / 2);
    foot.translate(0, -0.052, -0.055);
    add(`ankle${s}`, foot, `foot${s}`);
  }

  // Display plinth and brass support rod (the classic mannequin stand).
  const plinth = new Group();
  const baseMat = new MeshStandardMaterial({ map: walnut, roughness: 0.38, metalness: 0.0 });
  mats.push(baseMat);
  const top = new CylinderGeometry(0.42, 0.44, FLOOR_Y * 0.7, 72);
  top.translate(0, FLOOR_Y - FLOOR_Y * 0.35, 0);
  const lip = new CylinderGeometry(0.46, 0.47, FLOOR_Y * 0.32, 72);
  lip.translate(0, FLOOR_Y * 0.16, 0);
  geoms.push(top, lip);
  for (const g of [top, lip]) {
    const m = new Mesh(g, baseMat);
    m.receiveShadow = true;
    m.castShadow = true;
    plinth.add(m);
  }
  const rodGeo = new CylinderGeometry(0.009, 0.009, 1, 16);
  rodGeo.translate(0, 0.5, 0);
  geoms.push(rodGeo);
  const rodMat = new MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.28 });
  mats.push(rodMat);
  const rod = new Mesh(rodGeo, rodMat);
  rod.castShadow = true;
  const collar = new CylinderGeometry(0.03, 0.036, 0.018, 32);
  collar.translate(0, FLOOR_Y + 0.009, 0);
  geoms.push(collar);
  plinth.add(new Mesh(collar, rodMat));

  return {
    root,
    groups,
    pickables,
    rod,
    plinth,
    dispose: () => {
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      [wood, woodDark, walnut].forEach((t) => t.dispose());
    },
  };
}
