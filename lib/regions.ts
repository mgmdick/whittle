import type { View } from "./types";

// Named anatomical regions used to label where a tap landed. They're logic
// only (not drawn), laid over the illustration in lib/silhouette.ts.
// Shapes are authored for the viewer's left side ("A") and mirrored ("B").

export type Shape =
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number };

export type Region = { id: string; key: string; side: "A" | "B" | null; name: string; shape: Shape };

type Def = { key: string; shape: Shape; side: boolean };

const W = 200;

const limbs: Def[] = [
  { key: "shoulder", side: true, shape: { kind: "ellipse", cx: 61, cy: 88, rx: 9, ry: 12 } },
  { key: "upperArm", side: true, shape: { kind: "rect", x: 46, y: 98, w: 21, h: 50, r: 8 } },
  { key: "elbow", side: true, shape: { kind: "ellipse", cx: 55, cy: 151, rx: 9, ry: 7 } },
  { key: "forearm", side: true, shape: { kind: "rect", x: 43, y: 158, w: 20, h: 46, r: 8 } },
  { key: "wrist", side: true, shape: { kind: "rect", x: 44, y: 204, w: 16, h: 9, r: 4 } },
  { key: "hand", side: true, shape: { kind: "ellipse", cx: 50.5, cy: 229, rx: 9.5, ry: 17 } },
  { key: "thigh", side: true, shape: { kind: "rect", x: 68, y: 214, w: 32, h: 79, r: 10 } },
  { key: "knee", side: true, shape: { kind: "ellipse", cx: 87.5, cy: 299, rx: 10, ry: 10 } },
  { key: "shin", side: true, shape: { kind: "rect", x: 75, y: 307, w: 24, h: 72, r: 8 } },
  { key: "ankle", side: true, shape: { kind: "rect", x: 79, y: 379, w: 18, h: 13, r: 5 } },
];

const frontDefs: Def[] = [
  { key: "head", side: false, shape: { kind: "ellipse", cx: 100, cy: 33, rx: 18.5, ry: 25 } },
  { key: "neck", side: false, shape: { kind: "rect", x: 88, y: 55, w: 24, h: 16, r: 6 } },
  { key: "chest", side: true, shape: { kind: "rect", x: 66, y: 71, w: 34, h: 41, r: 8 } },
  { key: "abdUpper", side: true, shape: { kind: "rect", x: 66, y: 112, w: 34, h: 34, r: 6 } },
  { key: "abdLower", side: true, shape: { kind: "rect", x: 68, y: 146, w: 32, h: 36, r: 6 } },
  { key: "hip", side: true, shape: { kind: "ellipse", cx: 72.5, cy: 194, rx: 7.5, ry: 12 } },
  { key: "pelvis", side: false, shape: { kind: "rect", x: 78, y: 182, w: 44, h: 46, r: 10 } },
  ...limbs,
  { key: "foot", side: true, shape: { kind: "ellipse", cx: 88, cy: 404, rx: 11, ry: 8.5 } },
];

const backDefs: Def[] = [
  { key: "head", side: false, shape: { kind: "ellipse", cx: 100, cy: 33, rx: 18.5, ry: 25 } },
  { key: "neck", side: false, shape: { kind: "rect", x: 88, y: 55, w: 24, h: 16, r: 6 } },
  { key: "chest", side: true, shape: { kind: "rect", x: 66, y: 71, w: 34, h: 47, r: 8 } },
  { key: "abdUpper", side: true, shape: { kind: "rect", x: 66, y: 118, w: 34, h: 30, r: 6 } },
  { key: "abdLower", side: true, shape: { kind: "rect", x: 68, y: 148, w: 32, h: 36, r: 6 } },
  { key: "sacrum", side: false, shape: { kind: "rect", x: 91, y: 184, w: 18, h: 16, r: 6 } },
  { key: "glute", side: true, shape: { kind: "ellipse", cx: 84.5, cy: 207, rx: 16, ry: 19 } },
  ...limbs,
  { key: "foot", side: true, shape: { kind: "ellipse", cx: 88, cy: 403, rx: 10, ry: 8.5 } },
];

