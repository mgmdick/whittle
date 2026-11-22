import { PART_LABEL, norm } from "./pose";
import { personSide, regionById } from "./regions";
import { MUSCLE_BY_ID, musclesAt } from "./muscles";
import type { Movement, PainMarker } from "./types";

// A rules-based symptom checker. It suggests *possible* explanations and how
// urgently to get help; it does not diagnose. Every condition scores the
// user's findings and explains why it matched.

export type Urgency = "emergency" | "urgent" | "doctor" | "selfcare";
export type Side = "Right" | "Left" | null;

export type Intake = {
  duration: "days" | "weeks" | "months" | null;
  onset: "injury" | "sudden" | "gradual" | "woke" | null;
  age: "u18" | "18-39" | "40-59" | "60+" | null;
  sex: "female" | "male" | null;
  flags: string[];
};

export const EMPTY_INTAKE: Intake = { duration: null, onset: null, age: null, sex: null, flags: [] };

export const RED_FLAGS: { id: string; label: string }[] = [
  { id: "chestPressure", label: "Chest pressure, tightness or squeezing" },
  { id: "breath", label: "Short of breath, sweaty or faint" },
  { id: "numbWeak", label: "New numbness or weakness in an arm, leg or face" },
  { id: "bladder", label: "Loss of bladder/bowel control or numb groin" },
  { id: "worstHeadache", label: "Sudden, worst-ever headache" },
  { id: "fever", label: "Fever, chills or feeling very unwell" },
  { id: "swelling", label: "Leg swollen, red or warm" },
  { id: "cantBear", label: "Can't put weight on it / can't use it" },
  { id: "deformity", label: "Looks deformed after an injury" },
  { id: "weightLoss", label: "Unexplained weight loss or pain at night" },
];

// Extra symptoms that sharpen the picture (not emergencies by themselves).
export const DETAILS: { id: string; label: string }[] = [
  { id: "swollenJoint", label: "The joint looks swollen" },
  { id: "locking", label: "Clicks, catches, locks or gives way" },
  { id: "pop", label: "Felt a pop or snap when it started" },
  { id: "morningStiff", label: "Stiff for over an hour after waking" },
  { id: "firstSteps", label: "Worst with the first steps in the morning" },
  { id: "walking", label: "Leg pain when walking that eases with rest" },
  { id: "breathing", label: "Worse breathing in deeply or coughing" },
  { id: "rash", label: "Rash, blisters or skin change over the pain" },
  { id: "nightNumb", label: "Tingling or numbness that wakes you at night" },
  { id: "sitting", label: "Worse after sitting, better moving" },
  { id: "bulge", label: "A lump or bulge you can see or feel" },
  { id: "urine", label: "Burning or frequent urination" },
  { id: "jaw", label: "Jaw pain or clicking when chewing" },
  { id: "running", label: "Started with running or more exercise" },
];

export type Finding = {
  loc: string;
  side: Side;
  intensity: number;
  types: string[];
  label: string;
  source: "map" | "movement";
  tags: string[];
  /** Closer to the body's midline than the region centre (inner side). */
  medial?: boolean;
  /** Further from the midline (outer side). */
  lateral?: boolean;
  /** In the lower part of the region (e.g. just below the kneecap). */
  below?: boolean;
  muscles: string[];
};

// Canonical location for each region key in each view.
const LOC: Record<"front" | "back", Record<string, string>> = {
  front: {
    head: "head", neck: "neckFront", chest: "chest", abdUpper: "abdUpper", abdLower: "abdLower",
    pelvis: "groin", hip: "hip", shoulder: "shoulder", upperArm: "upperArm", elbow: "elbowInner",
    forearm: "forearmFlexor", wrist: "wristPalm", hand: "palm", thigh: "thighFront", knee: "kneecap",
    shin: "shin", ankle: "ankle", foot: "footTop",
  },
  back: {
    head: "headBack", neck: "neck", chest: "upperBack", abdUpper: "midBack", abdLower: "lowBack",
    sacrum: "sacrum", glute: "buttock", shoulder: "shoulderBack", upperArm: "upperArmBack", elbow: "elbowPoint",
    forearm: "forearmExtensor", wrist: "wristBack", hand: "handBack", thigh: "hamstring", knee: "kneeBack",
    shin: "calf", ankle: "achilles", foot: "heel",
  },
};

const PART_LOC: Record<string, string> = {
  head: "head", neck: "neck", torso: "lowBack", lowBack: "lowBack", shoulder: "shoulder", upperArm: "upperArm",
  elbow: "elbowPoint", forearm: "forearmExtensor", hand: "wristPalm", hip: "hip", thigh: "thighFront",
  knee: "kneecap", shin: "shin", foot: "ankle", chest: "upperBack", pelvis: "sacrum",
};

function movementTags(m: Movement): string[] {
  const t = `${m.label} ${m.note}`.toLowerCase();
  const tags: string[] = [...(m.tags ?? [])];
  const a = m.view === "3d" ? {} : m.angles;
  const armUp = Math.max(Math.abs(a.upperArmL ?? 0), Math.abs(a.upperArmR ?? 0));
  const torsoTilt = Math.abs(((a.torso ?? 180) + 360) % 360 - 180);
  if (armUp > 75 || /overhead|reach|raise|lift.*arm|shelf|hair/.test(t)) tags.push("overhead");
  if (m.view === "side" && (a.torso ?? 180) < 160 && (a.torso ?? 180) > 0) tags.push("flexion");
  if (/bend|lift|pick|tie|shoe/.test(t)) tags.push("flexion");
  if (m.view === "side" && (a.torso ?? 180) < 0) tags.push("extension");
  if (/lean back|arch/.test(t)) tags.push("extension");
  if (m.view === "front" && torsoTilt > 12) tags.push("sidebend");
  const kneeBend = Math.max(Math.abs((a.thighL ?? 0) - (a.shinL ?? 0)), Math.abs((a.thighR ?? 0) - (a.shinR ?? 0)));
  if (kneeBend > 60 || /squat|stair|kneel|sit|chair|crouch/.test(t)) tags.push("kneeLoad");
  if (Math.max(Math.abs(a.thighL ?? 0), Math.abs(a.thighR ?? 0)) > 50 || /squat|sit|stair|knee to chest/.test(t))
    tags.push("hipFlex");
  if (/lunge|step|stride|run|walk/.test(t)) tags.push("stride");
  if (Math.abs(norm((a.head ?? 180) - (a.torso ?? 180))) > 20 || /look|turn|head|neck|tilt/.test(t)) tags.push("neckMove");
  if (/grip|twist|jar|open|lift|carry|type|mouse/.test(t)) tags.push("grip");
  if (/twist|turn|pivot/.test(t)) tags.push("twist");
  return tags;
}

