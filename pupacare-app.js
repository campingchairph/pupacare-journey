/* PupaCare Journey: app logic. No build step. State lives in PC, saved to localStorage; photos go to IndexedDB. */
(function () {
  'use strict';

  const R = window.PUPA_RULES;
  const KEY = 'pupacare_data';
  const CHECK_DAYS = R.response_loop.check_every_days;

  /* ------------------------------------------------------------------ state */
  function defaultState() {
    return {
      v: 1,
      accepted: false,
      dog: { name: '', breed: '', dob: '', sex: '', weightKg: '', bcs: 5, city: '', photoId: null },
      diet: { type: '', brand: '', plantPct: null, starch: [], treats: '', triggers: '', probiotic: '', probioticBrand: '', species: [], realWeeks: '', radicallyBetter: '', refusesChange: '' },
      meds: [],
      regions: {},
      answers: {},
      temperament: '',
      redFlags: {},
      assessments: [],
      logs: [],
      checkins: []
    };
  }
  let PC = defaultState();
  const UI = { tab: 'today', step: null, checkin: null, logEdit: null, medEdit: null };

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) PC = Object.assign(defaultState(), JSON.parse(raw));
      PC.dog = Object.assign(defaultState().dog, PC.dog);
      PC.diet = Object.assign(defaultState().diet, PC.diet);
    } catch (e) { console.warn('load failed', e); }
  }
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(PC)); }
    catch (e) { toast('Storage is full. Export a backup in Settings.'); }
  }

  /* ------------------------------------------------------------- photo store */
  const IDB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('pupacare_photos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('photos');
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async put(id, data) {
      const db = await this.open();
      return new Promise((res, rej) => { const t = db.transaction('photos', 'readwrite'); t.objectStore('photos').put(data, id); t.oncomplete = res; t.onerror = () => rej(t.error); });
    },
    async get(id) {
      const db = await this.open();
      return new Promise((res) => { const q = db.transaction('photos').objectStore('photos').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
    },
    async del(id) {
      const db = await this.open();
      return new Promise((res) => { const t = db.transaction('photos', 'readwrite'); t.objectStore('photos').delete(id); t.oncomplete = res; t.onerror = res; });
    },
    async all() {
      const db = await this.open();
      return new Promise((res) => {
        const out = {}; const c = db.transaction('photos').objectStore('photos').openCursor();
        c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
        c.onerror = () => res(out);
      });
    },
    async clear() {
      const db = await this.open();
      return new Promise((res) => { const t = db.transaction('photos', 'readwrite'); t.objectStore('photos').clear(); t.oncomplete = res; t.onerror = res; });
    }
  };
  const PHOTO_CACHE = {};

  function compressImage(file, max, q) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', q));
        };
        img.onerror = rej; img.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  async function savePhoto(file, max, q) {
    const data = await compressImage(file, max, q);
    const id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await IDB.put(id, data);
    PHOTO_CACHE[id] = data;
    return id;
  }
  function hydratePhotos(root) {
    (root || document).querySelectorAll('[data-photo]').forEach(async (el) => {
      const id = el.getAttribute('data-photo');
      if (!id) return;
      const data = PHOTO_CACHE[id] || await IDB.get(id);
      if (data) { PHOTO_CACHE[id] = data; el.style.backgroundImage = 'url("' + data + '")'; el.classList.add('has-img'); }
    });
  }

  /* ----------------------------------------------------------------- helpers */
  const $ = (s, r) => (r || document).querySelector(s);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
  function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return todayStr(d); }
  function fmtDate(s, opt) { if (!s) return ''; return parseDay(s).toLocaleDateString('en-PH', opt || { month: 'short', day: 'numeric' }); }
  function dogName() { return PC.dog.name || 'your dog'; }
  function DN() { return esc(PC.dog.name || 'Your dog'); }
  function getPath(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), PC); }
  function setPath(path, val) { const ks = path.split('.'); const last = ks.pop(); const o = ks.reduce((o, k) => o[k], PC); o[last] = val; }
  function ageYears() {
    if (!PC.dog.dob) return null;
    return (Date.now() - parseDay(PC.dog.dob)) / (365.25 * 86400000);
  }
  function ageLabel() {
    const a = ageYears(); if (a == null) return '';
    if (a < 1) return Math.max(1, Math.round(a * 12)) + ' mo';
    return (Math.floor(a * 10) / 10).toString().replace(/\.0$/, '') + ' yr';
  }
  // Pronoun tokens in copy: {s} she/he/it, {S} capitalised, {p}/{P} her/his/its, {o} her/him/it.
  const PRON = {
    female: { s: 'she', S: 'She', p: 'her', P: 'Her', o: 'her' },
    male: { s: 'he', S: 'He', p: 'his', P: 'His', o: 'him' },
    '': { s: 'it', S: 'It', p: 'its', P: 'Its', o: 'it' }
  };
  function pr(html) { const m = PRON[PC.dog.sex] || PRON['']; return html.replace(/\{([sSpPo])\}/g, (_, k) => m[k]); }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }

  const IC = {
    paw: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><g fill="currentColor"><ellipse cx="12" cy="15.5" rx="4.2" ry="3.6"/><circle cx="6.6" cy="10.6" r="1.9"/><circle cx="9.6" cy="7" r="1.9"/><circle cx="14.4" cy="7" r="1.9"/><circle cx="17.4" cy="10.6" r="1.9"/></g></svg>',
    food: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h16a8 8 0 0 1-16 0zM8 9c0-2 2-2 2-4M13 9c0-2 2-2 2-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    herb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19C5 10 11 5 20 5c0 9-5 14-14 14zM5 19l8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    watch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    vet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    taper: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h5v4h5v4h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 18v.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    chart: '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path d="M4 19V5M4 19h16M7 15l4-4 3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ---------------------------------------------------------- question bank */
  // Owner-friendly wording for each sign in rules.json. Derived signs are computed from other answers.
  const SQ = {
    // diet
    certain_kibbles_worse: { step: 'diet', q: 'Is {s} worse on certain kibbles or brands?', s: 'Worse on certain kibbles' },
    better_on_fewer_carbs: { step: 'diet', q: 'Was {s} better when eating fewer carbs (less rice, kibble, bread)?', s: 'Better on fewer carbs' },
    probiotics_not_helping: { step: 'diet', q: 'Have probiotics been tried without much help?', s: 'Probiotics not helping' },
    // meds
    omega3_helped_fast: { step: 'meds', q: 'Did fish oil / omega-3 help quickly (within a few weeks)?', s: 'Omega-3 helped fast' },
    itchier_on_cesarex: { step: 'meds', q: 'Has {s} been on Cesarex (or a similar herb) and got itchier?', s: 'Itchier on Cesarex' },
    antibiotic_responsive_recurrence: { step: 'meds', q: 'Do skin infections clear on antibiotics, then keep coming back?', s: 'Infections recur after antibiotics' },
    // flare timing
    worse_hot_humid_onset: { step: 'timing', q: 'Did it start, or get worse, in hot and humid weather?', s: 'Worse in hot, humid weather' },
    six_month_cycle: { step: 'timing', q: 'Does it flare in a cycle, about every 6 months?', s: '~6-month flare cycle' },
    late_season_or_now_year_round: { step: 'timing', q: 'Used to be seasonal, but now it is year-round (or flares late in the season)?', s: 'Now year-round' },
    // skin & body
    roving_inflammation: { step: 'symptoms', q: 'Does the redness or itch move around: skin, ears, eyes, paws, tummy?', hint: 'Different spots flare at different times', s: 'Roving inflammation' },
    moist_hot_spots_pyoderma: { step: 'symptoms', q: 'Moist, oozing hot spots or pimple-like bumps?', s: 'Moist hot spots / pyoderma' },
    yeasty_waxy_ears: { step: 'symptoms', q: 'Ears waxy, brown or yeasty-smelling?', s: 'Yeasty, waxy ears' },
    whack_a_mole_pyoderma: { step: 'symptoms', q: 'Infection clears in one spot, then pops up somewhere else?', s: '"Whack-a-mole" infections' },
    lesions_red_raw_ulcerated: { step: 'symptoms', q: 'Very red, raw or open (ulcerated) skin?', s: 'Red, raw or ulcerated skin' },
    mild_itch_only: { step: 'symptoms', q: 'Is it mostly a mild itch, with no raw or very red skin?', s: 'Mild itch only' },
    nail_disease_onychodystrophy: { step: 'symptoms', q: 'Nail problems: brittle, splitting, misshapen or falling off?', s: 'Nail disease' },
    mild_pododermatitis: { step: 'symptoms', q: 'Mildly red, licked or puffy paws?', s: 'Mild paw inflammation' },
    chronic_distal_infection: { step: 'symptoms', q: 'Long-running infection at the "ends": paws, nails, ear tips, tail?', s: 'Chronic infection at paws/ends' },
    colitis_or_gi_flares: { step: 'symptoms', q: 'Tummy flares: mucus in stool, colitis, vomiting spells?', s: 'Colitis / tummy flares' },
    hives_swelling_history: { step: 'symptoms', q: 'Ever had hives or puffy swelling in the past?', hint: 'Swelling right now belongs on the red-flag screen', s: 'History of hives' },
    miserable_unhappy: { step: 'symptoms', q: 'Does {s} seem miserable or unhappy most days?', s: 'Miserable, unhappy' },
    // hands-on checks
    dry_coarse_thin_coat: { step: 'checks', q: 'Coat dry, coarse or thin?', hint: 'Run your hand against the fur', s: 'Dry, coarse, thin coat' },
    scurf_on_back_white_flakes: { step: 'checks', q: 'White flakes (dandruff) mainly along the back?', hint: 'Part the fur along the spine and look', s: 'White flakes on the back' },
    ear_margin_crusting: { step: 'checks', q: 'Crusts along the edges of the ear flaps?', hint: 'Slide your fingers along the ear edge', s: 'Crusty ear edges' },
    cool_ears_paws: { step: 'checks', q: 'Ears and paws feel cool to your hand?', hint: 'Indoors, rested, compare with your palm', s: 'Cool ears and paws' },
    hot_torso_cold_extremities: { step: 'checks', q: 'Belly/body feels hot but ears and paws are cold?', hint: 'Tip: you sweat where {s} leans on you', s: 'Hot body, cold ends' },
    classic_low_energy_tires_easily: { step: 'checks', q: 'Low energy, tires easily on walks?', s: 'Low energy' },
    classic_poor_picky_appetite: { step: 'checks', q: 'Poor or picky appetite?', s: 'Picky appetite' },
    classic_chronic_soft_stool: { step: 'checks', q: 'Soft stool most of the time?', s: 'Chronic soft stool' },
    classic_feels_cold_easily: { step: 'checks', q: 'Feels the cold easily, looks for warm spots?', s: 'Feels cold easily' },
    weak_pulse: { step: 'checks', q: 'Weak pulse?', tag: 'Vet only', hint: 'Skip unless your vet checked it', s: 'Weak pulse (vet)' },
    // history
    autoimmune_diagnosis: { step: 'history', q: 'Has a vet diagnosed an autoimmune disease (e.g. pemphigus, lupus)?', s: 'Autoimmune diagnosis' },
    calcinosis_cutis: { step: 'history', q: 'Has a vet found calcinosis cutis (hard, chalky skin bumps)?', tag: 'Vet dx', s: 'Calcinosis cutis' },
    cruciate_or_hip_history: { step: 'history', q: 'Cruciate (knee ligament) injury or hip dysplasia?', s: 'Cruciate / hip history' },
    kcs_dry_eye: { step: 'history', q: 'Dry eye (KCS) or thick sticky eye discharge?', s: 'Dry eye (KCS)' },
    classic_rectal_prolapse_history: { step: 'history', q: 'Ever had a rectal prolapse?', s: 'Rectal prolapse history' },
    high_eosinophils: { step: 'history', q: 'Bloodwork showed high eosinophils?', tag: 'Bloodwork', s: 'High eosinophils' },
    hypercalcemia_idiopathic: { step: 'history', q: 'Bloodwork showed high calcium with no clear cause?', tag: 'Bloodwork', s: 'High calcium' }
  };
  const DERIVED_LABEL = {
    eats_processed: 'Eats processed food', high_starch_homemade: 'Starchy homemade food', overweight: 'Overweight',
    temperament_exuberant_or_irritable: 'Exuberant or irritable', tongue_red: 'Red tongue', on_real_food_not_resolved: 'On real food, not resolved',
    low_plant_raw_diet: 'Raw diet low in plants', temperament_reactive_anxious_aggressive: 'Reactive / anxious', drugs_worked_then_failed: 'Meds worked, then stopped working',
    flares_on_dose_reduction: 'Flares when dose is lowered', young_under_2y: 'Under 2 years old', tongue_lavender: 'Lavender tongue',
    temperament_fearful_timid: 'Fearful or timid', long_term_apoquel_atopica: 'Long-term Apoquel/Atopica'
  };
  function signLabel(id) { return (SQ[id] && SQ[id].s) || DERIVED_LABEL[id] || id.replace(/_/g, ' '); }

  const DIET_LABEL = { kibble: 'Kibble', canned: 'Canned', baked: 'Baked', air_dried: 'Air-dried', dehydrated: 'Dehydrated', freeze_dried: 'Freeze-dried', raw_commercial: 'Raw (store-bought)', raw_homemade: 'Raw (homemade)', cooked_commercial: 'Cooked fresh (store-bought)', cooked_homemade: 'Home-cooked', lightly_cooked: 'Lightly cooked' };
  const PLANT_OPTS = [[0, 'None'], [0.08, 'A little (~10%)'], [0.167, 'About 1/6'], [0.25, 'About 1/4'], [0.333, '1/3 or more']];
  const SPECIES = ['Lactobacillus', 'Bifidobacterium', 'Bacteroides', 'Enterococcus faecium', 'Bacillus', 'Not sure'];
  const REGIONS = [['ears', 'Ears'], ['eyes', 'Eyes & face'], ['paws', 'Paws'], ['armpits', 'Armpits'], ['belly', 'Belly & groin'], ['back', 'Back'], ['tail', 'Tail base & bum'], ['legs', 'Legs'], ['neck', 'Neck & chest']];
  const TEMPS = [['exuberant', 'Exuberant', 'Big energy, bouncy'], ['irritable', 'Irritable', 'Grumpy, snappy when itchy'], ['reactive', 'Reactive / anxious', 'Barks, lunges, worries, may bite'], ['fearful', 'Fearful / timid', 'Shy, hides, startles'], ['calm', 'Calm', 'None of these really']];
  const DRUGS = [['apoquel', 'Apoquel'], ['cytopoint', 'Cytopoint'], ['prednisone', 'Prednisone / steroid'], ['atopica', 'Atopica'], ['antibiotic', 'Antibiotic'], ['antihistamine', 'Antihistamine'], ['other', 'Other']];
  const BCS = [[3, 'Thin'], [4, 'Lean'], [5, 'Ideal'], [6, 'A bit heavy'], [7, 'Heavy'], [8, 'Very heavy']];
  const PATTERN_PLAIN = {
    innate: 'Heat and damp from inside, often driven by processed or starchy food. The itch roves around, with hot spots and yeasty ears, and it gets worse in hot, humid weather.',
    adaptive: 'The gut-lining / microbiome type. Already on real food but still itchy; meds worked then failed; flares in ~6-month cycles.',
    blood_def: 'The dry type. Dry coat, white flakes on the back, crusty ear edges, cool paws. Often young dogs.',
    severe: 'Very inflamed: red, raw skin or autoimmune disease. Needs cooling down first, with your vet.',
    low_grade: 'Mild but chronic, and low on energy. Paws and nails; timid dogs; long-term Apoquel/Atopica.'
  };
  const PATTERN_SHORT = { innate: 'Damp Heat', adaptive: 'Leaky gut', blood_def: 'Dry / blood deficiency', severe: 'Severe / autoimmune', low_grade: 'Low-grade / Qi deficiency' };

  /* -------------------------------------------------------- rules engine */
  function isProcessed() { return R.diet.processed.includes(PC.diet.type); }
  function isReal() { return R.diet.real.includes(PC.diet.type); }
  function isRaw() { return /^raw/.test(PC.diet.type); }
  function yes(id) { return PC.answers[id] === 'y'; }
  function anyRedFlag(map) { return R.red_flags.some((f) => (map || PC.redFlags)[f.id] === 'y'); }

  function deriveSigns() {
    const s = {};
    Object.keys(SQ).forEach((k) => { s[k] = yes(k); });
    const d = PC.diet;
    const plant = d.plantPct == null ? 0 : Number(d.plantPct);
    s.eats_processed = isProcessed();
    s.high_starch_homemade = /homemade/.test(d.type) && d.starch.some((x) => R.diet.high_starch_flags.includes(x));
    s.overweight = Number(PC.dog.bcs) >= 6;
    s.temperament_exuberant_or_irritable = ['exuberant', 'irritable'].includes(PC.temperament);
    s.temperament_reactive_anxious_aggressive = PC.temperament === 'reactive';
    s.temperament_fearful_timid = PC.temperament === 'fearful';
    s.tongue_red = PC.answers.tongue === 'red';
    s.tongue_lavender = PC.answers.tongue === 'lavender';
    s.on_real_food_not_resolved = isReal() && d.radicallyBetter !== 'y';
    s.low_plant_raw_diet = isRaw() && plant < R.diet.foundation.plant_fraction.min;
    const age = ageYears();
    s.young_under_2y = age != null && age < 2;
    s.drugs_worked_then_failed = PC.meds.some((m) => m.worked === 'y' && m.stopped === 'y');
    s.flares_on_dose_reduction = PC.meds.some((m) => m.flares === 'y');
    s.long_term_apoquel_atopica = PC.meds.some((m) => ['apoquel', 'atopica'].includes(m.drug) && m.longTerm === 'y');
    return s;
  }

  function computeScores(signs) {
    const out = {};
    Object.entries(R.patterns).forEach(([k, p]) => {
      let tot = 0, got = 0;
      p.signs.forEach((x) => { tot += x.w; if (signs[x.id]) got += x.w; });
      out[k] = tot ? got / tot : 0;
    });
    return out;
  }
  function level(score) { return score >= R.scoring.high ? 'high' : score >= R.scoring.moderate ? 'moderate' : 'low'; }

  function pickG2cPattern(scores) {
    const mod = R.scoring.moderate, high = R.scoring.high;
    const severeHigh = scores.severe >= high;
    const ok = {
      severe: scores.severe >= mod,
      adaptive: scores.adaptive >= mod,
      low_grade: scores.low_grade >= mod && !severeHigh,
      blood_def_only: scores.blood_def >= mod && scores.severe < mod && scores.adaptive < mod && scores.low_grade < mod
    };
    const gate = R.gates.find((g) => g.id === 'G2c');
    for (const p of gate.priority) if (ok[p]) return p;
    // nothing reached "moderate": fall back to the strongest score
    const cand = [['severe', scores.severe], ['adaptive', scores.adaptive], ['low_grade', severeHigh ? -1 : scores.low_grade], ['blood_def_only', scores.blood_def]];
    cand.sort((a, b) => b[1] - a[1]);
    return cand[0][0];
  }

  function buildPlan(scores, signs) {
    const d = PC.diet;
    const plant = d.plantPct == null ? 0 : Number(d.plantPct);
    const irritable = ['irritable', 'reactive'].includes(PC.temperament);
    const name = esc(dogName());
    const P = { gate: '', why: '', pattern: null, formulas: [], phases: [], recheck: [2, 4, 6], diet: false, plants: false, taper: false, longDan: false };
    const it = (ic, html) => ({ ic, html });

    if (!d.type) {
      P.gate = 'G?'; P.why = 'Fill in the Diet step so we know which path fits.'; return P;
    }
    if (isProcessed() && d.refusesChange === 'y') {
      P.gate = 'G1a'; P.formulas = ['four_marbles', 'cesarex']; P.recheck = [2, 4, 6];
      P.why = name + ' eats processed food and switching isn\'t possible right now. Herbs alone work more slowly, so we\'ll keep asking about food at every check-in.';
      P.phases = [
        { t: 'Start gently', w: 'Week 0–2', items: [it('herb', 'Ask your vet about <b>Four Marbles</b> (Si Miao San) to cool the damp heat.'), it('herb', 'Ask your vet about <b>Cesarex</b> for the gut side.'), it('food', 'Cut starchy extras and treats (rice, bread, potato, corn, pasta) where you can.'), it('watch', 'Log the itch daily so the 2-week check-in has real numbers.')] },
        { t: 'Watch & adjust', w: 'Week 2–6', items: [it('watch', 'Check-ins at weeks 2, 4 and 6.'), it('food', 'Think about fresh food again. It\'s the biggest lever in this approach.'), it('herb', 'If {s} gets itchier on Cesarex, the check-in will suggest the next step for your vet.')] },
        { t: 'Settle in', w: 'Week 6+', items: [it('taper', 'Once {s}\'s clearly better, talk to your vet about a slow, stair-step taper.'), it('herb', 'Then find the lowest herb amount that holds.')] }
      ];
      P.taper = true; return P;
    }
    if (isProcessed()) {
      P.gate = 'G1b'; P.diet = true; P.recheck = [2, 4, 6]; P.longDan = irritable;
      P.formulas = irritable ? ['long_dan', 'four_marbles'] : ['four_marbles'];
      P.why = name + ' eats processed food. In this approach food is the foundation: move to fresh, meat-based food, with a cooling formula alongside.';
      P.phases = [
        { t: 'Food foundation', w: 'Week 0–2', items: [
          it('food', 'Switch to <b>fresh, meat-based food</b> (raw or cooked) over about 7–10 days, mixing a bit more each day.'),
          it('food', 'Make <b>1/6 to 1/3</b> of the bowl plants: kamote, kalabasa, carrot, pechay, malunggay. <b>Never onion.</b> Only a little garlic.'),
          it('food', 'Add a probiotic with <b>Lactobacillus, Bifidobacterium or Bacteroides</b>.'),
          irritable ? it('vet', 'Because {s} gets irritable, ask your vet about <b>Long Dan Xie Gan Tang</b>. It\'s strong and vet-supervised only.') : it('herb', 'Ask your vet about <b>Four Marbles</b> (Si Miao San).')
        ] },
        { t: 'Watch & adjust', w: 'Week 2–6', items: [
          it('watch', 'Check-ins at weeks 2, 4 and 6.'),
          irritable ? it('herb', 'Once things calm down, your vet can move {o} from Long Dan to <b>Four Marbles</b> to finish.') : it('herb', 'Keep Four Marbles going while the new food settles in.'),
          it('watch', 'Watch the stool while the food changes; soft stool for a few days is common.')
        ] },
        { t: 'Settle in', w: 'Week 6+', items: [it('taper', 'If {s}\'s radically better, run a new check: the plan will move to <b>maintain + taper</b>.'), it('herb', 'Find the lowest herb amount that holds, with your vet.')] }
      ];
      P.taper = true; return P;
    }
    if (isReal() && Number(d.realWeeks) >= 4 && d.radicallyBetter === 'y') {
      P.gate = 'G2a'; P.formulas = ['four_marbles']; P.taper = true; P.recheck = [2, 4];
      P.why = name + ' has been on real food for 4+ weeks and is radically better. Keep things steady and start a slow, vet-guided taper.';
      P.phases = [
        { t: 'Hold steady', w: 'Week 0–2', items: [it('food', 'Keep the fresh food, plants and probiotics exactly as they are.'), it('herb', 'Keep <b>Four Marbles</b> going as maintenance (with your vet).')] },
        { t: 'Stair-step taper', w: 'Week 2–6', items: [it('taper', 'With your vet, lower the itch medicine step by step (see the taper card below).'), it('watch', 'A mild itch is your signal to hold that dose for 1–2 weeks.')] },
        { t: 'Lowest dose', w: 'Week 6+', items: [it('herb', 'Once off meds, find the lowest herb amount that holds.'), it('watch', 'Restart herbs ~1 month before {p} usual flare season.')] }
      ];
      return P;
    }
    if (isRaw() && plant < 0.1) {
      P.gate = 'G2b'; P.plants = true; P.recheck = [2, 4];
      P.why = name + ' eats raw but with almost no plants. Add plants and the right probiotics first, then check again in 2–4 weeks.';
      P.phases = [
        { t: 'Add plants & probiotics', w: 'Week 0–2', items: [it('food', 'Build up to <b>1/6–1/3 plants</b>: kamote, kalabasa, carrot, pechay, malunggay, berries. <b>Never onion.</b>'), it('food', 'Use a probiotic with <b>Lactobacillus, Bifidobacterium or Bacteroides</b>.')] },
        { t: 'Re-check', w: 'Week 2–4', items: [it('watch', 'Check-ins at weeks 2 and 4.'), it('watch', 'Not resolved by week 4? Run a new check and the plan will pick a formula by pattern.')] }
      ];
      P.taper = false; return P;
    }
    if (isReal()) {
      const pat = pickG2cPattern(scores);
      const gate = R.gates.find((g) => g.id === 'G2c');
      P.gate = 'G2c'; P.pattern = pat; P.formulas = gate.plan_by_pattern[pat].filter((f) => R.formulas[f]);
      const patName = pat === 'blood_def_only' ? R.patterns.blood_def.label : R.patterns[pat].label;
      P.why = name + ' is on real food but not resolved yet, so the formula is chosen by {p} strongest pattern: <b>' + esc(patName) + '</b>.';
      if (scores.adaptive >= R.scoring.moderate && scores.blood_def >= R.scoring.moderate) P.why += ' Adaptive and dry signs overlap; Cesarex covers both.';
      const first = {
        severe: [it('vet', 'Ask your vet about <b>ImmunoBomb</b> (≈ Cool the Blood) to calm things first. Vet supervision.'), it('herb', 'Once calmer, your vet may add <b>Cesarex</b>.')],
        adaptive: [it('herb', 'Ask your vet about <b>Cesarex</b> for the gut lining and microbiome.')],
        low_grade: [it('herb', 'Ask your vet about <b>Galvanex</b> (Bu Zhong Yi Qi Tang) to lift {p} energy.'), it('herb', 'Plus <b>Cesarex</b>.')],
        blood_def_only: [it('herb', 'Ask your vet about <b>Four Materials</b> (Si Wu Tang) for the dry type.')]
      }[pat];
      P.phases = [
        { t: 'Start the formula', w: 'Week 0–2', items: first.concat([it('food', 'Keep the fresh food, with 1/6–1/3 plants and a good probiotic.')]) },
        { t: 'Every 2 weeks', w: 'Week 2–6', items: [it('watch', 'Check-ins every 14 days. The app suggests the next tweak to discuss with your vet.'), it('watch', 'Itchier after a new herb? Say so in the check-in.')] },
        { t: 'Settle in', w: 'Week 6–12', items: [it('taper', 'When {s}\'s clearly better, start the stair-step taper with your vet.'), it('vet', 'No progress by week 12, even when you stuck to the plan? Ask about allergy/microbiome testing or a dermatologist.')] }
      ];
      P.recheck = [2, 4, 6, 8, 10, 12]; P.taper = true;
      return P;
    }
    P.gate = 'G?'; P.why = 'Fill in the Diet step so we know which path fits.'; return P;
  }

  function runAssessment() {
    const signs = deriveSigns();
    const scores = computeScores(signs);
    const plan = buildPlan(scores, signs);
    const a = {
      id: uid(), date: todayStr(), rulesVersion: R.version, scores, gate: plan.gate, plan,
      signs: Object.keys(signs).filter((k) => signs[k]),
      snapshot: { diet: JSON.parse(JSON.stringify(PC.diet)), temperament: PC.temperament, meds: JSON.parse(JSON.stringify(PC.meds)), regions: Object.assign({}, PC.regions) }
    };
    PC.assessments.push(a);
    saveState();
    return a;
  }
  function activeAssessment() { const a = PC.assessments; for (let i = a.length - 1; i >= 0; i--) if (a[i].gate !== 'G0') return a[i]; return null; }
  function weeksOnPlan() { const a = activeAssessment(); return a ? daysBetween(a.date, todayStr()) / 7 : 0; }
  function lastCheckDate() {
    const a = activeAssessment(); if (!a) return null;
    const c = PC.checkins.filter((x) => x.date >= a.date && !x.redFlag);
    return c.length ? c[c.length - 1].date : a.date;
  }
  function nextCheckIn() { const d = lastCheckDate(); return d ? addDays(d, CHECK_DAYS) : null; }

  function responseLoop(c) {
    const a = activeAssessment(); if (!a) return [];
    const out = [];
    const severe = a.scores.severe >= R.scoring.high;
    const hasCes = a.plan.formulas.includes('cesarex');
    const improving = c.response === 'much_better' || c.response === 'bit_better';
    const weeks = weeksOnPlan();
    if (c.response === 'itchier') {
      if (hasCes && isReal()) out.push({ ic: 'vet', t: 'Itchier on Cesarex while on real food: ask your vet about <b>adding ImmunoBomb</b> and <b>reducing Cesarex</b>.' });
      else if (hasCes) out.push({ ic: 'vet', t: 'Itchier on Cesarex while on processed food: ask your vet about <b>adding Four Marbles</b> and <b>reducing Cesarex</b>.' });
      else out.push({ ic: 'vet', t: 'Itchier since a new herb: pause and tell your vet what changed and when.' });
    }
    if (c.response === 'bit_better' && c.tolerating === 'y') out.push({ ic: 'vet', t: 'Partial response and {s}\'s handling it well: ask your vet whether to <b>increase the herb dose</b>.' });
    if (improving && !severe && !a.plan.formulas.includes('galvanex')) out.push({ ic: 'herb', t: '{S}\'s improving: ask your vet about <b>adding Galvanex</b> to help finish the job.' });
    if (weeks >= 12 && c.diligent === 'y' && (c.response === 'same' || c.response === 'worse')) out.push({ ic: 'vet', t: '12+ weeks on the plan with no progress: ask about <b>allergy or microbiome testing</b> and a <b>vet dermatologist</b> referral.' });
    if (c.response === 'much_better' && isReal() && Number(PC.diet.realWeeks) + weeks >= 4) out.push({ ic: 'taper', t: 'Radically better? <b>Run a new check</b>; the plan can move to maintain + taper.' });
    if (c.response === 'worse') out.push({ ic: 'vet', t: 'Worse overall: message or visit your vet soon. Bring the vet report from the Report tab.' });
    if (isProcessed()) out.push({ ic: 'food', t: 'Still on processed food. Fresh food is the biggest lever whenever you\'re ready.' });
    if (!out.length) out.push({ ic: 'watch', t: 'Keep going as planned and log daily. Next check-in in 14 days.' });
    return out;
  }

  /* ---------------------------------------------------------------- render */
  function goTab(t) {
    UI.tab = t;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'panel-' + t; });
    $('#main').scrollTop = 0;
    render();
  }
  function render(keepScroll) {
    const m = $('#main'); const y = m.scrollTop;
    const fn = { today: renderToday, check: renderCheck, plan: renderPlan, log: renderLog, report: renderReport }[UI.tab];
    const el = $('#panel-' + UI.tab);
    el.innerHTML = pr(fn());
    if (keepScroll) { el.querySelectorAll(':scope > *').forEach((c) => { c.style.animation = 'none'; }); m.scrollTop = y; }
    hydratePhotos(el);
    bindCharts(el);
  }

  /* Trail: signature */
  function trailHTML() {
    const a = activeAssessment();
    const stops = [0, 2, 6, 12];
    const w = a ? weeksOnPlan() : -1;
    // Stops are evenly spaced; progress is mapped piecewise between them.
    const pos = [0, 1 / 3, 2 / 3, 1];
    let pct = 0;
    if (a) for (let i = 0; i < stops.length - 1; i++) if (w >= stops[i]) pct = pos[i] + (pos[i + 1] - pos[i]) * Math.min(1, (w - stops[i]) / (stops[i + 1] - stops[i]));
    let h = '<div class="trail" aria-label="Plan progress">' +
      '<div class="trail-line"></div><div class="trail-fill" style="width:calc((100% - 24px) * ' + pct.toFixed(3) + ')"></div>';
    stops.forEach((s, i) => {
      const left = 'calc(12px + (100% - 24px) * ' + pos[i].toFixed(4) + ')';
      const next = stops[i + 1] == null ? Infinity : stops[i + 1];
      const cls = !a ? '' : (w >= s && w < next) ? 'now' : w >= s ? 'done' : '';
      h += '<div class="trail-stop ' + cls + '" style="left:' + left + '"><div class="trail-dot">' + IC.paw + '</div><span>Wk ' + s + '</span></div>';
    });
    return h + '</div>';
  }

  function renderToday() {
    const a = activeAssessment();
    const today = todayStr();
    const todays = PC.logs.find((l) => l.date === today);
    const last7 = PC.logs.filter((l) => daysBetween(l.date, today) < 7);
    const avg = last7.length ? (last7.reduce((s, l) => s + Number(l.itch), 0) / last7.length) : null;
    const next = nextCheckIn();
    const due = next ? daysBetween(today, next) : null;
    const sub = [PC.dog.breed, ageLabel(), PC.dog.city].filter(Boolean).map(esc).join(' · ');

    let h = '<div class="card today-hero">' +
      '<div class="today-photo"><div class="hero-photo" data-photo="' + esc(PC.dog.photoId || '') + '"></div>' +
      '<button class="today-photo-edit" data-act="dogPhoto" aria-label="Change photo">' + IC.camera + '</button></div>' +
      '<div class="today-hero-body"><div class="label">' + (a ? 'Week ' + Math.floor(weeksOnPlan()) + ' of the journey' : 'Ready when you are') + '</div>' +
      '<h1 class="today-name" style="margin-top:4px">' + DN() + '</h1>' + (sub ? '<p class="muted small" style="margin-top:4px">' + sub + '</p>' : '') +
      trailHTML() + '</div></div>';

    if (!a) {
      h += '<div class="card"><h2>Start with <em>a check.</em></h2><p class="muted" style="margin:8px 0 14px">About 10 minutes. It starts with a safety screen, then covers food, meds, skin and a few hands-on checks. At the end you get a plan to discuss with your vet.</p>' +
        '<button class="btn btn-primary btn-wide" data-act="startCheck">Start ' + DN() + '\'s check ' + IC.arrow + '</button></div>';
    } else if (due != null && due <= 0) {
      h += '<div class="card card-cream"><div class="row-between"><div><div class="label">Check-in due</div><h3 style="margin-top:4px">How has ' + DN() + ' been?</h3></div></div>' +
        '<p class="muted small" style="margin:6px 0 12px">Every 14 days: safety screen, then how {s}\'s responding. The plan updates from your answers.</p>' +
        '<button class="btn btn-primary btn-wide" data-act="startCheckin">Do the check-in ' + IC.arrow + '</button></div>';
    }

    h += '<div class="stats">' +
      '<div class="stat"><b>' + (avg == null ? '–' : avg.toFixed(1)) + '</b><span>Avg itch (7d)</span></div>' +
      '<div class="stat"><b>' + PC.logs.length + '</b><span>Days logged</span></div>' +
      '<div class="stat"><b>' + (due == null ? '–' : due <= 0 ? 'Now' : due + 'd') + '</b><span>Next check-in</span></div></div>';

    h += '<div class="card"><div class="card-head"><div><div class="label">Today</div><h3 style="margin-top:2px">' + (todays ? 'Logged: itch ' + todays.itch + '/10' : 'How itchy today?') + '</h3></div>' +
      '<button class="btn ' + (todays ? 'btn-soft' : 'btn-primary') + ' btn-sm" data-act="addLog"' + (todays ? ' data-id="' + todays.id + '"' : '') + '>' + (todays ? 'Edit' : IC.plus + ' Log') + '</button></div>' +
      itchChart(14, 'Itch, last 14 days') + '</div>';

    if (a && a.plan.phases.length) {
      const ph = currentPhase(a);
      h += '<div class="card"><div class="card-head"><div><div class="label">This stretch · ' + esc(ph.w) + '</div><h3 style="margin-top:2px">' + esc(ph.t) + '</h3></div>' +
        '<button class="link-btn" data-act="tab" data-tab="plan">Full plan</button></div>' +
        ph.items.map(todoHTML).join('') + '</div>';
    }
    return h;
  }
  function currentPhase(a) {
    const w = weeksOnPlan();
    const idx = a.plan.phases.findIndex((p) => { const m = p.w.match(/(\d+)[–-](\d+)/); return m && w >= Number(m[1]) && w < Number(m[2]); });
    return a.plan.phases[idx < 0 ? (w < 1 ? 0 : a.plan.phases.length - 1) : idx];
  }
  function todoHTML(t) { return '<div class="todo"><span class="todo-ic">' + (IC[t.ic] || IC.watch) + '</span><p>' + t.html + '</p></div>'; }

  /* ------------------------------------------------------------ check flow */
  const STEPS = [
    ['flags', 'Safety first'], ['profile', 'About {o}'], ['diet', 'Food'], ['meds', 'Medicines'], ['symptoms', 'Skin & flares'],
    ['checks', 'Hands-on checks'], ['temperament', 'Personality'], ['history', 'History'], ['result', 'Result']
  ];
  function renderCheck() {
    if (UI.step == null) return checkIntro();
    const [key, title] = STEPS[UI.step];
    if (key === 'flags' && anyRedFlag()) return stopScreen('check');
    let h = '<div><div class="label">Step ' + (UI.step + 1) + ' of ' + STEPS.length + '</div><h1 class="page-title">' + esc(title) + '</h1>' +
      '<div class="wiz-progress">' + STEPS.map((_, i) => '<i class="' + (i <= UI.step ? 'done' : '') + '"></i>').join('') + '</div></div>';
    h += ({ flags: stepFlags, profile: stepProfile, diet: stepDiet, meds: stepMeds, symptoms: stepSymptoms, checks: stepChecks, temperament: stepTemperament, history: stepHistory, result: stepResult })[key]();
    if (key !== 'result') {
      const err = stepError(key);
      h += '<div class="wiz-nav">' + (UI.step > 0 ? '<button class="btn btn-ghost" data-act="wizBack">Back</button>' : '<button class="btn btn-ghost" data-act="wizExit">Cancel</button>') +
        '<button class="btn btn-primary" data-act="wizNext"' + (err ? ' disabled' : '') + '>' + (UI.step === STEPS.length - 2 ? 'See result' : 'Next') + ' ' + IC.arrow + '</button></div>' +
        (err ? '<p class="muted small" style="text-align:center">' + esc(err) + '</p>' : '');
    }
    return h;
  }
  function stepError(key) {
    if (key === 'flags' && R.red_flags.some((f) => !PC.redFlags[f.id])) return 'Answer all five to continue.';
    if (key === 'profile' && !PC.dog.name.trim()) return 'Add {p} name to continue.';
    if (key === 'diet' && !PC.diet.type) return 'Pick what {s} mostly eats to continue.';
    return '';
  }
  function checkIntro() {
    const a = PC.assessments[PC.assessments.length - 1];
    let h = '<div><div class="label">Check</div><h1 class="page-title">What kind of <em>itch</em> is it?</h1>' +
      '<p class="page-sub" style="margin-top:6px">Nine short steps. Answers are saved as you go, so a re-check only means updating what changed.</p></div>';
    h += '<div class="card"><ol class="steps">' + STEPS.map((s) => '<li>' + esc(s[1]) + '</li>').join('') + '</ol>' +
      '<button class="btn btn-primary btn-wide" style="margin-top:16px" data-act="startCheck">' + (a ? 'Run a new check' : 'Start the check') + ' ' + IC.arrow + '</button></div>';
    if (activeAssessment()) h += '<div class="card card-cream"><div class="row-between"><div><div class="label">Every 14 days</div><h3 style="margin-top:2px">Check-in</h3></div><button class="btn btn-soft btn-sm" data-act="startCheckin">Start</button></div><p class="muted small" style="margin-top:6px">Quicker than a full check: safety screen plus how {s}\'s responding.</p></div>';
    if (PC.assessments.length) {
      h += '<div class="card"><div class="label" style="margin-bottom:6px">Past results</div>' + PC.assessments.slice().reverse().map((x) =>
        '<div class="log-item"><div class="log-itch" style="font-size:15px">' + esc(x.gate) + '</div><div class="log-meta"><b>' + fmtDate(x.date, { month: 'short', day: 'numeric', year: 'numeric' }) + '</b><span>' +
        (x.gate === 'G0' ? 'Red flag: vet now' : esc(topPatternText(x))) + '</span></div></div>').join('') + '</div>';
    }
    return h;
  }
  function topPatternText(a) { const e = Object.entries(a.scores).sort((x, y) => y[1] - x[1])[0]; return 'Top: ' + R.patterns[e[0]].label + ' ' + Math.round(e[1] * 100) + '%'; }

  function ynQ(id, map, extra) {
    const v = (map || PC.answers)[id];
    const meta = SQ[id] || {};
    const q = extra && extra.q || meta.q;
    const hint = extra && extra.hint || meta.hint;
    const tag = meta.tag;
    const store = extra && extra.store || 'ans';
    const alert = extra && extra.alert;
    const unsure = !(extra && extra.noUnsure);
    return '<div class="q"><div><div class="q-text">' + esc(q) + (tag ? '<span class="q-tag">' + esc(tag) + '</span>' : '') + '</div>' + (hint ? '<div class="q-hint">' + esc(hint) + '</div>' : '') + '</div>' +
      '<div class="yn"><button class="chip ' + (v === 'y' ? (alert ? 'on-alert' : 'on-yes') : '') + '" data-act="' + store + '" data-id="' + id + '" data-val="y">Yes</button>' +
      '<button class="chip ' + (v === 'n' ? 'on-no' : '') + '" data-act="' + store + '" data-id="' + id + '" data-val="n">No</button>' +
      (unsure ? '<button class="chip ' + (v === 'u' ? 'on-no' : '') + '" data-act="' + store + '" data-id="' + id + '" data-val="u">Not sure</button>' : '') + '</div></div>';
  }
  function stepQuestions(step) { return Object.keys(SQ).filter((k) => SQ[k].step === step).map((k) => ynQ(k)).join(''); }
  function chipsOne(path, opts, cur) { return '<div class="chips">' + opts.map(([v, l]) => '<button class="chip ' + (String(cur) === String(v) ? 'on' : '') + '" data-act="set" data-path="' + path + '" data-val="' + esc(v) + '">' + esc(l) + '</button>').join('') + '</div>'; }
  function chipsMulti(path, opts, cur) { return '<div class="chips">' + opts.map(([v, l]) => '<button class="chip ' + (cur.includes(v) ? 'on' : '') + '" data-act="toggle" data-path="' + path + '" data-val="' + esc(v) + '">' + esc(l) + '</button>').join('') + '</div>'; }
  function input(path, label, type, ph, hint) {
    return '<div class="field"><label>' + esc(label) + '</label>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') +
      '<input type="' + (type || 'text') + '" data-bind="' + path + '" value="' + esc(getPath(path)) + '" placeholder="' + esc(ph || '') + '"' + (type === 'number' ? ' inputmode="decimal"' : '') + '></div>';
  }

  function stepFlags() {
    return '<div class="card card-alert"><p style="font-weight:700;color:#7F2318">Any "yes" means stop: go to a vet now. No plan is made while a red flag is present.</p></div>' +
      '<div class="card">' + R.red_flags.map((f) => ynQ(f.id, PC.redFlags, { q: f.q, store: 'flag', alert: true, noUnsure: true })).join('') + '</div>';
  }
  function stopScreen(where) {
    return '<div class="card card-alert stop-card"><div class="stop-icon">' + IC.stop + '</div>' +
      '<h1 class="page-title" style="color:#7F2318">Go to a vet <em style="color:#7F2318">now.</em></h1>' +
      '<p style="margin:10px 0 16px;color:#7F2318;font-weight:700">This could be an emergency. Please bring ' + DN() + ' to the nearest vet or emergency clinic today. We\'ve paused the plan.</p>' +
      '<p class="small" style="color:#7F2318">Once your vet has seen {o} and {s}\'s stable, come back and start again.</p>' +
      '<button class="btn btn-ghost btn-wide" style="margin-top:16px" data-act="' + (where === 'checkin' ? 'closeSheet' : 'clearFlags') + '">' + (where === 'checkin' ? 'Close' : '{S}\'s been seen: start over') + '</button></div>';
  }

  function stepProfile() {
    return '<div class="card stack">' + input('dog.name', 'Name', 'text', 'Pupa') +
      '<div class="grid-2">' + input('dog.breed', 'Breed', 'text', 'Aspin, Shih Tzu…') + input('dog.dob', 'Birthday', 'date', '', 'Rough is fine') + '</div>' +
      '<div class="field"><span class="field-label">Sex</span>' + chipsOne('dog.sex', [['female', 'Female'], ['male', 'Male']], PC.dog.sex) + '</div>' +
      '<div class="grid-2">' + input('dog.weightKg', 'Weight (kg)', 'number', '8') + input('dog.city', 'City', 'text', 'Quezon City') + '</div>' +
      '<div class="field"><span class="field-label">Body shape</span><div class="hint">Ideal: you can feel the ribs easily and see a waist from above.</div>' + chipsOne('dog.bcs', BCS, PC.dog.bcs) + '</div></div>';
  }

  function stepDiet() {
    const d = PC.diet;
    let h = '<div class="card stack"><div class="field"><span class="field-label">What does {s} mostly eat?</span><div class="label" style="margin-top:4px">Processed</div>' +
      chipsOne('diet.type', R.diet.processed.map((k) => [k, DIET_LABEL[k]]), d.type) + '<div class="label" style="margin-top:6px">Real / fresh food</div>' +
      chipsOne('diet.type', R.diet.real.map((k) => [k, DIET_LABEL[k]]), d.type) + '</div>' + input('diet.brand', 'Brand or recipe', 'text', 'e.g. brand name, or "home-cooked chicken + kamote"') + '</div>';
    if (d.type) {
      h += '<div class="card stack"><div class="field"><span class="field-label">How much of the bowl is plants (veg/fruit)?</span>' + chipsOne('diet.plantPct', PLANT_OPTS, d.plantPct) + '</div>' +
        '<div class="field"><span class="field-label">Any of these starchy foods?</span>' + chipsMulti('diet.starch', R.diet.high_starch_flags.map((x) => [x, x[0].toUpperCase() + x.slice(1)]), d.starch) + '</div>' +
        input('diet.treats', 'Treats', 'text', 'e.g. jerky, biscuits, rice cakes') + input('diet.triggers', 'Foods that seem to set {o} off', 'text', 'e.g. chicken, beef') + '</div>';
      if (isReal()) {
        h += '<div class="card">' + '<div class="field" style="padding-bottom:10px">' + '<label>How many weeks on real food so far?</label><input type="number" inputmode="numeric" data-bind="diet.realWeeks" value="' + esc(d.realWeeks) + '" placeholder="e.g. 6"></div>' +
          ynQ('radicallyBetter', { radicallyBetter: d.radicallyBetter }, { q: 'Is {s} radically better since switching?', store: 'dietyn', noUnsure: true }) + '</div>';
      } else {
        h += '<div class="card">' + ynQ('refusesChange', { refusesChange: d.refusesChange }, { q: 'Is switching to fresh food off the table for now?', hint: 'Budget, time, anything. No judgement; the plan adapts.', store: 'dietyn', noUnsure: true }) + '</div>';
      }
    }
    h += '<div class="card stack"><div class="field"><span class="field-label">Does {s} get a probiotic?</span>' + chipsOne('diet.probiotic', [['y', 'Yes'], ['n', 'No']], d.probiotic) + '</div>';
    if (d.probiotic === 'y') {
      h += input('diet.probioticBrand', 'Which one?', 'text', 'Brand') + '<div class="field"><span class="field-label">Species on the label</span>' + chipsMulti('diet.species', SPECIES.map((s) => [s, s]), d.species) + '</div>';
      if (d.species.length && !d.species.some((s) => R.diet.foundation.probiotic_species_required_any.includes(s)) && !d.species.includes('Not sure'))
        h += '<div class="info-box">' + IC.info + '<span>This approach looks for <b>Lactobacillus, Bifidobacterium or Bacteroides</b>. Enterococcus faecium is in the "wrong niche".</span></div>';
    }
    h += '</div><div class="card">' + stepQuestions('diet') + '</div>';
    return h;
  }

  function stepMeds() {
    let h = '<div class="card"><div class="card-head"><h3>Itch medicines, past & present</h3><button class="btn btn-soft btn-sm" data-act="addMed">' + IC.plus + ' Add</button></div>';
    if (!PC.meds.length) h += '<p class="muted small">Apoquel, Cytopoint, prednisone, Atopica, antibiotics… Add each one {s} has tried. None? Just tap Next.</p>';
    h += PC.meds.map((m) => '<div class="log-item" data-act="addMed" data-id="' + m.id + '" role="button" tabindex="0"><div class="log-itch" style="font-size:13px">' + (m.current === 'y' ? 'Now' : 'Past') + '</div><div class="log-meta"><b>' + esc(medName(m)) + '</b><span>' +
      [m.worked === 'y' ? 'worked' : m.worked === 'n' ? 'didn\'t work' : '', m.stopped === 'y' ? 'then stopped working' : '', m.flares === 'y' ? 'flares on lower dose' : ''].filter(Boolean).join(' · ') + '</span></div></div>').join('');
    h += '</div><div class="card">' + stepQuestions('meds') + '</div>';
    return h;
  }
  function medName(m) { return m.drug === 'other' ? (m.other || 'Other') : (DRUGS.find((d) => d[0] === m.drug) || [0, m.drug])[1]; }

  function stepSymptoms() {
    let h = '<div class="card"><div class="field-label" style="margin-bottom:4px">Where is {s} itchy or red?</div><p class="muted small" style="margin-bottom:12px">Tap how bad each spot is right now. 0 = fine.</p><div class="bodymap">' +
      REGIONS.map(([k, l]) => { const v = PC.regions[k] || 0; return '<div class="bm-item ' + (v ? 'on' : '') + '"><div class="bm-name">' + l + '</div><div class="sev">' + [0, 1, 2, 3].map((n) => '<button class="' + (v === n ? 'on' : '') + '" data-act="region" data-id="' + k + '" data-val="' + n + '" aria-label="' + l + ' severity ' + n + '">' + n + '</button>').join('') + '</div></div>'; }).join('') + '</div></div>';
    h += '<div class="card"><div class="label" style="margin-bottom:2px">When does it flare?</div>' + stepQuestions('timing') + '</div>';
    h += '<div class="card"><div class="label" style="margin-bottom:2px">Skin & body</div>' + stepQuestions('symptoms') + '</div>';
    return h;
  }

  function stepChecks() {
    const t = PC.answers.tongue;
    return '<div class="info-box">' + IC.info + '<span>Do these when {s}\'s calm and rested, indoors. A treat helps.</span></div>' +
      '<div class="card"><div class="q" style="padding-top:0"><div><div class="q-text">Tongue colour</div><div class="q-hint">Look in daylight. Normal is a healthy pink.</div></div>' +
      chipsOneAns('tongue', [['pink', 'Pink (normal)'], ['red', 'Red'], ['lavender', 'Lavender / purplish'], ['pale', 'Pale'], ['u', 'Not sure']], t) + '</div>' +
      (t === 'pale' ? '<div class="warn-box">' + IC.warn + '<span>A pale tongue can go with pale gums. If {p} gums look very pale or white, that\'s a red flag: see a vet now.</span></div>' : '') +
      stepQuestions('checks') + ynQ('gassy', null, { q: 'Is {s} gassy (lots of farts)?' }) + '</div>';
  }
  function chipsOneAns(id, opts, cur) { return '<div class="chips">' + opts.map(([v, l]) => '<button class="chip ' + (cur === v ? 'on' : '') + '" data-act="ans" data-id="' + id + '" data-val="' + v + '">' + esc(l) + '</button>').join('') + '</div>'; }

  function stepTemperament() {
    return '<div class="card"><p class="muted" style="margin-bottom:12px">Which sounds most like {o}, especially when {s}\'s itchy?</p><div class="stack">' +
      TEMPS.map(([k, l, d]) => '<button class="chip ' + (PC.temperament === k ? 'on' : '') + '" style="text-align:left;border-radius:16px;padding:12px 16px" data-act="set" data-path="temperament" data-val="' + k + '"><b>' + esc(l) + '</b><br><span class="small muted">' + esc(d) + '</span></button>').join('') + '</div></div>';
  }
  function stepHistory() {
    return '<div class="card">' + stepQuestions('history') + '</div><p class="muted small" style="text-align:center">Bloodwork questions are optional. Skip them if you don\'t have results.</p>';
  }

  function stepResult() {
    const a = PC.assessments[PC.assessments.length - 1];
    if (!a) return '';
    let h = '<div class="card"><div class="card-head"><h2>{P} <em>patterns</em></h2><span class="badge badge-low">rules v' + esc(a.rulesVersion) + '</span></div>' + scoreBars(a.scores) +
      '<p class="muted small" style="margin-top:12px">Patterns overlap. Bars show how many of each pattern\'s signs fit {o} (weighted). Dashed lines: 30% moderate, 50% high.</p></div>';
    h += '<div class="card card-cream"><div class="label">Path ' + esc(a.gate) + '</div><p style="margin-top:6px">' + a.plan.why + '</p></div>';
    h += whyCard(a);
    h += '<button class="btn btn-primary btn-wide" data-act="tab" data-tab="plan">See the plan ' + IC.arrow + '</button>' +
      '<button class="btn btn-ghost btn-wide" data-act="wizDone">Done</button>';
    return h;
  }
  function whyCard(a) {
    const rows = Object.entries(a.scores).filter(([, s]) => s >= R.scoring.moderate).sort((x, y) => y[1] - x[1]);
    if (!rows.length) return '<div class="card"><p class="muted">No pattern reached "moderate". The plan uses the strongest one, but it\'s worth checking the answers again with your vet.</p></div>';
    return '<div class="card"><h3>Why</h3>' + rows.map(([k]) => {
      const hits = R.patterns[k].signs.filter((s) => a.signs.includes(s.id)).sort((x, y) => y.w - x.w).slice(0, 5);
      return '<div style="margin-top:12px"><div class="score-name">' + esc(R.patterns[k].label) + '</div><p class="muted small" style="margin:2px 0 6px">' + esc(PATTERN_PLAIN[k]) + '</p><div class="chips">' +
        hits.map((s) => '<span class="chip" style="min-height:0;padding:4px 10px;font-size:12.5px">' + esc(signLabel(s.id)) + '</span>').join('') + '</div></div>';
    }).join('') + '</div>';
  }

  /* -------------------------------------------------------------- charts */
  function scoreBars(scores) {
    const lowExcluded = scores.severe >= R.scoring.high;
    return '<div class="scores">' + Object.keys(R.patterns).map((k) => {
      const s = scores[k]; const pct = Math.round(s * 100); const lv = level(s);
      const W = 300, H = 14, w = Math.max(0, Math.min(1, s)) * W;
      const ex = k === 'low_grade' && lowExcluded;
      return '<div class="score-row"><div class="score-name">' + esc(R.patterns[k].label) + ' ' +
        (ex ? '<span class="badge badge-low">set aside</span>' : lv === 'high' ? '<span class="badge badge-high">High</span>' : lv === 'moderate' ? '<span class="badge badge-mod">Moderate</span>' : '') + '</div>' +
        '<div class="score-pct">' + pct + '%</div><div class="score-bar"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(R.patterns[k].label) + ' ' + pct + ' percent" style="width:100%;height:14px;display:block">' +
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="4" fill="#F3E8D8"/>' +
        (w > 0 ? '<rect x="0" y="0" width="' + w.toFixed(1) + '" height="' + H + '" rx="4" fill="' + (ex ? '#C9B8A3' : '#D9773A') + '" fill-opacity="' + (lv === 'low' && !ex ? 0.55 : 1) + '"><title>' + pct + '%</title></rect>' : '') +
        '<line x1="' + W * R.scoring.moderate + '" x2="' + W * R.scoring.moderate + '" y1="-2" y2="' + (H + 2) + '" stroke="#8E7B69" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>' +
        '<line x1="' + W * R.scoring.high + '" x2="' + W * R.scoring.high + '" y1="-2" y2="' + (H + 2) + '" stroke="#5C4A3B" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>' +
        '</svg></div></div>';
    }).join('') + '</div>';
  }

  function itchSeries(days) {
    const today = todayStr(); const start = addDays(today, -(days - 1));
    return PC.logs.filter((l) => l.date >= start && l.date <= today).sort((a, b) => a.date < b.date ? -1 : 1).map((l) => ({ d: l.date, v: Number(l.itch), x: daysBetween(start, l.date) }));
  }
  function itchChart(days, title, forPrint) {
    const pts = itchSeries(days);
    if (!pts.length) return '<div class="empty">' + IC.chart + '<p class="small">No itch logs yet. Log once a day and a line will grow here.</p></div>';
    const W = 320, H = 140, L = 22, Rr = 8, T = 10, B = 22;
    const xs = (x) => L + (days === 1 ? 0 : x / (days - 1)) * (W - L - Rr);
    const ys = (v) => T + (1 - v / 10) * (H - T - B);
    let g = '';
    [0, 5, 10].forEach((v) => { g += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + ys(v) + '" y2="' + ys(v) + '" stroke="rgba(60,40,20,.10)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (ys(v) + 4) + '" text-anchor="end" font-size="10" fill="#8E7B69" font-family="Nunito, sans-serif" font-weight="700">' + v + '</text>'; });
    const first = addDays(todayStr(), -(days - 1));
    g += '<text x="' + L + '" y="' + (H - 4) + '" font-size="10" fill="#8E7B69" font-family="Nunito, sans-serif" font-weight="700">' + fmtDate(first) + '</text>';
    g += '<text x="' + (W - Rr) + '" y="' + (H - 4) + '" text-anchor="end" font-size="10" fill="#8E7B69" font-family="Nunito, sans-serif" font-weight="700">Today</text>';
    const path = pts.map((p, i) => (i ? 'L' : 'M') + xs(p.x).toFixed(1) + ' ' + ys(p.v).toFixed(1)).join(' ');
    const area = path + ' L' + xs(pts[pts.length - 1].x).toFixed(1) + ' ' + ys(0) + ' L' + xs(pts[0].x).toFixed(1) + ' ' + ys(0) + ' Z';
    g += '<path d="' + area + '" fill="#D9773A" fill-opacity=".10"/>';
    g += '<path d="' + path + '" fill="none" stroke="#D9773A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach((p) => { g += '<circle cx="' + xs(p.x).toFixed(1) + '" cy="' + ys(p.v).toFixed(1) + '" r="4" fill="#D9773A" stroke="#fff" stroke-width="2"/>'; });
    const last = pts[pts.length - 1];
    g += '<text x="' + Math.min(xs(last.x), W - Rr - 2).toFixed(1) + '" y="' + (ys(last.v) - 9).toFixed(1) + '" text-anchor="end" font-size="11" fill="#2B2118" font-family="Nunito, sans-serif" font-weight="800">' + last.v + '</text>';
    if (!forPrint) g += '<line class="xh" x1="0" x2="0" y1="' + T + '" y2="' + ys(0) + '" stroke="#5C4A3B" stroke-width="1" stroke-dasharray="3 3" opacity="0"/><rect class="hit" x="' + L + '" y="0" width="' + (W - L - Rr) + '" height="' + H + '" fill="transparent"/>';
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + g + '</svg>';
    if (forPrint) return svg;
    return '<div class="chart-wrap" data-chart=\'' + esc(JSON.stringify({ pts, days, W, L, Rr, T, B, H })) + '\'>' + svg + '<div class="chart-tip"></div></div>';
  }
  function bindCharts(root) {
    root.querySelectorAll('[data-chart]').forEach((wrap) => {
      const c = JSON.parse(wrap.getAttribute('data-chart'));
      const svg = wrap.querySelector('svg'); const tip = wrap.querySelector('.chart-tip'); const xh = svg.querySelector('.xh');
      const xs = (x) => c.L + (c.days === 1 ? 0 : x / (c.days - 1)) * (c.W - c.L - c.Rr);
      const ys = (v) => c.T + (1 - v / 10) * (c.H - c.T - c.B);
      const move = (e) => {
        const r = svg.getBoundingClientRect(); const sx = (e.clientX - r.left) * (c.W / r.width);
        let best = c.pts[0]; c.pts.forEach((p) => { if (Math.abs(xs(p.x) - sx) < Math.abs(xs(best.x) - sx)) best = p; });
        const px = xs(best.x) * (r.width / c.W), py = ys(best.v) * (r.height / c.H);
        tip.innerHTML = fmtDate(best.d, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · itch <b>' + best.v + '</b>/10';
        tip.style.left = px + 'px'; tip.style.top = py + 'px'; tip.classList.add('show');
        xh.setAttribute('x1', xs(best.x)); xh.setAttribute('x2', xs(best.x)); xh.setAttribute('opacity', '.5');
      };
      const hide = () => { tip.classList.remove('show'); xh.setAttribute('opacity', '0'); };
      svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', hide);
    });
  }

  /* ------------------------------------------------------------------ plan */
  function renderPlan() {
    const a = activeAssessment();
    if (!a) return '<div><div class="label">Plan</div><h1 class="page-title">No plan <em>yet.</em></h1></div><div class="card"><p class="muted" style="margin-bottom:14px">Run the check first. The plan is built from {p} answers and is meant to be discussed with your vet.</p><button class="btn btn-primary btn-wide" data-act="startCheck">Start the check ' + IC.arrow + '</button></div>';
    const p = a.plan;
    const w = weeksOnPlan();
    let h = '<div><div class="label">Plan · from ' + fmtDate(a.date, { month: 'short', day: 'numeric', year: 'numeric' }) + ' · path ' + esc(a.gate) + '</div><h1 class="page-title">' + DN() + '\'s <em>plan</em></h1><p class="page-sub" style="margin-top:6px">' + p.why + '</p></div>';
    h += '<div class="info-box">' + IC.info + '<span>This is a plan to <b>talk through with your vet</b>, not a prescription. We\'re fur-parents, not vets.</span></div>';
    if (p.gate === 'G?') return h + '<button class="btn btn-primary btn-wide" data-act="startCheck">Finish the check</button>';

    h += '<div class="card">' + p.phases.map((ph) => {
      const m = ph.w.match(/(\d+)[–-](\d+)/) || ph.w.match(/(\d+)\+/);
      const lo = m ? Number(m[1]) : 0, hi = m && m[2] ? Number(m[2]) : Infinity;
      return '<div class="phase ' + (w >= lo && w < hi ? 'now' : '') + '"><span class="phase-dot"></span><div class="phase-weeks">' + esc(ph.w) + '</div><div class="phase-title">' + esc(ph.t) + '</div>' + ph.items.map(todoHTML).join('') + '</div>';
    }).join('') + '</div>';

    h += '<div class="card card-cream"><div class="label">Check-ins</div><p style="margin-top:4px">Weeks ' + p.recheck.join(', ') + '. Next one: <b>' + fmtDate(nextCheckIn(), { weekday: 'short', month: 'short', day: 'numeric' }) + '</b>.</p>' +
      '<button class="btn btn-soft btn-sm" style="margin-top:10px" data-act="startCheckin">Check in now</button></div>';

    if (p.diet || p.plants || isReal()) h += dietCard(p);
    if (p.formulas.length) h += '<h2 style="margin-top:6px">Formulas <em>to ask about</em></h2>' + p.formulas.map(formulaCard).join('');
    const bd = R.patterns.blood_def.cautions || [];
    if (p.formulas.includes('four_materials') && PC.answers.gassy === 'y') h += '<div class="warn-box">' + IC.warn + '<span>' + esc(bd[0] && bd[0].msg) + '</span></div>';
    if (isRaw() || p.diet) h += rawGuide();
    if (p.taper) h += taperCard();
    h += '<p class="muted small" style="text-align:center">Rules v' + esc(a.rulesVersion) + ' · Based on Dr. Steve Marsden\'s webinars: one integrative vet\'s approach, not mainstream veterinary consensus.</p>';
    return h;
  }
  function dietCard(p) {
    const f = R.diet.foundation; const plant = PC.diet.plantPct == null ? 0 : Number(PC.diet.plantPct);
    const enoughPlants = plant >= f.skip_adding_plants_if_plant_fraction_gte;
    const sp = PC.diet.species || [];
    const goodProb = sp.some((s) => f.probiotic_species_required_any.includes(s));
    return '<div class="card"><div class="card-head"><h3>Food foundation</h3>' + (enoughPlants ? '<span class="badge badge-good">Plants OK</span>' : '') + '</div><ul class="plain">' +
      '<li><b>Base:</b> ' + esc(f.base) + '.</li>' +
      (enoughPlants ? '<li>{P} plant share already looks good. No need to add more.</li>' : '<li><b>Plants:</b> about 1/6 to 1/3 of the bowl. Try ' + esc(f.plant_fraction.examples.join(', ')) + '.</li>') +
      '<li><b>Never:</b> ' + esc(f.plant_fraction.never.join(', ')) + '. <b>Only a little:</b> ' + esc(f.plant_fraction.minimal.join(', ')) + '.</li>' +
      '<li><b>Probiotic:</b> look for ' + esc(f.probiotic_species_required_any.join(', ')) + (PC.diet.probiotic === 'y' ? (goodProb ? '. The current one fits.' : '. Check {p} current one\'s label.') : '.') + '</li>' +
      '<li><b>Skip:</b> ' + esc(f.probiotic_wrong_niche.join(', ')) + ' (the "wrong niche" for this).</li>' +
      (PC.diet.starch.length ? '<li><b>Cut back:</b> ' + esc(PC.diet.starch.join(', ')) + '.</li>' : '') + '</ul></div>';
  }
  function formulaCard(key) {
    const f = R.formulas[key]; if (!f) return '';
    const vet = key === 'long_dan' || key === 'immunobomb';
    const nice = { four_marbles: 'Four Marbles', long_dan: 'Long Dan', four_materials: 'Four Materials', minor_bupleurum: 'Minor Bupleurum', cesarex: 'Cesarex', immunobomb: 'ImmunoBomb', galvanex: 'Galvanex' }[key];
    return '<div class="card formula ' + (vet ? 'vet' : '') + '"><div class="row-between"><div class="label">' + esc(nice) + '</div>' + (vet ? '<span class="badge badge-vet">Vet supervision</span>' : '') + '</div>' +
      '<div class="formula-classical" style="margin-top:4px">' + esc(f.classical) + '</div>' +
      (f.brands ? '<div class="formula-brands" style="margin-top:2px">' + esc(f.brands.join(' · ')) + '</div>' : '') +
      '<p class="small" style="margin-top:8px;color:var(--ink-2)">For: ' + esc(PATTERN_SHORT[f.for] ? PATTERN_SHORT[f.for] : f.for) + '</p>' +
      (f.caution ? '<div class="warn-box" style="margin-top:10px;font-size:13px">' + IC.warn + '<span>' + esc(f.caution) + '</span></div>' : '') +
      (key === 'cesarex' ? '<p class="small muted" style="margin-top:8px">Minor Bupleurum versions must contain ginseng (Ren Shen), not codonopsis, and are usually paired with Four Materials.</p>' : '') +
      '<div class="dose-note" style="margin-top:10px">' + IC.info + '<span>Dose: follow the product label and confirm with your vet. This app never gives doses.</span></div></div>';
  }
  function rawGuide() {
    return '<div class="card"><h3>Raw food: safe handling</h3><ul class="plain" style="margin-top:8px">' +
      '<li>Keep raw frozen; thaw in the fridge, not on the counter. Our heat spoils meat fast.</li>' +
      '<li>Use thawed raw within 1–2 days. Throw out what {s} leaves after 20–30 minutes.</li>' +
      '<li>Separate boards and bowls. Wash with hot soapy water; wash your hands after.</li>' +
      '<li>Buy from suppliers with a cold chain (frozen on delivery).</li>' +
      '<li>Puppies, seniors, sick dogs or homes with babies and immune-weak people: ask your vet whether lightly cooked is safer.</li></ul></div>';
  }
  function taperCard() {
    const cur = PC.meds.filter((m) => m.current === 'y' && R.drug_taper.per_drug[m.drug]);
    let h = '<div class="card"><div class="card-head"><h3>Medicine taper</h3><span class="badge badge-vet">With your vet</span></div>' +
      '<div class="warn-box">' + IC.warn + '<span>Never stop prednisone suddenly. Adrenal risk.</span></div>' +
      '<p class="small muted" style="margin:10px 0 6px">Only when {s}\'s clearly better. Stair-step:</p><ol class="steps">' + R.drug_taper.steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
    if (cur.length) {
      h += '<div class="stack" style="margin-top:12px">' + cur.map((m) => {
        const d = R.drug_taper.per_drug[m.drug];
        const how = { dose_step: 'Lower the dose in steps (your vet sets each step).', vet_schedule_only: 'Your vet\'s schedule only.', interval_extend: 'Longer gaps between injections. Your vet decides.' }[d.mode];
        return '<div class="info-box"><span><b>' + esc(medName(m)) + ':</b> ' + esc(how) + (d.warn ? ' <b>' + esc(d.warn) + '</b>' : '') + (d.note ? ' ' + esc(d.note) : '') + '</span></div>';
      }).join('') + '</div>';
    }
    return h + '</div>';
  }

  /* ------------------------------------------------------------------- log */
  function renderLog() {
    const logs = PC.logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    let h = '<div class="row-between"><div><div class="label">Daily log</div><h1 class="page-title">Itch <em>diary</em></h1></div><button class="btn btn-primary btn-sm" data-act="addLog">' + IC.plus + ' Log</button></div>';
    h += '<div class="card"><div class="label" style="margin-bottom:8px">Itch, last 30 days (0–10)</div>' + itchChart(30, 'Itch, last 30 days') + '</div>';
    if (!logs.length) return h + '<div class="card empty"><p>Nothing logged yet. A quick daily note (itch score, stool, ears, a photo) makes the 14-day check-ins and your vet visit much easier.</p></div>';
    h += '<div class="card card-tight">' + logs.map((l) => '<div class="log-item" data-act="addLog" data-id="' + l.id + '" role="button" tabindex="0">' +
      '<div class="log-itch">' + esc(l.itch) + '</div>' + (l.photoId ? '<div class="log-thumb" data-photo="' + esc(l.photoId) + '"></div>' : '') +
      '<div class="log-meta"><b>' + fmtDate(l.date, { weekday: 'short', month: 'short', day: 'numeric' }) + '</b><span>' + esc([STOOL[l.stool], (l.ears || []).join(', '), l.note].filter(Boolean).join(' · ') || 'No notes') + '</span></div></div>').join('') + '</div>';
    return h;
  }
  const STOOL = { 1: 'Hard stool', 2: 'Firm stool', 3: 'Soft stool', 4: 'Loose stool', 5: 'Watery stool' };

  function openLogSheet(id) {
    const ex = id ? PC.logs.find((l) => l.id === id) : PC.logs.find((l) => l.date === todayStr());
    UI.logEdit = ex ? JSON.parse(JSON.stringify(ex)) : { id: uid(), date: todayStr(), itch: 5, stool: 2, ears: [], note: '', photoId: null, _new: true };
    renderLogSheet();
  }
  function renderLogSheet() {
    const l = UI.logEdit;
    openSheet('<h2>' + (l._new ? 'Log the day' : 'Edit log') + '</h2>' +
      '<div class="field"><label>Date</label><input type="date" data-lbind="date" value="' + esc(l.date) + '" max="' + todayStr() + '"></div>' +
      '<div class="field"><span class="field-label">Itch (0 = none, 10 = non-stop)</span><div class="range-row"><input class="range" type="range" min="0" max="10" step="1" value="' + l.itch + '" data-lbind="itch" aria-label="Itch score"><span class="range-val" id="itch-val">' + l.itch + '</span></div></div>' +
      '<div class="field"><span class="field-label">Stool</span><div class="chips">' + [1, 2, 3, 4, 5].map((n) => '<button class="chip ' + (l.stool === n ? 'on' : '') + '" data-act="lset" data-k="stool" data-val="' + n + '">' + STOOL[n].replace(' stool', '') + '</button>').join('') + '</div></div>' +
      '<div class="field"><span class="field-label">Ears</span><div class="chips">' + ['Clean', 'Waxy', 'Red', 'Smelly', 'Scratching'].map((e) => '<button class="chip ' + (l.ears.includes(e) ? 'on' : '') + '" data-act="ltoggle" data-val="' + e + '">' + e + '</button>').join('') + '</div></div>' +
      '<div class="field"><span class="field-label">Photo</span><label class="hero-frame" style="aspect-ratio:16/9;margin:0"><input type="file" accept="image/*" data-act-file="logPhoto" hidden><div class="hero-photo" data-photo="' + esc(l.photoId || '') + '"></div><span class="hero-photo-hint">' + IC.camera + (l.photoId ? 'Change photo' : 'Add a photo') + '</span></label></div>' +
      '<div class="field"><label>Notes</label><textarea data-lbind="note" placeholder="New food? Bath? Weather? Anything that changed.">' + esc(l.note) + '</textarea></div>' +
      '<button class="btn btn-primary btn-wide" data-act="saveLog">Save</button>' + (l._new ? '' : '<button class="btn btn-ghost btn-wide" data-act="delLog">Delete this log</button>'));
  }

  /* ------------------------------------------------------------ meds sheet */
  function openMedSheet(id) {
    const ex = id && PC.meds.find((m) => m.id === id);
    UI.medEdit = ex ? JSON.parse(JSON.stringify(ex)) : { id: uid(), drug: '', other: '', dose: '', since: '', current: '', worked: '', stopped: '', flares: '', longTerm: '', side: '', _new: true };
    renderMedSheet();
  }
  function medYN(k, q) {
    const v = UI.medEdit[k];
    return '<div class="q"><div class="q-text">' + esc(q) + '</div><div class="yn">' + [['y', 'Yes'], ['n', 'No']].map(([val, l]) => '<button class="chip ' + (v === val ? (val === 'y' ? 'on-yes' : 'on-no') : '') + '" data-act="mset" data-k="' + k + '" data-val="' + val + '">' + l + '</button>').join('') + '</div></div>';
  }
  function renderMedSheet() {
    const m = UI.medEdit;
    openSheet('<h2>' + (m._new ? 'Add a medicine' : 'Edit medicine') + '</h2>' +
      '<div class="field"><span class="field-label">Which one?</span><div class="chips">' + DRUGS.map(([k, l]) => '<button class="chip ' + (m.drug === k ? 'on' : '') + '" data-act="mset" data-k="drug" data-val="' + k + '">' + l + '</button>').join('') + '</div></div>' +
      (m.drug === 'other' ? '<div class="field"><label>Name</label><input type="text" data-mbind="other" value="' + esc(m.other) + '"></div>' : '') +
      '<div class="field"><label>As prescribed (your own note)</label><div class="hint">Copy what your vet wrote, for the vet report. The app never suggests doses.</div><input type="text" data-mbind="dose" value="' + esc(m.dose) + '" placeholder="Copy from the vet\'s label"></div>' +
      '<div class="field"><label>Since when?</label><input type="text" data-mbind="since" value="' + esc(m.since) + '" placeholder="e.g. Jan 2025, about 8 months"></div>' +
      '<div class="card" style="padding:4px 16px">' + medYN('current', 'Still giving it now?') + medYN('worked', 'Did it work at first?') + medYN('stopped', 'Did it stop working later?') + medYN('flares', 'Does {s} flare when the dose is lowered?') +
      (['apoquel', 'atopica'].includes(m.drug) ? medYN('longTerm', 'Used for 6 months or longer?') : '') + '</div>' +
      '<div class="field"><label>Side effects you noticed</label><input type="text" data-mbind="side" value="' + esc(m.side) + '" placeholder="Optional"></div>' +
      '<button class="btn btn-primary btn-wide" data-act="saveMed"' + (m.drug ? '' : ' disabled') + '>Save</button>' + (m._new ? '' : '<button class="btn btn-ghost btn-wide" data-act="delMed">Remove</button>'));
  }

  /* -------------------------------------------------------------- check-in */
  function openCheckin() {
    UI.checkin = { flags: {}, response: '', tolerating: '', diligent: '', note: '', stage: 'flags' };
    renderCheckinSheet();
  }
  function renderCheckinSheet() {
    const c = UI.checkin;
    if (c.stage === 'flags') {
      const done = R.red_flags.every((f) => c.flags[f.id]);
      if (anyRedFlag(c.flags)) return openSheet(stopScreen('checkin'));
      return openSheet('<div class="label">Check-in · step 1 of 2</div><h2>Safety <em>first</em></h2><div class="card">' + R.red_flags.map((f) => ynQ(f.id, c.flags, { q: f.q, store: 'cflag', alert: true, noUnsure: true })).join('') + '</div>' +
        '<button class="btn btn-primary btn-wide" data-act="ciNext"' + (done ? '' : ' disabled') + '>Next ' + IC.arrow + '</button>');
    }
    if (c.stage === 'q') {
      const opt = [['much_better', 'Much better'], ['bit_better', 'A bit better'], ['same', 'About the same'], ['worse', 'Worse'], ['itchier', 'Itchier since a new herb']];
      const done = c.response && c.tolerating && c.diligent;
      return openSheet('<div class="label">Check-in · step 2 of 2</div><h2>How is ' + DN() + '?</h2>' +
        '<div class="field"><span class="field-label">Since the last check</span><div class="stack">' + opt.map(([k, l]) => '<button class="chip ' + (c.response === k ? 'on' : '') + '" style="text-align:left;border-radius:16px" data-act="ciset" data-k="response" data-val="' + k + '">' + l + '</button>').join('') + '</div></div>' +
        '<div class="card" style="padding:4px 16px">' + ['tolerating', 'diligent'].map((k) => '<div class="q"><div class="q-text">' + (k === 'tolerating' ? 'Handling the herbs/food well (stool, appetite OK)?' : 'Stuck to the plan most days?') + '</div><div class="yn">' +
          [['y', 'Yes'], ['n', 'No']].map(([v, l]) => '<button class="chip ' + (c[k] === v ? (v === 'y' ? 'on-yes' : 'on-no') : '') + '" data-act="ciset" data-k="' + k + '" data-val="' + v + '">' + l + '</button>').join('') + '</div></div>').join('') + '</div>' +
        '<div class="field"><label>Anything else?</label><textarea data-cbind="note" placeholder="Optional">' + esc(c.note) + '</textarea></div>' +
        '<button class="btn btn-primary btn-wide" data-act="ciSave"' + (done ? '' : ' disabled') + '>See suggestions ' + IC.arrow + '</button>');
    }
    if (c.stage === 'done') {
      return openSheet('<div class="label">Check-in saved</div><h2>Next steps <em>to discuss</em></h2><div class="card">' + c.suggestions.map((s) => todoHTML({ ic: s.ic, html: s.t })).join('') + '</div>' +
        '<p class="muted small">These are conversation starters for your vet, not instructions. Next check-in: <b>' + fmtDate(nextCheckIn(), { weekday: 'short', month: 'short', day: 'numeric' }) + '</b>.</p>' +
        '<button class="btn btn-primary btn-wide" data-act="closeSheet">Done</button>');
    }
  }

  /* ---------------------------------------------------------------- report */
  function renderReport() {
    const a = activeAssessment();
    let h = '<div><div class="label">For your vet</div><h1 class="page-title">Vet <em>report</em></h1><p class="page-sub" style="margin-top:6px">One page with {p} profile, history, pattern scores, current plan and itch chart. Print it or save it as a PDF to show your vet.</p></div>';
    h += '<button class="btn btn-primary btn-wide" data-act="print">' + IC.arrow + ' Print / Save as PDF</button>';
    h += '<div class="card"><h3>' + DN() + '</h3><p class="muted small" style="margin-top:4px">' + esc([PC.dog.breed, ageLabel(), PC.dog.sex, PC.dog.weightKg ? PC.dog.weightKg + ' kg' : '', PC.dog.city].filter(Boolean).join(' · ') || 'Fill in the profile in the Check tab.') + '</p>' +
      '<p class="small" style="margin-top:8px"><b>Food:</b> ' + esc(DIET_LABEL[PC.diet.type] || '–') + (PC.diet.brand ? ' (' + esc(PC.diet.brand) + ')' : '') + '</p>' +
      '<p class="small"><b>Medicines:</b> ' + (PC.meds.length ? PC.meds.map((m) => esc(medName(m)) + (m.current === 'y' ? ' (current)' : '')).join(', ') : '–') + '</p></div>';
    if (a) h += '<div class="card"><div class="label" style="margin-bottom:10px">Latest pattern scores · ' + fmtDate(a.date) + '</div>' + scoreBars(a.scores) + '</div>';
    h += '<div class="card"><div class="label" style="margin-bottom:8px">Itch, last 30 days</div>' + itchChart(30, 'Itch, last 30 days') + '</div>';
    if (PC.checkins.length) h += '<div class="card"><div class="label" style="margin-bottom:6px">Check-ins</div>' + PC.checkins.slice().reverse().slice(0, 6).map((c) => '<div class="log-item"><div class="log-meta"><b>' + fmtDate(c.date) + '</b><span>' + (c.redFlag ? 'Red flag: sent to vet' : esc(RESP[c.response] || c.response)) + '</span></div></div>').join('') + '</div>';
    return h;
  }
  const RESP = { much_better: 'Much better', bit_better: 'A bit better', same: 'About the same', worse: 'Worse', itchier: 'Itchier since a new herb' };

  function buildPrint() {
    const a = activeAssessment();
    const rows = (pairs) => '<table>' + pairs.filter((p) => p[1]).map(([k, v]) => '<tr><th style="width:32%">' + esc(k) + '</th><td>' + v + '</td></tr>').join('') + '</table>';
    let h = '<h1>' + DN() + ': itch & skin report</h1><p class="pr-note">Prepared by the owner with PupaCare Journey on ' + fmtDate(todayStr(), { year: 'numeric', month: 'long', day: 'numeric' }) + '. Owner-reported; not a diagnosis. Pattern logic follows Dr. Steve Marsden\'s integrative approach (rules v' + esc(R.version) + ').</p>';
    h += '<section><h2>Profile</h2>' + rows([['Breed', esc(PC.dog.breed)], ['Age', esc(ageLabel())], ['Sex', esc(PC.dog.sex)], ['Weight', PC.dog.weightKg ? esc(PC.dog.weightKg) + ' kg' : ''], ['Body shape', esc((BCS.find((b) => b[0] == PC.dog.bcs) || [0, ''])[1])], ['City', esc(PC.dog.city)], ['Temperament', esc((TEMPS.find((t) => t[0] === PC.temperament) || [0, ''])[1])]]) + '</section>';
    h += '<section><h2>Diet</h2>' + rows([['Type', esc(DIET_LABEL[PC.diet.type] || '')], ['Brand / recipe', esc(PC.diet.brand)], ['Plant share', PC.diet.plantPct != null ? esc((PLANT_OPTS.find((p) => p[0] == PC.diet.plantPct) || [0, ''])[1]) : ''], ['Starches', esc(PC.diet.starch.join(', '))], ['Treats', esc(PC.diet.treats)], ['Suspected triggers', esc(PC.diet.triggers)], ['Probiotic', PC.diet.probiotic === 'y' ? esc((PC.diet.probioticBrand || 'yes') + (PC.diet.species.length ? ' (' + PC.diet.species.join(', ') + ')' : '')) : PC.diet.probiotic === 'n' ? 'None' : ''], ['Weeks on real food', esc(PC.diet.realWeeks)]]) + '</section>';
    if (PC.meds.length) h += '<section><h2>Medicines</h2><table><tr><th>Drug</th><th>As prescribed</th><th>Since</th><th>Now?</th><th>Worked</th><th>Stopped working</th><th>Flares on lower dose</th><th>Side effects</th></tr>' +
      PC.meds.map((m) => '<tr><td>' + esc(medName(m)) + '</td><td>' + esc(m.dose) + '</td><td>' + esc(m.since) + '</td><td>' + yn(m.current) + '</td><td>' + yn(m.worked) + '</td><td>' + yn(m.stopped) + '</td><td>' + yn(m.flares) + '</td><td>' + esc(m.side) + '</td></tr>').join('') + '</table></section>';
    const reg = Object.entries(PC.regions).filter(([, v]) => v > 0);
    if (reg.length) h += '<section><h2>Affected areas (0–3)</h2><p>' + reg.map(([k, v]) => esc((REGIONS.find((r) => r[0] === k) || [0, k])[1]) + ': ' + v).join(' · ') + '</p></section>';
    if (a) {
      h += '<section><h2>Signs the owner reported</h2><p>' + a.signs.map((s) => esc(signLabel(s))).join(' · ') + '</p></section>';
      h += '<section><h2>Pattern scores (' + fmtDate(a.date) + ')</h2><table>' + Object.keys(R.patterns).map((k) => '<tr><td>' + esc(R.patterns[k].label) + '</td><td style="width:18%">' + Math.round(a.scores[k] * 100) + '% (' + level(a.scores[k]) + ')</td></tr>').join('') + '</table></section>';
      h += '<section><h2>Plan being discussed (path ' + esc(a.gate) + ')</h2><p>' + a.plan.why + '</p><ul>' + a.plan.phases.map((p) => '<li><b>' + esc(p.w) + ': ' + esc(p.t) + '.</b> ' + p.items.map((i) => i.html).join(' ') + '</li>').join('') + '</ul>' +
        (a.plan.formulas.length ? '<p><b>Formulas to ask about:</b> ' + a.plan.formulas.map((f) => esc(R.formulas[f].classical) + (R.formulas[f].brands ? ' (' + esc(R.formulas[f].brands.join(' / ')) + ')' : '')).join('; ') + '. No doses suggested by the app.</p>' : '') + '</section>';
    }
    h += '<section><h2>Itch score, last 30 days</h2>' + itchChart(30, 'Itch, last 30 days', true) + '</section>';
    const recent = PC.logs.slice().sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 14);
    if (recent.length) h += '<section><h2>Recent log</h2><table><tr><th>Date</th><th>Itch</th><th>Stool</th><th>Ears</th><th>Note</th></tr>' + recent.map((l) => '<tr><td>' + fmtDate(l.date) + '</td><td>' + esc(l.itch) + '</td><td>' + esc(STOOL[l.stool] || '') + '</td><td>' + esc((l.ears || []).join(', ')) + '</td><td>' + esc(l.note) + '</td></tr>').join('') + '</table></section>';
    if (PC.checkins.length) h += '<section><h2>Check-ins</h2><table>' + PC.checkins.map((c) => '<tr><td style="width:20%">' + fmtDate(c.date) + '</td><td>' + (c.redFlag ? 'Red flag: referred to vet' : esc(RESP[c.response] || '') + (c.note ? ': ' + esc(c.note) : '')) + '</td></tr>').join('') + '</table></section>';
    $('#print-root').innerHTML = pr(h);
  }
  function yn(v) { return v === 'y' ? 'Yes' : v === 'n' ? 'No' : ''; }

  /* --------------------------------------------------------------- sheets */
  function openSheet(html) {
    const s = $('#sheet'); const body = $('#sheet-body');
    const wasOpen = !s.hidden; const y = body.scrollTop;
    body.innerHTML = pr(html); s.hidden = false; $('#sheet-backdrop').hidden = false;
    if (wasOpen) { s.style.animation = 'none'; body.scrollTop = y; } else { s.style.animation = ''; body.scrollTop = 0; }
    hydratePhotos(body);
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; UI.logEdit = null; UI.medEdit = null; UI.checkin = null; render(true); }

  function openSettings() {
    openSheet('<h2>Settings</h2>' +
      '<div class="card stack"><h3>Backup</h3><p class="muted small">Everything is saved on this phone only. Export a backup now and then, and before changing phones.</p>' +
      '<button class="btn btn-soft btn-wide" data-act="export">Export backup (.json)</button><label class="btn btn-ghost btn-wide">Import backup<input type="file" accept="application/json,.json" data-act-file="import" hidden></label></div>' +
      '<div class="card"><h3>About</h3><p class="small" style="margin-top:6px;color:var(--ink-2)">Made by fur-parents for ' + DN() + ' and dogs like {o}. <b>We\'re not vets.</b> The logic follows one integrative vet\'s approach (Dr. Steve Marsden\'s two-part webinar), which is not mainstream veterinary consensus. Pattern weights are early guesses (v' + esc(R.version) + ') and will change. The app never gives doses. Always confirm with your vet.</p></div>' +
      '<div class="card"><h3>Start over</h3><p class="muted small" style="margin:6px 0 10px">Deletes all data and photos on this phone. This can\'t be undone.</p><button class="btn btn-alert btn-wide" data-act="reset">Delete everything</button></div>' +
      '<button class="btn btn-ghost btn-wide" data-act="closeSheet">Close</button>');
  }

  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act; const id = el.dataset.id; const val = el.dataset.val;
    switch (act) {
      case 'tab': closeSheetSilently(); goTab(el.dataset.tab); break;
      case 'startCheck': UI.step = 0; UI.tab = 'check'; goTab('check'); break;
      case 'wizExit': UI.step = null; render(); break;
      case 'wizBack': UI.step = Math.max(0, UI.step - 1); $('#main').scrollTop = 0; render(); break;
      case 'wizNext':
        if (STEPS[UI.step][0] === 'flags' && anyRedFlag()) { render(); break; }
        if (UI.step === STEPS.length - 2) runAssessment();
        UI.step++; $('#main').scrollTop = 0; render(); break;
      case 'wizDone': UI.step = null; goTab('today'); break;
      case 'clearFlags':
        PC.assessments.push({ id: uid(), date: todayStr(), rulesVersion: R.version, scores: {}, gate: 'G0', plan: null, signs: [] });
        PC.redFlags = {}; saveState(); UI.step = null; render(); break;
      case 'flag': PC.redFlags[id] = val; saveState(); render(true); break;
      case 'ans': PC.answers[id] = PC.answers[id] === val ? '' : val; saveState(); render(true); break;
      case 'dietyn': PC.diet[id] = val; saveState(); render(true); break;
      case 'set': {
        const path = el.dataset.path; const cur = getPath(path);
        let v = val; if (['dog.bcs', 'diet.plantPct'].includes(path)) v = Number(val);
        setPath(path, String(cur) === String(v) && path !== 'diet.type' ? (typeof v === 'number' ? null : '') : v);
        saveState(); render(true); break;
      }
      case 'toggle': { const arr = getPath(el.dataset.path); const i = arr.indexOf(val); if (i >= 0) arr.splice(i, 1); else arr.push(val); saveState(); render(true); break; }
      case 'region': PC.regions[id] = Number(val); saveState(); render(true); break;
      case 'addMed': openMedSheet(id); break;
      case 'mset': UI.medEdit[el.dataset.k] = UI.medEdit[el.dataset.k] === val && el.dataset.k !== 'drug' ? '' : val; renderMedSheet(); break;
      case 'saveMed': {
        const m = UI.medEdit; delete m._new; const i = PC.meds.findIndex((x) => x.id === m.id);
        if (i >= 0) PC.meds[i] = m; else PC.meds.push(m); saveState(); closeSheet(); break;
      }
      case 'delMed': PC.meds = PC.meds.filter((x) => x.id !== UI.medEdit.id); saveState(); closeSheet(); break;
      case 'addLog': openLogSheet(id); break;
      case 'lset': UI.logEdit[el.dataset.k] = Number(val); renderLogSheet(); break;
      case 'ltoggle': { const a = UI.logEdit.ears; const i = a.indexOf(val); if (i >= 0) a.splice(i, 1); else a.push(val); renderLogSheet(); break; }
      case 'saveLog': {
        const l = UI.logEdit; delete l._new; l.itch = Number(l.itch);
        const clash = PC.logs.find((x) => x.date === l.date && x.id !== l.id);
        if (clash) PC.logs = PC.logs.filter((x) => x.id !== clash.id);
        const i = PC.logs.findIndex((x) => x.id === l.id); if (i >= 0) PC.logs[i] = l; else PC.logs.push(l);
        saveState(); closeSheet(); toast('Saved'); break;
      }
      case 'delLog': { const l = UI.logEdit; if (l.photoId) IDB.del(l.photoId); PC.logs = PC.logs.filter((x) => x.id !== l.id); saveState(); closeSheet(); break; }
      case 'startCheckin': if (!activeAssessment()) { toast('Run a check first'); break; } openCheckin(); break;
      case 'cflag': UI.checkin.flags[id] = val; renderCheckinSheet(); break;
      case 'ciNext': UI.checkin.stage = 'q'; renderCheckinSheet(); break;
      case 'ciset': UI.checkin[el.dataset.k] = val; renderCheckinSheet(); break;
      case 'ciSave': {
        const c = UI.checkin; c.suggestions = responseLoop(c);
        PC.checkins.push({ id: uid(), date: todayStr(), response: c.response, tolerating: c.tolerating, diligent: c.diligent, note: c.note, redFlag: false, suggestions: c.suggestions });
        saveState(); c.stage = 'done'; renderCheckinSheet(); break;
      }
      case 'closeSheet':
        if (UI.checkin && UI.checkin.stage === 'flags' && anyRedFlag(UI.checkin.flags)) { PC.checkins.push({ id: uid(), date: todayStr(), redFlag: true }); saveState(); }
        closeSheet(); break;
      case 'dogPhoto': pickFile('image/*', async (f) => { const pid = await savePhoto(f, 1100, 0.82); if (PC.dog.photoId) IDB.del(PC.dog.photoId); PC.dog.photoId = pid; saveState(); render(true); }); break;
      case 'print': buildPrint(); setTimeout(() => window.print(), 50); break;
      case 'export': exportBackup(); break;
      case 'reset':
        if (!confirm('Delete all of ' + dogName() + '\'s data and photos on this phone? This can\'t be undone.')) break;
        localStorage.removeItem(KEY); await IDB.clear(); location.reload(); break;
    }
  });
  function closeSheetSilently() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; }

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.bind) {
      setPath(t.dataset.bind, t.value); saveState();
      if (t.dataset.bind === 'dog.name') { const btn = $('[data-act="wizNext"]'); if (btn) btn.disabled = !t.value.trim(); }
    }
    if (t.dataset.lbind) { UI.logEdit[t.dataset.lbind] = t.dataset.lbind === 'itch' ? Number(t.value) : t.value; if (t.dataset.lbind === 'itch') $('#itch-val').textContent = t.value; }
    if (t.dataset.mbind) UI.medEdit[t.dataset.mbind] = t.value;
    if (t.dataset.cbind) UI.checkin[t.dataset.cbind] = t.value;
  });
  document.addEventListener('change', async (e) => {
    const t = e.target; const kind = t.dataset.actFile; if (!kind || !t.files || !t.files[0]) return;
    const f = t.files[0];
    if (kind === 'logPhoto') { const pid = await savePhoto(f, 720, 0.72); if (UI.logEdit.photoId) IDB.del(UI.logEdit.photoId); UI.logEdit.photoId = pid; renderLogSheet(); }
    if (kind === 'import') importBackup(f);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
  });

  function pickFile(accept, cb) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => { if (i.files[0]) cb(i.files[0]); }; i.click();
  }

  async function exportBackup() {
    const photos = await IDB.all();
    const blob = new Blob([JSON.stringify({ app: 'pupacare-journey', exported: new Date().toISOString(), data: PC, photos })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'pupacare-backup-' + todayStr() + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importBackup(file) {
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const j = JSON.parse(fr.result);
        if (j.app !== 'pupacare-journey' || !j.data) throw new Error('not a backup');
        if (!confirm('Replace everything on this phone with this backup?')) return;
        await IDB.clear();
        for (const [k, v] of Object.entries(j.photos || {})) if (typeof v === 'string' && v.startsWith('data:image/')) await IDB.put(k, v);
        PC = Object.assign(defaultState(), j.data); saveState(); location.reload();
      } catch (err) { toast('That file isn\'t a PupaCare backup'); }
    };
    fr.readAsText(file);
  }

  /* --------------------------------------------------------------- welcome */
  function initWelcome() {
    const w = $('#welcome'); w.hidden = false;
    const h1 = $('#welcome-h1');
    let n = 0;
    const split = (node) => {
      Array.from(node.childNodes).forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else { const s = document.createElement('span'); s.className = 'w'; s.style.animationDelay = (0.1 + n++ * 0.08) + 's'; s.textContent = part; frag.appendChild(s); }
          });
          c.replaceWith(frag);
        } else split(c);
      });
    };
    split(h1);
    const name = $('#welcome-name'), consent = $('#welcome-consent'), start = $('#welcome-start');
    name.value = PC.dog.name || '';
    const sexBtns = document.querySelectorAll('#welcome-sex [data-sex]');
    const paintSex = () => sexBtns.forEach((b) => b.classList.toggle('on', b.dataset.sex === PC.dog.sex));
    sexBtns.forEach((b) => b.addEventListener('click', () => { PC.dog.sex = b.dataset.sex; saveState(); paintSex(); }));
    paintSex();
    const upd = () => { start.disabled = !(consent.checked && name.value.trim()); };
    name.addEventListener('input', upd); consent.addEventListener('change', upd);
    $('#welcome-photo-input').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const pid = await savePhoto(f, 1100, 0.82); PC.dog.photoId = pid; saveState();
      const img = $('#welcome-photo-img'); img.setAttribute('data-photo', pid); hydratePhotos(w);
      $('#welcome-photo-hint').lastChild.textContent = 'Change photo';
    });
    start.addEventListener('click', () => {
      PC.dog.name = name.value.trim(); PC.accepted = true; saveState();
      w.hidden = true; showApp();
    });
  }
  function showApp() { $('#app').hidden = false; goTab('today'); }

  window.goTab = goTab;
  window.openSettings = openSettings;
  window.closeSheet = closeSheet;

  loadState();
  if (PC.accepted) showApp(); else initWelcome();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
