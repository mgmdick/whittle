import { relaxed, type E3, type JointName } from "./mannequin/rig";

// A guided "movement check" — the kind of quick screen a physio does. For
// each body area the mannequin demonstrates a few standard movements and the
// person says whether each one hurts. Movements are authored for the RIGHT
// side and mirrored for the left.

export type AreaId = "neck" | "shoulder" | "elbow" | "wrist" | "chest" | "upperBack" | "abdomen" | "lowBack" | "hip" | "knee" | "ankle";
export type Answer = "none" | "hurts" | "severe" | "cant";
export type CamView = "front" | "angle" | "side" | "back";
type Joints = Partial<Record<JointName, E3>>;

export type Spot = {
  id: string;
  label: string;
  loc: string; // location code used by the symptom checker
  medial?: boolean;
  lateral?: boolean;
  below?: boolean;
  tags?: string[];
};

export type Test = {
  id: string;
  title: string;
  /** Instruction; {side} becomes "left"/"right". */
  prompt: string;
  /** Peak pose (or poses) of the movement; omitted for plain questions. */
  keyframes?: Joints[];
  /** Seconds to reach the peak. */
  speed?: number;
  view: CamView;
  /** Tags recorded if this movement hurts. */
  tags: string[];
  /** Tags recorded if it can't be done. */
  cantTags?: string[];
  followUp?: { question: string; options: { id: string; label: string; tags: string[] }[] };
  /** Yes/no question with no movement. */
  question?: boolean;
};

export type Area = {
  id: AreaId;
  label: string;
  sided: boolean;
  parts: string[]; // mannequin parts that highlight (with side suffix added for sided areas)
  spots: Spot[];
  tests: Test[];
};

const R = relaxed;

