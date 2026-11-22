import type { View } from "./types";

// The body is drawn in a 200 × 420 viewBox as a segmented mannequin. Every
// segment is a tappable region. Shapes are authored for the viewer's left
// side ("A") and mirrored to the right ("B").

export type Shape =
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number };

export type Region = { id: string; name: string; shape: Shape };

type Def = { key: string; shape: Shape; side: boolean };

const W = 200;

const limbs: Def[] = [
  { key: "shoulder", side: true, shape: { kind: "ellipse", cx: 64, cy: 80, rx: 13, ry: 11 } },
  { key: "upperArm", side: true, shape: { kind: "rect", x: 47, y: 90, w: 15, h: 52, r: 7.5 } },
  { key: "elbow", side: true, shape: { kind: "ellipse", cx: 54.5, cy: 148, rx: 8, ry: 7 } },
  { key: "forearm", side: true, shape: { kind: "rect", x: 47.5, y: 156, w: 14, h: 46, r: 7 } },
  { key: "wrist", side: true, shape: { kind: "rect", x: 48, y: 204, w: 13, h: 8, r: 4 } },
  { key: "hand", side: true, shape: { kind: "ellipse", cx: 54.5, cy: 225, rx: 8.5, ry: 12 } },
  { key: "thigh", side: true, shape: { kind: "rect", x: 79, y: 220, w: 20, h: 70, r: 10 } },
  { key: "knee", side: true, shape: { kind: "ellipse", cx: 89, cy: 298, rx: 10, ry: 8.5 } },
  { key: "shin", side: true, shape: { kind: "rect", x: 81, y: 308, w: 16, h: 72, r: 8 } },
  { key: "ankle", side: true, shape: { kind: "rect", x: 82, y: 382, w: 14, h: 8, r: 4 } },
];

const frontDefs: Def[] = [
  { key: "head", side: false, shape: { kind: "ellipse", cx: 100, cy: 34, rx: 19, ry: 23 } },
  { key: "neck", side: false, shape: { kind: "rect", x: 91, y: 56, w: 18, h: 14, r: 5 } },
  { key: "chest", side: true, shape: { kind: "rect", x: 75, y: 72, w: 24.5, h: 54, r: 9 } },
  { key: "abdUpper", side: false, shape: { kind: "rect", x: 77, y: 128, w: 46, h: 30, r: 8 } },
  { key: "abdLower", side: false, shape: { kind: "rect", x: 78, y: 160, w: 44, h: 30, r: 8 } },
  { key: "pelvis", side: false, shape: { kind: "rect", x: 82, y: 192, w: 36, h: 25, r: 8 } },
  { key: "hip", side: true, shape: { kind: "ellipse", cx: 73, cy: 204, rx: 8, ry: 13 } },
  ...limbs,
  { key: "foot", side: true, shape: { kind: "ellipse", cx: 89, cy: 400, rx: 11, ry: 8 } },
];

const backDefs: Def[] = [
  { key: "head", side: false, shape: { kind: "ellipse", cx: 100, cy: 34, rx: 19, ry: 23 } },
  { key: "neck", side: false, shape: { kind: "rect", x: 91, y: 56, w: 18, h: 14, r: 5 } },
  { key: "chest", side: true, shape: { kind: "rect", x: 75, y: 72, w: 24.5, h: 54, r: 9 } },
  { key: "abdUpper", side: false, shape: { kind: "rect", x: 77, y: 128, w: 46, h: 30, r: 8 } },
  { key: "abdLower", side: false, shape: { kind: "rect", x: 78, y: 160, w: 44, h: 26, r: 8 } },
  { key: "sacrum", side: false, shape: { kind: "rect", x: 92, y: 188, w: 16, h: 18, r: 6 } },
  { key: "glute", side: true, shape: { kind: "ellipse", cx: 81, cy: 205, rx: 13, ry: 14 } },
  ...limbs,
  { key: "foot", side: true, shape: { kind: "ellipse", cx: 89, cy: 398, rx: 9, ry: 7 } },
];

const NAMES: Record<string, [string, string]> = {
  head: ["Head / face", "Back of head"],
  neck: ["Front of neck", "Back of neck"],
  chest: ["chest", "upper back / shoulder blade"],
  abdUpper: ["Upper abdomen", "Mid back"],
  abdLower: ["Lower abdomen", "Lower back"],
  pelvis: ["Groin / pelvis", "Groin / pelvis"],
  sacrum: ["Tailbone / sacrum", "Tailbone / sacrum"],
  hip: ["hip", "hip"],
  glute: ["buttock", "buttock"],
  shoulder: ["shoulder (front)", "shoulder (back)"],
  upperArm: ["upper arm (biceps)", "upper arm (triceps)"],
  elbow: ["elbow (inner)", "elbow (point)"],
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

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function build(view: View): Region[] {
  const defs = view === "front" ? frontDefs : backDefs;
  const idx = view === "front" ? 0 : 1;
  // Front view: viewer's left is the person's right. Back view: same side.
  const sideA = view === "front" ? "Right" : "Left";
  const sideB = view === "front" ? "Left" : "Right";
  const out: Region[] = [];
  for (const d of defs) {
    const base = NAMES[d.key][idx];
    if (!d.side) {
      out.push({ id: `${view}:${d.key}`, name: cap(base), shape: d.shape });
    } else {
      out.push({ id: `${view}:${d.key}:A`, name: `${sideA} ${base}`, shape: d.shape });
      out.push({ id: `${view}:${d.key}:B`, name: `${sideB} ${base}`, shape: mirror(d.shape) });
    }
  }
  return out;
}

export const REGIONS: Record<View, Region[]> = {
  front: build("front"),
  back: build("back"),
};

export const BODY_VIEWBOX = "0 0 200 420";
