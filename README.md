# Where it hurts

A small mobile web app for showing where you're sore:

- **Body** — tap the exact spot on a front/back body map. Each spot gets a 1–10
  intensity, what it feels like (sharp, aching, burning…) and a note.
- **Dummy** — drag a posable mannequin's arms, legs, head and torso into the
  position that hurts (or start from a preset like *Arms overhead*, *Bend
  forward*, *Squat*), then tap the parts/joints that are sore. Angles are shown
  while you drag (e.g. "Right upper arm · 120°").
- **Log** — saved maps and painful movements with dates; **Share with doctor**
  sends a plain-text summary via the phone's share sheet (or copies it).

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
3. No environment variables are needed. Click **Deploy**.

Or from the CLI: `cd body-map && npx vercel` (choose the defaults), then
`npx vercel --prod`.