export const AREAS: Area[] = [
  {
    id: "neck",
    label: "Neck",
    sided: false,
    parts: ["neck", "head"],
    spots: [
      { id: "back", label: "Back of the neck", loc: "neck" },
      { id: "side", label: "One side of the neck", loc: "neck", tags: ["oneSide"] },
      { id: "arm", label: "Neck, spreading into the arm", loc: "neck", tags: ["armRadiation"] },
      { id: "head", label: "Neck and back of the head", loc: "headBack" },
    ],
    tests: [
      { id: "lookDown", title: "Look down", prompt: "Slowly bring your chin down towards your chest.", keyframes: [{ ...R, neck: [55, 0, 0] }], view: "side", tags: ["neckMove", "neckFlex"] },
      {
        id: "lookUp",
        title: "Look up",
        prompt: "Slowly tip your head back and look up at the ceiling.",
        keyframes: [{ ...R, neck: [-45, 0, 0] }],
        view: "side",
        tags: ["neckMove", "neckExt"],
        followUp: {
          question: "Did pain or tingling shoot into your arm?",
          options: [
            { id: "yes", label: "Yes, into my arm", tags: ["armRadiation"] },
            { id: "no", label: "No, just the neck", tags: [] },
          ],
        },
      },
      { id: "turn", title: "Turn your head", prompt: "Turn your head to look over your {side} shoulder.", keyframes: [{ ...R, neck: [0, -70, 0] }], view: "front", tags: ["neckMove", "neckRot"] },
      { id: "tilt", title: "Tilt your head", prompt: "Tilt your {side} ear towards your {side} shoulder.", keyframes: [{ ...R, neck: [0, 0, 40] }], view: "front", tags: ["neckMove", "neckTilt"] },
    ],
  },
  {
    id: "shoulder",
    label: "Shoulder",
    sided: true,
    parts: ["shoulder", "upperArm"],
    spots: [
      { id: "front", label: "Front of the shoulder", loc: "shoulder" },
      { id: "side", label: "Outer side / top of the arm", loc: "shoulder", lateral: true },
      { id: "top", label: "Very top of the shoulder", loc: "shoulder", tags: ["acTop"] },
      { id: "back", label: "Back of the shoulder", loc: "shoulderBack" },
    ],
    tests: [
      {
        id: "raiseSide",
        title: "Arm out to the side",
        prompt: "Lift your {side} arm out to the side, slowly, all the way up.",
        keyframes: [{ ...R, shoulderR: [0, 0, -95], elbowR: [0, 0, 0] }, { ...R, shoulderR: [0, 0, -170], elbowR: [0, 0, 0] }],
        speed: 1.4,
        view: "front",
        tags: ["overhead"],
        cantTags: ["shoulderRestricted"],
        followUp: {
          question: "When did it hurt?",
          options: [
            { id: "arc", label: "In the middle of the lift", tags: ["painfulArc"] },
            { id: "top", label: "Only at the very top", tags: ["acTop"] },
            { id: "all", label: "All the way up", tags: [] },
          ],
        },
      },
      {
        id: "raiseFront",
        title: "Arm forward and up",
        prompt: "Lift your {side} arm forwards and up over your head.",
        keyframes: [{ ...R, shoulderR: [-170, 0, -6], elbowR: [-4, 0, 0] }],
        speed: 1.6,
        view: "side",
        tags: ["overhead"],
        cantTags: ["shoulderRestricted"],
      },
      {
        id: "behindHead",
        title: "Hand behind head",
        prompt: "Put your {side} hand behind your head, as if combing your hair.",
        keyframes: [{ ...R, shoulderR: [-170, 60, -20], elbowR: [-120, 0, 0] }],
        view: "angle",
        tags: ["overhead", "externalRotation"],
        cantTags: ["shoulderRestricted"],
      },
      {
        id: "behindBack",
        title: "Hand behind back",
        prompt: "Reach your {side} hand up behind your back, like doing up a bra or tucking in a shirt.",
        keyframes: [{ ...R, shoulderR: [35, 90, -20], elbowR: [-110, 0, 0], wristR: [20, 0, 0] }],
        view: "back",
        tags: ["behindBack", "twist"],
        cantTags: ["shoulderRestricted"],
      },
      {
        id: "crossBody",
        title: "Reach across",
        prompt: "Reach your {side} arm across your chest towards the other shoulder.",
        keyframes: [{ ...R, shoulderR: [-90, 0, 35], elbowR: [-15, 0, 0] }],
        view: "angle",
        tags: ["crossBody"],
      },
    ],
  },
  {
    id: "elbow",
    label: "Elbow & forearm",
    sided: true,
    parts: ["elbow", "forearm"],
    spots: [
      { id: "outer", label: "Outer side (thumb side)", loc: "elbowPoint", lateral: true },
      { id: "inner", label: "Inner side (little-finger side)", loc: "elbowInner", medial: true },
      { id: "point", label: "Point of the elbow", loc: "elbowPoint" },
      { id: "forearm", label: "Forearm", loc: "forearmExtensor" },
    ],
    tests: [
      {
        id: "gripLift",
        title: "Lift with palm down",
        prompt: "Hold your {side} arm out and lift something light (a mug or a bag) with your palm facing down.",
        keyframes: [{ ...R, shoulderR: [-75, 0, -6], elbowR: [-10, 0, 0], wristR: [-25, 0, 0] }],
        view: "angle",
        tags: ["grip", "wristExt"],
      },
      {
        id: "wristBack",
        title: "Bend the wrist back",
        prompt: "With your {side} arm straight out, bend your wrist back as if pushing against a wall.",
        keyframes: [{ ...R, shoulderR: [-85, 0, -6], elbowR: [0, 0, 0], wristR: [-65, 0, 0] }],
        view: "side",
        tags: ["wristExt"],
      },
      {
        id: "wristDown",
        title: "Bend the wrist down",
        prompt: "With your {side} arm straight out, bend your wrist down, fingers to the floor.",
        keyframes: [{ ...R, shoulderR: [-85, 0, -6], elbowR: [0, 0, 0], wristR: [65, 0, 0] }],
        view: "side",
        tags: ["wristFlex"],
      },
      {
        id: "bendStraighten",
        title: "Bend & straighten",
        prompt: "Fully bend your {side} elbow, then straighten it all the way.",
        keyframes: [{ ...R, shoulderR: [-10, 0, -8], elbowR: [-145, 0, 0] }, { ...R, shoulderR: [-10, 0, -8], elbowR: [0, 0, 0] }],
        view: "side",
        tags: ["elbowMove"],
        cantTags: ["elbowRestricted"],
      },
    ],
  },
  {
    id: "wrist",
    label: "Wrist & hand",
    sided: true,
    parts: ["hand"],
    spots: [
      { id: "thumb", label: "Thumb side of the wrist", loc: "wristPalm", lateral: true },
      { id: "little", label: "Little-finger side", loc: "wristBack", medial: true },
      { id: "palm", label: "Palm side / fingers", loc: "wristPalm" },
      { id: "back", label: "Back of the wrist / hand", loc: "wristBack" },
    ],
    tests: [
      {
        id: "extend",
        title: "Bend the wrist back",
        prompt: "Bend your {side} wrist back as far as it comfortably goes.",
        keyframes: [{ ...R, shoulderR: [-60, 0, -6], elbowR: [-60, 0, 0], wristR: [-65, 0, 0] }],
        view: "side",
        tags: ["wristExt"],
      },
      {
        id: "flex",
        title: "Bend the wrist forward",
        prompt: "Bend your {side} wrist forward, fingers curling down.",
        keyframes: [{ ...R, shoulderR: [-60, 0, -6], elbowR: [-60, 0, 0], wristR: [65, 0, 0] }],
        view: "side",
        tags: ["wristFlex"],
      },
      {
        id: "thumbFold",
        title: "Thumb tuck",
        prompt: "Tuck your {side} thumb into your palm, wrap your fingers over it, and tilt your wrist towards your little finger.",
        keyframes: [{ ...R, shoulderR: [-60, 0, -6], elbowR: [-70, 0, 0], wristR: [0, 0, -30] }],
        view: "front",
        tags: ["finkelstein"],
      },
      {
        id: "prayer",
        title: "Reverse prayer hold",
        prompt: "Press the backs of your hands together in front of your chest, wrists bent down, and hold for 30 seconds.",
        keyframes: [{ ...R, shoulderL: [-40, -60, 10], shoulderR: [-40, 60, -10], elbowL: [-120, 0, 0], elbowR: [-120, 0, 0], wristL: [70, 0, 0], wristR: [70, 0, 0] }],
        view: "angle",
        tags: ["phalen"],
        followUp: {
          question: "Did your thumb or fingers tingle or go numb?",
          options: [
            { id: "yes", label: "Yes, tingling/numb", tags: ["phalenTingle"] },
            { id: "no", label: "No", tags: [] },
          ],
        },
      },
    ],
  },
  {
    id: "chest",
    label: "Chest",
    sided: false,
    parts: ["chest"],
    spots: [
      { id: "centre", label: "Centre of the chest / breastbone", loc: "chest" },
      { id: "left", label: "Left side of the chest", loc: "chest", tags: ["leftChest"] },
      { id: "right", label: "Right side of the chest", loc: "chest", tags: ["rightChest"] },
      { id: "ribs", label: "Ribs, under the arm", loc: "chest", tags: ["ribs"] },
    ],
    tests: [
      {
        id: "heartQ",
        title: "First, a safety question",
        prompt: "Does it feel like pressure, squeezing or tightness — or come with breathlessness, sweating, feeling sick, or pain spreading to your arm, jaw or back?",
        view: "front",
        question: true,
        tags: ["cardiacFeatures"],
      },
      { id: "press", title: "Press on it", prompt: "Press firmly on the sore spot with your fingers. Does that reproduce the pain?", view: "front", question: true, tags: ["tender"] },
      { id: "breath", title: "Deep breath", prompt: "Take a big, deep breath in.", keyframes: [{ ...R, waist: [-6, 0, 0], neck: [-8, 0, 0], shoulderL: [0, 0, 14], shoulderR: [0, 0, -14] }], speed: 2, view: "front", tags: ["breathing"] },
      { id: "twist", title: "Twist", prompt: "Cross your arms and turn your upper body to each side.", keyframes: [{ ...R, waist: [0, -40, 0], neck: [0, -15, 0], shoulderR: [-35, 90, 10], elbowR: [-90, 0, 0], shoulderL: [-35, -90, -10], elbowL: [-90, 0, 0] }], view: "front", tags: ["twist"] },
      { id: "armsBack", title: "Open the chest", prompt: "Take your arms out and back, squeezing your shoulder blades together.", keyframes: [{ ...R, shoulderL: [30, 0, 70], shoulderR: [30, 0, -70], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0], neck: [-8, 0, 0] }], view: "angle", tags: ["chestStretch"] },
    ],
  },
  {
    id: "upperBack",
    label: "Upper back",
    sided: false,
    parts: ["chest"],
    spots: [
      { id: "between", label: "Between the shoulder blades", loc: "upperBack" },
      { id: "side", label: "Around one shoulder blade", loc: "upperBack", tags: ["oneSide"] },
      { id: "ribs", label: "Along the ribs", loc: "upperBack", tags: ["ribs"] },
    ],
    tests: [
      { id: "twist", title: "Twist", prompt: "Cross your arms and twist your upper body round to each side.", keyframes: [{ ...R, waist: [0, -40, 0], neck: [0, -15, 0], shoulderR: [-35, 90, 10], elbowR: [-90, 0, 0], shoulderL: [-35, -90, -10], elbowL: [-90, 0, 0] }], view: "front", tags: ["twist"] },
      { id: "hug", title: "Hug yourself", prompt: "Wrap your arms around yourself, reaching for your shoulder blades.", keyframes: [{ ...R, shoulderR: [-60, 90, 35], elbowR: [-110, 0, 0], shoulderL: [-60, -90, -35], elbowL: [-110, 0, 0] }], view: "front", tags: ["protraction"] },
      { id: "arch", title: "Arch back", prompt: "Lift your chest and arch your upper back, squeezing your shoulder blades together.", keyframes: [{ ...R, waist: [-18, 0, 0], neck: [-15, 0, 0], shoulderL: [30, 0, 20], shoulderR: [30, 0, -20] }], view: "side", tags: ["extension"] },
      { id: "breath", title: "Deep breath", prompt: "Take a big, deep breath in.", keyframes: [{ ...R, waist: [-6, 0, 0], neck: [-8, 0, 0], shoulderL: [0, 0, 14], shoulderR: [0, 0, -14] }], speed: 2, view: "front", tags: ["breathing"] },
    ],
  },
  {
    id: "abdomen",
    label: "Tummy",
    sided: false,
    parts: ["lowBack", "pelvis"],
    spots: [
      { id: "upperMid", label: "Upper middle (below the breastbone)", loc: "abdUpper" },
      { id: "upperRight", label: "Upper right, under the ribs", loc: "abdUpper", tags: ["sideR"] },
      { id: "upperLeft", label: "Upper left", loc: "abdUpper", tags: ["sideL"] },
      { id: "lowerRight", label: "Lower right", loc: "abdLower", tags: ["sideR"] },
      { id: "lowerLeft", label: "Lower left", loc: "abdLower", tags: ["sideL"] },
      { id: "lowerMid", label: "Low down in the middle / groin", loc: "groin" },
    ],
    tests: [
      { id: "curl", title: "Curl forward", prompt: "Tighten your tummy and curl your shoulders forward, as if starting a sit-up.", keyframes: [{ ...R, waist: [28, 0, 0], neck: [25, 0, 0], shoulderR: [-35, 90, 10], elbowR: [-90, 0, 0], shoulderL: [-35, -90, -10], elbowL: [-90, 0, 0] }], view: "side", tags: ["crunch"] },
      { id: "twist", title: "Twist", prompt: "Keep your hips still and turn your shoulders to each side.", keyframes: [{ ...R, waist: [0, -40, 0], neck: [0, -20, 0], shoulderR: [-40, 0, -10], elbowR: [-90, 0, 0], shoulderL: [-30, 0, 10], elbowL: [-90, 0, 0] }], view: "front", tags: ["twist"] },
      { id: "cough", title: "Cough", prompt: "Give a good cough. Does it make the pain worse?", view: "front", question: true, tags: ["cough"] },
      { id: "press", title: "Press on it", prompt: "Press gently on the sore spot. Does it hurt more when you press, or when you let go quickly?", view: "front", question: true, tags: ["tender"] },
      { id: "food", title: "Food & bowels", prompt: "Does it change with eating, or when you go to the toilet?", view: "front", question: true, tags: ["eating"] },
    ],
  },
  {
    id: "lowBack",
    label: "Lower back",
    sided: false,
    parts: ["lowBack", "pelvis"],
    spots: [
      { id: "centre", label: "Centre of the lower back", loc: "lowBack" },
      { id: "side", label: "One side", loc: "lowBack", tags: ["oneSide"] },
      { id: "leg", label: "Back, spreading into the buttock or leg", loc: "lowBack", tags: ["legRadiation"] },
      { id: "tailbone", label: "Tailbone", loc: "sacrum" },
    ],
    tests: [
      {
        id: "bendForward",
        title: "Bend forward",
        prompt: "Slowly bend forward as if to touch your toes.",
        keyframes: [{ ...R, pelvis: [28, 0, 0], waist: [60, 0, 0], neck: [15, 0, 0], shoulderL: [-80, 0, 4], shoulderR: [-80, 0, -4], hipL: [-28, 0, 3], hipR: [-28, 0, -3] }],
        speed: 1.4,
        view: "side",
        tags: ["flexion"],
        followUp: {
          question: "Did pain spread down your leg?",
          options: [
            { id: "yes", label: "Yes, down my leg", tags: ["legRadiation"] },
            { id: "no", label: "No, just my back", tags: [] },
          ],
        },
      },
      { id: "leanBack", title: "Lean back", prompt: "Put your hands on your hips and gently lean backwards.", keyframes: [{ ...R, waist: [-25, 0, 0], neck: [-20, 0, 0], shoulderR: [5, 90, -40], elbowR: [-90, 0, 0], shoulderL: [5, -90, 40], elbowL: [-90, 0, 0] }], view: "side", tags: ["extension"] },
      { id: "sideBend", title: "Side bend", prompt: "Slide your {side} hand down the outside of your {side} leg.", keyframes: [{ ...R, waist: [0, 0, 30], neck: [0, 0, 10], shoulderR: [0, 0, -8], shoulderL: [0, 0, 25] }], view: "front", tags: ["sidebend"] },
      { id: "twist", title: "Twist", prompt: "Keep your hips still and twist your shoulders round to the {side}.", keyframes: [{ ...R, waist: [0, -40, 0], neck: [0, -20, 0], shoulderR: [-40, 0, -10], elbowR: [-90, 0, 0], shoulderL: [-30, 0, 10], elbowL: [-90, 0, 0] }], view: "front", tags: ["twist"] },
      {
        id: "sitStand",
        title: "Sit to stand",
        prompt: "Sit down on a chair, then stand back up.",
        keyframes: [{ shoulderL: [-40, 0, 6], shoulderR: [-40, 0, -6], waist: [30, 0, 0], hipL: [-95, 0, 4], hipR: [-95, 0, -4], kneeL: [95, 0, 0], kneeR: [95, 0, 0] }],
        view: "side",
        tags: ["sitStand", "flexion"],
      },
    ],
  },
  {
    id: "hip",
    label: "Hip & groin",
    sided: true,
    parts: ["hip", "thigh"],
    spots: [
      { id: "side", label: "Outer side of the hip", loc: "hip", lateral: true },
      { id: "groin", label: "Groin / front of the hip", loc: "groin" },
      { id: "buttock", label: "Buttock", loc: "buttock" },
    ],
    tests: [
      { id: "kneeChest", title: "Knee to chest", prompt: "Lift your {side} knee up towards your chest.", keyframes: [{ ...R, hipR: [-110, 0, -4], kneeR: [115, 0, 0], shoulderL: [0, 0, 25], shoulderR: [0, 0, -25] }], view: "side", tags: ["hipFlex"] },
      { id: "figure4", title: "Cross your legs", prompt: "Sitting down, rest your {side} ankle on your other knee (figure-4).", keyframes: [{ shoulderL: [-25, 0, 6], shoulderR: [-25, 0, -6], hipL: [-90, 0, 4], kneeL: [90, 0, 0], hipR: [-80, -35, -45], kneeR: [110, 0, 0] }], view: "front", tags: ["hipRotation", "hipFlex"] },
      { id: "oneLeg", title: "Stand on that leg", prompt: "Stand on your {side} leg only, for about 30 seconds.", keyframes: [{ ...R, hipL: [-70, 0, 4], kneeL: [90, 0, 0], shoulderL: [0, 0, 30], shoulderR: [0, 0, -30] }], view: "front", tags: ["singleLeg"] },
      { id: "legBack", title: "Leg behind", prompt: "Hold onto something and swing your {side} leg straight back behind you.", keyframes: [{ ...R, hipR: [28, 0, -3], kneeR: [10, 0, 0], waist: [8, 0, 0] }], view: "side", tags: ["hipExt"] },
      {
        id: "squat",
        title: "Squat",
        prompt: "Squat down as low as is comfortable.",
        keyframes: [{ waist: [35, 0, 0], neck: [-20, 0, 0], shoulderL: [-85, 0, 6], shoulderR: [-85, 0, -6], hipL: [-110, 0, 12], hipR: [-110, 0, -12], kneeL: [125, 0, 0], kneeR: [125, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] }],
        view: "angle",
        tags: ["hipFlex", "kneeLoad"],
      },
    ],
  },
  {
    id: "knee",
    label: "Knee",
    sided: true,
    parts: ["knee", "shin"],
    spots: [
      { id: "front", label: "Around / behind the kneecap", loc: "kneecap" },
      { id: "below", label: "Just below the kneecap", loc: "kneecap", below: true },
      { id: "inner", label: "Inner side", loc: "kneecap", medial: true },
      { id: "outer", label: "Outer side", loc: "kneecap", lateral: true },
      { id: "back", label: "Back of the knee", loc: "kneeBack" },
    ],
    tests: [
      {
        id: "squat",
        title: "Squat",
        prompt: "Squat down as low as is comfortable.",
        keyframes: [{ waist: [35, 0, 0], neck: [-20, 0, 0], shoulderL: [-85, 0, 6], shoulderR: [-85, 0, -6], hipL: [-110, 0, 12], hipR: [-110, 0, -12], kneeL: [125, 0, 0], kneeR: [125, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] }],
        view: "angle",
        tags: ["kneeLoad", "squat"],
        cantTags: ["kneeRestricted"],
      },
      { id: "step", title: "Step up", prompt: "Step up onto a stair with your {side} foot.", keyframes: [{ shoulderR: [20, 0, -6], shoulderL: [-25, 0, 6], hipR: [-75, 0, -3], kneeR: [80, 0, 0], hipL: [5, 0, 3] }], view: "side", tags: ["kneeLoad", "stairs"] },
      {
        id: "straighten",
        title: "Straighten fully",
        prompt: "Sitting down, straighten your {side} knee all the way out in front of you.",
        keyframes: [{ shoulderL: [-25, 0, 6], shoulderR: [-25, 0, -6], hipL: [-90, 0, 4], kneeL: [90, 0, 0], hipR: [-90, 0, -4], kneeR: [0, 0, 0] }],
        view: "side",
        tags: ["kneeExtension"],
        cantTags: ["kneeLocked"],
      },
      { id: "twist", title: "Twist on the leg", prompt: "With your weight on your {side} leg and the knee slightly bent, turn your body round.", keyframes: [{ ...R, waist: [0, 35, 0], hipR: [-20, 25, -3], kneeR: [25, 0, 0], hipL: [-10, 0, 3], kneeL: [15, 0, 0] }], view: "front", tags: ["twistKnee"] },
      { id: "deepBend", title: "Heel to bottom", prompt: "Hold onto something and bend your {side} knee, bringing your heel up towards your bottom.", keyframes: [{ ...R, hipR: [10, 0, -3], kneeR: [140, 0, 0] }], view: "side", tags: ["kneeFlex"], cantTags: ["kneeRestricted"] },
    ],
  },
  {
    id: "ankle",
    label: "Ankle & foot",
    sided: true,
    parts: ["foot"],
    spots: [
      { id: "outer", label: "Outer ankle", loc: "ankle", lateral: true },
      { id: "inner", label: "Inner ankle", loc: "ankle", medial: true },
      { id: "achilles", label: "Back of the ankle (Achilles)", loc: "achilles" },
      { id: "heel", label: "Heel / sole", loc: "heel" },
      { id: "top", label: "Top of the foot / toes", loc: "footTop" },
    ],
    tests: [
      { id: "tiptoe", title: "Up on tiptoes", prompt: "Rise up onto your tiptoes, then lower slowly.", keyframes: [{ ...R, ankleL: [40, 0, 0], ankleR: [40, 0, 0] }], view: "side", tags: ["heelRaise"], cantTags: ["cantTiptoe"] },
      { id: "heels", title: "Walk on heels", prompt: "Lift your toes and stand on your heels.", keyframes: [{ ...R, ankleL: [-25, 0, 0], ankleR: [-25, 0, 0], waist: [6, 0, 0] }], view: "side", tags: ["heelWalk"] },
      { id: "roll", title: "Roll the ankle", prompt: "Gently roll your {side} foot inwards and outwards.", keyframes: [{ ...R, hipR: [-20, 0, -8], kneeR: [30, 0, 0], ankleR: [10, 0, 20] }, { ...R, hipR: [-20, 0, -8], kneeR: [30, 0, 0], ankleR: [10, 0, -20] }], view: "front", tags: ["ankleRoll"] },
      { id: "oneLeg", title: "Balance", prompt: "Stand on your {side} foot only, for about 30 seconds.", keyframes: [{ ...R, hipL: [-60, 0, 4], kneeL: [85, 0, 0], shoulderL: [0, 0, 30], shoulderR: [0, 0, -30] }], view: "front", tags: ["singleLeg"] },
      {
        id: "firstSteps",
        title: "Morning",
        prompt: "Is it worst with your first steps in the morning, easing as you get going?",
        view: "angle",
        question: true,
        tags: ["firstSteps"],
      },
    ],
  },
];