export function buildFindings(markers: PainMarker[], movements: Movement[]): Finding[] {
  const out: Finding[] = [];
  for (const m of markers) {
    const r = regionById(m.regionId);
    if (!r) continue;
    const loc = LOC[m.view][r.key];
    if (!loc) continue;
    const c = r.shape.kind === "ellipse" ? { x: r.shape.cx, y: r.shape.cy, h: r.shape.ry * 2 } : { x: r.shape.x + r.shape.w / 2, y: r.shape.y + r.shape.h / 2, h: r.shape.h };
    const dMid = Math.abs(m.x - 100) - Math.abs(c.x - 100);
    out.push({
      loc,
      side: r.side ? personSide(m.view, r.side) : null,
      intensity: m.intensity,
      types: m.types,
      label: m.region,
      source: "map",
      tags: [],
      medial: r.side ? dMid < -1.2 : undefined,
      lateral: r.side ? dMid > 1.2 : undefined,
      below: m.y > c.y + c.h * 0.12,
      muscles: musclesAt(m.view, m.x, m.y).map((h) => h.muscle.id),
    });
  }
  for (const mv of movements) {
    const tags = movementTags(mv);
    for (const part of mv.painParts) {
      const base = part.replace(/[LR]$/, "");
      const loc = PART_LOC[base];
      if (!loc) continue;
      const side: Side = /L$/.test(part) ? "Left" : /R$/.test(part) ? "Right" : null;
      out.push({
        loc,
        side,
        intensity: mv.intensity,
        types: mv.note ? mv.note.split(/,\s*| — /) : [],
        label: `${PART_LABEL[part]} when ${mv.label.toLowerCase()}`,
        source: "movement",
        tags,
        muscles: [],
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- scoring

type Ctx = { f: Finding[]; q: Intake };

type Meta = { name?: string; about?: string; selfCare?: string[]; muscles?: string[] };

class Score {
  points = 0;
  why: string[] = [];
  meta: Meta = {};
  add(p: number, reason?: string) {
    if (p <= 0) return this;
    this.points += p;
    if (reason && !this.why.includes(reason)) this.why.push(reason);
    return this;
  }
}

const at = (c: Ctx, locs: string[], side?: Side) =>
  c.f.filter((x) => locs.includes(x.loc) && (side === undefined || x.side === side));
const peak = (fs: Finding[]) => fs.reduce((m, x) => Math.max(m, x.intensity), 0);
const feels = (fs: Finding[], types: string[]) => fs.some((x) => x.types.some((t) => types.includes(t)));
const tagged = (fs: Finding[], tags: string[]) => fs.some((x) => x.tags.some((t) => tags.includes(t)));
const flag = (c: Ctx, id: string) => c.q.flags.includes(id);
const describe = (fs: Finding[]) => {
  const top = [...fs].sort((a, b) => b.intensity - a.intensity)[0];
  return `${top.label} (${top.intensity}/10)`;
};
/** Base points for pain in these locations: more for stronger pain. */
function located(s: Score, fs: Finding[], weight: number) {
  if (!fs.length) return false;
  s.add(weight * (0.7 + peak(fs) / 20), describe(fs));
  return true;
}
const sides = (fs: Finding[]) => new Set(fs.map((x) => x.side).filter(Boolean)).size;

const NERVE = ["Tingling / numb", "Shooting", "Burning"];
const SHARP = ["Sharp", "Stabbing"];
const COLICKY = ["Cramping", "Stabbing", "Sharp"];

export type Condition = {
  id: string;
  name: string;
  area: string;
  about: string;
  selfCare: string[];
  seeDoctor: string;
  urgency: Urgency;
  /** Muscles/tendons typically involved (ids from lib/muscles). */
  muscles?: string[];
  score: (c: Ctx) => Score;
};

const older = (c: Ctx) => c.q.age === "40-59" || c.q.age === "60+";
const younger = (c: Ctx) => c.q.age === "u18" || c.q.age === "18-39";

export const CONDITIONS: Condition[] = [
  // ---------------- Head & neck
  {
    id: "tension-headache",
    name: "Tension-type headache",
    area: "Head",
    about: "The most common headache: a steady, band-like pressure across the forehead, temples or back of the head, often with tight neck and shoulder muscles. Linked to stress, poor sleep, screens and posture.",
    selfCare: ["Regular meals, water and sleep", "Simple painkillers (paracetamol/ibuprofen) — but not more than 2–3 days a week", "Neck and shoulder stretches, heat on the neck", "Screen breaks every 30–45 minutes"],
    seeDoctor: "If headaches are new after age 50, getting more frequent, wake you up, or come with vision changes, confusion or a stiff neck with fever.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["head", "headBack"]);
      if (!located(s, h, 3)) return s;
      if (feels(h, ["Aching", "Stiff"])) s.add(1.5, "Dull, pressing quality");
      if (at(c, ["neck", "upperBack"]).length) s.add(1.5, "Neck/upper back tension too");
      if (feels(h, ["Throbbing"])) s.points -= 1;
      return s;
    },
  },
  {
    id: "migraine",
    name: "Migraine",
    area: "Head",
    about: "Recurrent moderate-to-severe headaches, often throbbing and on one side, with nausea or sensitivity to light and sound. Attacks last hours to days; some people get a visual aura first.",
    selfCare: ["Rest in a dark, quiet room", "Take painkillers early in an attack", "Keep a diary of triggers (sleep, alcohol, missed meals, hormones)"],
    seeDoctor: "For frequent attacks (preventive treatment helps), or straight away if it's the first time, the worst headache ever, or comes with weakness, slurred speech or confusion.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["head", "headBack"]);
      if (!h.length) return s;
      located(s, h, 2);
      if (feels(h, ["Throbbing"])) s.add(3, "Throbbing quality");
      if (peak(h) >= 6) s.add(1, "Moderate-to-severe intensity");
      return s;
    },
  },
  {
    id: "neck-strain",
    name: "Neck muscle strain / stiff neck",
    area: "Neck",
    about: "Strained or tight neck muscles cause aching and stiffness that's worse turning or tilting the head. Often from sleeping awkwardly, desk posture or a sudden movement. Usually settles in days to a couple of weeks.",
    selfCare: ["Keep it moving gently — avoid a collar", "Heat pack 15–20 min a few times a day", "Painkillers or anti-inflammatory gel", "Raise screens to eye level"],
    seeDoctor: "If it follows a significant injury, comes with arm weakness or numbness, fever with a stiff neck, or isn't improving after 2 weeks.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const n = at(c, ["neck", "neckFront", "upperBack"]);
      if (!located(s, n, 3.5)) return s;
      if (feels(n, ["Stiff", "Aching"])) s.add(1.5, "Stiff/aching quality");
      if (tagged(n, ["neckMove"])) s.add(2, "Hurts moving the head");
      if (c.q.onset === "woke") s.add(2, "Woke up with it");
      return s;
    },
  },
  {
    id: "cervical-radiculopathy",
    name: "Pinched nerve in the neck (cervical radiculopathy)",
    area: "Neck & arm",
    about: "A disc or bony narrowing in the neck irritates a nerve root, causing neck pain that shoots down one arm with tingling, numbness or weakness in the hand. Most cases improve over 6–12 weeks.",
    selfCare: ["Stay gently active", "Avoid long periods looking down", "Painkillers as needed"],
    seeDoctor: "Book a GP or physio review. Seek urgent help for progressive weakness, problems walking, or symptoms in both arms.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const n = at(c, ["neck", "upperBack", "shoulderBack"]);
      const arm = at(c, ["upperArm", "upperArmBack", "forearmFlexor", "forearmExtensor", "palm", "handBack", "wristPalm", "wristBack"]);
      if (!n.length || !arm.length) return s;
      located(s, n, 2);
      s.add(2, "Pain spreading into the arm");
      if (feels([...n, ...arm], NERVE)) s.add(3.5, "Nerve-type sensations (tingling/shooting/burning)");
      if (flag(c, "numbWeak")) s.add(2, "Numbness or weakness");
      return s;
    },
  },
  // ---------------- Shoulder & arm
  {
    id: "rotator-cuff",
    name: "Rotator cuff tendinopathy / impingement",
    area: "Shoulder",
    about: "Irritation of the shoulder tendons. Typically an ache at the front or side of the shoulder and upper arm, worse lifting the arm out to the side or overhead, and lying on that side at night. Very common after 40 and with overhead work or sport.",
    selfCare: ["Keep moving within comfort; avoid repeated overhead loading for a while", "Ice or heat, and painkillers", "Gentle pendulum and band exercises; physio exercise programmes work well"],
    seeDoctor: "If you can't lift the arm at all after a fall (possible tear), or it hasn't improved after 4–6 weeks.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const sh = at(c, ["shoulder", "shoulderBack", "upperArm"]);
      if (!located(s, sh, 3)) return s;
      if (tagged(sh, ["overhead"])) s.add(4, "Hurts raising the arm / overhead");
      if (feels(sh, ["Aching", "Sharp"])) s.add(1);
      if (older(c)) s.add(1, "Common in your age group");
      if (c.q.onset === "gradual") s.add(1, "Came on gradually");
      return s;
    },
  },
  {
    id: "frozen-shoulder",
    name: "Frozen shoulder (adhesive capsulitis)",
    area: "Shoulder",
    about: "The shoulder capsule thickens and tightens, causing pain then increasing stiffness in every direction. Most common between 40 and 60 and in people with diabetes. It slowly resolves, often over 1–3 years.",
    selfCare: ["Gentle range-of-motion exercises daily", "Heat before stretching", "Painkillers to allow movement"],
    seeDoctor: "See a GP or physio to confirm it — injections and guided exercise can shorten the painful phase.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const sh = at(c, ["shoulder", "shoulderBack"]);
      if (!sh.length) return s;
      located(s, sh, 1.5);
      if (feels(sh, ["Stiff"])) s.add(3, "Marked stiffness");
      if (c.q.duration === "months") s.add(2, "Lasting months");
      if (older(c)) s.add(1);
      return s;
    },
  },
  {
    id: "tennis-elbow",
    name: "Tennis elbow (lateral epicondylitis)",
    area: "Elbow",
    about: "Overuse of the forearm muscles that extend the wrist causes pain on the outer elbow, often spreading into the forearm, worse gripping, lifting or twisting (jars, mugs, mouse use).",
    selfCare: ["Reduce the aggravating gripping activity", "Forearm strap (counterforce brace)", "Ice and anti-inflammatory gel", "Gradual wrist-extensor strengthening"],
    seeDoctor: "If it's not improving after 6 weeks of rest from the trigger.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const e = at(c, ["elbowPoint", "forearmExtensor"]);
      if (!located(s, e, 3.5)) return s;
      if (tagged(e, ["grip"])) s.add(2, "Hurts gripping/lifting");
      if (c.q.onset === "gradual") s.add(1, "Came on gradually");
      return s;
    },
  },
  {
    id: "golfers-elbow",
    name: "Golfer's elbow (medial epicondylitis)",
    area: "Elbow",
    about: "Overuse of the forearm muscles that bend the wrist causes pain on the inner side of the elbow and forearm, worse gripping and wrist-bending.",
    selfCare: ["Rest from the aggravating activity", "Ice, anti-inflammatory gel", "Gradual strengthening"],
    seeDoctor: "If not improving after 6 weeks, or you get tingling in the ring and little fingers.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const e = at(c, ["elbowInner", "forearmFlexor"]);
      if (!located(s, e, 3)) return s;
      if (tagged(e, ["grip"])) s.add(2, "Hurts gripping");
      return s;
    },
  },
  {
    id: "carpal-tunnel",
    name: "Carpal tunnel syndrome",
    area: "Wrist & hand",
    about: "Pressure on the median nerve at the wrist causes tingling, numbness or burning in the thumb, index and middle fingers, often worse at night or when gripping. Common in pregnancy, diabetes and with repetitive hand use.",
    selfCare: ["Wrist splint at night (keeps the wrist straight)", "Breaks from repetitive gripping/typing", "Shaking the hand out often helps symptoms"],
    seeDoctor: "If it's constant, you have weakness or wasting at the base of the thumb, or symptoms last more than a few weeks.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const w = at(c, ["wristPalm", "palm"]);
      if (!w.length) return s;
      located(s, w, 2);
      if (feels(w, NERVE)) s.add(4, "Tingling/numbness or burning");
      return s;
    },
  },
  {
    id: "wrist-tendinitis",
    name: "Wrist tendinitis / De Quervain's",
    area: "Wrist",
    about: "Irritated tendons around the wrist — often on the thumb side — causing pain with gripping, pinching, lifting a baby or twisting.",
    selfCare: ["Rest and a thumb/wrist splint", "Ice", "Avoid repetitive pinching and twisting"],
    seeDoctor: "If it doesn't settle in 2–4 weeks; steroid injections are very effective.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const w = at(c, ["wristPalm", "wristBack", "handBack"]);
      if (!located(s, w, 3)) return s;
      if (feels(w, ["Aching", "Sharp", "Tender to touch"])) s.add(1);
      if (feels(w, NERVE)) s.points -= 1.5;
      return s;
    },
  },
  {
    id: "hand-oa",
    name: "Hand osteoarthritis",
    area: "Hand",
    about: "Wear-related joint changes in the fingers and base of the thumb cause aching, morning stiffness (under 30 minutes) and bony knobbly joints. Common after 50.",
    selfCare: ["Warm water soaks for stiffness", "Hand exercises", "Anti-inflammatory gel, gadgets for jars"],
    seeDoctor: "If joints are hot and swollen, or stiffness lasts over an hour each morning (could be inflammatory arthritis).",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["palm", "handBack"]);
      if (!h.length) return s;
      located(s, h, 1.5);
      if (feels(h, ["Stiff"])) s.add(2.5, "Stiffness");
      if (c.q.age === "60+" || c.q.age === "40-59") s.add(1.5, "Common in your age group");
      if (c.q.duration === "months") s.add(1);
      return s;
    },
  },
  // ---------------- Chest
  {
    id: "cardiac",
    name: "Heart-related chest pain (must be ruled out)",
    area: "Chest",
    about: "Angina or a heart attack typically feels like pressure, tightness or heaviness in the chest that can spread to the left arm, jaw, neck or back, often with breathlessness, sweating or nausea. It can be subtle, especially in women and people with diabetes.",
    selfCare: ["Do not wait to see if it passes"],
    seeDoctor: "Call emergency services now if chest pain is new, crushing, spreading, or comes with breathlessness, sweating, nausea or faintness.",
    urgency: "emergency",
    score: (c) => {
      const s = new Score();
      const ch = at(c, ["chest", "abdUpper"]);
      if (!at(c, ["chest"]).length) return s;
      located(s, ch, 2.5);
      if (flag(c, "chestPressure")) s.add(6, "Pressure or tightness in the chest");
      if (flag(c, "breath")) s.add(4, "Breathless, sweaty or faint");
      if (at(c, ["upperArm", "shoulder", "neckFront"], "Left").length) s.add(3, "Pain also in the left arm/shoulder/neck");
      if (older(c)) s.add(1.5, "Higher risk age group");
      if (feels(ch, ["Tender to touch"]) && !flag(c, "chestPressure")) s.points -= 2;
      return s;
    },
  },
  {
    id: "chest-wall",
    name: "Chest wall strain / costochondritis",
    area: "Chest",
    about: "Inflammation where the ribs join the breastbone, or a strained chest muscle. Sharp or aching pain that's tender when you press on it and worse with deep breaths, twisting or certain arm movements.",
    selfCare: ["Painkillers or anti-inflammatories", "Heat", "Avoid heavy lifting and push-ups for a while"],
    seeDoctor: "Any new chest pain deserves a check, especially if you're over 40 or it's with breathlessness — get heart causes excluded first.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const ch = at(c, ["chest"]);
      if (!located(s, ch, 2.5)) return s;
      if (feels(ch, ["Tender to touch"])) s.add(4, "Tender when pressed");
      if (feels(ch, SHARP)) s.add(1.5, "Sharp quality");
      if (tagged(ch, ["overhead", "twist"])) s.add(1.5, "Changes with movement");
      if (flag(c, "chestPressure") || flag(c, "breath")) s.points -= 3;
      return s;
    },
  },
  // ---------------- Abdomen
  {
    id: "reflux",
    name: "Indigestion / acid reflux / gastritis",
    area: "Upper abdomen",
    about: "Stomach acid irritating the gullet or stomach lining causes burning in the upper tummy or behind the breastbone, often after meals, lying down, alcohol or anti-inflammatory painkillers.",
    selfCare: ["Smaller meals, not late at night", "Cut back alcohol, coffee, spicy/fatty food", "Antacids; avoid ibuprofen/aspirin", "Raise the head of the bed"],
    seeDoctor: "If it lasts over 3 weeks, or with trouble swallowing, vomiting, black stools, weight loss, or you're over 55 with new symptoms.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const u = at(c, ["abdUpper", "chest"]);
      if (!at(c, ["abdUpper"]).length && !feels(u, ["Burning"])) return s;
      located(s, u, 2);
      if (feels(u, ["Burning"])) s.add(4, "Burning quality");
      return s;
    },
  },
  {
    id: "gallbladder",
    name: "Gallstones / gallbladder inflammation",
    area: "Upper right abdomen",
    about: "Gallstones can block the gallbladder, causing intense cramping pain under the right ribs that may spread to the right shoulder blade, often after fatty meals and lasting from 30 minutes to hours. Fever suggests inflammation (cholecystitis).",
    selfCare: ["Avoid large fatty meals while waiting for assessment"],
    seeDoctor: "See a doctor soon. Get urgent care for pain lasting over a few hours, fever, yellow skin/eyes, or dark urine.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const ru = at(c, ["abdUpper"], "Right");
      if (!located(s, ru, 3.5)) return s;
      if (feels(ru, COLICKY)) s.add(2, "Cramping/sharp pain");
      if (at(c, ["upperBack", "shoulderBack", "midBack"], "Right").length) s.add(2, "Spreading to the right back/shoulder blade");
      if (flag(c, "fever")) s.add(2.5, "Fever");
      if (c.q.sex === "female") s.add(0.5);
      if (older(c)) s.add(0.5);
      return s;
    },
  },
  {
    id: "appendicitis",
    name: "Appendicitis (must be ruled out)",
    area: "Lower right abdomen",
    about: "Inflammation of the appendix. Pain often starts around the belly button then settles in the lower right abdomen, getting steadily worse over hours, worse with movement or coughing, often with loss of appetite, nausea or fever.",
    selfCare: ["Don't eat or take laxatives while waiting to be seen"],
    seeDoctor: "Get seen the same day (A&E/urgent care) for worsening lower-right abdominal pain, especially with fever or vomiting.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const rl = at(c, ["abdLower"], "Right");
      if (!rl.length) return s;
      located(s, rl, 3);
      if (peak(rl) >= 6) s.add(2, "Significant pain in the lower right");
      if (feels(rl, ["Sharp", "Stabbing", "Aching"])) s.add(1);
      if (c.q.onset === "sudden" || c.q.duration === "days") s.add(1.5, "Recent onset");
      if (flag(c, "fever")) s.add(2.5, "Fever");
      if (c.q.duration === "months") s.points -= 3;
      return s;
    },
  },
  {
    id: "ibs",
    name: "Gas, constipation or irritable bowel (IBS)",
    area: "Abdomen",
    about: "Cramping, bloating tummy pain that comes and goes, often eased by passing wind or opening the bowels, with changes in bowel habit. Very common and not dangerous, though it can be uncomfortable.",
    selfCare: ["Regular meals, fluids and fibre (oats, linseed)", "Peppermint oil capsules", "Gentle exercise; heat pack", "Note food triggers"],
    seeDoctor: "If you have blood in stools, weight loss, a persistent change in bowel habit (especially over 50), or pain waking you at night.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const a = at(c, ["abdLower", "abdUpper"]);
      if (!located(s, a, 2)) return s;
      if (feels(a, ["Cramping"])) s.add(3, "Cramping quality");
      if (sides(a) > 1) s.add(1.5, "Pain in more than one area of the tummy");
      if (c.q.duration === "months" || c.q.duration === "weeks") s.add(1);
      return s;
    },
  },
  {
    id: "abdominal-strain",
    name: "Abdominal muscle strain",
    area: "Abdomen",
    about: "A pulled abdominal wall muscle from lifting, sport, twisting or heavy coughing. Pain is tender to press, and worse sitting up, twisting or coughing, but not linked to eating or bowels.",
    selfCare: ["Rest from sport and lifting", "Ice for 48 hours then heat", "Painkillers"],
    seeDoctor: "If there's a bulge (possible hernia), fever, vomiting, or it's not improving in 2 weeks.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const a = at(c, ["abdLower", "abdUpper"]);
      if (!a.length) return s;
      located(s, a, 1.5);
      if (c.q.onset === "injury") s.add(3, "Started with an injury/strain");
      if (feels(a, ["Tender to touch"])) s.add(1.5, "Tender to press");
      if (tagged(a, ["flexion", "twist", "extension"])) s.add(2, "Hurts with trunk movement");
      return s;
    },
  },
  {
    id: "kidney-stone",
    name: "Kidney stone",
    area: "Flank",
    about: "A stone passing down from the kidney causes severe waves of pain in the side/back below the ribs (one side), often spreading to the lower abdomen or groin, with restlessness, nausea or blood in the urine.",
    selfCare: ["Drink plenty of water", "Painkillers (anti-inflammatories work well if safe for you)"],
    seeDoctor: "Get seen the same day for severe pain. Go urgently if you have fever, vomiting, or can't pass urine.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const flank = [
        ...at(c, ["midBack"]).filter((x) => x.side),
        ...at(c, ["lowBack"]).filter((x) => x.side && x.types.some((t) => COLICKY.includes(t))),
      ];
      if (!flank.length) return s;
      located(s, flank, 2);
      if (feels(flank, COLICKY)) s.add(2.5, "Colicky/stabbing pain");
      if (peak(flank) >= 7) s.add(2, "Severe intensity");
      const sd = flank[0].side;
      if (at(c, ["abdLower", "groin"], sd).length || at(c, ["groin"]).length) s.add(3, "Spreading towards the groin/lower tummy");
      if (c.q.onset === "sudden") s.add(1.5, "Sudden onset");
      if (c.q.onset === "injury") s.points -= 3;
      return s;
    },
  },
  {
    id: "kidney-infection",
    name: "Kidney infection (pyelonephritis)",
    area: "Flank",
    about: "A urine infection that has spread to a kidney: aching in the side/back below the ribs with fever, shivering, feeling unwell, and often burning or frequent urination.",
    selfCare: ["Drink fluids", "Paracetamol for fever"],
    seeDoctor: "Needs antibiotics — get seen today.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const flank = at(c, ["midBack", "lowBack"]);
      if (!flank.length || !flag(c, "fever")) return s;
      located(s, flank, 2);
      s.add(5, "Back/flank pain with fever");
      return s;
    },
  },
  {
    id: "pelvic-gyn",
    name: "Period pain or other gynaecological cause",
    area: "Lower abdomen / pelvis",
    about: "Cramping lower tummy or pelvic pain can come from periods, ovulation, endometriosis, ovarian cysts or pelvic infection. Severe one-sided pain with a missed period needs urgent checks for ectopic pregnancy.",
    selfCare: ["Heat pack, ibuprofen if safe", "Track pain against your cycle"],
    seeDoctor: "Go urgently for sudden severe one-sided pain, pain with a possible pregnancy, fainting, or fever. Book a GP visit for pain that disrupts life each month.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      if (c.q.sex !== "female") return s;
      const p = at(c, ["abdLower", "groin"]);
      if (!located(s, p, 2.5)) return s;
      if (feels(p, ["Cramping", "Aching"])) s.add(2, "Cramping/aching quality");
      return s;
    },
  },
  // ---------------- Back
  {
    id: "low-back-strain",
    name: "Non-specific low back pain (muscle/ligament strain)",
    area: "Lower back",
    about: "By far the most common cause of back pain: strained muscles, ligaments or joints with no serious underlying cause. Often follows lifting, bending or a long day of sitting. Most cases improve a lot within 2–6 weeks.",
    selfCare: ["Keep moving — bed rest slows recovery", "Heat, painkillers or anti-inflammatories", "Walking and gentle stretches (knee-to-chest, cat-cow)", "Return to normal activity gradually"],
    seeDoctor: "If pain is severe and not improving after 2–4 weeks, or you have numbness, leg weakness, fever, or problems with bladder/bowels (emergency).",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const b = at(c, ["lowBack", "midBack", "sacrum"]);
      if (!located(s, b, 4)) return s;
      if (feels(b, ["Aching", "Stiff", "Cramping"])) s.add(1.5, "Aching/stiff quality");
      if (tagged(b, ["flexion", "extension", "sidebend", "twist"])) s.add(2, "Hurts with bending or twisting");
      if (c.q.onset === "injury") s.add(1, "Started after lifting/strain");
      return s;
    },
  },
  {
    id: "cauda-equina",
    name: "Cauda equina syndrome (emergency)",
    area: "Lower back",
    about: "Severe compression of the bundle of nerves at the base of the spine. Warning signs are back pain or sciatica with numbness around the bottom/genitals, new bladder or bowel problems, or weakness in both legs. It needs emergency surgery to prevent permanent damage.",
    selfCare: ["Do not wait — this needs emergency assessment"],
    seeDoctor: "Go to A&E / call emergency services now.",
    urgency: "emergency",
    score: (c) => {
      const s = new Score();
      if (!flag(c, "bladder")) return s;
      const b = at(c, ["lowBack", "sacrum", "buttock", "hamstring", "calf"]);
      if (!b.length) return s;
      located(s, b, 3);
      s.add(8, "Bladder/bowel changes or numb groin with back/leg pain");
      return s;
    },
  },
  {
    id: "sciatica",
    name: "Sciatica (lumbar nerve root irritation)",
    area: "Lower back & leg",
    about: "Irritation of a nerve root in the lower back — often by a bulging disc — causes pain that shoots from the buttock down the back or side of the leg, sometimes to the foot, with tingling or numbness. Leg pain is often worse than back pain.",
    selfCare: ["Stay active and walk little and often", "Avoid long sitting", "Painkillers; heat on the back"],
    seeDoctor: "See a GP or physio if it's severe or lasts over 4–6 weeks. Emergency if you have leg weakness getting worse, numbness around the groin/bottom, or bladder/bowel changes.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const back = at(c, ["lowBack", "buttock", "sacrum"]);
      const leg = at(c, ["hamstring", "calf", "thighFront", "shin", "heel", "footTop", "achilles", "ankle"]);
      if (!back.length || !leg.length) return s;
      located(s, back, 2);
      s.add(2.5, `Pain spreading into the leg: ${describe(leg)}`);
      if (feels([...back, ...leg], NERVE)) s.add(4, "Shooting/tingling/burning (nerve-type) pain");
      const bs = new Set(back.map((x) => x.side));
      if (leg.some((x) => bs.has(x.side))) s.add(1, "Same side as the back pain");
      if (flag(c, "numbWeak")) s.add(1.5, "Numbness or weakness");
      return s;
    },
  },
  {
    id: "si-joint",
    name: "Sacroiliac (SI) joint pain",
    area: "Lower back / buttock",
    about: "The joints between the spine's base and the pelvis can become irritated, causing one-sided pain over the dimple at the top of the buttock, sometimes into the groin or thigh. Common in pregnancy and after falls.",
    selfCare: ["Avoid standing on one leg and long asymmetric postures", "Heat and gentle mobility", "Pelvic belt can help"],
    seeDoctor: "If it persists beyond 4–6 weeks, or with morning stiffness that eases with exercise (possible inflammatory back pain).",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const p = at(c, ["sacrum", "buttock"]);
      if (!located(s, p, 2.5)) return s;
      if (sides(p) === 1) s.add(1.5, "One-sided");
      if (feels(p, ["Aching", "Stiff"])) s.add(1);
      return s;
    },
  },
  {
    id: "piriformis",
    name: "Piriformis syndrome / deep gluteal pain",
    area: "Buttock",
    about: "A tight deep buttock muscle can irritate the sciatic nerve, causing deep buttock pain that may shoot down the back of the thigh, worse sitting for long or climbing stairs.",
    selfCare: ["Piriformis/figure-4 stretches", "Avoid sitting on a wallet; take sitting breaks", "Heat and massage"],
    seeDoctor: "If it persists or you get numbness or weakness.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const b = at(c, ["buttock"]);
      if (!located(s, b, 2.5)) return s;
      if (feels(b, NERVE)) s.add(2, "Shooting/tingling");
      if (!at(c, ["lowBack"]).length) s.add(1, "No low back pain");
      return s;
    },
  },
  {
    id: "upper-back-strain",
    name: "Upper back / postural muscle strain",
    area: "Upper back",
    about: "Aching or knotted muscles between the shoulder blades, often from desk work, phone use, carrying bags or sleeping position.",
    selfCare: ["Posture breaks and shoulder-blade squeezes", "Heat and massage", "Strengthening (rows, band pull-aparts)"],
    seeDoctor: "If pain is severe and unrelated to movement, comes with chest pain, breathlessness, fever or weight loss.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const u = at(c, ["upperBack", "shoulderBack"]);
      if (!located(s, u, 3.5)) return s;
      if (feels(u, ["Aching", "Stiff", "Tender to touch"])) s.add(1.5, "Aching/knotted quality");
      return s;
    },
  },
  // ---------------- Hip & groin
  {
    id: "hip-bursitis",
    name: "Outer hip pain (greater trochanteric pain syndrome)",
    area: "Hip",
    about: "Irritation of the tendons and bursa on the outside of the hip causes pain and tenderness there, worse lying on that side, climbing stairs or standing on one leg. Most common in women over 40.",
    selfCare: ["Avoid lying on that side; pillow between knees", "Don't cross legs or hang on one hip", "Ice, painkillers; glute strengthening"],
    seeDoctor: "If not improving after 6 weeks, or with fever or after a fall.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["hip"]);
      if (!located(s, h, 3.5)) return s;
      if (feels(h, ["Tender to touch", "Aching"])) s.add(1.5, "Tender/aching over the side of the hip");
      if (c.q.sex === "female" && older(c)) s.add(1, "Most common in women over 40");
      return s;
    },
  },
  {
    id: "hip-oa",
    name: "Hip osteoarthritis",
    area: "Hip / groin",
    about: "Wear-related changes in the hip joint cause groin or front-of-thigh ache (sometimes buttock or knee), stiffness after rest, and difficulty putting on shoes and socks. Usually over 50.",
    selfCare: ["Keep active — walking, cycling, swimming", "Strengthening exercises", "Weight loss if relevant", "Painkillers, walking stick in the opposite hand"],
    seeDoctor: "See your GP for assessment and a physio plan; earlier if it stops you sleeping or walking.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["groin", "hip", "thighFront"]);
      if (!at(c, ["groin", "hip"]).length) return s;
      located(s, h, 2);
      if (feels(h, ["Stiff"])) s.add(2, "Stiffness");
      if (tagged(h, ["hipFlex", "kneeLoad"])) s.add(1.5, "Hurts squatting or sitting");
      if (c.q.age === "60+") s.add(2, "Common over 60");
      else if (c.q.age === "40-59") s.add(1);
      if (younger(c)) s.points -= 2;
      return s;
    },
  },
  {
    id: "groin-strain",
    name: "Groin (adductor) or hip flexor strain",
    area: "Groin / front of hip",
    about: "A pulled muscle in the inner thigh or front of the hip, usually from sport (kicking, sprinting, changing direction). Pain on squeezing the knees together or lifting the knee.",
    selfCare: ["Rest from sport; ice for 48 hours", "Gentle stretching after the first few days", "Gradual strengthening before return"],
    seeDoctor: "If there's a lump or bulge, severe bruising, or it isn't better in 3–4 weeks.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const g = at(c, ["groin", "thighFront"]);
      if (!at(c, ["groin"]).length) return s;
      located(s, g, 2);
      if (c.q.onset === "injury") s.add(3, "Started with an injury");
      if (tagged(g, ["stride", "hipFlex"])) s.add(1.5, "Hurts with stride/hip bending");
      return s;
    },
  },
  {
    id: "inguinal-hernia",
    name: "Inguinal hernia",
    area: "Groin",
    about: "Part of the bowel or fat pushes through a weak spot in the groin, causing an ache or a bulge that's more obvious when standing, coughing or lifting, and may disappear lying down. Much more common in men.",
    selfCare: ["Avoid heavy lifting and straining until checked"],
    seeDoctor: "See a GP. Go urgently if the bulge becomes hard, very painful, or you vomit — it may be trapped.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const g = at(c, ["groin", "abdLower"]);
      if (!at(c, ["groin"]).length) return s;
      located(s, g, 2);
      if (feels(g, ["Aching"])) s.add(1);
      if (tagged(g, ["flexion"]) || c.q.onset === "gradual") s.add(1, "Worse with lifting/straining");
      if (c.q.sex === "male") s.add(1.5, "More common in men");
      return s;
    },
  },
  // ---------------- Thigh & knee
  {
    id: "hamstring-strain",
    name: "Hamstring strain",
    area: "Back of thigh",
    about: "A pulled muscle at the back of the thigh, usually a sudden sharp pain while sprinting or stretching, followed by tenderness and sometimes bruising.",
    selfCare: ["Rest, ice for 48 hours, compression", "Gentle walking as pain allows", "Gradual strengthening (bridges, then curls) before running"],
    seeDoctor: "If you felt a pop, can't walk normally, or there's extensive bruising.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["hamstring"]);
      if (!located(s, h, 3)) return s;
      if (feels(h, SHARP)) s.add(2, "Sharp pain");
      if (c.q.onset === "injury" || c.q.onset === "sudden") s.add(2.5, "Sudden onset during activity");
      if (feels(h, NERVE)) s.points -= 1.5;
      return s;
    },
  },
  {
    id: "quad-strain",
    name: "Thigh muscle (quadriceps) strain",
    area: "Front of thigh",
    about: "A pulled or bruised front-thigh muscle from kicking, sprinting or a direct knock.",
    selfCare: ["Rest, ice, compression", "Gentle stretching after a few days", "Gradual return to sport"],
    seeDoctor: "If there's a large, hard, painful swelling or you can't straighten the knee.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const t = at(c, ["thighFront"]);
      if (!located(s, t, 2.5)) return s;
      if (c.q.onset === "injury") s.add(2.5, "Started with an injury");
      if (feels(t, SHARP)) s.add(1);
      return s;
    },
  },
  {
    id: "meralgia",
    name: "Meralgia paresthetica (thigh nerve compression)",
    area: "Outer thigh",
    about: "Compression of a skin nerve at the hip causes burning, tingling or numbness over the outer front of the thigh — no weakness. Linked to tight belts, weight gain and pregnancy.",
    selfCare: ["Loose clothing and belts", "Weight loss if relevant"],
    seeDoctor: "If it persists or you develop weakness.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const t = at(c, ["thighFront"]);
      if (!t.length || !feels(t, NERVE)) return s;
      located(s, t, 2);
      s.add(3, "Burning/tingling over the thigh");
      return s;
    },
  },
  {
    id: "patellofemoral",
    name: "Patellofemoral pain (runner's knee)",
    area: "Knee",
    about: "Pain around or behind the kneecap, worse with squatting, stairs (especially down), kneeling, running, or after sitting with bent knees. Common in active younger adults.",
    selfCare: ["Reduce running/jumping load for a few weeks", "Hip and thigh strengthening (clams, step-downs, wall sits)", "Ice after activity"],
    seeDoctor: "If the knee swells, locks, gives way, or isn't improving after 6 weeks of exercises.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap"]);
      if (!located(s, k, 3)) return s;
      if (tagged(k, ["kneeLoad"])) s.add(3, "Hurts squatting, sitting or on stairs");
      if (feels(k, ["Aching"])) s.add(1, "Aching quality");
      if (younger(c)) s.add(1, "Common in your age group");
      if (c.q.onset === "gradual") s.add(1);
      if (k.some((x) => x.source === "map") && k.filter((x) => x.source === "map").every((x) => x.below)) s.points -= 2.5;
      return s;
    },
  },
  {
    id: "meniscus",
    name: "Meniscus irritation or tear",
    area: "Knee",
    about: "The knee's cartilage cushions can tear with a twist (younger people) or wear (older people). Pain along the joint line, swelling, catching or locking, worse twisting, squatting or pivoting.",
    selfCare: ["Rest, ice, compression and elevation", "Avoid deep squats and pivoting", "Crutches if it hurts to walk"],
    seeDoctor: "See a doctor or physio — urgently if the knee locks and won't straighten.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap", "kneeBack"]);
      if (!located(s, k, 2.5)) return s;
      if (feels(k, SHARP)) s.add(1.5, "Sharp pain");
      if (c.q.onset === "injury") s.add(2.5, "Started with a twist/injury");
      if (tagged(k, ["twist", "kneeLoad"])) s.add(1.5, "Hurts squatting/twisting");
      return s;
    },
  },
  {
    id: "knee-oa",
    name: "Knee osteoarthritis",
    area: "Knee",
    about: "Wear-related knee changes cause aching, stiffness after rest, creaking and sometimes swelling, worse with stairs and long walks. Common after 50.",
    selfCare: ["Strengthening exercises are the best treatment", "Keep active (cycling, swimming)", "Weight loss if relevant; anti-inflammatory gel"],
    seeDoctor: "See your GP for a plan, or sooner if the knee is hot, very swollen or giving way.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap", "kneeBack"]);
      if (!k.length) return s;
      located(s, k, 1.5);
      if (feels(k, ["Stiff", "Aching"])) s.add(1.5, "Stiff/aching");
      if (c.q.age === "60+") s.add(2.5, "Common over 60");
      else if (c.q.age === "40-59") s.add(1.5);
      if (c.q.duration === "months") s.add(1.5, "Long-standing");
      if (younger(c)) s.points -= 2;
      return s;
    },
  },
  {
    id: "bakers-cyst",
    name: "Baker's cyst",
    area: "Back of knee",
    about: "A fluid-filled swelling behind the knee, often linked to arthritis or a meniscus problem, causing tightness or aching that's worse fully bending or straightening.",
    selfCare: ["Treat the underlying knee problem", "Ice and rest"],
    seeDoctor: "See a doctor if the calf becomes swollen, red or painful — a burst cyst and a blood clot can look alike and need checking.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneeBack"]);
      if (!located(s, k, 3)) return s;
      if (feels(k, ["Aching", "Stiff"])) s.add(1);
      return s;
    },
  },
  // ---------------- Lower leg & foot
  {
    id: "dvt",
    name: "Blood clot in the leg (DVT) — must be ruled out",
    area: "Calf",
    about: "A deep vein clot causes calf pain or tenderness with swelling, warmth or redness, usually in one leg. Risk is higher after surgery, long flights, immobility, pregnancy, the pill, or cancer. A clot can travel to the lungs.",
    selfCare: ["Don't massage the calf"],
    seeDoctor: "Get seen the same day for a swollen, painful calf. Call emergency services if you become short of breath or have chest pain.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const calf = at(c, ["calf", "kneeBack", "shin"]);
      if (!calf.length) return s;
      if (flag(c, "swelling")) {
        located(s, calf, 3);
        s.add(6, "Swollen, red or warm leg");
      } else {
        located(s, at(c, ["calf"]), 1);
        if (c.q.onset !== "injury" && peak(calf) >= 6) s.add(1, "Significant calf pain without injury");
      }
      if (flag(c, "breath")) s.add(3, "Breathlessness");
      return s;
    },
  },
  {
    id: "calf-strain",
    name: "Calf muscle strain",
    area: "Calf",
    about: "A sudden sharp pain in the calf during push-off (running, jumping, tennis), like being kicked, followed by tightness and difficulty rising on tiptoe.",
    selfCare: ["Rest, ice, compression, elevation", "Heel raise in shoes for a few days", "Gentle calf raises once walking is comfortable"],
    seeDoctor: "If you can't walk, or the calf is swollen and red without a clear injury (rule out a clot).",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const k = at(c, ["calf"]);
      if (!located(s, k, 3)) return s;
      if (feels(k, SHARP)) s.add(1.5, "Sharp pain");
      if (c.q.onset === "injury" || c.q.onset === "sudden") s.add(2.5, "Sudden onset during activity");
      if (flag(c, "swelling")) s.points -= 1;
      return s;
    },
  },
  {
    id: "shin-splints",
    name: "Shin splints (medial tibial stress syndrome)",
    area: "Shin",
    about: "Aching along the inner edge of the shin bone from overload — new running, more mileage, hard surfaces. Pain at the start of exercise that may ease, then returns. Pinpoint bony pain could be a stress fracture.",
    selfCare: ["Cut running load; cross-train (bike, swim)", "Ice after exercise", "Check footwear; build up slowly (10% a week)"],
    seeDoctor: "If pain is in one exact spot on the bone, present at rest or at night (possible stress fracture).",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const sh = at(c, ["shin"]);
      if (!located(s, sh, 3)) return s;
      if (feels(sh, ["Aching", "Tender to touch"])) s.add(1.5, "Aching/tender along the shin");
      if (c.q.onset === "gradual") s.add(1);
      return s;
    },
  },
  {
    id: "ankle-sprain",
    name: "Ankle sprain",
    area: "Ankle",
    about: "Stretched or torn ligaments from rolling the ankle — usually on the outer side — with pain, swelling and bruising.",
    selfCare: ["Rest, ice, compression, elevation for 2–3 days", "Start walking as soon as you can, then balance exercises", "Ankle support for sport"],
    seeDoctor: "Get an X-ray if you can't take 4 steps, or there's bone tenderness at the ankle knobs or base of the 5th toe.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const a = at(c, ["ankle", "achilles"]);
      if (!located(s, a, 2.5)) return s;
      if (c.q.onset === "injury") s.add(3.5, "Started with a twist/injury");
      return s;
    },
  },
  {
    id: "achilles",
    name: "Achilles tendinopathy",
    area: "Back of ankle",
    about: "Overload of the Achilles tendon causes pain and stiffness at the back of the heel/ankle, typically worst first thing in the morning and at the start of exercise.",
    selfCare: ["Reduce running and hills", "Heel raises (slow, loaded) are the key treatment", "Supportive shoes; avoid going barefoot"],
    seeDoctor: "Urgently if you felt a sudden snap or 'kick' at the back of the ankle — possible rupture.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const a = at(c, ["achilles"]);
      if (!located(s, a, 3.5)) return s;
      if (feels(a, ["Stiff", "Aching"])) s.add(1.5, "Stiff/aching");
      if (c.q.onset === "gradual") s.add(1.5, "Gradual onset");
      return s;
    },
  },
  {
    id: "plantar-fasciitis",
    name: "Plantar fasciitis (heel pain)",
    area: "Heel",
    about: "Irritation of the thick band under the foot causes sharp heel pain, worst with the first steps in the morning or after resting, easing as you walk. Common with standing jobs, running and weight gain.",
    selfCare: ["Calf and foot stretches; roll a frozen bottle underfoot", "Cushioned, supportive shoes; avoid flat shoes and barefoot", "Heel pads/insoles"],
    seeDoctor: "If no better after 2–3 months of self-care, or with numbness, swelling or after an injury.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["heel"]);
      if (!located(s, h, 4)) return s;
      if (feels(h, ["Sharp", "Stabbing"])) s.add(1.5, "Sharp heel pain");
      if (c.q.onset === "gradual") s.add(1);
      return s;
    },
  },
  {
    id: "gout",
    name: "Gout",
    area: "Foot / joint",
    about: "Uric acid crystals cause a sudden, extremely painful, hot, red, swollen joint — classically the base of the big toe — often starting overnight. Triggers include alcohol, red meat, seafood and dehydration.",
    selfCare: ["Rest and raise the joint, ice", "Drink water; avoid alcohol"],
    seeDoctor: "See a doctor promptly for treatment — and urgently if you have a fever (an infected joint can look similar).",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const g = at(c, ["footTop", "ankle", "kneecap"]);
      if (!g.length) return s;
      located(s, g, 1.5);
      if (at(c, ["footTop"]).length) s.add(1.5, "Foot/toe location");
      if (peak(g) >= 7) s.add(1.5, "Severe intensity");
      if (feels(g, ["Burning", "Throbbing", "Tender to touch"])) s.add(1.5, "Burning/throbbing, very tender");
      if (c.q.onset === "sudden" || c.q.onset === "woke") s.add(2, "Sudden onset");
      if (c.q.onset === "injury") s.points -= 3;
      return s;
    },
  },
  // ---------------- Whole body
  {
    id: "fracture",
    name: "Possible fracture or significant injury",
    area: "Injured area",
    about: "After a fall or impact, severe pain, inability to bear weight or use the limb, swelling, bruising or deformity can mean a broken bone or serious ligament injury.",
    selfCare: ["Immobilise and support it; ice wrapped in a cloth", "Don't eat if surgery might be needed"],
    seeDoctor: "Go to urgent care or A&E for an X-ray.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      if (c.q.onset !== "injury") return s;
      const any = c.f;
      if (!any.length) return s;
      s.add(1, describe(any));
      if (flag(c, "cantBear")) s.add(4, "Can't bear weight or use it");
      if (flag(c, "deformity")) s.add(5, "Looks deformed");
      if (peak(any) >= 8) s.add(2, "Severe pain after injury");
      return s;
    },
  },
  {
    id: "neuropathy",
    name: "Peripheral neuropathy",
    area: "Hands / feet",
    about: "Damage to the small nerves — most often from diabetes, vitamin B12 deficiency, alcohol or some medicines — causes burning, tingling or numbness, typically in both feet and later the hands ('glove and stocking').",
    selfCare: ["Check feet daily for injuries", "Well-fitting shoes"],
    seeDoctor: "See your GP for blood tests (sugar, B12, thyroid) to find and treat the cause.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const ext = at(c, ["footTop", "heel", "palm", "handBack"]);
      if (!ext.length || !feels(ext, NERVE)) return s;
      located(s, ext, 1.5);
      s.add(2, "Burning/tingling in the hands or feet");
      if (sides(ext) > 1) s.add(3, "On both sides");
      return s;
    },
  },
  {
    id: "widespread",
    name: "Widespread pain (e.g. fibromyalgia)",
    area: "Many areas",
    about: "Long-lasting aching in many parts of the body, often with fatigue, poor sleep and tender spots. Fibromyalgia is a real, common condition; other causes such as thyroid problems or inflammatory conditions should be checked.",
    selfCare: ["Regular gentle exercise (walking, swimming)", "Sleep routine and pacing", "Stress management"],
    seeDoctor: "See your GP to check blood tests and discuss a management plan.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const locs = new Set(c.f.map((x) => x.loc));
      if (locs.size < 5) return s;
      s.add(locs.size * 0.7, `Pain in ${locs.size} different areas`);
      if (c.q.duration === "months") s.add(2.5, "Lasting months");
      if (feels(c.f, ["Aching", "Tender to touch"])) s.add(1);
      return s;
    },
  },
];

