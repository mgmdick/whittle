import type { Shape } from "./regions";
import type { View } from "./types";

// Muscle atlas for the 200 × 420 body map. Superficial muscles are drawn
// (smooth outlines through `pts`); deep ones are listed by area only.
// Shapes are authored for the viewer's left half and mirrored.

type P = [number, number];

export type Muscle = {
  id: string;
  name: string;
  group: string;
  action: string;
  pain: string;
  causes: string;
  relief: string;
  tendon?: boolean;
  fiber?: number; // fibre direction in degrees for the drawn texture (left half)
  draw?: Partial<Record<View, P[][]>>;
  deep?: Partial<Record<View, Shape[]>>;
};

const R = (x: number, y: number, w: number, h: number): Shape => ({ kind: "rect", x, y, w, h, r: 4 });
const E = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: "ellipse", cx, cy, rx, ry });

export const MUSCLES: Muscle[] = [
  // ------------------------------------------------------------ head & neck
  {
    id: "temporalis",
    name: "Temporalis & masseter",
    group: "Jaw muscles",
    action: "Close the jaw and grind food.",
    pain: "Aching in the temple, cheek, jaw and teeth; a common source of tension headaches and jaw-joint (TMJ) pain.",
    causes: "Clenching or grinding (often at night or when stressed), chewing gum, a lot of talking.",
    relief: "Relax the jaw — lips together, teeth apart, tongue resting on the roof of the mouth. Massage the cheek and temple in small circles; warm compress. A night guard helps grinding.",
    deep: { front: [R(84, 30, 13, 24)] },
  },
  {
    id: "suboccipitals",
    name: "Suboccipitals",
    group: "Deep neck",
    action: "Tilt and turn the head; fine-tune head position.",
    pain: "Headache wrapping from the base of the skull over the side of the head towards the eye.",
    causes: "Forward head posture at screens, phones and driving; reading in bed.",
    relief: "Chin tucks (draw the head straight back), massage at the skull base, raise screens to eye level.",
    deep: { back: [R(86, 40, 14, 14)] },
  },
  {
    id: "scm",
    name: "Sternocleidomastoid",
    group: "Neck",
    action: "Turns the head to the opposite side and bends the neck forward.",
    pain: "Rarely hurts where it is — refers pain to the forehead, around the eye, the ear and the top of the head; can cause dizziness.",
    causes: "Looking up for long periods, sleeping awkwardly, whiplash, stomach sleeping with the head turned.",
    relief: "Gentle side-bend and rotation stretches; pinch-and-hold massage along the muscle (avoid pressing the pulse in the front of the neck).",
    fiber: 70,
    draw: { front: [[[86, 42], [90, 41], [95, 56], [99, 69], [96, 71], [91, 58]]] },
  },
  {
    id: "levatorScapulae",
    name: "Levator scapulae",
    group: "Neck & shoulder",
    action: "Lifts the shoulder blade and side-bends the neck.",
    pain: "Ache at the angle of the neck and top of the shoulder blade; the classic 'stiff neck' where you can't turn your head.",
    causes: "Phone between ear and shoulder, carrying bags on one shoulder, cold drafts, stress.",
    relief: "Look down towards the opposite armpit and gently pull the head with your hand; heat; shoulder rolls.",
    deep: { back: [R(85, 54, 12, 30)], front: [R(84, 60, 8, 12)] },
  },
  {
    id: "neckExtensors",
    name: "Splenius & neck extensors",
    group: "Back of neck",
    action: "Hold the head up and extend/turn the neck.",
    pain: "Ache in the back of the neck, often spreading up into the head.",
    causes: "Prolonged looking down (phones, laptops), sleeping position.",
    relief: "Chin tucks, posture breaks, heat and gentle movement.",
    deep: { back: [R(92, 50, 8, 22)] },
  },
  // ------------------------------------------------------------ shoulder & chest
  {
    id: "trapezius",
    name: "Trapezius",
    group: "Upper back & neck",
    action: "Shrugs, pulls back and rotates the shoulder blade; supports the neck.",
    pain: "Upper part: ache from the neck to the shoulder and up the side of the head to the temple. Middle/lower parts: burning or aching between and along the shoulder blades.",
    causes: "Stress, desk posture, heavy bags, holding the arms up (typing, steering).",
    relief: "Ear-to-shoulder stretches, shoulder-blade squeezes, heat, massage; rows and band pull-aparts to strengthen.",
    fiber: 28,
    draw: {
      front: [[[90, 60], [91, 66], [80, 72], [68, 76], [66, 74], [78, 68]]],
      back: [[[100, 46], [100, 150], [94, 140], [88, 120], [84, 104], [74, 86], [64, 78], [68, 74], [80, 70], [90, 62], [93, 52]]],
    },
  },
  {
    id: "deltoid",
    name: "Deltoid",
    group: "Shoulder",
    action: "Lifts the arm forwards, out to the side and backwards.",
    pain: "Ache over the cap of the shoulder, worse lifting the arm.",
    causes: "Overhead work, lifting, a fall onto the shoulder; often tender alongside rotator-cuff problems.",
    relief: "Rest from overhead loading, ice or heat, gentle range-of-motion exercises.",
    fiber: 82,
    draw: {
      front: [[[66, 75], [60, 78], [56, 86], [55, 96], [57, 104], [61, 108], [64, 100], [66, 90], [69, 80]]],
      back: [[[66, 75], [60, 78], [56, 86], [55, 96], [57, 104], [61, 108], [64, 100], [66, 90], [69, 80]]],
    },
  },
  {
    id: "supraspinatus",
    name: "Supraspinatus (rotator cuff)",
    group: "Rotator cuff",
    action: "Starts lifting the arm out to the side and holds the ball of the shoulder in its socket.",
    pain: "Deep ache over the outer shoulder that can spread down to the elbow; a 'painful arc' when lifting the arm between 60° and 120°.",
    causes: "Overhead activity, age-related tendon wear, sleeping on the arm, falls.",
    relief: "Avoid repeated overhead lifting for a while; pendulum swings; physio-led strengthening is the main treatment.",
    deep: { front: [R(56, 76, 14, 18)], back: [R(64, 76, 26, 10)] },
  },
  {
    id: "infraspinatus",
    name: "Infraspinatus & teres minor (rotator cuff)",
    group: "Rotator cuff",
    action: "Rotate the arm outwards and steady the shoulder joint.",
    pain: "Deep ache felt in the FRONT of the shoulder and down the arm; trouble reaching behind your back or sleeping on either side.",
    causes: "Reaching back (seat belts, back seat), throwing, sudden pulls on the arm.",
    relief: "Ball massage against a wall over the shoulder blade, sleeper and cross-body stretches, external-rotation band work.",
    fiber: 18,
    draw: { back: [[[76, 90], [88, 88], [93, 92], [90, 106], [83, 114], [77, 106]]] },
  },
  {
    id: "rhomboids",
    name: "Rhomboids",
    group: "Upper back",
    action: "Pull the shoulder blades together.",
    pain: "Superficial ache along the inner edge of the shoulder blade, between the blades.",
    causes: "Rounded-shoulder posture, long desk days, reaching forward for a long time.",
    relief: "Shoulder-blade squeezes, thoracic extension over a rolled towel, massage ball against a wall.",
    deep: { back: [R(88, 84, 11, 34)] },
  },
  {
    id: "pecMajor",
    name: "Pectoralis major",
    group: "Chest",
    action: "Brings the arm across the body and rotates it inwards; pushing.",
    pain: "Front of the chest and shoulder, sometimes down the inner arm. On the left it can mimic heart pain — heart causes must be ruled out first.",
    causes: "Push-ups and bench press, heavy lifting, rounded posture.",
    relief: "Doorway chest stretch, heat, posture work.",
    fiber: 8,
    draw: { front: [[[70, 79], [84, 76.5], [99, 78], [99.5, 106], [90, 110.5], [78, 110], [68, 105], [65, 97], [67, 88]]] },
  },
  {
    id: "pecMinor",
    name: "Pectoralis minor",
    group: "Chest (deep)",
    action: "Pulls the shoulder blade forwards and down.",
    pain: "Front of the shoulder and chest; when tight it can squeeze nerves and vessels, causing tingling down the arm into the ring and little fingers.",
    causes: "Rounded shoulders, carrying heavy backpacks, crutches.",
    relief: "Corner/doorway stretch with the arm high; shoulder-blade setting exercises.",
    deep: { front: [R(72, 82, 18, 20)] },
  },
  {
    id: "serratusAnterior",
    name: "Serratus anterior",
    group: "Side of chest",
    action: "Pulls the shoulder blade forward around the ribs (punching, reaching).",
    pain: "Side-of-chest ache or a 'stitch' when breathing deeply; can feel like you can't take a full breath.",
    causes: "Running, push-ups, heavy coughing, reaching overhead.",
    relief: "Side stretches, deep diaphragmatic breathing, rest from aggravating exercise.",
    fiber: 160,
    draw: { front: [[[66, 108], [73, 111], [74, 124], [68, 128], [66, 118]]] },
  },
  {
    id: "intercostals",
    name: "Intercostals",
    group: "Between the ribs",
    action: "Lift and lower the ribs when breathing.",
    pain: "Sharp, localised rib pain that's worse breathing in, coughing or twisting.",
    causes: "Coughing fits, twisting sports, a knock to the ribs.",
    relief: "Painkillers so you can breathe deeply (important to avoid chest infection), heat, gentle movement.",
    deep: { front: [R(66, 96, 20, 36)], back: [R(68, 96, 20, 40)] },
  },
  {
    id: "latissimus",
    name: "Latissimus dorsi",
    group: "Mid back",
    action: "Pulls the arm down and back (climbing, rowing, pull-ups).",
    pain: "Ache around the bottom tip of the shoulder blade and mid back, sometimes down the back of the arm.",
    causes: "Pull-ups, rowing, reaching up and pulling, carrying heavy things at your side.",
    relief: "Overhead side-bend stretch, child's pose with arms reaching, foam rolling the side of the back.",
    fiber: 40,
    draw: { back: [[[68, 108], [80, 112], [92, 132], [99, 152], [99, 176], [88, 172], [76, 160], [70, 145], [67, 125]]] },
  },
  // ------------------------------------------------------------ arm
  {
    id: "biceps",
    name: "Biceps brachii",
    group: "Upper arm (front)",
    action: "Bends the elbow and turns the palm up.",
    pain: "Front of the shoulder and over the muscle; tendon pain at the front of the shoulder or elbow crease.",
    causes: "Lifting with palms up, carrying, curls, a sudden heavy load (a 'pop' with a Popeye bulge means a tendon tear).",
    relief: "Rest from heavy lifting, ice, gentle stretches with the arm straight behind you.",
    fiber: 88,
    draw: { front: [[[58, 104], [54, 112], [52, 128], [53, 142], [56, 148], [60, 146], [62, 132], [62, 116], [61, 107]]] },
  },
  {
    id: "brachialis",
    name: "Brachialis",
    group: "Upper arm (deep)",
    action: "The main elbow-bending muscle.",
    pain: "Front of the elbow and, surprisingly, the base of the thumb.",
    causes: "Repetitive lifting and carrying, climbing.",
    relief: "Rest, massage just above the elbow crease on the outer side, gentle straightening stretches.",
    deep: { front: [R(48, 128, 16, 20)] },
  },
  {
    id: "triceps",
    name: "Triceps",
    group: "Upper arm (back)",
    action: "Straightens the elbow (pushing, throwing).",
    pain: "Back of the shoulder and arm, and the outer or point of the elbow.",
    causes: "Push-ups, dips, throwing, using crutches.",
    relief: "Overhead triceps stretch, massage, reduce pushing load.",
    fiber: 90,
    draw: { back: [[[52, 102], [49, 114], [48.5, 130], [50, 146], [55, 152], [60, 148], [63, 132], [63, 114], [60, 104]]] },
  },
  {
    id: "brachioradialis",
    name: "Brachioradialis",
    group: "Forearm",
    action: "Bends the elbow with the thumb up (hammer grip).",
    pain: "Outer elbow and forearm, sometimes the back of the hand — overlaps with tennis elbow.",
    causes: "Hammering, lifting with the thumb up, gripping tools.",
    relief: "Rest from gripping, massage, wrist-extensor stretches.",
    fiber: 86,
    draw: { front: [[[48, 148], [46, 160], [46, 178], [47.5, 194], [50, 192], [52, 172], [53, 156], [52, 148]]] },
  },
  {
    id: "forearmFlexors",
    name: "Forearm flexors",
    group: "Forearm (palm side)",
    action: "Bend the wrist and fingers; gripping.",
    pain: "Inner elbow and the palm side of the forearm and wrist (golfer's elbow).",
    causes: "Gripping, golf, throwing, typing, climbing.",
    relief: "Prayer stretch / wrist-extension stretch, massage, gradual eccentric strengthening.",
    fiber: 84,
    draw: { front: [[[53, 152], [52.5, 170], [50.5, 192], [52, 206], [57, 206], [60, 192], [61.5, 170], [61, 154], [57, 150]]] },
  },
  {
    id: "forearmExtensors",
    name: "Forearm extensors",
    group: "Forearm (back)",
    action: "Lift the wrist and fingers; stabilise the wrist when gripping.",
    pain: "Outer elbow, back of the forearm and hand (tennis elbow); weak grip.",
    causes: "Repetitive gripping and wrist extension — mouse use, racquet sports, DIY, lifting with palms down.",
    relief: "Wrist-flexion stretch with the elbow straight, counterforce strap, slow eccentric wrist exercises.",
    fiber: 96,
    draw: { back: [[[47, 152], [46, 172], [47.5, 194], [51, 207], [56, 207], [59, 192], [61, 170], [61, 154], [56, 150]]] },
  },
  {
    id: "thenar",
    name: "Thenar muscles",
    group: "Thumb",
    action: "Move the thumb (pinching, gripping).",
    pain: "Ache at the base of the thumb; wasting here can be a sign of carpal tunnel syndrome.",
    causes: "Phone use (texting), pinching, writing, gripping.",
    relief: "Thumb stretches, massage, breaks from texting.",
    fiber: 60,
    draw: { front: [[[44.5, 212], [42.5, 219], [44, 226], [48, 224], [49, 216]]] },
  },
  // ------------------------------------------------------------ trunk
  {
    id: "rectusAbdominis",
    name: "Rectus abdominis",
    group: "Abdomen",
    action: "Bends the trunk forward (sit-ups) and braces the abdomen.",
    pain: "Abdominal wall pain that's tender to press and worse sitting up; trigger points can mimic digestive pain or refer a band of pain across the back.",
    causes: "Sit-ups, heavy coughing, sport, pregnancy.",
    relief: "Rest from crunches, heat, gentle extension stretches (lying on your front, propped on elbows).",
    fiber: 90,
    draw: { front: [[[99.5, 112], [99.5, 178], [94, 180], [89, 172], [87.5, 140], [88, 116], [92, 112]]] },
  },
  {
    id: "obliques",
    name: "External obliques",
    group: "Side of abdomen",
    action: "Twist and side-bend the trunk.",
    pain: "Side of the abdomen and groin; can feel like heartburn or a 'stitch'.",
    causes: "Twisting sports (golf, tennis), coughing, lifting while turning.",
    relief: "Rest, heat, gentle side stretches.",
    fiber: 52,
    draw: { front: [[[70, 112], [86, 116], [86.5, 150], [88, 175], [80, 186], [73, 180], [70.5, 160], [68.5, 138], [67, 124]]] },
  },
  {
    id: "erectorSpinae",
    name: "Erector spinae & multifidus",
    group: "Spine muscles",
    action: "Straighten and support the spine; control bending.",
    pain: "Aching or spasm alongside the spine in the mid or low back, sometimes into the buttock.",
    causes: "Lifting with a bent back, long sitting or standing, sudden movements.",
    relief: "Keep moving, heat, knee-to-chest and cat-cow stretches; core and back strengthening.",
    fiber: 90,
    draw: { back: [[[99.5, 92], [99.5, 196], [95, 198], [92, 186], [91.5, 150], [93, 118], [96, 96]]] },
  },
  {
    id: "quadratusLumborum",
    name: "Quadratus lumborum",
    group: "Deep low back",
    action: "Side-bends the trunk and hitches the hip; steadies the spine.",
    pain: "Deep one-sided low-back ache that can spread to the hip and buttock; sharp when turning in bed, coughing or standing up from sitting.",
    causes: "Lifting and twisting, standing on one leg, sleeping on a soft mattress, leg-length difference.",
    relief: "Side-lying stretch over a pillow, child's pose reaching to one side, heat.",
    deep: { back: [R(82, 150, 12, 36)] },
  },
  {
    id: "iliopsoas",
    name: "Iliopsoas (hip flexor)",
    group: "Hip flexor",
    action: "Lifts the thigh and bends the trunk forward at the hip.",
    pain: "Low back ache alongside the spine and pain in the groin/front of the thigh; worse standing up straight after sitting.",
    causes: "Long sitting, running, kicking, sit-ups.",
    relief: "Kneeling hip-flexor (lunge) stretch, avoid long sitting, glute strengthening.",
    fiber: 62,
    draw: { front: [[[80, 188], [88, 200], [95, 214], [91, 218], [83, 206], [77, 194]]] },
    deep: { front: [R(82, 150, 14, 36)] },
  },
  // ------------------------------------------------------------ hip & buttock
  {
    id: "gluteMax",
    name: "Gluteus maximus",
    group: "Buttock",
    action: "Extends the hip (climbing, standing up, running).",
    pain: "Buttock ache, worse sitting for long or climbing hills; can be tender near the tailbone.",
    causes: "Sitting, hill running, squats, falls on the buttock.",
    relief: "Knee-to-opposite-shoulder stretch, massage ball while seated or lying, bridges.",
    fiber: 30,
    draw: { back: [[[73, 198], [86, 196], [99, 200], [99.5, 224], [90, 231], [79, 228], [74, 216]]] },
  },
  {
    id: "gluteMed",
    name: "Gluteus medius & minimus",
    group: "Outer buttock / hip",
    action: "Keep the pelvis level when you stand on one leg; move the leg out to the side.",
    pain: "Outer hip and buttock, low back/sacrum, sometimes down the side of the thigh; worse walking, lying on that side.",
    causes: "Running, standing hanging on one hip, weakness, crossing legs.",
    relief: "Clam shells, side-lying leg raises, figure-4 stretch; avoid lying on the sore side.",
    fiber: 70,
    draw: { back: [[[72, 186], [82, 183], [95, 190], [92, 198], [80, 200], [71.5, 198]]] },
  },
  {
    id: "piriformis",
    name: "Piriformis & deep rotators",
    group: "Deep buttock",
    action: "Rotate the hip outwards.",
    pain: "Deep buttock pain that can run down the back of the thigh (sciatica-like) — the sciatic nerve passes right by it.",
    causes: "Long sitting (especially on a wallet), running, driving.",
    relief: "Figure-4 / piriformis stretch, massage ball, take sitting breaks.",
    deep: { back: [R(80, 202, 18, 12)] },
  },
  {
    id: "tfl",
    name: "Tensor fasciae latae",
    group: "Outer hip",
    action: "Helps lift and turn the thigh inward; tightens the IT band.",
    pain: "Front-outer hip, spreading down the outer thigh towards the knee.",
    causes: "Running, long sitting, standing with weight on one leg.",
    relief: "Hip-flexor and outer-hip stretches, massage ball (not too hard), glute strengthening.",
    fiber: 78,
    draw: { front: [[[70, 190], [76, 192], [78, 206], [75, 222], [70.5, 214], [69.5, 200]]] },
  },
  {
    id: "itBand",
    name: "Iliotibial (IT) band",
    group: "Outer thigh",
    action: "A thick strap of tissue that steadies the outer hip and knee.",
    pain: "Outer thigh and especially the outer knee — sharp pain while running, often at a predictable distance or downhill.",
    causes: "Increasing running distance, downhill running, cambered roads, weak hip muscles.",
    relief: "Reduce running, strengthen glutes; foam roll the outer thigh muscles (not the band itself) gently.",
    tendon: true,
    fiber: 80,
    draw: {
      front: [[[69.5, 214], [72, 216], [76.5, 262], [79, 294], [77, 296], [73, 266], [69.5, 234]]],
      back: [[[69.5, 206], [72, 208], [77, 262], [79.5, 296], [77.5, 298], [73.5, 266], [69.5, 230]]],
    },
  },
  {
    id: "adductors",
    name: "Adductors",
    group: "Inner thigh",
    action: "Bring the legs together; steady the pelvis.",
    pain: "Groin and inner thigh, sometimes down to the inner knee.",
    causes: "Football, sprinting, changing direction, horse riding, slipping into the splits.",
    relief: "Gentle butterfly and side-lunge stretches once the acute pain settles, adductor squeezes.",
    fiber: 70,
    draw: { front: [[[88, 206], [99, 222], [99, 232], [96, 252], [92, 262], [90, 240], [85, 222]]] },
  },
  {
    id: "sartorius",
    name: "Sartorius",
    group: "Thigh",
    action: "Crosses the legs (bends, lifts and turns out the hip; bends the knee).",
    pain: "Superficial burning or tingling along the inner thigh to the inner knee.",
    causes: "Running, cycling, sitting cross-legged.",
    relief: "Gentle quad and hip-flexor stretches, massage along the strap.",
    fiber: 68,
    draw: { front: [[[74, 196], [78, 197], [86, 230], [94, 268], [96, 292], [93, 294], [89, 270], [81, 234]]] },
  },
  // ------------------------------------------------------------ thigh & knee
  {
    id: "rectusFemoris",
    name: "Rectus femoris (quadriceps)",
    group: "Front of thigh",
    action: "Straightens the knee and lifts the thigh (kicking, sprinting).",
    pain: "Front of the thigh and deep in the front of the knee, often worse at night.",
    causes: "Kicking, sprinting, squatting, a direct knock ('dead leg').",
    relief: "Standing quad stretch (heel to bottom), ice after a knock, gradual strengthening.",
    fiber: 88,
    draw: { front: [[[80, 214], [86, 212], [89, 240], [89, 270], [87, 286], [83, 286], [80, 262], [78, 236]]] },
  },
  {
    id: "vastusLateralis",
    name: "Vastus lateralis (quadriceps)",
    group: "Outer thigh",
    action: "Straightens the knee.",
    pain: "Outer thigh and outer side of the knee; can make the kneecap feel stuck.",
    causes: "Running, cycling, squats.",
    relief: "Foam rolling the outer-front thigh, quad stretches.",
    fiber: 84,
    draw: { front: [[[71, 220], [77, 222], [80, 250], [82, 278], [81, 292], [77, 292], [74, 272], [71.5, 248], [70, 232]]] },
  },
  {
    id: "vastusMedialis",
    name: "Vastus medialis (quadriceps)",
    group: "Inner thigh above the knee",
    action: "Straightens the knee and guides the kneecap.",
    pain: "Inner side of the knee; sometimes the knee 'buckles'.",
    causes: "Squatting, stairs, weakness after knee injuries.",
    relief: "Quad strengthening (straight-leg raises, step-downs), quad stretches.",
    fiber: 70,
    draw: { front: [[[92, 252], [97, 262], [96, 284], [92, 294], [87.5, 292], [88, 276], [90, 262]]] },
  },
  {
    id: "patellarTendon",
    name: "Patellar tendon",
    group: "Below the kneecap",
    action: "Connects the quadriceps to the shin bone.",
    pain: "Pain just below the kneecap, worse jumping, squatting and on stairs (jumper's knee); in teenagers, a tender bump below the knee (Osgood-Schlatter).",
    causes: "Jumping sports, sudden increase in training, growth spurts.",
    relief: "Load management, isometric holds (wall sits), patellar strap; slow heavy strengthening.",
    tendon: true,
    deep: { front: [R(84, 302, 9, 12)] },
  },
  {
    id: "pesAnserine",
    name: "Pes anserine tendons",
    group: "Inner knee",
    action: "Where three thigh-muscle tendons attach to the inner shin.",
    pain: "Tenderness on the inner side of the knee, just below the joint; worse on stairs and at night.",
    causes: "Running, knee arthritis, being overweight, tight hamstrings.",
    relief: "Ice, pillow between knees at night, hamstring and quad stretches.",
    tendon: true,
    deep: { front: [R(91, 300, 8, 14)] },
  },
  {
    id: "hamstringLateral",
    name: "Biceps femoris (hamstring)",
    group: "Back of thigh (outer)",
    action: "Bends the knee and extends the hip.",
    pain: "Back of the thigh and behind the knee; sharp pain during sprinting suggests a strain.",
    causes: "Sprinting, high kicks, long sitting, weak glutes.",
    relief: "Gentle hamstring stretches once acute pain settles; bridges, then Nordic curls to strengthen.",
    fiber: 82,
    draw: { back: [[[73, 232], [81, 232], [85, 260], [84, 290], [80, 294], [76, 272], [72.5, 250]]] },
  },
  {
    id: "hamstringMedial",
    name: "Semitendinosus & semimembranosus (hamstrings)",
    group: "Back of thigh (inner)",
    action: "Bend the knee and extend the hip.",
    pain: "Lower buttock, back of the thigh and inner back of the knee.",
    causes: "Sprinting, stretching too hard, long sitting.",
    relief: "Hamstring stretches, bridges, gradual return to running.",
    fiber: 94,
    draw: { back: [[[86, 232], [98, 232], [98, 252], [95, 276], [93, 294], [88, 292], [86, 264]]] },
  },
  {
    id: "popliteus",
    name: "Popliteus",
    group: "Back of knee (deep)",
    action: "Unlocks the straight knee and steadies it.",
    pain: "Pain behind the knee, worse running downhill, walking down stairs or crouching.",
    causes: "Downhill running, twisting on a bent knee.",
    relief: "Rest from downhill running, gentle massage, calf and hamstring stretches.",
    deep: { back: [R(80, 290, 16, 14)] },
  },
  // ------------------------------------------------------------ lower leg & foot
  {
    id: "tibialisAnterior",
    name: "Tibialis anterior",
    group: "Shin",
    action: "Lifts the foot and toes (stops the foot slapping when you walk).",
    pain: "Front of the shin, ankle and big toe; aching along the shin with running.",
    causes: "New or increased running, hills, hard surfaces, tight calves.",
    relief: "Reduce running load, massage along the outside of the shin, calf stretches.",
    fiber: 88,
    draw: { front: [[[80, 312], [86, 314], [87, 340], [86, 368], [84, 378], [81, 372], [78.5, 346], [78, 326]]] },
  },
  {
    id: "peroneals",
    name: "Peroneals (fibularis)",
    group: "Outer lower leg",
    action: "Turn the foot outwards and steady the ankle.",
    pain: "Outer side of the lower leg and behind the outer ankle bone.",
    causes: "Ankle sprains, running on cambered surfaces, high-arched feet.",
    relief: "Balance and ankle-strengthening exercises, massage.",
    fiber: 90,
    draw: { front: [[[77.5, 318], [79, 320], [80, 350], [82, 380], [80, 382], [77.5, 356], [77, 336]]] },
  },
  {
    id: "gastrocnemius",
    name: "Gastrocnemius (calf)",
    group: "Calf",
    action: "Points the foot and pushes off when walking, running and jumping.",
    pain: "Calf ache or cramp, behind the knee, and sometimes the arch of the foot; a sudden 'kick' in the calf suggests a tear.",
    causes: "Running and jumping, high heels, dehydration (cramps), sudden push-off.",
    relief: "Straight-knee calf stretch against a wall, massage, gradual calf raises.",
    fiber: 90,
    draw: {
      front: [[[92, 312], [95.5, 318], [96, 336], [94, 350], [91.5, 346], [91, 328]]],
      back: [
        [[78, 302], [86, 302], [87.5, 330], [85, 352], [81, 348], [78, 326]],
        [[89, 302], [96, 302], [96.5, 326], [94, 350], [90, 352], [88.5, 330]],
      ],
    },
  },
  {
    id: "soleus",
    name: "Soleus (deep calf)",
    group: "Lower calf",
    action: "Points the foot; keeps you upright when standing.",
    pain: "Lower calf and heel; can make walking uphill or stairs painful.",
    causes: "Running, especially uphill; standing all day.",
    relief: "Bent-knee calf stretch, seated calf raises, massage.",
    fiber: 86,
    draw: { back: [[[79, 340], [83, 350], [88, 356], [94, 350], [96, 348], [95, 368], [91, 378], [85, 378], [81, 368]]] },
  },
  {
    id: "achillesTendon",
    name: "Achilles tendon",
    group: "Back of ankle",
    action: "Connects the calf muscles to the heel bone.",
    pain: "Pain and stiffness at the back of the ankle/heel, worst first thing in the morning.",
    causes: "Running more, hills, tight calves, flat shoes; some antibiotics (quinolones).",
    relief: "Slow heavy heel raises, a small heel lift, avoid going barefoot. A sudden snap needs urgent review.",
    tendon: true,
    fiber: 90,
    draw: { back: [[[86.5, 366], [90, 366], [90.5, 392], [86, 392]]] },
  },
  {
    id: "plantarFascia",
    name: "Plantar fascia",
    group: "Sole of the foot",
    action: "A strong band supporting the arch.",
    pain: "Sharp heel pain, worst on the first steps in the morning or after resting.",
    causes: "Standing jobs, running, unsupportive shoes, weight gain, tight calves.",
    relief: "Calf and arch stretches, roll the sole on a frozen bottle, cushioned supportive shoes.",
    tendon: true,
    deep: { back: [E(88, 403, 10, 9)] },
  },
  {
    id: "footExtensors",
    name: "Foot extensors",
    group: "Top of the foot",
    action: "Lift the toes.",
    pain: "Ache across the top of the foot; tender tendons.",
    causes: "Tight laces, new shoes, running more.",
    relief: "Loosen or re-lace shoes, ice, rest from running.",
    fiber: 90,
    draw: { front: [[[82, 392], [94, 393], [96, 404], [90, 410], [82, 406]]] },
  },
];

