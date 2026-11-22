# Whittle

*Whittle down what's hurting.*

A small mobile web app for showing where you're sore:

- **Check** — a 3D wooden artist's mannequin (three.js) on its stand. It waves
  hello, then three modes:
  - **Check** (default) — an animated Q&A, like a physio's quick screen. Tap
    where it hurts (or pick an area), choose side and exact spot, and the
    mannequin demonstrates 4–5 standard test movements while the camera swings
    to the best angle. Answer *No pain / Hurts / Hurts a lot / Can't do it*
    (answers dock above the tab bar), with follow-ups where they matter. Ends
    with "does movement change the pain?". Re-checking the same area later
    shows what improved (↑) or got worse (↓). Nine areas
    (`lib/movementCheck.ts`).
  - **Exercises** — ~30 gentle stretches, strengthening and mobility exercises
    the mannequin performs on a loop with a rep counter, dose, steps and a
    safety note (`lib/exercises.ts`). Opened with a plan from Results, or
    browsed by area.
  - **Free pose** — select parts ("It hurts here" + sliders), drag limbs (IK
    with anatomical joint limits), movement presets, camera angles, and a
    physics ragdoll mode.
- **Results** — your mannequin snapshot beside a clear verdict, the top likely
  causes with **Show me the exercises**, and **Share with my physio or GP**. It answers a few quick questions (how long, how it started, age,
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
- **History** — saved checks with **Re-check**; **Share with doctor**
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
