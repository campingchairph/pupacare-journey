# PupaCare Journey

A phone-first journal and plan-builder for itchy, allergic dogs, made by fur-parents in the Philippines for Pupa and every dog with the same skin troubles.
**We're not vets.** The app suggests a plan to *discuss with your vet*. It never diagnoses and never gives doses.

Logic follows Dr. Steve Marsden's two-part webinar (one integrative vet's approach, not mainstream veterinary consensus).

## Run it
No build step. Open `index.html` through any static server, or use GitHub Pages:
`https://campingchairph.github.io/pupacare-journey/`

On your phone, open the link, then use **Add to Home Screen** to make it feel like an app.

## Files
| File | What it does |
|---|---|
| `index.html` | App shell, welcome screen, tab bar, bottom sheet |
| `pupacare.css` | All styles (warm cream palette, Fraunces + Nunito) |
| `pupacare-app.js` | State, rules engine, screens, charts, vet report |
| `rules.json` | Decision rules (source of truth, versioned) |
| `rules.js` | Same rules as a script so the app works offline. **Regenerate after editing `rules.json`** |
| `SPEC.md` | Product spec |
| `DESIGN.md` | Visual build spec (MotionSites references) |
| `sw.js`, `manifest.json`, `icon.svg` | PWA bits (offline + home-screen icon) |

Regenerate `rules.js` after changing `rules.json`:
```bash
{ printf '/* Generated from rules.json. Keep in sync: edit rules.json, then regenerate this file. */\nwindow.PUPA_RULES = '; cat rules.json; printf ';\n'; } > rules.js
```

## Data
Everything stays **on the phone**: answers in `localStorage` (`pupacare_data`), photos in IndexedDB.
Nothing is uploaded. Use **Settings → Export backup** now and then, and before switching phones.

## How the plan is chosen
1. Red flags (every check and check-in): any "yes" means **go to a vet now**, and no plan is made.
2. Five pattern scores = sum of weights of true signs ÷ all weights (≥30% moderate, ≥50% high). All five are kept.
3. Gates: processed food (G1a/G1b) → real food and radically better (G2a) → raw with too few plants (G2b) → real food, not resolved: formula by pattern (G2c).
4. Check-in every 14 days runs the response loop and suggests what to ask your vet next.

Every assessment stores `rulesVersion` so old results stay explainable. Weights are v0 guesses; tune them with real outcomes.
