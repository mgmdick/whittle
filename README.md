# Where it hurts

A small mobile web app for showing where you're sore:

- **Body** — tap the exact spot on a front/back body map. Each spot gets a 1–10
  intensity, what it feels like (sharp, aching, burning…) and a note.
- **Dummy** — drag a posable mannequin's arms, legs, head and torso into the
  position that hurts (or start from a preset like *Arms overhead*, *Bend
  forward*, *Squat*), then tap the parts/joints that are sore. Angles are shown
  while you drag (e.g. "Right upper arm · 120°").
- **Assess** — answers a few quick questions (how long, how it started, age,
  red-flag symptoms) and gives:
  - a **triage verdict**: emergency / get seen today / book a doctor / self-care,
    with the reasons;
  - the **most likely explanations**, ranked, each with why it fits, what it is,
    what helps, and when to see a doctor. This runs on a built-in rules engine
    (`lib/diagnose.ts`) covering ~45 common conditions — works offline, no key
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
cd body-map
npm install
npm run dev   # http://localhost:3000
```

## Deploy to Vercel

This app lives in the `body-map/` folder of the repo, next to the Story Prompts
app, so it's deployed as its **own** Vercel project:

1. In Vercel, **Add New → Project** and import this repository.
2. Set **Root Directory** to `body-map`. Framework preset: Next.js (auto-detected).
3. Click **Deploy**. No environment variables are required.

### Optional: AI second opinion

To turn on the "AI second opinion" card in the Assess tab, add these in
Vercel → Project → Settings → Environment Variables, then redeploy:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com. Enables the AI card. |
| `ACCESS_CODE` | Recommended. Any secret phrase; users must enter it before an AI request, so strangers can't spend your API credit. |

Only the pain descriptions and quick-question answers are sent — no names.
Without the key the card simply doesn't appear.

Or from the CLI: `cd body-map && npx vercel` (choose the defaults), then
`npx vercel --prod`.