// ---------------------------------------------------------------- more conditions

const med = (fs: Finding[]) => fs.some((x) => x.medial);
const lat = (fs: Finding[]) => fs.some((x) => x.lateral);
const low = (fs: Finding[]) => fs.some((x) => x.below);
const hasMuscle = (fs: Finding[], ids: string[]) => fs.some((x) => x.muscles.some((m) => ids.includes(m)));

const MUSCLE_FOR: Record<string, string[]> = {
  "tension-headache": ["suboccipitals", "trapezius", "temporalis"],
  "neck-strain": ["levatorScapulae", "trapezius", "neckExtensors", "scm"],
  "rotator-cuff": ["supraspinatus", "infraspinatus", "deltoid"],
  "frozen-shoulder": ["supraspinatus", "infraspinatus"],
  "tennis-elbow": ["forearmExtensors", "brachioradialis"],
  "golfers-elbow": ["forearmFlexors"],
  "carpal-tunnel": ["thenar", "forearmFlexors"],
  "chest-wall": ["pecMajor", "intercostals"],
  "abdominal-strain": ["rectusAbdominis", "obliques"],
  "low-back-strain": ["erectorSpinae", "quadratusLumborum"],
  sciatica: ["piriformis", "erectorSpinae"],
  "si-joint": ["gluteMax", "gluteMed"],
  piriformis: ["piriformis", "gluteMax"],
  "upper-back-strain": ["rhomboids", "trapezius", "latissimus"],
  "hip-bursitis": ["gluteMed", "tfl", "itBand"],
  "groin-strain": ["adductors", "iliopsoas"],
  "hamstring-strain": ["hamstringLateral", "hamstringMedial"],
  "quad-strain": ["rectusFemoris", "vastusLateralis", "vastusMedialis"],
  patellofemoral: ["vastusMedialis", "vastusLateralis", "rectusFemoris"],
  "calf-strain": ["gastrocnemius", "soleus"],
  "shin-splints": ["tibialisAnterior", "soleus"],
  "ankle-sprain": ["peroneals"],
  achilles: ["achillesTendon", "soleus", "gastrocnemius"],
  "plantar-fasciitis": ["plantarFascia", "gastrocnemius"],
};

