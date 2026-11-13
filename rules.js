/* Generated from rules.json. Keep in sync: edit rules.json, then regenerate this file. */
window.PUPA_RULES = {
  "version": "0.2.0",
  "source": "Dr. Steve Marsden webinars Part 1 (l-wDg2rI6fc) + Part 2 (PxsTj3w0qsY). Weights are v0 heuristics, NOT from the source — tune with real cases.",
  "species": ["dog"],
  "market": "PH",

  "red_flags": [
    { "id": "face_swelling", "q": "Sudden swelling of face, lips or eyes?" },
    { "id": "breathing", "q": "Trouble breathing, noisy breathing or gums turning blue/grey?" },
    { "id": "collapse", "q": "Collapse, extreme weakness or can't stand?" },
    { "id": "vomit_diarrhea_blood", "q": "Repeated vomiting or bloody diarrhoea today?" },
    { "id": "pale_gums", "q": "Very pale or white gums?" }
  ],
  "red_flag_action": "STOP_PLAN_GO_TO_VET_NOW",

  "diet": {
    "processed": ["kibble", "canned", "baked", "air_dried", "dehydrated", "freeze_dried"],
    "real": ["raw_commercial", "raw_homemade", "cooked_commercial", "cooked_homemade", "lightly_cooked"],
    "high_starch_flags": ["rice", "potato", "bread", "corn", "pasta"],
    "foundation": {
      "base": "fresh meat-based food, raw or cooked",
      "plant_fraction": { "min": 0.167, "max": 0.333, "examples": ["sweet potato (kamote)", "squash (kalabasa)", "carrot", "pechay", "malunggay", "berries"], "never": ["onion"], "minimal": ["garlic"] },
      "probiotic_species_required_any": ["Lactobacillus", "Bifidobacterium", "Bacteroides"],
      "probiotic_note": "Bacteroides is rarely sold as a pet probiotic and could not be verified from the source (possible transcript error); in practice look for Lactobacillus or Bifidobacterium.",
      "probiotic_wrong_niche": ["Enterococcus faecium"],
      "probiotic_wrong_niche_note": "Dr. Marsden's view, not mainstream guidance; E. faecium is a common, generally safe pet probiotic.",
      "skip_adding_plants_if_plant_fraction_gte": 0.167
    }
  },

  "patterns": {
    "innate": {
      "label": "Innate excess (Damp Heat)",
      "signs": [
        { "id": "eats_processed", "w": 3 },
        { "id": "high_starch_homemade", "w": 2 },
        { "id": "certain_kibbles_worse", "w": 2 },
        { "id": "worse_hot_humid_onset", "w": 2 },
        { "id": "overweight", "w": 2 },
        { "id": "roving_inflammation", "w": 3, "note": "skin + ears + eyes + paws + gut, moving around" },
        { "id": "moist_hot_spots_pyoderma", "w": 2 },
        { "id": "yeasty_waxy_ears", "w": 1 },
        { "id": "better_on_fewer_carbs", "w": 2 },
        { "id": "antibiotic_responsive_recurrence", "w": 1 },
        { "id": "colitis_or_gi_flares", "w": 1 },
        { "id": "hives_swelling_history", "w": 1 },
        { "id": "temperament_exuberant_or_irritable", "w": 1 },
        { "id": "tongue_red", "w": 1, "vet_or_photo": true }
      ]
    },
    "adaptive": {
      "label": "Adaptive / leaky gut",
      "signs": [
        { "id": "on_real_food_not_resolved", "w": 3 },
        { "id": "low_plant_raw_diet", "w": 2 },
        { "id": "temperament_reactive_anxious_aggressive", "w": 2 },
        { "id": "six_month_cycle", "w": 3 },
        { "id": "late_season_or_now_year_round", "w": 1 },
        { "id": "drugs_worked_then_failed", "w": 3 },
        { "id": "flares_on_dose_reduction", "w": 2 },
        { "id": "cruciate_or_hip_history", "w": 1 },
        { "id": "high_eosinophils", "w": 2, "bloodwork": true },
        { "id": "hypercalcemia_idiopathic", "w": 1, "bloodwork": true, "vet_warning": "Unexplained high calcium is very rare in dogs; the most common cause is lymphoma. Needs a full vet workup first." },
        { "id": "kcs_dry_eye", "w": 1 }
      ]
    },
    "blood_def": {
      "label": "Blood deficiency (endothelial dysfunction)",
      "signs": [
        { "id": "young_under_2y", "w": 2 },
        { "id": "dry_coarse_thin_coat", "w": 2 },
        { "id": "scurf_on_back_white_flakes", "w": 2 },
        { "id": "ear_margin_crusting", "w": 2 },
        { "id": "cool_ears_paws", "w": 2 },
        { "id": "whack_a_mole_pyoderma", "w": 2 },
        { "id": "omega3_helped_fast", "w": 2 },
        { "id": "tongue_lavender", "w": 1, "vet_or_photo": true },
        { "id": "weak_pulse", "w": 1, "vet_only": true }
      ],
      "cautions": [{ "id": "gassy", "msg": "Gassy dogs may get loose stools on Four Substances (Si Wu Tang) — start low, tell your vet." }]
    },
    "severe": {
      "label": "Severe / autoimmune (needs 'ice pack')",
      "signs": [
        { "id": "lesions_red_raw_ulcerated", "w": 3 },
        { "id": "autoimmune_diagnosis", "w": 4 },
        { "id": "hot_torso_cold_extremities", "w": 3, "note": "owner sweats where dog touches them" },
        { "id": "calcinosis_cutis", "w": 2, "vet_warning": "In dogs often linked to Cushing's disease or long-term steroid use. Ask your vet." },
        { "id": "itchier_on_cessorex", "w": 3 },
        { "id": "miserable_unhappy", "w": 1 }
      ]
    },
    "low_grade": {
      "label": "Low-grade / Qi deficiency (Galvanex)",
      "signs": [
        { "id": "mild_itch_only", "w": 2 },
        { "id": "nail_disease_onychodystrophy", "w": 3 },
        { "id": "mild_pododermatitis", "w": 2 },
        { "id": "chronic_distal_infection", "w": 2 },
        { "id": "temperament_fearful_timid", "w": 2 },
        { "id": "long_term_apoquel_atopica", "w": 2 },
        { "id": "probiotics_not_helping", "w": 1 },
        { "id": "classic_low_energy_tires_easily", "w": 1 },
        { "id": "classic_poor_picky_appetite", "w": 1 },
        { "id": "classic_chronic_soft_stool", "w": 1 },
        { "id": "classic_feels_cold_easily", "w": 1 },
        { "id": "classic_rectal_prolapse_history", "w": 1, "vet_trigger": true }
      ],
      "exclude_if": ["severe.score_high"]
    }
  },

  "scoring": {
    "method": "sum(weights of true signs) / sum(all weights) per pattern",
    "high": 0.5,
    "moderate": 0.3,
    "keep_all_scores": true
  },

  "gates": [
    { "id": "G0", "rule": "any red_flag", "action": "STOP_PLAN_GO_TO_VET_NOW" },
    { "id": "G1a", "rule": "diet in processed AND owner_refuses_diet_change", "plan": ["four_marvels", "cessorex"], "note": "Slower. Re-offer diet change at every check-in." },
    { "id": "G1b", "rule": "diet in processed", "plan": ["diet_foundation", "four_marvels_or_long_dan"], "long_dan_if": "temperament_irritable_or_aggressive", "then": "finish_on_four_marvels", "recheck_weeks": [2, 4, 6] },
    { "id": "G2a", "rule": "on real food >= 4 weeks AND radically_better", "plan": ["four_marvels_maintain", "taper"] },
    { "id": "G2b", "rule": "on raw AND plant_fraction < 0.1", "plan": ["add_plants", "add_probiotics"], "recheck_weeks": [2, 4] },
    { "id": "G2c", "rule": "on real food AND not resolved", "plan_by_pattern": {
        "severe": ["immunobalm", "then_add_cessorex"],
        "blood_def_only": ["four_materials"],
        "adaptive": ["cessorex"],
        "low_grade": ["galvanex", "cessorex"]
      },
      "priority": ["severe", "adaptive", "low_grade", "blood_def_only"]
    }
  ],

  "response_loop": {
    "check_every_days": 14,
    "rules": [
      { "if": "itchier_on_cessorex AND diet_real", "then": ["add_immunobalm", "reduce_cessorex"] },
      { "if": "itchier_on_cessorex AND diet_processed", "then": ["add_four_marvels", "reduce_cessorex"] },
      { "if": "partial_response AND tolerating", "then": ["ask_vet_increase_dose"] },
      { "if": "improving AND NOT severe", "then": ["add_galvanex"] },
      { "if": "weeks_on_plan >= 12 AND diligent AND no_progress", "then": ["refer_allergy_or_microbiome_testing", "refer_dermatologist"] }
    ]
  },

  "drug_taper": {
    "method": "stair_step",
    "steps": [
      "Lower dose until MILD itch appears",
      "Hold that dose; keep diet + herbs",
      "Wait 1–2 weeks until itch settles",
      "Step down again; repeat until off",
      "Then find lowest herb dose",
      "Restart herbs ~1 month before known flare season"
    ],
    "per_drug": {
      "apoquel": { "mode": "dose_step", "vet_confirm": true },
      "prednisone": { "mode": "vet_schedule_only", "vet_confirm": true, "warn": "Never stop suddenly — adrenal risk." },
      "cytopoint": { "mode": "interval_extend", "vet_confirm": true, "note": "Not covered in source — vet decides." },
      "atopica": { "mode": "dose_step", "vet_confirm": true }
    }
  },

  "formulas": {
    "four_marvels":   { "name": "Four Marvels", "classical": "Si Miao San (Four Marvels Powder)", "brands": ["Kan Essentials: Four Marvels", "Natural Path Herb Co.: Si Miao San (older brand, may no longer be sold)"], "for": "innate" },
    "long_dan":       { "name": "Long Dan", "classical": "Long Dan Xie Gan Tang (Gentiana Drain the Liver Decoction)", "for": "innate, irritable dogs", "caution": "Strong. Vet only. Not digestion-supportive. Some older versions used Guan Mu Tong (Aristolochia), which can damage the kidneys: only use a veterinary brand, through your vet." },
    "four_materials": { "name": "Four Substances", "classical": "Si Wu Tang (Four Substances Decoction)", "brands": ["Kan Essentials: Dry Derma Relief (related: Si Wu Xiao Feng Yin, Si Wu Tang plus anti-itch herbs)"], "for": "blood_def" },
    "minor_bupleurum":{ "name": "Minor Bupleurum", "classical": "Xiao Chai Hu Tang (Minor Bupleurum Decoction)", "brands": ["Kan Essentials: Harmonize the Qi"], "rule": "Must contain ginseng (Ren Shen), not codonopsis (Dang Shen)", "note": "Alone not enough for dogs — pair with Four Substances" },
    "cessorex":       { "name": "Cessorex", "classical": "Xiao Chai Hu Tang + Si Wu Tang (Minor Bupleurum + Four Substances), per the label's ingredients", "brands": ["Gold Standard Herbs: Cessorex"], "for": "adaptive" },
    "immunobalm":     { "name": "ImmunoBalm", "classical": "Based on Qing Ying Tang (\"Cool the Blood\")", "brands": ["Gold Standard Herbs: ImmunoBalm", "Kan Essentials: Cool the Blood"], "for": "severe/autoimmune" },
    "galvanex":       { "name": "Galvanex", "classical": "Bu Zhong Yi Qi Tang (Tonify the Middle and Augment the Qi Decoction)", "brands": ["Gold Standard Herbs: Galvanex", "Kan Essentials: Lift the Qi"], "for": "low_grade", "caution": "Not for severely inflamed dogs." }
  },
  "verified": {
    "date": "2026-11-13",
    "note": "Product names checked against retailer and maker listings: the transcript's 'Cesarex', 'ImmunoBomb', 'Four Marbles' and 'Lift/Harmonize the Chi' were corrected to Cessorex, ImmunoBalm, Four Marvels and Lift/Harmonize the Qi."
  },
  "product_fields_todo": ["ph_source", "affiliate_url", "label_dose_url", "price_php"],
  "dosing_policy": "Never compute doses. Link to product label + 'confirm with your vet'."
}
;