export const MUSCLE_BY_ID: Record<string, Muscle> = Object.fromEntries(MUSCLES.map((m) => [m.id, m]));

const W = 200;

function inPoly(pts: P[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inShape(s: Shape, x: number, y: number): boolean {
  if (s.kind === "ellipse") return ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1;
  return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
}

function polyArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

/** Display name, refined by position for multi-part muscles. */
export function muscleLabel(m: Muscle, y: number, view: View): string {
  if (m.id === "trapezius" && view === "back") {
    if (y < 84) return "Upper trapezius";
    if (y < 114) return "Middle trapezius";
    return "Lower trapezius";
  }
  if (m.id === "trapezius") return "Upper trapezius";
  if (m.id === "deltoid") return view === "front" ? "Deltoid (front & side)" : "Deltoid (rear)";
  return m.name;
}

export type MuscleHit = { muscle: Muscle; label: string; deep: boolean };

/** Muscles under a point on the map, superficial first. */
export function musclesAt(view: View, x: number, y: number): MuscleHit[] {
  const ax = x > W / 2 ? W - x : x;
  const surface: { m: Muscle; area: number }[] = [];
  const deep: Muscle[] = [];
  for (const m of MUSCLES) {
    const shapes = m.draw?.[view];
    if (shapes) {
      const hit = shapes.find((pts) => inPoly(pts, ax, y));
      if (hit) {
        surface.push({ m, area: polyArea(hit) });
        continue;
      }
    }
    if (m.deep?.[view]?.some((s) => inShape(s, ax, y))) deep.push(m);
  }
  surface.sort((a, b) => a.area - b.area);
  return [
    ...surface.map(({ m }) => ({ muscle: m, label: muscleLabel(m, y, view), deep: false })),
    ...deep.map((m) => ({ muscle: m, label: muscleLabel(m, y, view), deep: true })),
  ];
}

/** Drawn muscle outlines for a view, both halves. */
export function drawnMuscles(view: View): { muscle: Muscle; side: "A" | "B"; pts: P[]; fiber: number }[] {
  const out: { muscle: Muscle; side: "A" | "B"; pts: P[]; fiber: number }[] = [];
  for (const m of MUSCLES) {
    for (const pts of m.draw?.[view] ?? []) {
      out.push({ muscle: m, side: "A", pts, fiber: m.fiber ?? 90 });
      out.push({ muscle: m, side: "B", pts: pts.map(([x, y]) => [W - x, y] as P), fiber: 180 - (m.fiber ?? 90) });
    }
  }
  return out;
}

export function centroid(pts: P[]): P {
  const n = pts.length;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}