const MORE: Condition[] = [
  {
    id: "muscle-strain",
    name: "Muscle strain or trigger point",
    area: "Muscle",
    about: "",
    selfCare: [],
    seeDoctor: "If it's not easing after 2–3 weeks, there's major bruising or swelling, or you can't use the limb.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const fs = c.f.filter((x) => x.source === "map" && x.muscles.length && !x.types.some((t) => NERVE.includes(t)));
      if (!fs.length) return s;
      const top = [...fs].sort((a, b) => b.intensity - a.intensity)[0];
      const m = MUSCLE_BY_ID[top.muscles[0]];
      if (!m || m.tendon) return s;
      s.add(2.7 + top.intensity / 5, `${top.label}: over the ${m.name.toLowerCase()}`);
      if (feels(fs, ["Aching", "Stiff", "Tender to touch", "Cramping"])) s.add(1.5, "Muscular quality (aching, tight, tender)");
      if (c.q.onset === "injury") s.add(1.5, "Started with a strain");
      if (tagged(c.f, ["flexion", "overhead", "twist", "stride", "grip"])) s.add(0.5);
      s.meta = {
        name: `Strain or trigger point: ${m.name}`,
        about: `${m.name} — ${m.group.toLowerCase()}. It ${m.action.charAt(0).toLowerCase()}${m.action.slice(1)} ${m.pain} Common causes: ${m.causes.charAt(0).toLowerCase()}${m.causes.slice(1)}`,
        selfCare: [m.relief, "Heat for tight muscles; ice for a fresh strain in the first 48 hours", "Keep gently active rather than resting completely"],
        muscles: [m.id],
      };
      return s;
    },
  },
  // ------------- head & neck
  {
    id: "tmj",
    name: "Jaw joint disorder (TMJ / TMD)",
    area: "Jaw & temple",
    about: "Strain of the jaw joint and chewing muscles causes aching in front of the ear, cheek and temple, clicking, and pain chewing or opening wide. Often linked to clenching or grinding.",
    selfCare: ["Soft foods for a while; avoid gum and wide yawns", "Relax the jaw: teeth apart, tongue on the roof of the mouth", "Warm compress and gentle massage of the cheek and temple"],
    seeDoctor: "See a dentist or GP if it lasts more than a few weeks, the jaw locks, or you can't open your mouth fully.",
    urgency: "selfcare",
    muscles: ["temporalis"],
    score: (c) => {
      const s = new Score();
      const h = at(c, ["head"]);
      if (!flag(c, "jaw") && !hasMuscle(h, ["temporalis"])) return s;
      if (h.length) located(s, h, 1.5);
      if (flag(c, "jaw")) s.add(4.5, "Jaw pain or clicking when chewing");
      if (hasMuscle(h, ["temporalis"])) s.add(2, "Over the jaw/temple muscles");
      return s;
    },
  },
  {
    id: "cluster-headache",
    name: "Cluster headache",
    area: "Head (around one eye)",
    about: "Excruciating, stabbing pain around or behind one eye lasting 15 minutes to 3 hours, often at the same time each day for weeks, with a watery eye or blocked nostril on that side.",
    selfCare: ["High-flow oxygen and specific medicines work — see a doctor"],
    seeDoctor: "See a GP for diagnosis and treatment. Seek urgent help for a first-ever severe headache.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["head"]);
      if (!h.length || !feels(h, ["Stabbing", "Sharp", "Burning"]) || peak(h) < 8) return s;
      located(s, h, 1.5);
      s.add(3, "Severe stabbing/burning head pain");
      return s;
    },
  },
  {
    id: "occipital-neuralgia",
    name: "Occipital neuralgia",
    area: "Back of head",
    about: "Irritation of the nerves running from the top of the neck over the back of the scalp causes sharp, shooting or electric pains at the base of the skull and up the back of the head, with a tender scalp.",
    selfCare: ["Heat and massage at the base of the skull", "Posture breaks, chin tucks"],
    seeDoctor: "See a GP if it's frequent or severe — nerve blocks can help.",
    urgency: "doctor",
    muscles: ["suboccipitals"],
    score: (c) => {
      const s = new Score();
      const h = at(c, ["headBack"]);
      if (!h.length || !feels(h, ["Shooting", "Stabbing", "Burning", "Sharp"])) return s;
      located(s, h, 2);
      s.add(3, "Shooting/electric pain at the back of the head");
      return s;
    },
  },
  {
    id: "giant-cell-arteritis",
    name: "Giant cell arteritis (must be ruled out)",
    area: "Temples / head",
    about: "Inflammation of the arteries in the head, almost only in people over 50: a new headache (often at the temples), scalp tenderness, jaw pain when chewing, feeling unwell, sometimes vision problems. Untreated it can cause sudden blindness.",
    selfCare: ["Don't wait — needs same-day steroid treatment if suspected"],
    seeDoctor: "Get seen today. Go to A&E immediately for any change in vision.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["head", "headBack"]);
      if (!h.length || c.q.age !== "60+") return s;
      located(s, h, 1.5);
      s.add(1.5, "New headache over 60");
      if (c.q.duration === "days" || c.q.duration === "weeks") s.add(1.5, "Recent onset");
      if (flag(c, "jaw")) s.add(3, "Jaw pain when chewing");
      if (feels(h, ["Tender to touch"])) s.add(1.5, "Tender scalp");
      return s;
    },
  },
  {
    id: "whiplash",
    name: "Whiplash / neck sprain",
    area: "Neck",
    about: "A sudden jolt of the head — classically a rear-end car crash — strains the neck's muscles and ligaments, causing neck pain and stiffness that often comes on hours later, sometimes with headache and shoulder pain.",
    selfCare: ["Keep the neck gently moving; avoid a soft collar", "Painkillers and heat", "Gradually return to normal activities"],
    seeDoctor: "Urgently if you have numbness, weakness, severe pain, or were in a high-speed collision; otherwise if not improving in 2–3 weeks.",
    urgency: "doctor",
    muscles: ["scm", "trapezius", "neckExtensors"],
    score: (c) => {
      const s = new Score();
      const n = at(c, ["neck", "neckFront"]);
      if (!n.length || c.q.onset !== "injury") return s;
      located(s, n, 2);
      s.add(4, "Neck pain after an injury/jolt");
      return s;
    },
  },
  // ------------- shoulder & arm
  {
    id: "shoulder-dislocation",
    name: "Shoulder dislocation or fracture",
    area: "Shoulder",
    about: "After a fall or forceful movement the ball of the shoulder can pop out of the socket or a bone can break. Severe pain, the arm held still, a squared-off or deformed shoulder.",
    selfCare: ["Support the arm in a sling or against the body", "Don't try to put it back yourself"],
    seeDoctor: "Go to A&E now.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const sh = at(c, ["shoulder", "shoulderBack", "upperArm"]);
      if (!sh.length || c.q.onset !== "injury") return s;
      located(s, sh, 1.5);
      if (flag(c, "deformity")) s.add(5, "Looks deformed");
      if (flag(c, "cantBear")) s.add(3, "Can't use the arm");
      if (peak(sh) >= 8) s.add(1.5, "Severe pain after injury");
      return s;
    },
  },
  {
    id: "biceps-tendinopathy",
    name: "Biceps tendinopathy",
    area: "Front of shoulder",
    about: "Irritation of the long biceps tendon in its groove at the front of the shoulder: aching at the front of the shoulder, worse lifting, carrying or reaching overhead.",
    selfCare: ["Reduce lifting and overhead work", "Ice, painkillers, then gentle strengthening"],
    seeDoctor: "If a sudden pop is followed by a bulge in the upper arm (rupture), or no better in 6 weeks.",
    urgency: "selfcare",
    muscles: ["biceps"],
    score: (c) => {
      const s = new Score();
      const f = at(c, ["shoulder", "upperArm"]).filter((x) => x.source === "map");
      if (!f.length) return s;
      located(s, f, 2);
      if (hasMuscle(f, ["biceps"])) s.add(2, "Over the biceps");
      if (tagged(c.f, ["overhead", "grip"])) s.add(1.5, "Hurts lifting/reaching");
      return s;
    },
  },
  {
    id: "calcific-tendinitis",
    name: "Calcific tendinitis",
    area: "Shoulder",
    about: "Calcium deposits in a rotator-cuff tendon can suddenly become inflamed, causing very severe shoulder pain (often at night) that makes moving the arm almost impossible — without any injury.",
    selfCare: ["Ice, anti-inflammatories if safe, rest the arm"],
    seeDoctor: "See a GP; injections or other treatments work well.",
    urgency: "doctor",
    muscles: ["supraspinatus"],
    score: (c) => {
      const s = new Score();
      const sh = at(c, ["shoulder", "shoulderBack"]);
      if (!sh.length || peak(sh) < 7 || c.q.onset === "injury") return s;
      located(s, sh, 1.5);
      if (c.q.onset === "sudden" || c.q.onset === "woke") s.add(3, "Sudden severe pain without injury");
      return s;
    },
  },
  {
    id: "olecranon-bursitis",
    name: "Elbow bursitis",
    area: "Point of the elbow",
    about: "The fluid sac over the point of the elbow swells — a soft, squashy lump — after leaning on elbows, a knock, or sometimes gout or infection.",
    selfCare: ["Avoid leaning on the elbow; pad it", "Ice and compression"],
    seeDoctor: "Urgently if it's hot, red, very painful or you have a fever — it may be infected.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const e = at(c, ["elbowPoint"]);
      if (!e.length || !(flag(c, "swollenJoint") || flag(c, "bulge"))) return s;
      located(s, e, 2);
      s.add(4, "Swelling over the point of the elbow");
      if (flag(c, "fever")) s.add(1, "Fever — infection possible");
      return s;
    },
  },
  {
    id: "cubital-tunnel",
    name: "Ulnar nerve irritation (cubital tunnel)",
    area: "Inner elbow & hand",
    about: "Pressure on the 'funny bone' nerve at the inner elbow causes tingling and numbness in the ring and little fingers, worse with the elbow bent (phones, sleeping with arms bent), and later grip weakness.",
    selfCare: ["Avoid leaning on the inner elbow and long periods with it bent", "Wrap a towel loosely around the elbow at night to keep it straighter"],
    seeDoctor: "If symptoms are constant, you notice weakness or muscle wasting in the hand.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const e = at(c, ["elbowInner", "elbowPoint", "forearmFlexor"]);
      const hand = at(c, ["palm", "handBack", "wristPalm"]);
      if (!e.length || !feels([...e, ...hand], NERVE)) return s;
      located(s, e, 2);
      s.add(2.5, "Tingling/numbness around the elbow");
      if (hand.length) s.add(1.5, "Spreading into the hand");
      if (med(e)) s.add(1, "Inner side of the elbow");
      return s;
    },
  },
  {
    id: "trigger-finger",
    name: "Trigger finger",
    area: "Hand",
    about: "A thickened finger tendon catches in its sheath, so the finger clicks, sticks or locks bent, with a tender lump in the palm at the base of the finger.",
    selfCare: ["Rest from heavy gripping", "Gentle finger stretches; a night splint"],
    seeDoctor: "A steroid injection or a small procedure usually fixes it.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["palm", "handBack"]);
      if (!h.length || !flag(c, "locking")) return s;
      located(s, h, 2);
      s.add(4, "Finger catching or locking");
      return s;
    },
  },
  {
    id: "ganglion",
    name: "Ganglion cyst",
    area: "Wrist",
    about: "A harmless, smooth, fluid-filled lump, usually on the back of the wrist, that can ache or press on nearby structures. Often comes and goes.",
    selfCare: ["Leave it alone if it isn't troubling you", "Don't try to burst it"],
    seeDoctor: "If it's painful, growing, or you're not sure what the lump is.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const w = at(c, ["wristBack", "wristPalm", "handBack"]);
      if (!w.length || !flag(c, "bulge")) return s;
      located(s, w, 2);
      s.add(4, "A lump at the wrist");
      return s;
    },
  },
  {
    id: "scaphoid",
    name: "Wrist sprain or scaphoid fracture",
    area: "Wrist",
    about: "A fall on an outstretched hand can sprain the wrist or crack the small scaphoid bone on the thumb side. Scaphoid fractures are easy to miss and can heal badly if not treated.",
    selfCare: ["Support the wrist, ice, elevate"],
    seeDoctor: "Get an X-ray (same day or next day), especially if it's tender at the base of the thumb.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const w = at(c, ["wristPalm", "wristBack", "handBack", "palm"]);
      if (!w.length || c.q.onset !== "injury") return s;
      located(s, w, 2);
      s.add(3, "Wrist pain after a fall/injury");
      if (lat(w)) s.add(1.5, "Thumb side of the wrist");
      return s;
    },
  },
  // ------------- chest
  {
    id: "rib-injury",
    name: "Bruised or cracked rib",
    area: "Ribs",
    about: "A knock or fall onto the chest — or even heavy coughing — can bruise or crack a rib: sharp, localised pain that's worse breathing in, coughing or moving.",
    selfCare: ["Regular painkillers so you can breathe deeply and cough", "Take a few deep breaths every hour to prevent chest infection", "Hold a pillow against the chest to cough"],
    seeDoctor: "Urgently if you're short of breath, coughing blood, or develop a fever.",
    urgency: "doctor",
    muscles: ["intercostals"],
    score: (c) => {
      const s = new Score();
      const r = at(c, ["chest", "upperBack", "midBack", "abdUpper"]);
      if (!r.length || c.q.onset !== "injury") return s;
      located(s, r, 2);
      if (flag(c, "breathing")) s.add(3, "Worse breathing in or coughing");
      if (feels(r, SHARP)) s.add(1);
      return s;
    },
  },
  {
    id: "shingles",
    name: "Shingles",
    area: "A band on one side",
    about: "Reactivation of the chickenpox virus in a nerve: burning, tingling or stabbing pain in a strip on one side of the body, followed a few days later by a blistering rash in the same band.",
    selfCare: ["Keep the rash clean and covered", "Painkillers, loose clothing", "Avoid contact with pregnant women and babies until blisters crust"],
    seeDoctor: "See a GP within 3 days of the rash for antiviral treatment — urgently if it's near the eye.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      if (!flag(c, "rash") || !c.f.length) return s;
      s.add(2, describe(c.f));
      s.add(3, "Rash or blisters over the painful area");
      if (feels(c.f, ["Burning", "Tingling / numb", "Shooting"])) s.add(2, "Burning/nerve-type pain");
      if (sides(c.f) === 1) s.add(1, "One side only");
      return s;
    },
  },
  {
    id: "pleurisy",
    name: "Pleurisy or chest infection",
    area: "Chest",
    about: "Inflammation of the lining of the lungs — often with a chest infection — causes sharp chest or back pain that's worse breathing in or coughing, sometimes with fever, cough and breathlessness.",
    selfCare: ["Rest, fluids, painkillers so you can breathe deeply"],
    seeDoctor: "Get seen today, especially with fever, breathlessness or coughing up blood.",
    urgency: "urgent",
    muscles: ["intercostals"],
    score: (c) => {
      const s = new Score();
      const r = at(c, ["chest", "upperBack", "midBack"]);
      if (!r.length || !flag(c, "breathing") || c.q.onset === "injury") return s;
      located(s, r, 2);
      s.add(2.5, "Worse breathing in or coughing");
      if (flag(c, "fever")) s.add(3, "Fever");
      if (flag(c, "breath")) s.add(1.5, "Breathless");
      return s;
    },
  },
  {
    id: "pulmonary-embolism",
    name: "Blood clot in the lung (must be ruled out)",
    area: "Chest",
    about: "A clot (often from the leg) blocking a lung artery causes sudden breathlessness and sharp chest pain worse on breathing in, sometimes with a fast heartbeat, coughing blood or fainting.",
    selfCare: ["This is an emergency"],
    seeDoctor: "Call emergency services now.",
    urgency: "emergency",
    score: (c) => {
      const s = new Score();
      if (!flag(c, "breath")) return s;
      const ch = at(c, ["chest", "upperBack"]);
      if (!ch.length && !at(c, ["calf"]).length) return s;
      if (ch.length) located(s, ch, 2);
      if (flag(c, "breathing")) s.add(2, "Pain worse on breathing in");
      if (at(c, ["calf"]).length || flag(c, "swelling")) s.add(4, "Leg pain or swelling too");
      s.add(1.5, "Breathlessness");
      return s;
    },
  },
  // ------------- abdomen & pelvis
  {
    id: "diverticulitis",
    name: "Diverticulitis",
    area: "Lower left abdomen",
    about: "Inflamed or infected pouches in the bowel wall — usually over 40 — causing constant pain in the lower left abdomen, often with fever, feeling sick and a change in bowel habit.",
    selfCare: ["Clear fluids and rest while waiting to be seen"],
    seeDoctor: "See a doctor today if you have fever or severe pain; urgent care for bleeding or worsening pain.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const ll = at(c, ["abdLower"], "Left");
      if (!ll.length) return s;
      located(s, ll, 2.5);
      if (older(c)) s.add(1.5, "Common over 40");
      if (flag(c, "fever")) s.add(2.5, "Fever");
      if (feels(ll, ["Aching", "Cramping", "Tender to touch"])) s.add(1);
      return s;
    },
  },
  {
    id: "peptic-ulcer",
    name: "Stomach or duodenal ulcer",
    area: "Upper abdomen",
    about: "A sore in the stomach lining (often from H. pylori bacteria or anti-inflammatory painkillers) causing burning or gnawing upper-abdominal pain, sometimes eased or worsened by eating.",
    selfCare: ["Avoid ibuprofen, aspirin and alcohol", "Antacids for short-term relief"],
    seeDoctor: "See a GP for testing and treatment. Go urgently for black stools, vomiting blood, or sudden severe pain.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const u = at(c, ["abdUpper"]);
      if (!u.length) return s;
      located(s, u, 2);
      if (feels(u, ["Burning", "Aching"])) s.add(2, "Burning/gnawing pain");
      if (c.q.duration === "weeks" || c.q.duration === "months") s.add(1, "Ongoing");
      return s;
    },
  },
  {
    id: "pancreatitis",
    name: "Pancreatitis (must be ruled out)",
    area: "Upper abdomen & back",
    about: "Inflammation of the pancreas — often due to gallstones or alcohol — causing severe, constant upper-abdominal pain that bores through to the back, with vomiting.",
    selfCare: ["Don't eat or drink alcohol; seek care"],
    seeDoctor: "Go to A&E / urgent care now.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const u = at(c, ["abdUpper"]);
      if (!u.length || peak(u) < 7) return s;
      located(s, u, 2);
      if (at(c, ["midBack", "upperBack"]).length) s.add(3, "Boring through to the back");
      s.add(1, "Severe upper-abdominal pain");
      return s;
    },
  },
  {
    id: "uti",
    name: "Urinary tract infection (cystitis)",
    area: "Lower abdomen",
    about: "A bladder infection causing burning when passing urine, needing to go often and urgently, and lower-tummy aching. Much more common in women.",
    selfCare: ["Drink plenty of water", "Paracetamol or ibuprofen"],
    seeDoctor: "See a GP or pharmacist — antibiotics may be needed. Urgently if you have fever, back/flank pain or are pregnant.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      if (!flag(c, "urine")) return s;
      const p = at(c, ["abdLower", "groin"]);
      if (p.length) located(s, p, 2);
      s.add(4.5, "Burning or frequent urination");
      if (c.q.sex === "female") s.add(0.5);
      return s;
    },
  },
  {
    id: "testicular-torsion",
    name: "Testicular torsion (emergency)",
    area: "Groin",
    about: "A twisted testicle cuts off its own blood supply: sudden severe pain in the testicle, groin or lower abdomen, often with nausea. Most common in teenagers and young men. Surgery within hours saves the testicle.",
    selfCare: ["This is an emergency — don't wait"],
    seeDoctor: "Go to A&E immediately.",
    urgency: "emergency",
    score: (c) => {
      const s = new Score();
      if (c.q.sex !== "male") return s;
      const g = at(c, ["groin"]);
      if (!g.length || c.q.onset !== "sudden" || peak(g) < 6) return s;
      located(s, g, 3);
      s.add(4, "Sudden severe groin pain");
      if (younger(c)) s.add(1.5, "Most common in younger males");
      return s;
    },
  },
  {
    id: "ectopic-ovarian",
    name: "Ectopic pregnancy or ovarian torsion (must be ruled out)",
    area: "Lower abdomen (one side)",
    about: "Sudden, severe one-sided lower-abdominal or pelvic pain in someone who could be pregnant may be an ectopic pregnancy; a twisted ovary causes similar pain with vomiting. Both are emergencies.",
    selfCare: ["Do a pregnancy test if possible, but don't delay getting help"],
    seeDoctor: "Go to A&E now, especially with dizziness, fainting or shoulder-tip pain.",
    urgency: "emergency",
    score: (c) => {
      const s = new Score();
      if (c.q.sex !== "female" || c.q.age === "60+") return s;
      const p = at(c, ["abdLower", "groin"]).filter((x) => x.side);
      if (!p.length || c.q.onset !== "sudden" || peak(p) < 7) return s;
      located(s, p, 2.5);
      s.add(3, "Sudden severe one-sided pelvic pain");
      return s;
    },
  },
  {
    id: "hernia-abdominal",
    name: "Abdominal wall hernia",
    area: "Abdomen",
    about: "A bulge through a weak spot in the abdominal wall — around the belly button or an old scar — that aches, especially when lifting, coughing or standing.",
    selfCare: ["Avoid heavy lifting and straining until assessed"],
    seeDoctor: "See a GP. Go urgently if it becomes hard, very painful, red, or you start vomiting.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const a = at(c, ["abdUpper", "abdLower"]);
      if (!a.length || !flag(c, "bulge")) return s;
      located(s, a, 2);
      s.add(4, "A bulge in the tummy wall");
      return s;
    },
  },
  {
    id: "gastroenteritis",
    name: "Gastroenteritis (stomach bug)",
    area: "Abdomen",
    about: "A viral or food-related infection causing crampy tummy pain, diarrhoea and/or vomiting, sometimes with a mild fever. Usually settles within a few days.",
    selfCare: ["Small, frequent sips of fluid or rehydration solution", "Rest; eat bland food when you feel able", "Wash hands to avoid spreading it"],
    seeDoctor: "If you can't keep fluids down, have blood in vomit or stools, severe pain, or it lasts more than a week.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const a = at(c, ["abdLower", "abdUpper"]);
      if (!a.length || !flag(c, "fever")) return s;
      located(s, a, 1.5);
      if (feels(a, ["Cramping"])) s.add(2.5, "Crampy pain");
      if (sides(a) > 1) s.add(1, "Spread across the tummy");
      s.add(1, "Fever");
      return s;
    },
  },
  // ------------- back
  {
    id: "disc-herniation",
    name: "Lumbar disc bulge",
    area: "Lower back",
    about: "A bulging disc between the vertebrae can cause deep central low-back pain, worse sitting, bending forward, coughing or sneezing — and may irritate a nerve to cause sciatica.",
    selfCare: ["Walk little and often; limit long sitting", "Lie on your front or back with knees bent for relief", "Avoid heavy lifting for a few weeks"],
    seeDoctor: "If pain spreads below the knee with numbness/weakness, or isn't improving in 4–6 weeks. Emergency for bladder/bowel changes.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const b = at(c, ["lowBack", "sacrum"]);
      if (!b.length) return s;
      located(s, b, 1.5);
      if (flag(c, "sitting")) s.add(2, "Worse sitting");
      if (tagged(b, ["flexion"])) s.add(1.5, "Worse bending forward");
      if (flag(c, "breathing")) s.add(1, "Worse coughing");
      return s;
    },
  },
  {
    id: "spinal-stenosis",
    name: "Lumbar spinal stenosis",
    area: "Lower back & legs",
    about: "Age-related narrowing of the spinal canal squeezes the nerves, causing heaviness, aching or tingling in the buttocks and legs when standing or walking, eased by sitting or leaning forward (pushing a trolley helps).",
    selfCare: ["Exercise that bends you forward (cycling) is often easier", "Use a walking aid or rest breaks"],
    seeDoctor: "See a GP for assessment; urgently with leg weakness or bladder/bowel changes.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      if (!older(c)) return s;
      const b = at(c, ["lowBack", "buttock", "hamstring", "calf", "thighFront"]);
      if (!b.length || !flag(c, "walking")) return s;
      located(s, b, 2);
      s.add(3.5, "Leg symptoms with walking, eased by rest");
      if (c.q.age === "60+") s.add(1.5, "Most common over 60");
      return s;
    },
  },
  {
    id: "axial-spa",
    name: "Inflammatory back pain (axial spondyloarthritis)",
    area: "Lower back & buttocks",
    about: "An inflammatory condition starting before 45: low-back and buttock pain with marked morning stiffness lasting over 30–60 minutes, better with exercise and worse with rest, often waking you in the second half of the night.",
    selfCare: ["Daily stretching and exercise help a lot"],
    seeDoctor: "See a GP and ask about a rheumatology referral — effective treatments exist.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const b = at(c, ["lowBack", "sacrum", "buttock"]);
      if (!b.length || !flag(c, "morningStiff")) return s;
      located(s, b, 2);
      s.add(3, "Long morning stiffness");
      if (younger(c)) s.add(1.5, "Usually starts before 45");
      if (c.q.duration === "months") s.add(1.5, "Lasting months");
      if (flag(c, "sitting")) s.add(1, "Better with movement");
      return s;
    },
  },
  {
    id: "compression-fracture",
    name: "Spinal compression fracture",
    area: "Mid / low back",
    about: "In people with thin bones (osteoporosis), a vertebra can collapse after a minor fall, lifting or even coughing, causing sudden sharp back pain that's worse standing and moving.",
    selfCare: ["Painkillers and gentle movement; avoid lifting"],
    seeDoctor: "See a doctor promptly for an X-ray and bone health check.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const b = at(c, ["midBack", "lowBack", "upperBack"]);
      if (!b.length || c.q.age !== "60+") return s;
      located(s, b, 1.5);
      if (c.q.onset === "sudden" || c.q.onset === "injury") s.add(3, "Sudden onset at an older age");
      if (c.q.sex === "female") s.add(1, "Osteoporosis is more common in women");
      return s;
    },
  },
  {
    id: "facet-joint",
    name: "Facet joint pain",
    area: "Lower back",
    about: "The small joints at the back of the spine can become irritated or arthritic, causing aching just to one or both sides of the spine, worse leaning back, twisting or standing for long, and stiff in the morning.",
    selfCare: ["Knee-to-chest and gentle flexion stretches", "Heat; avoid long standing and arching back"],
    seeDoctor: "If it persists beyond 6 weeks despite exercise.",
    urgency: "selfcare",
    muscles: ["erectorSpinae", "quadratusLumborum"],
    score: (c) => {
      const s = new Score();
      const b = at(c, ["lowBack"]);
      if (!b.length) return s;
      located(s, b, 1.5);
      if (tagged(b, ["extension", "twist"])) s.add(3, "Worse leaning back or twisting");
      if (older(c)) s.add(0.5);
      return s;
    },
  },
  {
    id: "coccydynia",
    name: "Tailbone pain (coccydynia)",
    area: "Tailbone",
    about: "Pain at the very bottom of the spine, worse sitting (especially leaning back) and standing up from sitting. Often after a fall onto the bottom, childbirth, or long sitting on hard seats.",
    selfCare: ["Wedge or U-shaped cushion", "Lean forward when sitting; avoid hard seats", "Painkillers, ice or heat"],
    seeDoctor: "If it lasts more than a few weeks or follows a hard fall.",
    urgency: "selfcare",
    muscles: ["gluteMax"],
    score: (c) => {
      const s = new Score();
      const t = at(c, ["sacrum"]);
      if (!t.length) return s;
      located(s, t, 2);
      if (flag(c, "sitting")) s.add(3, "Worse sitting");
      if (c.q.onset === "injury") s.add(1.5, "After a fall");
      return s;
    },
  },
  // ------------- hip
  {
    id: "hip-labral",
    name: "Hip labral tear / impingement (FAI)",
    area: "Groin / front of hip",
    about: "In active younger adults, extra bone at the hip joint or a tear of the cartilage rim causes deep groin pain with clicking or catching, worse sitting low, squatting, or bringing the knee to the chest.",
    selfCare: ["Avoid deep squats and long low sitting", "Physio-led hip strengthening"],
    seeDoctor: "See a GP or sports physio if it's persistent or catching.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["groin", "hip"]);
      if (!h.length) return s;
      located(s, h, 1.5);
      if (flag(c, "locking")) s.add(2.5, "Clicking or catching");
      if (tagged(c.f, ["hipFlex", "kneeLoad"])) s.add(1.5, "Hurts with deep hip bending");
      if (younger(c)) s.add(1, "Common in active younger adults");
      return s;
    },
  },
  {
    id: "hip-fracture",
    name: "Hip fracture (must be ruled out)",
    area: "Hip / groin",
    about: "In older adults, a fall onto the hip can break the top of the thigh bone: groin or hip pain, difficulty or inability to walk, and sometimes a shortened, outward-turned leg.",
    selfCare: ["Don't try to walk on it; keep warm and still"],
    seeDoctor: "Call an ambulance / go to A&E.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      const h = at(c, ["hip", "groin", "thighFront", "buttock"]);
      if (!h.length || c.q.onset !== "injury" || !older(c)) return s;
      located(s, h, 2);
      if (c.q.age === "60+") s.add(2, "Fall at an older age");
      if (flag(c, "cantBear")) s.add(4, "Can't bear weight");
      return s;
    },
  },
  // ------------- knee
  {
    id: "acl",
    name: "ACL (cruciate ligament) injury",
    area: "Knee",
    about: "A twisting injury — often landing or changing direction in sport — with a pop, rapid swelling within hours, and the knee feeling unstable or giving way.",
    selfCare: ["Rest, ice, compression, elevation", "Crutches if it hurts to walk"],
    seeDoctor: "See a doctor or sports physio within days; urgently if the knee is locked or very swollen.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap", "kneeBack"]);
      if (!k.length || c.q.onset !== "injury") return s;
      located(s, k, 1.5);
      if (flag(c, "pop")) s.add(3, "Felt a pop");
      if (flag(c, "swollenJoint")) s.add(2, "Swelling");
      if (flag(c, "locking")) s.add(1.5, "Gives way");
      return s;
    },
  },
  {
    id: "mcl",
    name: "MCL (inner knee ligament) sprain",
    area: "Inner knee",
    about: "A blow to the outside of the knee or a twist stretches the ligament on the inner side, causing inner-knee pain and tenderness along the joint.",
    selfCare: ["Rest, ice, compression; a hinged brace for bigger sprains", "Gentle bending and straightening as pain allows"],
    seeDoctor: "If you can't bear weight, it's very unstable, or not improving in 2–3 weeks.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap"]);
      if (!k.length || c.q.onset !== "injury" || !med(k)) return s;
      located(s, k, 2);
      s.add(3, "Inner-knee pain after an injury");
      return s;
    },
  },
  {
    id: "patellar-tendinopathy",
    name: "Patellar tendinopathy (jumper's knee)",
    area: "Below the kneecap",
    about: "Overload of the tendon just below the kneecap causes pain there, worse jumping, squatting, stairs and after sitting. Common in basketball, volleyball and running.",
    selfCare: ["Reduce jumping and deep squats", "Isometric wall sits (hold 30–45 s, ×5) for pain relief", "Patellar strap; slow, heavy strengthening"],
    seeDoctor: "If no better after 6–12 weeks of load management.",
    urgency: "selfcare",
    muscles: ["patellarTendon", "rectusFemoris"],
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap"]).filter((x) => x.source === "map");
      if (!k.length || !low(k)) return s;
      located(s, k, 2);
      s.add(3.5, "Just below the kneecap");
      if (tagged(c.f, ["kneeLoad"]) || flag(c, "running")) s.add(2, "Loading the knee hurts");
      if (c.q.age === "u18") s.points -= 1;
      return s;
    },
  },
  {
    id: "osgood",
    name: "Osgood-Schlatter disease",
    area: "Below the kneecap",
    about: "In active children and teenagers during growth spurts, the tendon pulls on the growth plate just below the knee, causing a tender, sometimes bony bump that hurts with running, jumping and kneeling.",
    selfCare: ["Reduce running/jumping to a tolerable level", "Ice after sport; knee pads for kneeling", "Quad and hamstring stretches"],
    seeDoctor: "If it's very painful, swollen, or the knee locks or gives way.",
    urgency: "selfcare",
    muscles: ["patellarTendon"],
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap"]);
      if (!k.length || c.q.age !== "u18" || !low(k)) return s;
      located(s, k, 2);
      s.add(4, "Below the kneecap in a young person");
      return s;
    },
  },
  {
    id: "itb-syndrome",
    name: "Iliotibial band syndrome",
    area: "Outer knee",
    about: "Friction and compression where the IT band crosses the outer knee causes sharp outer-knee pain during running — often starting at a predictable distance, and worse downhill.",
    selfCare: ["Reduce running distance and downhill running", "Hip/glute strengthening (side planks, clams)", "Foam roll the outer thigh muscles gently"],
    seeDoctor: "If it doesn't improve after 4–6 weeks of changes.",
    urgency: "selfcare",
    muscles: ["itBand", "tfl", "gluteMed"],
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap", "thighFront", "hamstring"]);
      if (!k.length) return s;
      const outer = k.filter((x) => x.lateral || x.muscles.includes("itBand"));
      if (!outer.length) return s;
      located(s, outer, 2);
      s.add(2.5, "Outer side of the knee/thigh");
      if (flag(c, "running")) s.add(2, "Started with running");
      return s;
    },
  },
  {
    id: "pes-anserine-bursitis",
    name: "Pes anserine bursitis",
    area: "Inner knee",
    about: "Inflammation of the tendons/bursa on the inner side of the shin just below the knee causes inner-knee tenderness, worse on stairs, standing up and at night. Common with knee arthritis and in runners.",
    selfCare: ["Ice, pillow between the knees in bed", "Hamstring and quad stretches; reduce stairs"],
    seeDoctor: "If no better in 4–6 weeks; injections can help.",
    urgency: "selfcare",
    muscles: ["pesAnserine", "hamstringMedial", "sartorius"],
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap"]).filter((x) => x.source === "map");
      if (!k.length || !med(k)) return s;
      located(s, k, 2);
      s.add(2, "Inner side of the knee");
      if (low(k)) s.add(1.5, "Just below the joint");
      if (older(c)) s.add(1);
      if (c.q.onset === "injury") s.points -= 2;
      return s;
    },
  },
  {
    id: "prepatellar-bursitis",
    name: "Kneecap bursitis (housemaid's knee)",
    area: "Front of knee",
    about: "Swelling of the fluid sac in front of the kneecap from kneeling or a knock — a soft swelling over the kneecap that's sore to kneel on.",
    selfCare: ["Avoid kneeling; use knee pads", "Ice and compression"],
    seeDoctor: "Urgently if it's hot, red and you feel unwell — it may be infected.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const k = at(c, ["kneecap"]);
      if (!k.length || !(flag(c, "bulge") || flag(c, "swollenJoint"))) return s;
      located(s, k, 2);
      s.add(3, "Swelling over the kneecap");
      return s;
    },
  },
  {
    id: "septic-arthritis",
    name: "Infected or acutely inflamed joint (must be ruled out)",
    area: "A single joint",
    about: "A hot, swollen, very painful joint with fever can be a joint infection — a medical emergency that can destroy the joint within days. Gout can look similar.",
    selfCare: ["Don't wait it out"],
    seeDoctor: "Go to A&E / urgent care today.",
    urgency: "urgent",
    score: (c) => {
      const s = new Score();
      if (!flag(c, "swollenJoint") || !flag(c, "fever")) return s;
      const j = at(c, ["kneecap", "kneeBack", "ankle", "hip", "groin", "elbowPoint", "elbowInner", "wristPalm", "wristBack", "shoulder", "footTop"]);
      if (!j.length) return s;
      located(s, j, 2);
      s.add(6, "Swollen joint with fever");
      return s;
    },
  },
  // ------------- lower leg & foot
  {
    id: "stress-fracture",
    name: "Stress fracture",
    area: "Shin / foot",
    about: "A tiny crack in a bone from repeated loading — after a jump in running or marching. Pinpoint bone pain that worsens with activity and later at rest or at night.",
    selfCare: ["Stop the impact activity; switch to cycling or swimming"],
    seeDoctor: "See a doctor for imaging — continuing to run can make it worse.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const b = at(c, ["shin", "footTop", "heel"]);
      if (!b.length || !(flag(c, "running") || c.q.onset === "gradual")) return s;
      located(s, b, 1.5);
      if (feels(b, ["Tender to touch"])) s.add(1.5, "Pinpoint tenderness");
      if (flag(c, "running")) s.add(1.5, "After more running/exercise");
      if (peak(b) >= 6) s.add(1, "Significant pain");
      return s;
    },
  },
  {
    id: "compartment",
    name: "Compartment syndrome (must be ruled out)",
    area: "Lower leg / forearm",
    about: "After a crush, fracture or tight cast, rising pressure inside a muscle compartment causes severe pain out of proportion to the injury, a tight swollen limb and pain on stretching the muscles. Needs emergency surgery.",
    selfCare: ["Loosen anything tight; don't elevate high"],
    seeDoctor: "Go to A&E immediately.",
    urgency: "emergency",
    score: (c) => {
      const s = new Score();
      const l = at(c, ["shin", "calf", "forearmFlexor", "forearmExtensor", "thighFront"]);
      if (!l.length || c.q.onset !== "injury" || peak(l) < 9 || !flag(c, "swelling")) return s;
      located(s, l, 2);
      s.add(5, "Severe pain and swelling after an injury");
      return s;
    },
  },
  {
    id: "cramps",
    name: "Muscle cramps",
    area: "Calf / foot / thigh",
    about: "Sudden, painful tightening of a muscle — often the calf at night — lasting seconds to minutes. Linked to exercise, dehydration, pregnancy, some medicines and age.",
    selfCare: ["Stretch the muscle (pull toes towards you) and massage", "Calf stretches before bed; stay hydrated"],
    seeDoctor: "If frequent, severe, or with swelling, numbness or weakness.",
    urgency: "selfcare",
    muscles: ["gastrocnemius", "hamstringLateral"],
    score: (c) => {
      const s = new Score();
      const m = at(c, ["calf", "hamstring", "footTop", "heel", "thighFront"]);
      if (!m.length || !feels(m, ["Cramping"])) return s;
      located(s, m, 2);
      s.add(3, "Cramping quality");
      return s;
    },
  },
  {
    id: "claudication",
    name: "Poor leg circulation (claudication)",
    area: "Calf / buttock",
    about: "Narrowed leg arteries (peripheral arterial disease) cause cramping calf, thigh or buttock pain when walking that goes away with a few minutes' rest. Smoking and diabetes are major risks.",
    selfCare: ["Stop smoking; supervised walking exercise helps a lot"],
    seeDoctor: "See a GP for checks (pulses, blood pressure, cholesterol, sugar). Urgently if the foot is cold, pale, numb or painful at rest.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const l = at(c, ["calf", "buttock", "hamstring", "thighFront"]);
      if (!l.length || !flag(c, "walking")) return s;
      located(s, l, 2);
      s.add(3, "Pain walking, eased by rest");
      if (at(c, ["calf"]).length) s.add(1, "In the calf");
      if (older(c)) s.add(1);
      return s;
    },
  },
  {
    id: "achilles-rupture",
    name: "Achilles tendon rupture",
    area: "Back of ankle",
    about: "A sudden snap at the back of the ankle — like being kicked — during push-off, then weakness pushing up on tiptoe and walking flat-footed. Most common in 30–50-year-old weekend athletes.",
    selfCare: ["Don't walk on it more than necessary; point the toes down"],
    seeDoctor: "Go to A&E / urgent care today.",
    urgency: "urgent",
    muscles: ["achillesTendon", "gastrocnemius"],
    score: (c) => {
      const s = new Score();
      const a = at(c, ["achilles", "calf", "heel"]);
      if (!a.length || !flag(c, "pop")) return s;
      located(s, a, 2);
      s.add(5, "Felt a snap at the back of the leg");
      return s;
    },
  },
  {
    id: "mortons-neuroma",
    name: "Morton's neuroma",
    area: "Ball of the foot / toes",
    about: "A thickened nerve between the toes (usually 3rd and 4th) causes burning, tingling or the feeling of standing on a pebble, worse in tight or high-heeled shoes.",
    selfCare: ["Wide, low-heeled shoes", "Metatarsal pads; rest and massage the foot"],
    seeDoctor: "If it persists — injections or insoles can help.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const f = at(c, ["footTop"]);
      if (!f.length || !feels(f, NERVE)) return s;
      located(s, f, 2);
      s.add(3, "Burning/tingling in the forefoot");
      if (sides(f) === 1) s.add(1, "One foot");
      return s;
    },
  },
  {
    id: "bunion",
    name: "Bunion (hallux valgus)",
    area: "Big toe",
    about: "The big toe angles towards the others and a bony bump forms on the inner side of the foot, which rubs in shoes and can ache.",
    selfCare: ["Wide shoes with a deep toe box", "Bunion pads; toe spacers"],
    seeDoctor: "If pain stops you walking comfortably despite footwear changes.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      const f = at(c, ["footTop"]);
      if (!f.length || !flag(c, "bulge")) return s;
      located(s, f, 2);
      s.add(2.5, "A bump on the foot");
      if (med(f)) s.add(1.5, "Inner side (big-toe side)");
      return s;
    },
  },
  {
    id: "severs",
    name: "Sever's disease",
    area: "Heel",
    about: "Heel pain in active children aged about 8–14: irritation of the heel's growth plate, worse with running and jumping.",
    selfCare: ["Reduce running/jumping", "Heel cushions, calf stretches, ice after sport"],
    seeDoctor: "If pain is severe, at night, or with swelling or a limp.",
    urgency: "selfcare",
    muscles: ["achillesTendon"],
    score: (c) => {
      const s = new Score();
      const h = at(c, ["heel", "achilles"]);
      if (!h.length || c.q.age !== "u18") return s;
      located(s, h, 2);
      s.add(4, "Heel pain in a young person");
      return s;
    },
  },
  {
    id: "tarsal-tunnel",
    name: "Tarsal tunnel syndrome",
    area: "Inner ankle & sole",
    about: "Compression of the nerve behind the inner ankle bone causes burning, tingling or numbness on the sole and inner ankle, worse standing or walking for long.",
    selfCare: ["Supportive shoes or insoles", "Rest and ice"],
    seeDoctor: "If symptoms persist or you notice numbness or weakness.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const a = at(c, ["ankle", "achilles", "heel"]);
      if (!a.length || !feels(a, NERVE)) return s;
      located(s, a, 2);
      s.add(2.5, "Burning/tingling around the ankle or sole");
      if (med(a)) s.add(1.5, "Inner side of the ankle");
      return s;
    },
  },
  // ------------- whole body
  {
    id: "pmr",
    name: "Polymyalgia rheumatica",
    area: "Shoulders & hips",
    about: "An inflammatory condition in people over 50 causing pain and marked stiffness in both shoulders and upper arms, and often hips and thighs — worst in the morning — sometimes with tiredness and low mood. Responds dramatically to steroids.",
    selfCare: ["Keep moving gently"],
    seeDoctor: "See a GP soon for blood tests. Same day if you also have headache, jaw pain or vision problems.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      if (!older(c)) return s;
      const sh = at(c, ["shoulder", "shoulderBack", "upperArm", "upperArmBack", "neck"]);
      const hp = at(c, ["hip", "buttock", "thighFront", "groin"]);
      if (!sh.length) return s;
      located(s, sh, 1.5);
      if (sides(sh) > 1) s.add(2, "Both shoulders");
      if (hp.length) s.add(1.5, "Hips/thighs too");
      if (flag(c, "morningStiff")) s.add(3, "Long morning stiffness");
      if (c.q.age === "60+") s.add(1);
      return s;
    },
  },
  {
    id: "rheumatoid",
    name: "Rheumatoid or inflammatory arthritis",
    area: "Hands, wrists & feet",
    about: "An autoimmune arthritis causing painful, swollen, stiff joints — typically the small joints of both hands, wrists and feet — with morning stiffness over an hour and tiredness. Early treatment prevents joint damage.",
    selfCare: ["Keep joints moving; warm water for morning stiffness"],
    seeDoctor: "See a GP soon for blood tests and a rheumatology referral.",
    urgency: "doctor",
    score: (c) => {
      const s = new Score();
      const j = at(c, ["palm", "handBack", "wristPalm", "wristBack", "footTop", "ankle"]);
      if (!j.length) return s;
      located(s, j, 1.5);
      if (sides(j) > 1) s.add(2, "Both sides of the body");
      if (flag(c, "morningStiff")) s.add(2.5, "Long morning stiffness");
      if (flag(c, "swollenJoint")) s.add(2, "Swollen joints");
      return s;
    },
  },
  {
    id: "viral-myalgia",
    name: "Viral illness (flu-like aches)",
    area: "Many areas",
    about: "Flu, COVID and other viral infections commonly cause aching muscles in many places, with fever, tiredness and headache. Usually settles within a week.",
    selfCare: ["Rest, fluids, paracetamol or ibuprofen", "Stay home to avoid spreading it"],
    seeDoctor: "If you're breathless, very unwell, have a stiff neck or rash, or aren't improving after a week.",
    urgency: "selfcare",
    score: (c) => {
      const s = new Score();
      if (!flag(c, "fever")) return s;
      const locs = new Set(c.f.map((x) => x.loc));
      if (locs.size < 3) return s;
      s.add(2 + locs.size * 0.5, `Aches in ${locs.size} areas with fever`);
      if (feels(c.f, ["Aching"])) s.add(1);
      return s;
    },
  },
];

