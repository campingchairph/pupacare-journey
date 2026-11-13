# Itchy Dog App — SPEC v0.1

Plan builder for itchy/allergic dogs when Apoquel/Cytopoint stop working.
Logic from Dr. Steve Marsden's 2-part webinar. Decision rules live in `rules.json`.

## Decisions (locked)
| | |
|---|---|
| Market | Philippines first (PHP, local foods, local sourcing) |
| Species | Dogs only (v1). Cats later — separate branch |
| Doses | Never shown/computed. Link to product label + "confirm with your vet" |
| Revenue | Affiliate links (disclosed) |
| Stack | Expo (React Native) + Supabase |

## Core principle
The app **suggests a plan to discuss with a vet**. It does not diagnose and never says "cure".
Rules engine **decides**; LLM (optional) only **explains** in plain Taglish/English.

## User flow
1. **Red-flag screen** (always first, every check-in) → any yes = "Go to a vet now", no plan.
2. **Dog profile** — name, breed, age, sex, weight, body condition (photo guide), city.
3. **Diet** — type, brand, % plants, starch items, treats, known food triggers, probiotic + species.
4. **Meds** — each drug: dose, duration, worked?, stopped working?, flares on dose drop?, side effects.
5. **Symptoms** — body map tap + severity; when flares happen (hot/humid onset? ~6-month cycle? year-round?).
6. **Owner checks** — guided with photos: ear/paw temp, torso heat, tongue photo, dandruff location, ear-edge crusts, nails, gas, stool.
7. **Temperament** — exuberant / irritable / reactive-aggressive / fearful-timid.
8. **History** — cruciate, hip dysplasia, autoimmune dx, Cushing's, KCS, bloodwork (eosinophils, calcium) optional.
9. **Result** — pattern scores (all 5, bar chart) + which gate fired + plain-language why.
10. **Plan** — phased (Wk 0–2, 2–6, 6+): diet foundation, formulas (classical + brand), taper steps, what to watch.
11. **Daily log** — itch 0–10, photo, stool score, ears, notes.
12. **Check-in every 14 days** — re-runs red flags + response loop → plan updates.
13. **Vet report PDF** — profile, history, scores, current plan, log chart.

## Patterns (see rules.json)
- `innate` — Damp Heat. Processed food driven.
- `adaptive` — leaky gut / microbiome. On real food but not resolved.
- `blood_def` — endothelial dysfunction. Dry, scurfy, cool extremities, young.
- `severe` — red/raw/autoimmune. Needs "ice pack" first.
- `low_grade` — Qi deficiency. Mild, chronic, distal, fearful dog.

## Supabase tables
```
dogs(id, owner_id, name, breed, dob, sex, weight_kg, bcs, city)
diet_entries(id, dog_id, started_at, type, brand, plant_fraction, starch_items[], probiotic, species[])
med_history(id, dog_id, drug, dose, start, end, worked, stopped_working, flares_on_reduction)
symptoms(id, dog_id, region, severity, recorded_at)
sign_answers(id, assessment_id, sign_id, value, source[owner|photo|vet|bloodwork])
assessments(id, dog_id, rules_version, scores jsonb, gate_id, created_at)
plans(id, assessment_id, phase, items jsonb, active)
daily_logs(id, dog_id, date, itch, stool, ears, photo_url, note)
checkins(id, dog_id, date, response[better|same|worse|itchier_on_new_herb], red_flag)
products(id, formula_key, brand, ph_source, affiliate_url, label_dose_url, price_php)
```

## Developer notes
- `rules.json` is versioned; store `rules_version` on every assessment so old results stay explainable.
- Keep **all** pattern scores; patterns overlap (e.g. adaptive + blood_def → Cessorex covers both).
- Seasonality: ask about **cycles** (hot/humid onset, ~6-month cycle), not US months.
- Taper UI per drug: Apoquel/Atopica = dose steps; Prednisone = vet schedule only; Cytopoint = longer interval, vet decides.
- Owner-checkable signs get photo guides; `vet_only` signs are optional and editable by a vet.
- Affiliate disclosure on every product card + settings page. Show classical formula name first so users can source alternatives.
- Weights are v0 guesses — log outcomes so they can be tuned.

## Safety (non-negotiable)
- Red flags block plan generation.
- No dose numbers, ever.
- "Never stop prednisone suddenly" shown on any taper screen.
- Long Dan Xie Gan Tang, ImmunoBalm: "vet supervision" badge.
- Raw-food handling guide if raw is chosen.
- Disclaimer: one integrative vet's approach; not mainstream veterinary consensus.

## TODO before build
- [ ] PH sourcing per product (Gold Standard Herbs / Kan Essentials ship to PH? local TCM vets? iHerb?) + affiliate programs
- [ ] PH raw/fresh dog food suppliers list
- [ ] Find a PH integrative/TCM vet partner for review
- [ ] Photo guides: tongue colour, ear-margin crusts, scurf, body condition
- [ ] Test with 3–5 real dogs; tune weights