const NAMES: Record<string, [string, string]> = {
  head: ["Head / face", "Back of head"],
  neck: ["Front of neck", "Back of neck"],
  chest: ["chest", "upper back / shoulder blade"],
  abdUpper: ["upper abdomen", "mid back"],
  abdLower: ["lower abdomen", "lower back"],
  pelvis: ["Groin / pelvis", "Groin / pelvis"],
  sacrum: ["Tailbone / sacrum", "Tailbone / sacrum"],
  hip: ["hip", "hip"],
  glute: ["buttock", "buttock"],
  shoulder: ["shoulder (front)", "shoulder (back)"],
  upperArm: ["upper arm (biceps)", "upper arm (triceps)"],
  elbow: ["inner elbow", "elbow point"],
  forearm: ["forearm (palm side)", "forearm (back)"],
  wrist: ["wrist (palm side)", "wrist (back)"],
  hand: ["palm / fingers", "back of hand"],
  thigh: ["thigh (front)", "hamstring"],
  knee: ["kneecap", "back of knee"],
  shin: ["shin", "calf"],
  ankle: ["ankle", "Achilles / ankle"],
  foot: ["top of foot / toes", "heel"],
};

function mirror(s: Shape): Shape {
  if (s.kind === "ellipse") return { ...s, cx: W - s.cx };
  return { ...s, x: W - s.x - s.w };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Person's own side for a region drawn on the viewer's left (A) or right (B). */
export function personSide(view: View, side: "A" | "B"): "Right" | "Left" {
  // Front view: the person faces you, so the viewer's left is their right.
  if (view === "front") return side === "A" ? "Right" : "Left";
  return side === "A" ? "Left" : "Right";
}

function build(view: View): Region[] {
  const defs = view === "front" ? frontDefs : backDefs;
  const idx = view === "front" ? 0 : 1;
  const out: Region[] = [];
  for (const d of defs) {
    const base = NAMES[d.key][idx];
    if (!d.side) {
      out.push({ id: `${view}:${d.key}`, key: d.key, side: null, name: cap(base), shape: d.shape });
    } else {
      for (const side of ["A", "B"] as const) {
        out.push({
          id: `${view}:${d.key}:${side}`,
          key: d.key,
          side,
          name: `${personSide(view, side)} ${base}`,
          shape: side === "A" ? d.shape : mirror(d.shape),
        });
      }
    }
  }
  return out;
}

export const REGIONS: Record<View, Region[]> = { front: build("front"), back: build("back") };

const area = (s: Shape) => (s.kind === "ellipse" ? Math.PI * s.rx * s.ry : s.w * s.h);

function contains(s: Shape, x: number, y: number): boolean {
  if (s.kind === "ellipse") return ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1;
  return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
}

function distance(s: Shape, x: number, y: number): number {
  if (s.kind === "ellipse") {
    return Math.max(0, Math.hypot((x - s.cx) / s.rx, (y - s.cy) / s.ry) - 1) * Math.min(s.rx, s.ry);
  }
  const dx = Math.max(s.x - x, 0, x - (s.x + s.w));
  const dy = Math.max(s.y - y, 0, y - (s.y + s.h));
  return Math.hypot(dx, dy);
}

const BY_AREA: Record<View, Region[]> = {
  front: [...REGIONS.front].sort((a, b) => area(a.shape) - area(b.shape)),
  back: [...REGIONS.back].sort((a, b) => area(a.shape) - area(b.shape)),
};

/** The most specific region under a point, or the nearest one. */
export function hitTest(view: View, x: number, y: number): Region {
  const hit = BY_AREA[view].find((r) => contains(r.shape, x, y));
  if (hit) return hit;
  let best = REGIONS[view][0];
  let bestD = Infinity;
  for (const r of REGIONS[view]) {
    const d = distance(r.shape, x, y);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function regionById(id: string): Region | undefined {
  const view = id.split(":")[0] as View;
  return REGIONS[view]?.find((r) => r.id === id);
}

export const BODY_VIEWBOX = "0 0 200 420";