for (const cond of CONDITIONS) if (!cond.muscles && MUSCLE_FOR[cond.id]) cond.muscles = MUSCLE_FOR[cond.id];

export const ALL_CONDITIONS: Condition[] = [...CONDITIONS, ...MORE];

// ---------------------------------------------------------------- triage

export type Triage = { level: Urgency; title: string; message: string; reasons: string[] };

export function triage(findings: Finding[], q: Intake): Triage {
  const c: Ctx = { f: findings, q };
  const has = (locs: string[]) => at(c, locs).length > 0;
  const reasons: string[] = [];
  let level = "selfcare" as Urgency;
  const raise = (l: Urgency, why: string) => {
    const order: Urgency[] = ["selfcare", "doctor", "urgent", "emergency"];
    if (order.indexOf(l) > order.indexOf(level)) level = l;
    reasons.push(why);
  };

  const chest = has(["chest"]);
  if ((flag(c, "chestPressure") || flag(c, "breath")) && (chest || has(["abdUpper", "upperArm", "shoulder", "neckFront", "upperBack"])))
    raise("emergency", "Chest pressure or breathlessness with upper-body pain can be a heart attack");
  else if (flag(c, "chestPressure")) raise("emergency", "Chest pressure needs emergency assessment");
  if (flag(c, "worstHeadache")) raise("emergency", "A sudden worst-ever headache can be a bleed on the brain");
  if (flag(c, "bladder")) raise("emergency", "Bladder/bowel changes or a numb groin can mean nerve compression (cauda equina)");
  if (flag(c, "numbWeak")) {
    if (has(["head", "headBack", "neck"]) || !findings.length) raise("emergency", "New weakness or numbness can be a stroke — act FAST");
    else raise("urgent", "New numbness or weakness needs prompt assessment");
  }
  if (flag(c, "breath") && has(["calf"])) raise("emergency", "Breathlessness with calf pain can mean a clot in the lung");

  if (chest && (level as Urgency) !== "emergency") {
    const tender = feels(at(c, ["chest"]), ["Tender to touch"]);
    if (!tender || peak(at(c, ["chest"])) >= 6) raise("urgent", "New chest pain should be checked promptly to exclude heart causes");
    else raise("doctor", "Chest pain — even if it seems muscular — is worth getting checked");
  }
  if (flag(c, "fever") && has(["lowBack", "midBack", "abdLower", "abdUpper", "neck"]))
    raise("urgent", "Fever with back, abdominal or neck pain may mean infection");
  if (flag(c, "fever") && !has(["lowBack", "midBack", "abdLower", "abdUpper", "neck"]) && findings.length)
    raise("doctor", "Fever with joint pain — a hot swollen joint needs same-day review");
  if (flag(c, "swelling")) raise("urgent", "A swollen, red or warm leg needs a same-day check for a blood clot");
  if (flag(c, "cantBear") || flag(c, "deformity")) raise("urgent", "Unable to bear weight or deformity — needs an X-ray");
  const abd = at(c, ["abdLower", "abdUpper"]);
  if (peak(abd) >= 7) raise("urgent", "Severe abdominal pain should be assessed today");
  if (peak(at(c, ["abdLower"], "Right")) >= 6 && q.duration !== "months") raise("urgent", "Significant lower-right abdominal pain — appendicitis needs excluding");
  if (peak(at(c, ["midBack"]).filter((x) => x.side)) >= 7 && feels(at(c, ["midBack"]), COLICKY))
    raise("urgent", "Severe colicky flank pain — possible kidney stone");

  if (q.sex === "male" && q.onset === "sudden" && peak(at(c, ["groin"])) >= 6)
    raise("emergency", "Sudden severe groin pain in a male can be testicular torsion — needs surgery within hours");
  if (q.sex === "female" && q.age !== "60+" && q.onset === "sudden" && peak(at(c, ["abdLower", "groin"]).filter((x) => x.side)) >= 7)
    raise("emergency", "Sudden severe one-sided pelvic pain can be an ectopic pregnancy or twisted ovary");
  if (flag(c, "swollenJoint") && flag(c, "fever")) raise("urgent", "A swollen joint with fever may be infected");
  if (q.age === "60+" && has(["head", "headBack"]) && (flag(c, "jaw") || q.duration === "days"))
    raise("urgent", "A new headache over 60 (especially with jaw pain) needs same-day checks for giant cell arteritis");
  if (flag(c, "pop") && has(["achilles", "calf", "heel"])) raise("urgent", "A snap at the back of the ankle may be an Achilles rupture");
  if (flag(c, "fever") && flag(c, "breathing") && has(["chest", "upperBack", "midBack"]))
    raise("urgent", "Chest pain on breathing with fever may be a chest infection or pleurisy");
  if (q.onset === "injury" && (flag(c, "pop") || flag(c, "swollenJoint") || flag(c, "locking")))
    raise("doctor", "A pop, swelling or giving way after an injury suggests a ligament or cartilage tear");
  if (flag(c, "urine")) raise("doctor", "Urinary symptoms may need a urine test and antibiotics");
  if (flag(c, "morningStiff")) raise("doctor", "Prolonged morning stiffness can mean an inflammatory condition");
  if (flag(c, "walking")) raise("doctor", "Leg pain on walking should be checked (circulation or spinal narrowing)");
  if (flag(c, "rash")) raise("doctor", "A painful rash may be shingles — antivirals work best within 3 days");
  if (flag(c, "weightLoss")) raise("doctor", "Weight loss or night pain should be investigated");
  if (q.duration === "months") raise("doctor", "Pain lasting months deserves a proper assessment");
  if (peak(findings) >= 8) raise("doctor", "Severe pain");
  if (feels(findings, ["Tingling / numb"])) raise("doctor", "Numbness or tingling");

  const copy: Record<Urgency, [string, string]> = {
    emergency: ["Call emergency services now", "Call 911 / 112 / 999 (or your local number). Don't drive yourself."],
    urgent: ["Get seen today", "Go to urgent care, a same-day GP appointment or A&E today."],
    doctor: ["Book a doctor or physio", "This is worth getting assessed in the next few days to weeks."],
    selfcare: ["Likely OK to manage at home", "Try the self-care tips below. See a doctor if it's not improving in 1–2 weeks or gets worse."],
  };
  return { level, title: copy[level][0], message: copy[level][1], reasons };
}

export type Result = { condition: Condition; score: number; pct: number; why: string[]; muscles: string[] };

export function assess(markers: PainMarker[], movements: Movement[], q: Intake) {
  const findings = buildFindings(markers, movements);
  const c: Ctx = { f: findings, q };
  const scored = ALL_CONDITIONS.map((cond) => {
    const s = cond.score(c);
    const condition: Condition = { ...cond, ...(s.meta.name ? { name: s.meta.name } : {}), ...(s.meta.about ? { about: s.meta.about } : {}), ...(s.meta.selfCare ? { selfCare: s.meta.selfCare } : {}) };
    return { condition, score: s.points, why: s.why, muscles: s.meta.muscles ?? cond.muscles ?? [] };
  })
    .filter((r) => r.score >= 2.5)
    .sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 1;
  const results: Result[] = scored.slice(0, 8).map((r) => ({ ...r, pct: Math.round((r.score / top) * 100) }));
  return { findings, results, triage: triage(findings, q) };
}

export function likelihoodLabel(pct: number): string {
  if (pct >= 85) return "Best match";
  if (pct >= 60) return "Possible";
  return "Less likely";
}
