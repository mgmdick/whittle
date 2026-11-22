# Whittle

*Whittle down what's hurting.*

A small mobile web app for showing where you're sore:

- **Body** — a carved-wood figure, front and back. Tap the exact sore spot to
  give it a 1–10 intensity, what it feels like and a note; the app names the
  **muscles under that spot** (superficial and deep). Switch to **Muscles** to
  reveal an anatomical muscle layer; pinch, scroll or use **+** to zoom and
  labels appear. Tap any muscle for what it does, how it hurts (including
  referred pain), common causes and what helps. ~50 muscles and tendons
  (`lib/muscles.ts`).
- **Mannequin** — a 3D wooden artist's mannequin (three.js) on its stand, with
  two modes:
  - **Movement check** (default) — an animated Q&A, like a physio's quick
    screen. Tap where it hurts on the mannequin (or pick an area), say which
    side and exactly where, then the mannequin demonstrates 4–5 standard test
    movements one at a time while the camera swings to the best angle. Answer
    *No pain / Hurts / Hurts a lot / Can't do it*, with follow-ups where they
    matter (e.g. *where in the lift* it hurt → painful arc vs AC joint). It
    ends by asking whether movement changes the pain at all. Nine areas
    (`lib/movementCheck.ts`); results feed the assessment.
  - **Free pose** — tap a part to select it ("It hurts here" + plain-language
    sliders), drag limbs (IK with anatomical joint limits), grouped movement
    presets with a Left/Right switch, camera angle buttons, and a physics mode
    (cannon-es ragdoll) that knocks it off its stand.
- **Assess** — answers a few quick questions (how long, how it started, age,
  red-flag symptoms) and gives:
  - a **triage verdict**: emergency / get seen today / book a doctor / self-care,
    with the reasons;
  - the **most likely explanations**, ranked, each with why it fits, what it is,
    what helps, and when to see a doctor. This runs on a built-in rules engine
    (`lib/diagnose.ts`) covering ~100 conditions, using where the pain is (down to inner/outer side
    and above/below the kneecap), the muscles under it, how it feels, painful
    movements, and an "anything else?" symptom checklist — works offline, no key
    needed;
  - an optional **AI second opinion** from Claude (see below).
- **Log** — saved maps and painful movements with dates; **Share with doctor**
  sends a plain-text summary via the phone's share sheet (or copies it).

> This is a symptom checker, not a medical diagnosis. It's designed to be
> cautious and to point people to the right level of care.

No accounts, no database: everything is stored in the browser on your phone
(`localStorage`). Clearing site data clears the log. It's installable — on
iPhone use Share → *Add to Home Screen*; on Android, *Install app*.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```

## Deploy to Vercel

1. In Vercel, **Add New → Project** and import this repository.
2. Framework preset: Next.js (auto-detected). No other settings needed.
3. Click **Deploy**. No environment variables are required.

Every push to `main` redeploys automatically.

### Optional: AI second opinion

To turn on the "AI second opinion" card in the Assess tab, add these in
Vercel → Project → Settings → Environment Variables, then redeploy:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com. Enables the AI card. |
| `ACCESS_CODE` | Recommended. Any secret phrase; users must enter it before an AI request, so strangers can't spend your API credit. |

Only the pain descriptions and quick-question answers are sent — no names.
Without the key the card simply doesn't appear.