/** Camera framing per area: centre height and vertical extent (metres). */
export const AREA_FRAME: Record<AreaId, { y: number; extent: number }> = {
  neck: { y: 1.45, extent: 0.95 },
  shoulder: { y: 1.3, extent: 1.5 },
  elbow: { y: 1.2, extent: 1.3 },
  wrist: { y: 1.15, extent: 1.15 },
  chest: { y: 1.3, extent: 1.3 },
  abdomen: { y: 1.05, extent: 1.35 },
  upperBack: { y: 1.3, extent: 1.35 },
  lowBack: { y: 1.0, extent: 2.15 },
  hip: { y: 0.88, extent: 1.85 },
  knee: { y: 0.58, extent: 1.3 },
  ankle: { y: 0.34, extent: 0.9 },
};

export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, Area>;

/** Mannequin part tapped (and whether on its front) → body area. */
export function areaForPart(part: string, front = false): { area: AreaId; side: "L" | "R" | null } {
  const side = part.endsWith("L") ? "L" : part.endsWith("R") ? "R" : null;
  const base = part.replace(/[LR]$/, "");
  const map: Record<string, AreaId> = {
    head: "neck",
    neck: "neck",
    shoulder: "shoulder",
    upperArm: "shoulder",
    elbow: "elbow",
    forearm: "elbow",
    hand: "wrist",
    chest: "upperBack",
    lowBack: "lowBack",
    pelvis: "lowBack",
    hip: "hip",
    thigh: "hip",
    knee: "knee",
    shin: "knee",
    foot: "ankle",
  };
  if (front && base === "chest") return { area: "chest", side: null };
  if (front && (base === "lowBack" || base === "pelvis")) return { area: "abdomen", side: null };
  return { area: map[base] ?? "lowBack", side };
}

