export type View = "front" | "back";

export type PainMarker = {
  id: string;
  view: View;
  x: number;
  y: number;
  regionId: string;
  region: string;
  intensity: number; // 1–10
  types: string[];
  note: string;
};

export type PoseView = "front" | "side";

export type Movement = {
  id: string;
  createdAt: number;
  view: PoseView;
  angles: Record<string, number>;
  painParts: string[];
  intensity: number;
  label: string;
  note: string;
};

export type MapEntry = {
  id: string;
  createdAt: number;
  markers: PainMarker[];
  note: string;
};

export type LogEntry =
  | ({ kind: "map" } & MapEntry)
  | ({ kind: "movement" } & Movement);

export const PAIN_TYPES = [
  "Aching",
  "Sharp",
  "Stabbing",
  "Burning",
  "Throbbing",
  "Shooting",
  "Tingling / numb",
  "Stiff",
  "Cramping",
  "Tender to touch",
];

export function intensityColor(i: number): string {
  const t = Math.min(Math.max((i - 1) / 9, 0), 1);
  const hue = 52 - t * 52;
  const light = 56 - t * 10;
  return `hsl(${hue.toFixed(0)} 92% ${light.toFixed(0)}%)`;
}

export function intensityWord(i: number): string {
  if (i <= 2) return "Mild";
  if (i <= 4) return "Uncomfortable";
  if (i <= 6) return "Moderate";
  if (i <= 8) return "Severe";
  return "Worst";
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
