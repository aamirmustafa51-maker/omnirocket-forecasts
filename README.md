# OmniRocket — Fatigue Forecasts

Personalized Meta ad fatigue forecasts hosted at `omnirocket.vercel.app/forecast/[brand-slug]`.

## How it works

- Each prospect gets a JSON file at `forecasts/[brand-slug].json`
- The Next.js dynamic route `app/forecast/[slug]/page.tsx` reads that JSON and renders the template
- Ad screenshots live at `public/ads/[brand-slug]/ad-N.jpg`
- Make.com automation generates the JSON + downloads images per "interested" lead, then commits to this repo

## Local dev

```
npm install
npm run dev
```

Then visit:
- `http://localhost:3000/` — homepage
- `http://localhost:3000/forecast/roland-mouret` — sample forecast

## Adding a new forecast manually

1. Drop a JSON into `forecasts/[slug].json` matching `roland-mouret.json` schema
2. (Optional) Drop ad images into `public/ads/[slug]/ad-1.jpg` ... `ad-5.jpg`
3. Commit + push → Vercel auto-deploys
4. Visit `/forecast/[slug]`

## Production pipeline (Make.com)

See `MAKE_WORKFLOW.md` and `PRODUCTION_PROMPT.md` in the parent directory.
