import { PART_LABEL, norm } from "./pose";
import { personSide, regionById } from "./regions";
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

export type Finding = {
  loc: string;
  side: Side;
  intensity: number;
  types: string[];
  label: string;
  source: "map" | "movement";
  tags: string[];
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
  knee: "kneecap", shin: "shin", foot: "ankle",
};

function movementTags(m: Movement): string[] {
  const t = `${m.label} ${m.note}`.toLowerCase();
  const tags: string[] = [];
  const a = m.angles;
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
    out.push({
      loc,
      side: r.side ? personSide(m.view, r.side) : null,
      intensity: m.intensity,
      types: m.types,
      label: m.region,
      source: "map",
      tags: [],
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
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- scoring

type Ctx = { f: Finding[]; q: Intake };

class Score {
  points = 0;
  why: string[] = [];
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

export type Result = { condition: Condition; score: number; pct: number; why: string[] };

export function assess(markers: PainMarker[], movements: Movement[], q: Intake) {
  const findings = buildFindings(markers, movements);
  const c: Ctx = { f: findings, q };
  const scored = CONDITIONS.map((cond) => {
    const s = cond.score(c);
    return { condition: cond, score: s.points, why: s.why };
  })
    .filter((r) => r.score >= 2.5)
    .sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 1;
  const results: Result[] = scored.slice(0, 6).map((r) => ({ ...r, pct: Math.round((r.score / top) * 100) }));
  return { findings, results, triage: triage(findings, q) };
}

export function likelihoodLabel(pct: number): string {
  if (pct >= 85) return "Best match";
  if (pct >= 60) return "Possible";
  return "Less likely";
}
