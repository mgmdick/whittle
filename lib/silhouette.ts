// Anatomical body illustration in a 200 × 420 viewBox. Each body part is a
// closed, smooth Catmull-Rom curve through hand-placed points; parts are
// authored for the viewer's left side and mirrored, so the figure is exactly
// symmetric.

type P = [number, number];

const W = 200;
const mirrorPts = (pts: P[]): P[] => pts.map(([x, y]) => [W - x, y]);

/** Closed smooth path through points (uniform Catmull-Rom → cubic Bézier). */
export function smoothClosed(pts: P[]): string {
  const n = pts.length;
  const f = (v: number) => v.toFixed(2);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

/** Symmetric closed path from the left half (top-centre → bottom-centre). */
function symmetric(leftHalf: P[]): string {
  const right = mirrorPts(leftHalf.slice(1, -1)).reverse();
  return smoothClosed([...leftHalf, ...right]);
}

const HEAD_LEFT: P[] = [
  [100, 9], [91, 10.5], [85, 17], [82.5, 28], [83, 40], [86.5, 49], [92.5, 55.5], [100, 58],
];
const NECK: P[] = [
  [93, 46], [92.5, 58], [89, 67], [83, 71.5], [100, 74], [117, 71.5], [111, 67], [107.5, 58], [107, 46], [100, 44],
];
const TORSO_LEFT: P[] = [
  [100, 69], [88, 68.5], [76, 71.5], [65.5, 75.5], [58.5, 82.5], [55.5, 92.5], [57.5, 102.5], [63, 110],
  [66, 122], [68.5, 138], [71, 154], [70.5, 168], [69.5, 182], [71, 196], [75.5, 208], [86, 219], [100, 225],
];
const ARM: P[] = [
  [57, 87], [51.5, 99], [48.5, 115], [48, 131], [48.3, 146], [46.8, 160], [45.4, 176], [45.8, 193], [47.6, 206],
  [52.5, 211.5], [57.2, 209.5], [60, 198], [62, 182], [62.6, 166], [63.6, 154], [65.6, 140], [66, 124],
  [64.6, 103], [62.5, 91],
];
const HAND: P[] = [
  [47.5, 205.5], [44, 211.5], [40.6, 219], [39, 226.5], [40.6, 229.4], [43.4, 226.6], [43, 235],
  [45.6, 243.5], [50.5, 247.2], [55.2, 244], [58.2, 236], [59.2, 224], [58.6, 213.5], [56.6, 206.5],
];
const LEG: P[] = [
  [72, 186], [69, 204], [70, 226], [73, 250], [77, 272], [79, 288], [79, 302], [77, 318], [77, 336], [79, 356],
  [82, 374], [83, 387], [80.5, 397], [79, 405], [84, 411], [93, 412], [97, 407], [95.5, 398], [94.5, 388],
  [94.5, 370], [96, 348], [96, 328], [94.5, 312], [95, 298], [96, 280], [98, 258], [100, 238], [99, 220], [88, 196],
];

export type BodyPart = { id: string; d: string };

// Paint order: arms behind the torso so the deltoid caps cover the arm tops.
export const BODY_PARTS: BodyPart[] = [
  { id: "armA", d: smoothClosed(ARM) },
  { id: "armB", d: smoothClosed(mirrorPts(ARM)) },
  { id: "handA", d: smoothClosed(HAND) },
  { id: "handB", d: smoothClosed(mirrorPts(HAND)) },
  { id: "legA", d: smoothClosed(LEG) },
  { id: "legB", d: smoothClosed(mirrorPts(LEG)) },
  { id: "neck", d: smoothClosed(NECK) },
  { id: "torso", d: symmetric(TORSO_LEFT) },
  { id: "head", d: symmetric(HEAD_LEFT) },
];

export const EARS = [
  { cx: 82.5, cy: 34, rx: 2.6, ry: 6 },
  { cx: 117.5, cy: 34, rx: 2.6, ry: 6 },
];

// Contour lines (muscle definition). Authored for the left side and mirrored.
type Lines = { left: string[]; center: string[]; dots?: [number, number, number][] };

function mirrorPath(d: string): string {
  // Mirror absolute M/Q/L/C commands: every x → 200 - x.
  return d.replace(/([MLQC])([^MLQCZ]*)/g, (_, cmd: string, args: string) => {
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const out = nums.map((v, i) => (i % 2 === 0 ? (W - v).toFixed(2) : v.toFixed(2)));
    return `${cmd}${out.join(" ")} `;
  });
}

const FRONT_LINES: Lines = {
  left: [
    "M89 77 Q80 74.5 69 79.5", // collarbone
    "M70.5 103 Q84 114 99 108.5", // pectoral
    "M64.5 80 Q69 92 66.5 104", // deltoid
    "M72 138 Q77.5 150 79.5 164", // oblique
    "M75 186 Q85 204 97.5 218", // inguinal
    "M88 128.5 Q94 130.5 99 128.5", // abs
    "M88.5 144.5 Q94 146.5 99 144.5",
    "M86.5 119 Q84.5 150 88 176",
    "M57.5 106 Q56.5 124 58.5 140", // biceps
    "M50.5 151 Q55 153 60 151", // elbow crease
    "M76.5 238 Q84 262 86 285", // quads
    "M96.5 246 Q92 270 92.5 289",
    "M87.5 317 Q86.5 342 88.5 370", // shin crest
    "M49 210 Q52.5 212 57 210", // wrist crease
  ],
  center: ["M100 80 L100 110", "M100 116 L100 160"],
  dots: [[100, 166, 1.6]],
};

const BACK_LINES: Lines = {
  left: [
    "M74 86 Q86 81.5 94 88 Q92.5 104 84 114 Q76.5 106 74 86", // scapula
    "M66 112 Q74 132 84.5 151", // lat
    "M95 53 L94 68", // neck tendon
    "M73 196 Q84 189 98.5 197", // upper glute
    "M76 226 Q87 233 98.5 228", // gluteal fold
    "M88 240 Q88.5 262 89 284", // hamstring split
    "M81 296 Q88 300.5 95 296", // knee crease
    "M80 320 Q86.5 334 88 352", // calf heads
    "M96 320 Q90 334 88 352",
    "M88 362 L88 386", // Achilles
    "M84 44.5 Q92 49 100 49.5", // hairline
  ],
  center: ["M100 196 L100 222"],
  dots: [
    [55, 151, 1.5],
    [145, 151, 1.5],
    [93, 186, 1.3],
    [107, 186, 1.3],
    ...Array.from({ length: 16 }, (_, i) => [100, 72 + i * 7.6, 1.15] as [number, number, number]),
  ],
};

export function contourPaths(view: "front" | "back") {
  const L = view === "front" ? FRONT_LINES : BACK_LINES;
  return {
    paths: [...L.left, ...L.left.map(mirrorPath), ...L.center],
    dots: L.dots ?? [],
  };
}