export const fillSide = (text: string, side: "L" | "R" | null) =>
  text.replace(/\{side\}/g, side === "L" ? "left" : side === "R" ? "right" : "");

export const ANSWERS: { id: Answer; label: string; tone: string }[] = [
  { id: "none", label: "No pain", tone: "ok" },
  { id: "hurts", label: "Hurts", tone: "mid" },
  { id: "severe", label: "Hurts a lot", tone: "bad" },
  { id: "cant", label: "Can't do it", tone: "cant" },
];

export type CheckResult = {
  area: AreaId;
  side: "L" | "R" | null;
  spot: string;
  answers: Record<string, Answer>;
  follow: Record<string, string>;
  mechanical: boolean | null;
  types: string[];
};

/** Tags, intensity and the painful movements, derived from a finished check. */
export function summarizeCheck(r: CheckResult) {
  const area = AREA_BY_ID[r.area];
  const spot = area.spots.find((s) => s.id === r.spot) ?? area.spots[0];
  const tags = new Set<string>(spot.tags ?? []);
  const painful: Test[] = [];
  let worst = 0;
  let cants = 0;
  for (const t of area.tests) {
    const a = r.answers[t.id];
    if (!a || a === "none") continue;
    if (t.question) {
      if (a === "hurts") t.tags.forEach((x) => tags.add(x));
      continue;
    }
    painful.push(t);
    if (a === "cant") {
      cants++;
      (t.cantTags ?? t.tags).forEach((x) => tags.add(x));
      worst = Math.max(worst, 7);
    } else {
      t.tags.forEach((x) => tags.add(x));
      worst = Math.max(worst, a === "severe" ? 8 : 5);
    }
    const f = r.follow[t.id];
    if (f) t.followUp?.options.find((o) => o.id === f)?.tags.forEach((x) => tags.add(x));
  }
  if (cants >= 2 && r.area === "shoulder") tags.add("globalRestriction");
  if (r.mechanical === false) tags.add("nonMechanical");
  if (r.mechanical === true) tags.add("mechanical");
  return { area, spot, tags: [...tags], painful, intensity: worst || 3 };
}
