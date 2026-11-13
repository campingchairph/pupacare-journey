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
      const raw = migrateNames(localStorage.getItem(KEY));
      if (raw) PC = Object.assign(defaultState(), JSON.parse(raw));
      PC.dog = Object.assign(defaultState().dog, PC.dog);
      PC.diet = Object.assign(defaultState().diet, PC.diet);
    } catch (e) { console.warn('load failed', e); }
  }
  // Rules v0.2.0 corrected transcript errors in product names. Rewrite saved data
  // (formula keys, sign ids and plan text) so old plans show the real names.
  function migrateNames(raw) {
    if (!raw) return raw;
    const pairs = [['four_marbles', 'four_marvels'], ['cesarex', 'cessorex'], ['immunobomb', 'immunobalm'],
      ['Four Marbles', 'Four Marvels'], ['Cesarex', 'Cessorex'], ['ImmunoBomb', 'ImmunoBalm'],
      ['Lift the Chi', 'Lift the Qi'], ['Harmonize the Chi', 'Harmonize the Qi'], ['Four Materials', 'Four Substances'],
      ['Lactobacillus, Bifidobacterium or Bacteroides', 'Lactobacillus or Bifidobacterium']];
    let out = raw;
    pairs.forEach(([a, b]) => { out = out.split(a).join(b); });
    if (out !== raw) { try { localStorage.setItem(KEY, out); } catch (e) { /* keep in memory only */ } }
    return out;
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
    itchier_on_cessorex: { step: 'meds', q: 'Has {s} been on Cessorex (or a similar herb) and got itchier?', s: 'Itchier on Cessorex' },
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
    calcinosis_cutis: { step: 'history', q: 'Has a vet found calcinosis cutis (hard, chalky skin bumps)?', tag: 'Vet dx', hint: R.patterns.severe.signs.find((x) => x.id === 'calcinosis_cutis').vet_warning, s: 'Calcinosis cutis' },
    cruciate_or_hip_history: { step: 'history', q: 'Cruciate (knee ligament) injury or hip dysplasia?', s: 'Cruciate / hip history' },
    kcs_dry_eye: { step: 'history', q: 'Dry eye (KCS) or thick sticky eye discharge?', s: 'Dry eye (KCS)' },
    classic_rectal_prolapse_history: { step: 'history', q: 'Ever had a rectal prolapse?', s: 'Rectal prolapse history' },
    high_eosinophils: { step: 'history', q: 'Bloodwork showed high eosinophils?', tag: 'Bloodwork', s: 'High eosinophils' },
    hypercalcemia_idiopathic: { step: 'history', q: 'Bloodwork showed high calcium with no clear cause?', tag: 'Bloodwork', hint: R.patterns.adaptive.signs.find((x) => x.id === 'hypercalcemia_idiopathic').vet_warning, s: 'High calcium' }
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
      P.gate = 'G1a'; P.formulas = ['four_marvels', 'cessorex']; P.recheck = [2, 4, 6];
      P.why = name + ' eats processed food and switching isn\'t possible right now. Herbs alone work more slowly, so we\'ll keep asking about food at every check-in.';
      P.phases = [
        { t: 'Start gently', w: 'Week 0–2', items: [it('herb', 'Ask your vet about <b>Four Marvels</b> (Si Miao San) to cool the damp heat.'), it('herb', 'Ask your vet about <b>Cessorex</b> for the gut side.'), it('food', 'Cut starchy extras and treats (rice, bread, potato, corn, pasta) where you can.'), it('watch', 'Log the itch daily so the 2-week check-in has real numbers.')] },
        { t: 'Watch & adjust', w: 'Week 2–6', items: [it('watch', 'Check-ins at weeks 2, 4 and 6.'), it('food', 'Think about fresh food again. It\'s the biggest lever in this approach.'), it('herb', 'If {s} gets itchier on Cessorex, the check-in will suggest the next step for your vet.')] },
        { t: 'Settle in', w: 'Week 6+', items: [it('taper', 'Once {s}\'s clearly better, talk to your vet about a slow, stair-step taper.'), it('herb', 'Then find the lowest herb amount that holds.')] }
      ];
      P.taper = true; return P;
    }
    if (isProcessed()) {
      P.gate = 'G1b'; P.diet = true; P.recheck = [2, 4, 6]; P.longDan = irritable;
      P.formulas = irritable ? ['long_dan', 'four_marvels'] : ['four_marvels'];
      P.why = name + ' eats processed food. In this approach food is the foundation: move to fresh, meat-based food, with a cooling formula alongside.';
      P.phases = [
        { t: 'Food foundation', w: 'Week 0–2', items: [
          it('food', 'Switch to <b>fresh, meat-based food</b> (raw or cooked) over about 7–10 days, mixing a bit more each day.'),
          it('food', 'Make <b>1/6 to 1/3</b> of the bowl plants: kamote, kalabasa, carrot, pechay, malunggay. <b>Never onion.</b> Only a little garlic.'),
          it('food', 'Add a probiotic with <b>Lactobacillus or Bifidobacterium</b>.'),
          irritable ? it('vet', 'Because {s} gets irritable, ask your vet about <b>Long Dan Xie Gan Tang</b>. It\'s strong and vet-supervised only.') : it('herb', 'Ask your vet about <b>Four Marvels</b> (Si Miao San).')
        ] },
        { t: 'Watch & adjust', w: 'Week 2–6', items: [
          it('watch', 'Check-ins at weeks 2, 4 and 6.'),
          irritable ? it('herb', 'Once things calm down, your vet can move {o} from Long Dan to <b>Four Marvels</b> to finish.') : it('herb', 'Keep Four Marvels going while the new food settles in.'),
          it('watch', 'Watch the stool while the food changes; soft stool for a few days is common.')
        ] },
        { t: 'Settle in', w: 'Week 6+', items: [it('taper', 'If {s}\'s radically better, run a new check: the plan will move to <b>maintain + taper</b>.'), it('herb', 'Find the lowest herb amount that holds, with your vet.')] }
      ];
      P.taper = true; return P;
    }
    if (isReal() && Number(d.realWeeks) >= 4 && d.radicallyBetter === 'y') {
      P.gate = 'G2a'; P.formulas = ['four_marvels']; P.taper = true; P.recheck = [2, 4];
      P.why = name + ' has been on real food for 4+ weeks and is radically better. Keep things steady and start a slow, vet-guided taper.';
      P.phases = [
        { t: 'Hold steady', w: 'Week 0–2', items: [it('food', 'Keep the fresh food, plants and probiotics exactly as they are.'), it('herb', 'Keep <b>Four Marvels</b> going as maintenance (with your vet).')] },
        { t: 'Stair-step taper', w: 'Week 2–6', items: [it('taper', 'With your vet, lower the itch medicine step by step (see the taper card below).'), it('watch', 'A mild itch is your signal to hold that dose for 1–2 weeks.')] },
        { t: 'Lowest dose', w: 'Week 6+', items: [it('herb', 'Once off meds, find the lowest herb amount that holds.'), it('watch', 'Restart herbs ~1 month before {p} usual flare season.')] }
      ];
      return P;
    }
    if (isRaw() && plant < 0.1) {
      P.gate = 'G2b'; P.plants = true; P.recheck = [2, 4];
      P.why = name + ' eats raw but with almost no plants. Add plants and the right probiotics first, then check again in 2–4 weeks.';
      P.phases = [
        { t: 'Add plants & probiotics', w: 'Week 0–2', items: [it('food', 'Build up to <b>1/6–1/3 plants</b>: kamote, kalabasa, carrot, pechay, malunggay, berries. <b>Never onion.</b>'), it('food', 'Use a probiotic with <b>Lactobacillus or Bifidobacterium</b>.')] },
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
      if (scores.adaptive >= R.scoring.moderate && scores.blood_def >= R.scoring.moderate) P.why += ' Adaptive and dry signs overlap; Cessorex covers both.';
      const first = {
        severe: [it('vet', 'Ask your vet about <b>ImmunoBalm</b> (based on Qing Ying Tang, "Cool the Blood") to calm things first. Vet supervision.'), it('herb', 'Once calmer, your vet may add <b>Cessorex</b>.')],
        adaptive: [it('herb', 'Ask your vet about <b>Cessorex</b> for the gut lining and microbiome.')],
        low_grade: [it('herb', 'Ask your vet about <b>Galvanex</b> (Bu Zhong Yi Qi Tang) to lift {p} energy.'), it('herb', 'Plus <b>Cessorex</b>.')],
        blood_def_only: [it('herb', 'Ask your vet about <b>Four Substances</b> (Si Wu Tang) for the dry type.')]
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
    const hasCes = a.plan.formulas.includes('cessorex');
    const improving = c.response === 'much_better' || c.response === 'bit_better';
    const weeks = weeksOnPlan();
    if (c.response === 'itchier') {
      if (hasCes && isReal()) out.push({ ic: 'vet', t: 'Itchier on Cessorex while on real food: ask your vet about <b>adding ImmunoBalm</b> and <b>reducing Cessorex</b>.' });
      else if (hasCes) out.push({ ic: 'vet', t: 'Itchier on Cessorex while on processed food: ask your vet about <b>adding Four Marvels</b> and <b>reducing Cessorex</b>.' });
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

  /* ---------------------------------------------------------------- scenery */
  const SC = { red: '#EE5127', orchid: '#B272A3', sun: '#FFC357', sky: '#50C1D6', fill: '#E9E2D3', ink: '#1E1B2E' };
  Object.assign(IC, {
    tick: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    print: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>'
  });

  function sceneSVG(name) {
    const { red, orchid, sun, sky, fill } = SC;
    const open = '<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMin slice">';
    switch (name) {
      case 'welcome':
        return '<svg viewBox="0 0 400 360" preserveAspectRatio="xMidYMax slice">' +
          '<circle class="drift" cx="350" cy="70" r="105" fill="' + sun + '"/>' +
          '<circle class="drift b" cx="15" cy="255" r="80" fill="' + sky + '"/>' +
          '<circle class="drift c" cx="405" cy="300" r="62" fill="' + orchid + '"/>' +
          '<circle class="drift" cx="318" cy="232" r="13" fill="' + red + '"/><circle class="drift b" cx="80" cy="130" r="9" fill="' + orchid + '"/>' +
          '<circle class="drift c" cx="110" cy="330" r="7" fill="' + red + '"/></svg>';
      case 'today':
        return open + '<circle class="breathe" cx="380" cy="10" r="105" fill="' + sun + '"/>' +
          '<circle class="drift" cx="298" cy="58" r="14" fill="' + red + '"/>' +
          '<circle class="drift b" cx="372" cy="138" r="8" fill="' + orchid + '"/><circle class="drift c" cx="250" cy="34" r="6" fill="' + sky + '"/></svg>';
      case 'check': {
        const done = UI.step == null ? 0 : UI.step + 1;
        const pts = [[262, 128], [292, 104], [326, 112], [356, 88], [372, 54], [342, 30], [306, 40], [276, 18], [240, 8]];
        return open + '<circle class="drift c" cx="410" cy="150" r="60" fill="' + sky + '" opacity=".35"/>' +
          pts.map(([x, y], i) => '<circle cx="' + x + '" cy="' + y + '" r="' + (10 + (i % 3) * 2) + '" fill="' + (i < done ? sky : fill) + '" style="transition:fill .5s"/>').join('') +
          '<circle class="drift" cx="230" cy="70" r="6" fill="' + red + '"/></svg>';
      }
      case 'plan':
        return open + '<rect class="drift" x="270" y="-34" width="180" height="90" rx="45" fill="' + sun + '"/>' +
          '<rect class="drift b" x="320" y="70" width="120" height="60" rx="30" fill="' + sun + '" opacity=".6"/>' +
          '<circle class="drift" cx="300" cy="62" r="11" fill="' + red + '"/><circle class="drift b" cx="245" cy="30" r="6" fill="' + sky + '"/></svg>';
      case 'log': {
        let dots = '';
        const P = [[232, 22, 5], [258, 38, 7], [286, 16, 4], [304, 46, 5]];
        P.forEach(([x, y, r], i) => { dots += '<circle class="drift ' + ['', 'b', 'c'][i % 3] + '" cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (i === 3 ? sun : orchid) + '"/>'; });
        return open + '<circle class="breathe" cx="412" cy="-40" r="76" fill="' + orchid + '"/>' + dots + '</svg>';
      }
      case 'report':
        return open + '<circle cx="300" cy="30" r="18" fill="none" stroke="' + red + '" stroke-width="5"/><circle cx="352" cy="26" r="13" fill="' + orchid + '"/>' +
          '<rect x="320" y="58" width="34" height="34" rx="8" fill="' + sun + '"/><circle cx="374" cy="84" r="8" fill="' + sky + '"/></svg>';
    }
    return '';
  }
  let sceneKey = '';
  function updateScene() {
    const key = UI.tab + (UI.tab === 'check' ? ':' + UI.step : '');
    if (key === sceneKey) return;
    const el = $('#scene');
    if (UI.tab === 'check' && sceneKey.startsWith('check') && el.firstChild) {
      // light up stones without rebuilding
      const done = UI.step == null ? 0 : UI.step + 1;
      el.querySelectorAll('circle[style]').forEach((c, i) => c.setAttribute('fill', i < done ? SC.sky : SC.fill));
    } else el.innerHTML = sceneSVG(UI.tab);
    sceneKey = key;
  }
  function dotsArt() {
    return '<svg class="empty-art" viewBox="0 0 120 84" aria-hidden="true"><circle class="drift" cx="22" cy="44" r="14" fill="' + SC.red + '"/><circle class="drift" style="animation-delay:-1s" cx="48" cy="22" r="14" fill="' + SC.orchid + '"/>' +
      '<circle class="drift" style="animation-delay:-2s" cx="76" cy="22" r="14" fill="' + SC.sun + '"/><circle class="drift" style="animation-delay:-3s" cx="100" cy="44" r="14" fill="' + SC.sky + '"/>' +
      '<path d="M61 46c-12 0-22 10-22 21 0 7 6 11 12 11 4 0 7-3 10-3s6 3 10 3c6 0 12-4 12-11 0-11-10-21-22-21z" fill="' + SC.ink + '"/></svg>';
  }
  function emptyState(title, text, btn) { return '<div class="card empty">' + dotsArt() + '<h3>' + title + '</h3><p>' + text + '</p>' + (btn || '') + '</div>'; }

  function burst(x, y) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cols = [SC.red, SC.orchid, SC.sun, SC.sky];
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('i'); d.className = 'burst-dot';
      const a = (i / 16) * Math.PI * 2 + Math.random() * .3, r = 60 + Math.random() * 60;
      d.style.left = (x - 5) + 'px'; d.style.top = (y - 5) + 'px'; d.style.background = cols[i % 4];
      d.style.setProperty('--dx', (Math.cos(a) * r).toFixed(0) + 'px'); d.style.setProperty('--dy', (Math.sin(a) * r).toFixed(0) + 'px');
      document.body.appendChild(d); setTimeout(() => d.remove(), 950);
    }
  }
  function burstAt(el) { if (!el) return burst(innerWidth / 2, innerHeight / 3); const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); }

  /* ---------------------------------------------------------------- render */
  const HEAD_TITLE = { today: () => dogName(), check: () => 'Check', plan: () => 'Plan', log: () => 'Itch diary', report: () => 'Vet report' };
  function goTab(t) {
    if (t !== 'check' && UI.step === STEPS.length - 1) UI.step = null;
    UI.tab = t;
    document.querySelectorAll('.tab').forEach((b) => { b.classList.toggle('active', b.dataset.tab === t); b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'); });
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'panel-' + t; });
    $('#main').scrollTop = 0;
    render();
  }
  let lastProg = 0;
  function render(keepScroll) {
    const m = $('#main'); const y = m.scrollTop;
    const app = $('#app');
    app.dataset.section = UI.tab;
    app.classList.toggle('in-flow', UI.tab === 'check' && UI.step != null);
    $('#head-title').textContent = HEAD_TITLE[UI.tab]();
    updateScene();
    const fn = { today: renderToday, check: renderCheck, plan: renderPlan, log: renderLog, report: renderReport }[UI.tab];
    const el = $('#panel-' + UI.tab);
    el.innerHTML = pr(fn());
    if (keepScroll) { el.querySelectorAll(':scope > *').forEach((c) => { c.style.animation = 'none'; }); m.scrollTop = y; }
    hydratePhotos(el);
    bindCharts(el);
    const bar = el.querySelector('.progress i');
    if (bar) { const to = bar.style.width; bar.style.width = lastProg + '%'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = to; })); lastProg = parseFloat(to); }
    onScroll();
  }
  function onScroll() {
    const y = $('#main').scrollTop;
    $('#app-head').classList.toggle('scrolled', y > 44);
    $('#scene').style.transform = 'translate3d(0,' + (-y * 0.35).toFixed(1) + 'px,0)';
  }

  /* Trail: signature */
  function trailHTML() {
    const a = activeAssessment();
    const stops = [0, 2, 6, 12];
    const w = a ? weeksOnPlan() : -1;
    const pos = [0, 1 / 3, 2 / 3, 1];
    let pct = 0;
    if (a) for (let i = 0; i < stops.length - 1; i++) if (w >= stops[i]) pct = pos[i] + (pos[i + 1] - pos[i]) * Math.min(1, (w - stops[i]) / (stops[i + 1] - stops[i]));
    let h = '<div class="trail" role="img" aria-label="Week ' + Math.max(0, Math.floor(w)) + ' of 12">' +
      '<div class="trail-line"></div><div class="trail-fill" style="width:calc((100% - 28px) * ' + pct.toFixed(3) + ')"></div>';
    stops.forEach((s, i) => {
      const left = 'calc(14px + (100% - 28px) * ' + pos[i].toFixed(4) + ')';
      const next = stops[i + 1] == null ? Infinity : stops[i + 1];
      const now = a && w >= s && w < next, on = a && w >= s;
      h += '<div class="trail-stop ' + (now ? 'now' : '') + '" style="left:' + left + '"><div class="trail-dot ' + (on ? 'on' : '') + '">' + IC.paw + '</div><span>Wk ' + s + '</span></div>';
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

    let h = '<div class="dog-head"><div class="avatar-wrap"><button class="avatar" data-act="dogPhoto" aria-label="' + (PC.dog.photoId ? 'Change photo' : 'Add a photo') + '"><div class="hero-photo" data-photo="' + esc(PC.dog.photoId || '') + '"></div></button>' +
      '<span class="avatar-add" aria-hidden="true">' + (PC.dog.photoId ? IC.camera : IC.plus) + '</span></div>' +
      '<div style="min-width:0"><h1 class="dog-name">' + DN() + '</h1><p class="dog-meta">' + (sub || (a ? 'Week ' + Math.floor(weeksOnPlan()) + ' of the journey' : 'Ready when you are')) + '</p></div></div>';

    // The one next thing
    const deco = '<svg class="deco" viewBox="0 0 150 150" aria-hidden="true"><circle cx="100" cy="50" r="50" fill="#fff" opacity=".18"/><circle cx="40" cy="110" r="16" fill="#fff" opacity=".22"/></svg>';
    if (!a) h += '<div class="card next-card c-red">' + deco + '<div class="label">First step</div><h2>Start ' + DN() + '\'s check</h2><p>About 10 minutes: safety, food, meds, skin and a few hands-on checks. You get a plan to talk through with your vet.</p><button class="btn" data-act="startCheck">Start the check ' + IC.arrow + '</button></div>';
    else if (due != null && due <= 0) h += '<div class="card next-card c-sky">' + deco + '<div class="label">Check-in due</div><h2>How has ' + DN() + ' been?</h2><p>Two quick steps: safety, then how {s}\'s responding. The plan updates from your answers.</p><button class="btn" data-act="startCheckin">Do the check-in ' + IC.arrow + '</button></div>';
    else if (!todays) h += '<div class="card next-card c-orchid">' + deco + '<div class="label">Today</div><h2>How itchy is ' + DN() + ' today?</h2><p>A 20-second log: itch score, stool, ears and a photo if you like.</p><button class="btn" data-act="addLog">' + IC.plus + ' Log today</button></div>';
    else h += '<div class="card next-card c-sun">' + deco + '<div class="label">All done for today</div><h2>Itch ' + todays.itch + '/10 logged</h2><p>Next check-in ' + (due === 1 ? 'tomorrow' : 'in ' + due + ' days') + '. Here\'s this stretch of the plan.</p><button class="btn" data-act="tab" data-tab="plan">Open the plan ' + IC.arrow + '</button></div>';

    if (a) h += '<div class="card"><div class="row-between"><div class="label">The journey</div><span class="small muted">Week ' + Math.floor(weeksOnPlan()) + ' of 12</span></div>' + trailHTML() + '</div>';

    h += '<div class="stats">' +
      '<div class="stat"><b>' + (avg == null ? '–' : avg.toFixed(1)) + '</b><span>Avg itch, 7d</span></div>' +
      '<div class="stat"><b>' + PC.logs.length + '</b><span>Days logged</span></div>' +
      '<div class="stat"><b>' + (due == null ? '–' : due <= 0 ? 'Now' : due + 'd') + '</b><span>Next check-in</span></div></div>';

    if (PC.logs.length) h += '<div class="card"><div class="card-head"><h3>Itch, last 14 days</h3>' + (todays ? '<button class="btn btn-soft btn-sm" data-act="addLog" data-id="' + todays.id + '">Edit today</button>' : '') + '</div>' + itchChart(14, 'Itch, last 14 days') + '</div>';

    if (a && a.plan.phases.length) {
      const ph = currentPhase(a);
      h += '<div class="card"><div class="card-head"><div><div class="label">This stretch · ' + esc(ph.w) + '</div><h3 style="margin-top:4px">' + esc(ph.t) + '</h3></div>' +
        '<button class="link-btn" data-act="tab" data-tab="plan">Full plan</button></div>' + ph.items.map(todoHTML).join('') + '</div>';
    }
    return h;
  }
  function currentPhaseIndex(a) {
    const w = weeksOnPlan();
    const idx = a.plan.phases.findIndex((p) => { const m = p.w.match(/(\d+)[–-](\d+)/); return m && w >= Number(m[1]) && w < Number(m[2]); });
    return idx < 0 ? (w < 1 ? 0 : a.plan.phases.length - 1) : idx;
  }
  function currentPhase(a) { return a.plan.phases[currentPhaseIndex(a)]; }
  function todoHTML(t) { return '<div class="todo"><span class="todo-ic i-' + t.ic + '">' + (IC[t.ic] || IC.watch) + '</span><p>' + t.html + '</p></div>'; }

  /* ------------------------------------------------------------ check flow */
  const STEPS = [
    ['flags', 'Safety first'], ['profile', 'About {o}'], ['diet', 'Food'], ['meds', 'Medicines'], ['symptoms', 'Skin & flares'],
    ['checks', 'Hands-on checks'], ['temperament', 'Personality'], ['history', 'History'], ['result', 'Result']
  ];
  function flowHead(stepLabel, pct, canBack) {
    return '<div class="flow-head"><div class="flow-bar">' +
      (canBack ? '<button class="btn btn-plain" data-act="wizBack" style="padding-left:0">' + IC.back + 'Back</button>' : '<span style="width:72px"></span>') +
      '<span class="flow-step">' + stepLabel + '</span>' +
      '<button class="btn btn-plain" data-act="wizExit" aria-label="Close the check" style="padding-right:0">' + IC.close + '</button></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>';
  }
  function renderCheck() {
    if (UI.step == null) return checkIntro();
    const [key, title] = STEPS[UI.step];
    const pct = ((UI.step + 1) / STEPS.length) * 100;
    if (key === 'flags' && anyRedFlag()) return flowHead('Safety first', pct, false) + stopScreen('check');
    let h = flowHead('Step ' + (UI.step + 1) + ' of ' + STEPS.length, pct, UI.step > 0 && key !== 'result');
    h += '<div class="page-head"><h1 class="page-title">' + esc(title) + '</h1></div>';
    h += ({ flags: stepFlags, profile: stepProfile, diet: stepDiet, meds: stepMeds, symptoms: stepSymptoms, checks: stepChecks, temperament: stepTemperament, history: stepHistory, result: stepResult })[key]();
    if (key !== 'result') {
      const err = stepError(key);
      h += '<div class="flow-foot"><button class="btn btn-accent btn-wide" data-act="wizNext"' + (err ? ' disabled' : '') + '>' + (UI.step === STEPS.length - 2 ? 'See the result' : 'Continue') + '</button>' +
        (err ? '<div class="hint">' + esc(err) + '</div>' : '') + '</div>';
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
    let h = '<div class="page-head"><h1 class="page-title">Check</h1><p class="page-sub">Nine short steps to find what kind of itch it is. Answers are saved, so a re-check only means updating what changed.</p></div>';
    h += '<div class="list">' + STEPS.slice(0, 8).map((s, i) => '<div class="list-row"><span class="todo-ic i-herb" style="font-weight:700;font-size:var(--t-foot)">' + (i + 1) + '</span><span class="grow">' + esc(s[1]) + '</span></div>').join('') + '</div>';
    h += '<button class="btn btn-accent btn-wide" data-act="startCheck">' + (a ? 'Run a new check' : 'Start the check') + '</button>';
    if (activeAssessment()) h += '<div class="card card-accent"><div class="row-between"><div><div class="label">Every 14 days</div><h3 style="margin-top:4px">Check-in</h3></div><button class="btn btn-soft btn-sm" data-act="startCheckin">Start</button></div><p class="small" style="margin-top:6px;color:var(--ink-2)">Quicker than a full check: safety, plus how {s}\'s responding.</p></div>';
    if (PC.assessments.length) {
      h += '<div class="list-title">Past results</div><div class="list">' + PC.assessments.slice().reverse().map((x) =>
        '<div class="list-row"><span class="badge ' + (x.gate === 'G0' ? 'badge-vet' : 'badge-good') + '">' + esc(x.gate) + '</span><div class="grow log-meta"><b>' + fmtDate(x.date, { month: 'short', day: 'numeric', year: 'numeric' }) + '</b><span>' +
        (x.gate === 'G0' ? 'Red flag: vet now' : esc(topPatternText(x))) + '</span></div></div>').join('') + '</div>';
    }
    return h;
  }
  function topPatternText(a) { const e = Object.entries(a.scores).sort((x, y) => y[1] - x[1])[0]; return 'Top: ' + R.patterns[e[0]].label + ' ' + Math.round(e[1] * 100) + '%'; }

  function seg(store, id, cur, opts, alert) {
    return '<div class="seg" role="group">' + opts.map(([v, l]) => '<button class="' + (cur === v ? 'on' + (v === 'y' ? (alert ? ' alert' : ' yes') : '') : '') + '" aria-pressed="' + (cur === v) + '" data-act="' + store + '" data-id="' + id + '" data-val="' + v + '">' + l + '</button>').join('') + '</div>';
  }
  function ynQ(id, map, extra) {
    const v = (map || PC.answers)[id];
    const meta = SQ[id] || {};
    const q = extra && extra.q || meta.q;
    const hint = extra && extra.hint || meta.hint;
    const store = extra && extra.store || 'ans';
    const opts = extra && extra.noUnsure ? [['y', 'Yes'], ['n', 'No']] : [['y', 'Yes'], ['n', 'No'], ['u', 'Not sure']];
    return '<div class="q"><div><div class="q-text">' + esc(q) + (meta.tag ? '<span class="q-tag">' + esc(meta.tag) + '</span>' : '') + '</div>' + (hint ? '<div class="q-hint">' + esc(hint) + '</div>' : '') + '</div>' +
      seg(store, id, v, opts, extra && extra.alert) + '</div>';
  }
  function stepQuestions(step) { return Object.keys(SQ).filter((k) => SQ[k].step === step).map((k) => ynQ(k)).join(''); }
  function qCard(title, inner) { return '<div class="q-card">' + (title ? '<div class="pad label" style="padding-bottom:0">' + title + '</div>' : '') + inner + '</div>'; }
  function chip(on, attrs, label) { return '<button class="chip ' + (on ? 'on' : '') + '" aria-pressed="' + !!on + '" ' + attrs + '><span class="tick">' + IC.tick + '</span>' + esc(label) + '</button>'; }
  function chipsOne(path, opts, cur, grid) { return '<div class="chips' + (grid ? ' grid' : '') + '">' + opts.map(([v, l]) => chip(String(cur) === String(v), 'data-act="set" data-path="' + path + '" data-val="' + esc(v) + '"', l)).join('') + '</div>'; }
  function chipsMulti(path, opts, cur) { return '<div class="chips">' + opts.map(([v, l]) => chip(cur.includes(v), 'data-act="toggle" data-path="' + path + '" data-val="' + esc(v) + '"', l)).join('') + '</div>'; }
  function input(path, label, type, ph, hint) {
    const id = 'f-' + path.replace('.', '-');
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') +
      '<input id="' + id + '" type="' + (type || 'text') + '" data-bind="' + path + '" value="' + esc(getPath(path)) + '" placeholder="' + esc(ph || '') + '"' + (type === 'number' ? ' inputmode="decimal"' : '') + '></div>';
  }

  function stepFlags() {
    return '<div class="banner banner-safety">' + IC.warn + '<span><b>Any "yes" means stop: go to a vet now.</b> No plan is made while a red flag is present.</span></div>' +
      qCard('', R.red_flags.map((f) => ynQ(f.id, PC.redFlags, { q: f.q, store: 'flag', alert: true, noUnsure: true })).join(''));
  }
  function stopScreen(where) {
    return '<div class="card stop-card"><div class="stop-icon">' + IC.stop + '</div>' +
      '<h1 class="page-title" style="color:#7A1A12">Go to a vet now.</h1>' +
      '<p style="margin:10px 0 16px;color:#7A1A12;font-weight:600">This could be an emergency. Please bring ' + DN() + ' to the nearest vet or emergency clinic today. We\'ve paused the plan.</p>' +
      '<p class="small" style="color:#7A1A12">Once your vet has seen {o} and {s}\'s stable, come back and start again.</p>' +
      '<button class="btn btn-danger btn-wide" style="margin-top:18px" data-act="' + (where === 'checkin' ? 'closeSheet' : 'clearFlags') + '">' + (where === 'checkin' ? 'Close' : '{S}\'s been seen: start over') + '</button></div>';
  }

  function stepProfile() {
    return '<div class="card stack">' + input('dog.name', 'Name', 'text', 'Pupa') +
      '<div class="grid-2">' + input('dog.breed', 'Breed', 'text', 'Aspin, Shih Tzu…') + input('dog.dob', 'Birthday', 'date', '', 'Rough is fine') + '</div>' +
      '<div class="field"><span class="field-label">Sex</span>' + seg('setseg', 'dog.sex', PC.dog.sex, [['female', 'Girl'], ['male', 'Boy']]) + '</div>' +
      '<div class="grid-2">' + input('dog.weightKg', 'Weight (kg)', 'number', '8') + input('dog.city', 'City', 'text', 'Quezon City') + '</div></div>' +
      '<div class="card stack"><div class="field"><span class="field-label">Body shape</span><div class="hint">Ideal: you can feel the ribs easily and see a waist from above.</div>' + chipsOne('dog.bcs', BCS, PC.dog.bcs, true) + '</div></div>';
  }

  function stepDiet() {
    const d = PC.diet;
    let h = '<div class="card stack"><span class="field-label">What does {s} mostly eat?</span><div class="label">Processed</div>' +
      chipsOne('diet.type', R.diet.processed.map((k) => [k, DIET_LABEL[k]]), d.type, true) + '<div class="label" style="margin-top:6px">Real / fresh food</div>' +
      chipsOne('diet.type', R.diet.real.map((k) => [k, DIET_LABEL[k]]), d.type, true) + input('diet.brand', 'Brand or recipe', 'text', 'e.g. "home-cooked chicken + kamote"') + '</div>';
    if (d.type) {
      h += '<div class="card stack"><div class="field"><span class="field-label">How much of the bowl is plants?</span>' + chipsOne('diet.plantPct', PLANT_OPTS, d.plantPct) + '</div>' +
        '<div class="field"><span class="field-label">Any of these starchy foods?</span>' + chipsMulti('diet.starch', R.diet.high_starch_flags.map((x) => [x, x[0].toUpperCase() + x.slice(1)]), d.starch) + '</div>' +
        input('diet.treats', 'Treats', 'text', 'e.g. jerky, biscuits') + input('diet.triggers', 'Foods that seem to set {o} off', 'text', 'e.g. chicken, beef') + '</div>';
      if (isReal()) {
        h += '<div class="q-card"><div class="pad field"><label for="f-realweeks">How many weeks on real food so far?</label><input id="f-realweeks" type="number" inputmode="numeric" data-bind="diet.realWeeks" value="' + esc(d.realWeeks) + '" placeholder="e.g. 6"></div>' +
          ynQ('radicallyBetter', { radicallyBetter: d.radicallyBetter }, { q: 'Is {s} radically better since switching?', store: 'dietyn', noUnsure: true }) + '</div>';
      } else {
        h += qCard('', ynQ('refusesChange', { refusesChange: d.refusesChange }, { q: 'Is switching to fresh food off the table for now?', hint: 'Budget, time, anything. No judgement; the plan adapts.', store: 'dietyn', noUnsure: true }));
      }
    }
    h += '<div class="card stack"><div class="field"><span class="field-label">Does {s} get a probiotic?</span>' + seg('setseg', 'diet.probiotic', d.probiotic, [['y', 'Yes'], ['n', 'No']]) + '</div>';
    if (d.probiotic === 'y') {
      h += input('diet.probioticBrand', 'Which one?', 'text', 'Brand') + '<div class="field"><span class="field-label">Species on the label</span>' + chipsMulti('diet.species', SPECIES.map((s) => [s, s]), d.species) + '</div>';
      if (d.species.length && !d.species.some((s) => R.diet.foundation.probiotic_species_required_any.includes(s)) && !d.species.includes('Not sure'))
        h += '<div class="banner banner-info">' + IC.info + '<span>This approach looks for <b>Lactobacillus or Bifidobacterium</b>. Dr. Marsden considers Enterococcus faecium the "wrong niche" (his view, not mainstream guidance).</span></div>';
    }
    h += '</div>' + qCard('A few more', stepQuestions('diet'));
    return h;
  }

  function stepMeds() {
    let h = '<div class="row-between"><span class="field-label">Itch medicines, past & present</span><button class="btn btn-tinted btn-sm" data-act="addMed">' + IC.plus + ' Add</button></div>';
    if (!PC.meds.length) h += '<div class="banner banner-info">' + IC.info + '<span>Apoquel, Cytopoint, prednisone, Atopica, antibiotics… Add each one {s} has tried. None? Just continue.</span></div>';
    else h += '<div class="list">' + PC.meds.map((m) => '<button class="list-row tap" data-act="addMed" data-id="' + m.id + '"><span class="badge ' + (m.current === 'y' ? 'badge-good' : 'badge-low') + '">' + (m.current === 'y' ? 'Now' : 'Past') + '</span><span class="grow log-meta"><b>' + esc(medName(m)) + '</b><span>' +
      ([m.worked === 'y' ? 'worked' : m.worked === 'n' ? 'didn\'t work' : '', m.stopped === 'y' ? 'then stopped working' : '', m.flares === 'y' ? 'flares on lower dose' : ''].filter(Boolean).join(' · ') || 'Tap to add details') + '</span></span>' + IC.chev + '</button>').join('') + '</div>';
    h += qCard('Other things you noticed', stepQuestions('meds'));
    return h;
  }
  function medName(m) { return m.drug === 'other' ? (m.other || 'Other') : (DRUGS.find((d) => d[0] === m.drug) || [0, m.drug])[1]; }

  function stepSymptoms() {
    let h = '<div class="card"><div class="field-label">Where is {s} itchy or red?</div><p class="small muted" style="margin:2px 0 12px">Tap how bad each spot is right now. 0 = fine.</p><div class="bodymap">' +
      REGIONS.map(([k, l]) => { const v = PC.regions[k] || 0; return '<div class="bm-item ' + (v ? 'on' : '') + '"><div class="bm-name">' + l + '</div><div class="sev" role="group" aria-label="' + l + '">' + [0, 1, 2, 3].map((n) => '<button class="' + (v === n ? 'on' : '') + '" aria-pressed="' + (v === n) + '" data-act="region" data-id="' + k + '" data-val="' + n + '" aria-label="' + l + ' severity ' + n + '">' + n + '</button>').join('') + '</div></div>'; }).join('') + '</div></div>';
    h += qCard('When does it flare?', stepQuestions('timing'));
    h += qCard('Skin & body', stepQuestions('symptoms'));
    return h;
  }

  function stepChecks() {
    const t = PC.answers.tongue;
    return '<div class="banner banner-accent">' + IC.info + '<span>Do these when {s}\'s calm and rested, indoors. A treat helps.</span></div>' +
      '<div class="q-card"><div class="q"><div><div class="q-text">Tongue colour</div><div class="q-hint">Look in daylight. Normal is a healthy pink.</div></div>' +
      '<div class="chips grid">' + [['pink', 'Pink (normal)'], ['red', 'Red'], ['lavender', 'Lavender / purplish'], ['pale', 'Pale'], ['u', 'Not sure']].map(([v, l]) => chip(t === v, 'data-act="ans" data-id="tongue" data-val="' + v + '"', l)).join('') + '</div>' +
      (t === 'pale' ? '<div class="banner banner-warn">' + IC.warn + '<span>A pale tongue can go with pale gums. If {p} gums look very pale or white, that\'s a red flag: see a vet now.</span></div>' : '') + '</div>' +
      stepQuestions('checks') + ynQ('gassy', null, { q: 'Is {s} gassy (lots of farts)?' }) + '</div>';
  }

  function stepTemperament() {
    return '<p class="page-sub" style="margin-top:-8px">Which sounds most like {o}, especially when {s}\'s itchy?</p><div class="stack">' +
      TEMPS.map(([k, l, d]) => '<button class="choice ' + (PC.temperament === k ? 'on' : '') + '" aria-pressed="' + (PC.temperament === k) + '" data-act="set" data-path="temperament" data-val="' + k + '"><b>' + esc(l) + '</b><span>' + esc(d) + '</span></button>').join('') + '</div>';
  }
  function stepHistory() {
    return qCard('', stepQuestions('history')) + '<p class="small muted" style="text-align:center">Bloodwork questions are optional. Skip them if you don\'t have results.</p>';
  }

  function stepResult() {
    const a = PC.assessments[PC.assessments.length - 1];
    if (!a) return '';
    let h = '<div class="card"><div class="card-head"><h2>{P} patterns</h2><span class="badge badge-low">rules v' + esc(a.rulesVersion) + '</span></div>' + scoreBars(a.scores) +
      '<p class="small muted" style="margin-top:14px">Patterns overlap. Bars show how many of each pattern\'s signs fit {o}, weighted. Dashed lines: 30% moderate, 50% high.</p></div>';
    h += '<div class="card card-accent"><div class="label">Path ' + esc(a.gate) + '</div><p style="margin-top:6px">' + a.plan.why + '</p></div>';
    h += whyCard(a);
    h += '<div class="flow-foot"><button class="btn btn-accent btn-wide" data-act="tab" data-tab="plan">See the plan</button><button class="btn btn-plain btn-wide" data-act="wizDone">Done</button></div>';
    return h;
  }
  function whyCard(a) {
    const rows = Object.entries(a.scores).filter(([, s]) => s >= R.scoring.moderate).sort((x, y) => y[1] - x[1]);
    if (!rows.length) return '<div class="banner banner-info">' + IC.info + '<span>No pattern reached "moderate". The plan uses the strongest one, but it\'s worth going over the answers with your vet.</span></div>';
    return '<div class="card"><h3>Why</h3>' + rows.map(([k]) => {
      const hits = R.patterns[k].signs.filter((s) => a.signs.includes(s.id)).sort((x, y) => y.w - x.w).slice(0, 5);
      return '<div style="margin-top:14px"><div class="score-name">' + esc(R.patterns[k].label) + '</div><p class="small muted" style="margin:2px 0 8px">' + esc(PATTERN_PLAIN[k]) + '</p><div class="chips">' +
        hits.map((s) => '<span class="chip chip-static">' + esc(signLabel(s.id)) + '</span>').join('') + '</div></div>';
    }).join('') + '</div>';
  }

  /* -------------------------------------------------------------- charts */
  function scoreBars(scores) {
    const lowExcluded = scores.severe >= R.scoring.high;
    return '<div class="scores">' + Object.keys(R.patterns).map((k) => {
      const s = scores[k] || 0; const pct = Math.round(s * 100); const lv = level(s);
      const W = 300, H = 12, w = Math.max(0, Math.min(1, s)) * W;
      const ex = k === 'low_grade' && lowExcluded;
      return '<div class="score-row"><div class="score-name">' + esc(R.patterns[k].label) + ' ' +
        (ex ? '<span class="badge badge-low">set aside</span>' : lv === 'high' ? '<span class="badge badge-high">High</span>' : lv === 'moderate' ? '<span class="badge badge-mod">Moderate</span>' : '') + '</div>' +
        '<div class="score-pct">' + pct + '%</div><div class="score-bar"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(R.patterns[k].label) + ' ' + pct + ' percent" style="width:100%;height:12px;display:block;overflow:visible">' +
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="4" fill="#F4EFE4"/>' +
        (w > 0 ? '<rect class="fill" x="0" y="0" width="' + w.toFixed(1) + '" height="' + H + '" rx="4" fill="' + (ex ? '#C9C3B5' : '#137E92') + '" fill-opacity="' + (lv === 'low' && !ex ? 0.5 : 1) + '"><title>' + pct + '%</title></rect>' : '') +
        '<line x1="' + W * R.scoring.moderate + '" x2="' + W * R.scoring.moderate + '" y1="-3" y2="' + (H + 3) + '" stroke="#6B6678" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>' +
        '<line x1="' + W * R.scoring.high + '" x2="' + W * R.scoring.high + '" y1="-3" y2="' + (H + 3) + '" stroke="#1E1B2E" stroke-width="1.2" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>' +
        '</svg></div></div>';
    }).join('') + '</div>';
  }

  function itchSeries(days) {
    const today = todayStr(); const start = addDays(today, -(days - 1));
    return PC.logs.filter((l) => l.date >= start && l.date <= today).sort((a, b) => a.date < b.date ? -1 : 1).map((l) => ({ d: l.date, v: Number(l.itch), x: daysBetween(start, l.date) }));
  }
  function itchChart(days, title, forPrint) {
    const pts = itchSeries(days);
    if (!pts.length) return '<p class="small muted" style="padding:12px 0">No logs in this window yet.</p>';
    const W = 320, H = 140, L = 22, Rr = 10, T = 12, B = 22;
    const xs = (x) => L + (days === 1 ? 0 : x / (days - 1)) * (W - L - Rr);
    const ys = (v) => T + (1 - v / 10) * (H - T - B);
    const F = 'font-family="-apple-system, system-ui, sans-serif"';
    let g = '';
    [0, 5, 10].forEach((v) => { g += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + ys(v) + '" y2="' + ys(v) + '" stroke="rgba(30,27,46,.08)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (ys(v) + 4) + '" text-anchor="end" font-size="10" fill="#6B6678" ' + F + ' font-weight="600">' + v + '</text>'; });
    g += '<text x="' + L + '" y="' + (H - 4) + '" font-size="10" fill="#6B6678" ' + F + ' font-weight="600">' + fmtDate(addDays(todayStr(), -(days - 1))) + '</text>';
    g += '<text x="' + (W - Rr) + '" y="' + (H - 4) + '" text-anchor="end" font-size="10" fill="#6B6678" ' + F + ' font-weight="600">Today</text>';
    const path = pts.map((p, i) => (i ? 'L' : 'M') + xs(p.x).toFixed(1) + ' ' + ys(p.v).toFixed(1)).join(' ');
    const area = path + ' L' + xs(pts[pts.length - 1].x).toFixed(1) + ' ' + ys(0) + ' L' + xs(pts[0].x).toFixed(1) + ' ' + ys(0) + ' Z';
    g += '<path class="area" d="' + area + '" fill="#B272A3" fill-opacity=".14"/>';
    g += '<path class="line" d="' + path + '" fill="none" stroke="#874877" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach((p) => { g += '<circle class="pt" cx="' + xs(p.x).toFixed(1) + '" cy="' + ys(p.v).toFixed(1) + '" r="4" fill="#B272A3" stroke="#fff" stroke-width="2"/>'; });
    const last = pts[pts.length - 1];
    g += '<text class="pt" x="' + Math.min(xs(last.x), W - Rr - 2).toFixed(1) + '" y="' + (ys(last.v) - 9).toFixed(1) + '" text-anchor="end" font-size="11" fill="#1E1B2E" ' + F + ' font-weight="700">' + last.v + '</text>';
    if (!forPrint) g += '<line class="xh" x1="0" x2="0" y1="' + T + '" y2="' + ys(0) + '" stroke="#48445A" stroke-width="1" stroke-dasharray="3 3" opacity="0"/><rect x="' + L + '" y="0" width="' + (W - L - Rr) + '" height="' + H + '" fill="transparent"/>';
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
        tip.innerHTML = fmtDate(best.d, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · itch <b>' + best.v + '</b>/10';
        tip.style.left = (xs(best.x) * (r.width / c.W)) + 'px'; tip.style.top = (ys(best.v) * (r.height / c.H)) + 'px'; tip.classList.add('show');
        xh.setAttribute('x1', xs(best.x)); xh.setAttribute('x2', xs(best.x)); xh.setAttribute('opacity', '.5');
      };
      const hide = () => { tip.classList.remove('show'); xh.setAttribute('opacity', '0'); };
      svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', hide);
    });
  }

  /* ------------------------------------------------------------------ plan */
  function renderPlan() {
    const a = activeAssessment();
    if (!a) return '<div class="page-head"><h1 class="page-title">Plan</h1></div>' + emptyState('No plan yet', 'Run the check first. The plan is built from {p} answers and is meant to be talked through with your vet.', '<button class="btn btn-accent" data-act="startCheck">Start the check</button>');
    const p = a.plan;
    let h = '<div class="page-head"><div class="label">From ' + fmtDate(a.date, { month: 'short', day: 'numeric', year: 'numeric' }) + ' · path ' + esc(a.gate) + '</div><h1 class="page-title" style="margin-top:4px">' + DN() + '\'s plan</h1><p class="page-sub">' + p.why + '</p></div>';
    h += '<div class="banner banner-info">' + IC.info + '<span>A plan to <b>talk through with your vet</b>, not a prescription. We\'re fur-parents, not vets.</span></div>';
    if (p.gate === 'G?') return h + '<button class="btn btn-accent btn-wide" data-act="startCheck">Finish the check</button>';

    const cur = currentPhaseIndex(a);
    const sel = UI.phase == null || UI.phase >= p.phases.length ? cur : UI.phase;
    const ph = p.phases[sel];
    h += '<div class="seg" role="tablist" aria-label="Plan weeks">' + p.phases.map((x, i) => '<button role="tab" aria-selected="' + (i === sel) + '" class="' + (i === sel ? 'on' : '') + '" data-act="phase" data-val="' + i + '">' + esc(x.w.replace('Week ', 'Wk ')) + '</button>').join('') + '</div>';
    h += '<div class="card"><div class="row-between"><div class="label">' + esc(ph.w) + '</div>' + (sel === cur ? '<span class="badge badge-mod">Now</span>' : '') + '</div><div class="phase-title" style="margin-top:4px">' + esc(ph.t) + '</div>' + ph.items.map(todoHTML).join('') + '</div>';

    h += '<div class="card card-accent"><div class="row-between"><div><div class="label">Check-ins · weeks ' + p.recheck.join(', ') + '</div><h3 style="margin-top:4px">Next: ' + fmtDate(nextCheckIn(), { weekday: 'short', month: 'short', day: 'numeric' }) + '</h3></div>' +
      '<button class="btn btn-soft btn-sm" data-act="startCheckin">Check in</button></div></div>';

    h += '<h2 class="section-title">Details</h2>';
    if (p.formulas.length) h += '<p class="small muted" style="margin-top:-6px">Doses: always the product label, confirmed by your vet. This app never gives doses.</p>' + p.formulas.map(formulaCard).join('');
    const bd = R.patterns.blood_def.cautions || [];
    if (p.formulas.includes('four_materials') && PC.answers.gassy === 'y') h += '<div class="banner banner-warn">' + IC.warn + '<span>' + esc(bd[0] && bd[0].msg) + '</span></div>';
    if (p.diet || p.plants || isReal()) h += dietCard(p);
    if (isRaw() || p.diet) h += rawGuide();
    if (p.taper) h += taperCard();
    h += '<p class="small muted" style="text-align:center">Rules v' + esc(a.rulesVersion) + ' · Based on Dr. Steve Marsden\'s webinars: one integrative vet\'s approach, not mainstream veterinary consensus.</p>';
    return h;
  }
  function disc(swatch, top, title, sub, body, badge) {
    return '<details class="disc"><summary>' + (swatch ? '<span class="formula-swatch" style="background:' + swatch + '"></span>' : '') +
      '<div style="min-width:0">' + (top ? '<div class="formula-nick">' + top + '</div>' : '') + '<div class="formula-classical">' + title + '</div>' + (sub ? '<div class="formula-brands">' + sub + '</div>' : '') + '</div>' +
      (badge || '') + IC.chev + '</summary><div class="disc-body">' + body + '</div></details>';
  }
  function dietCard() {
    const f = R.diet.foundation; const plant = PC.diet.plantPct == null ? 0 : Number(PC.diet.plantPct);
    const enoughPlants = plant >= f.skip_adding_plants_if_plant_fraction_gte;
    const goodProb = (PC.diet.species || []).some((s) => f.probiotic_species_required_any.includes(s));
    return disc(SC.sun, 'Food', 'Food foundation', enoughPlants ? 'Plant share looks good' : '1/6–1/3 plants, the right probiotic', '<ul class="plain">' +
      '<li><b>Base:</b> ' + esc(f.base) + '.</li>' +
      (enoughPlants ? '<li>{P} plant share already looks good. No need to add more.</li>' : '<li><b>Plants:</b> about 1/6 to 1/3 of the bowl. Try ' + esc(f.plant_fraction.examples.join(', ')) + '.</li>') +
      '<li><b>Never:</b> ' + esc(f.plant_fraction.never.join(', ')) + '. <b>Only a little:</b> ' + esc(f.plant_fraction.minimal.join(', ')) + '.</li>' +
      '<li><b>Probiotic:</b> look for Lactobacillus or Bifidobacterium' + (PC.diet.probiotic === 'y' ? (goodProb ? '. The current one fits.' : '. Check {p} current one\'s label.') : '.') + ' <span class="muted">(The webinar notes also named Bacteroides, but it is rarely sold as a pet probiotic and we couldn\'t verify it.)</span></li>' +
      '<li><b>Dr. Marsden\'s view:</b> ' + esc(f.probiotic_wrong_niche.join(', ')) + ' is the "wrong niche" for this. That is his opinion, not mainstream guidance; it is a common, generally safe pet probiotic.</li>' +
      (PC.diet.starch.length ? '<li><b>Cut back:</b> ' + esc(PC.diet.starch.join(', ')) + '.</li>' : '') + '</ul>');
  }
  function formulaCard(key) {
    const f = R.formulas[key]; if (!f) return '';
    const vet = key === 'long_dan' || key === 'immunobalm';
    const nice = f.name || key;
    const body = (f.brands ? '<p class="small"><b>Brands:</b> ' + esc(f.brands.join(' · ')) + '</p>' : '') +
      '<p class="small" style="color:var(--ink-2)"><b>For:</b> ' + esc(PATTERN_SHORT[f.for] ? PATTERN_SHORT[f.for] : f.for) + '</p>' +
      (f.caution ? '<div class="banner banner-warn">' + IC.warn + '<span>' + esc(f.caution) + '</span></div>' : '') +
      (key === 'cessorex' ? '<p class="small muted">The label lists Panax ginseng (Ren Shen) with the Minor Bupleurum herbs, plus the four Si Wu Tang herbs. Minor Bupleurum formulas should use ginseng, not codonopsis (Dang Shen).</p>' : '') +
      '<div class="banner banner-info">' + IC.info + '<span>Dose: follow the product label and confirm with your vet.</span></div>';
    return disc(vet ? '#B42318' : SC.sky, esc(nice), esc(f.classical), '', body, vet ? '<span class="badge badge-vet" style="margin-left:auto">Vet</span>' : '');
  }
  function rawGuide() {
    return disc(SC.red, 'Safety', 'Raw food: safe handling', '', '<ul class="plain">' +
      '<li>Keep raw frozen; thaw in the fridge, not on the counter. Our heat spoils meat fast.</li>' +
      '<li>Use thawed raw within 1–2 days. Throw out what {s} leaves after 20–30 minutes.</li>' +
      '<li>Separate boards and bowls. Wash with hot soapy water; wash your hands after.</li>' +
      '<li>Buy from suppliers with a cold chain (frozen on delivery).</li>' +
      '<li>Puppies, seniors, sick dogs or homes with babies and immune-weak people: ask your vet whether lightly cooked is safer.</li></ul>');
  }
  function taperCard() {
    const cur = PC.meds.filter((m) => m.current === 'y' && R.drug_taper.per_drug[m.drug]);
    let body = '<div class="banner banner-warn">' + IC.warn + '<span>Never stop prednisone suddenly. Adrenal risk.</span></div>' +
      '<p class="small muted">Only when {s}\'s clearly better, and always with your vet. Stair-step:</p><ol class="steps">' + R.drug_taper.steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
    cur.forEach((m) => {
      const d = R.drug_taper.per_drug[m.drug];
      const how = { dose_step: 'Lower the dose in steps (your vet sets each step).', vet_schedule_only: 'Your vet\'s schedule only.', interval_extend: 'Longer gaps between injections. Your vet decides.' }[d.mode];
      body += '<div class="banner banner-info"><span><b>' + esc(medName(m)) + ':</b> ' + esc(how) + (d.warn ? ' <b>' + esc(d.warn) + '</b>' : '') + (d.note ? ' ' + esc(d.note) : '') + '</span></div>';
    });
    return disc(SC.orchid, 'With your vet', 'Medicine taper', 'Never stop prednisone suddenly', body);
  }

  /* ------------------------------------------------------------------- log */
  function renderLog() {
    const logs = PC.logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    let h = '<div class="page-head row-between"><h1 class="page-title">Itch diary</h1><button class="btn btn-accent btn-sm" data-act="addLog">' + IC.plus + ' Log</button></div>';
    if (!logs.length) return h + emptyState('Nothing logged yet', 'A quick daily note (itch score, stool, ears, a photo) makes check-ins and vet visits much easier.', '<button class="btn btn-accent" data-act="addLog">Log today</button>');
    h += '<div class="card"><div class="card-head"><h3>Itch, last 30 days</h3><span class="small muted">0–10</span></div>' + itchChart(30, 'Itch, last 30 days') + '</div>';
    const groups = [];
    const today = todayStr();
    logs.forEach((l) => {
      const ago = daysBetween(l.date, today);
      const key = ago < 7 ? 'This week' : ago < 14 ? 'Last week' : (() => { const d = parseDay(l.date); d.setDate(d.getDate() - d.getDay()); const s = todayStr(d); return fmtDate(s) + ' – ' + fmtDate(addDays(s, 6)); })();
      let g = groups.find((x) => x.k === key); if (!g) { g = { k: key, items: [] }; groups.push(g); }
      g.items.push(l);
    });
    groups.forEach((g) => {
      h += '<div class="week-label">' + esc(g.k) + '</div><div class="list">' + g.items.map((l) => '<button class="list-row tap" data-act="addLog" data-id="' + l.id + '">' +
        '<span class="log-itch lv-' + (l.itch >= 7 ? 2 : l.itch >= 4 ? 1 : 0) + '">' + esc(l.itch) + '</span>' + (l.photoId ? '<span class="log-thumb" data-photo="' + esc(l.photoId) + '"></span>' : '') +
        '<span class="log-meta"><b>' + fmtDate(l.date, { weekday: 'short', month: 'short', day: 'numeric' }) + '</b><span>' + esc([STOOL[l.stool], (l.ears || []).join(', '), l.note].filter(Boolean).join(' · ') || 'No notes') + '</span></span>' + IC.chev + '</button>').join('') + '</div>';
    });
    return h;
  }
  const STOOL = { 1: 'Hard stool', 2: 'Firm stool', 3: 'Soft stool', 4: 'Loose stool', 5: 'Watery stool' };

  function openLogSheet(id) {
    const ex = id ? PC.logs.find((l) => l.id === id) : PC.logs.find((l) => l.date === todayStr());
    UI.logEdit = ex ? JSON.parse(JSON.stringify(ex)) : { id: uid(), date: todayStr(), itch: 5, stool: 2, ears: [], note: '', photoId: null, _new: true };
    renderLogSheet();
  }
  function itchWord(n) { return n <= 1 ? 'Barely' : n <= 3 ? 'A little' : n <= 6 ? 'Itchy' : n <= 8 ? 'Very itchy' : 'Non-stop'; }
  function renderLogSheet() {
    const l = UI.logEdit;
    openSheet('<h2>' + (l._new ? 'Log the day' : 'Edit log') + '</h2>' +
      '<div class="card stack"><div class="field"><span class="field-label">Itch</span><div class="range-row"><input class="range" type="range" min="0" max="10" step="1" value="' + l.itch + '" data-lbind="itch" aria-label="Itch score, 0 to 10"><span class="range-val" id="itch-val">' + l.itch + '</span></div>' +
      '<div class="row-between small muted"><span>0 none</span><b id="itch-word" style="color:var(--ink)">' + itchWord(l.itch) + '</b><span>10 non-stop</span></div></div></div>' +
      '<div class="field"><span class="field-label">Stool</span>' + seg('lset', 'stool', String(l.stool), [1, 2, 3, 4, 5].map((n) => [String(n), STOOL[n].replace(' stool', '')])) + '</div>' +
      '<div class="field"><span class="field-label">Ears</span><div class="chips">' + ['Clean', 'Waxy', 'Red', 'Smelly', 'Scratching'].map((e) => chip(l.ears.includes(e), 'data-act="ltoggle" data-val="' + e + '"', e)).join('') + '</div></div>' +
      '<div class="field"><span class="field-label">Photo</span><label class="photo-pick"><input type="file" accept="image/*" data-act-file="logPhoto" hidden><div class="hero-photo" data-photo="' + esc(l.photoId || '') + '"></div><span class="ob-photo-hint" style="bottom:12px">' + IC.camera + (l.photoId ? 'Change photo' : 'Add a photo') + '</span></label></div>' +
      '<div class="field"><label for="log-note">Notes</label><textarea id="log-note" data-lbind="note" placeholder="New food? Bath? Weather? Anything that changed.">' + esc(l.note) + '</textarea></div>' +
      '<div class="field"><label for="log-date">Date</label><input id="log-date" type="date" data-lbind="date" value="' + esc(l.date) + '" max="' + todayStr() + '"></div>' +
      '<button class="btn btn-primary btn-wide" data-act="saveLog" style="background:var(--orchid)">Save</button>' + (l._new ? '' : '<button class="btn btn-plain btn-wide" style="color:var(--danger)" data-act="delLog">Delete this log</button>'));
  }

  /* ------------------------------------------------------------ meds sheet */
  function openMedSheet(id) {
    const ex = id && PC.meds.find((m) => m.id === id);
    UI.medEdit = ex ? JSON.parse(JSON.stringify(ex)) : { id: uid(), drug: '', other: '', dose: '', since: '', current: '', worked: '', stopped: '', flares: '', longTerm: '', side: '', _new: true };
    renderMedSheet();
  }
  function medYN(k, q) { return '<div class="q"><div class="q-text">' + esc(q) + '</div>' + seg('mset', k, UI.medEdit[k], [['y', 'Yes'], ['n', 'No']]) + '</div>'; }
  function renderMedSheet() {
    const m = UI.medEdit;
    openSheet('<h2>' + (m._new ? 'Add a medicine' : 'Edit medicine') + '</h2>' +
      '<div class="field"><span class="field-label">Which one?</span><div class="chips grid">' + DRUGS.map(([k, l]) => chip(m.drug === k, 'data-act="mset" data-id="drug" data-val="' + k + '"', l)).join('') + '</div></div>' +
      (m.drug === 'other' ? '<div class="field"><label for="m-other">Name</label><input id="m-other" type="text" data-mbind="other" value="' + esc(m.other) + '"></div>' : '') +
      '<div class="field"><label for="m-dose">As prescribed (your own note)</label><div class="hint">Copy what your vet wrote, for the vet report. The app never suggests doses.</div><input id="m-dose" type="text" data-mbind="dose" value="' + esc(m.dose) + '" placeholder="Copy from the vet\'s label"></div>' +
      '<div class="field"><label for="m-since">Since when?</label><input id="m-since" type="text" data-mbind="since" value="' + esc(m.since) + '" placeholder="e.g. Jan 2025, about 8 months"></div>' +
      '<div class="q-card">' + medYN('current', 'Still giving it now?') + medYN('worked', 'Did it work at first?') + medYN('stopped', 'Did it stop working later?') + medYN('flares', 'Does {s} flare when the dose is lowered?') +
      (['apoquel', 'atopica'].includes(m.drug) ? medYN('longTerm', 'Used for 6 months or longer?') : '') + '</div>' +
      '<div class="field"><label for="m-side">Side effects you noticed</label><input id="m-side" type="text" data-mbind="side" value="' + esc(m.side) + '" placeholder="Optional"></div>' +
      '<button class="btn btn-primary btn-wide" style="background:var(--sky);color:var(--ink)" data-act="saveMed"' + (m.drug ? '' : ' disabled') + '>Save</button>' + (m._new ? '' : '<button class="btn btn-plain btn-wide" style="color:var(--danger)" data-act="delMed">Remove</button>'));
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
      return openSheet('<div class="label">Check-in · 1 of 2</div><h2>Safety first</h2>' + qCard('', R.red_flags.map((f) => ynQ(f.id, c.flags, { q: f.q, store: 'cflag', alert: true, noUnsure: true })).join('')) +
        '<button class="btn btn-primary btn-wide" style="background:var(--sky);color:var(--ink)" data-act="ciNext"' + (done ? '' : ' disabled') + '>Continue</button>');
    }
    if (c.stage === 'q') {
      const opt = [['much_better', 'Much better', 'Clearly less itchy'], ['bit_better', 'A bit better', 'Some improvement'], ['same', 'About the same', 'No real change'], ['worse', 'Worse', 'More itchy or sore'], ['itchier', 'Itchier since a new herb', 'Started after a new formula']];
      const done = c.response && c.tolerating && c.diligent;
      return openSheet('<div class="label">Check-in · 2 of 2</div><h2>How is ' + DN() + '?</h2>' +
        '<div class="stack">' + opt.map(([k, l, d]) => '<button class="choice ' + (c.response === k ? 'on' : '') + '" style="' + (c.response === k ? 'background:var(--sky);color:var(--ink)' : '') + '" aria-pressed="' + (c.response === k) + '" data-act="ciset" data-k="response" data-val="' + k + '"><b>' + l + '</b><span>' + d + '</span></button>').join('') + '</div>' +
        '<div class="q-card">' + ['tolerating', 'diligent'].map((k) => '<div class="q"><div class="q-text">' + (k === 'tolerating' ? 'Handling the herbs/food well (stool, appetite OK)?' : 'Stuck to the plan most days?') + '</div>' +
          '<div class="seg">' + [['y', 'Yes'], ['n', 'No']].map(([v, l]) => '<button class="' + (c[k] === v ? 'on' : '') + '" aria-pressed="' + (c[k] === v) + '" data-act="ciset" data-k="' + k + '" data-val="' + v + '">' + l + '</button>').join('') + '</div></div>').join('') + '</div>' +
        '<div class="field"><label for="ci-note">Anything else?</label><textarea id="ci-note" data-cbind="note" placeholder="Optional">' + esc(c.note) + '</textarea></div>' +
        '<button class="btn btn-primary btn-wide" style="background:var(--sky);color:var(--ink)" data-act="ciSave"' + (done ? '' : ' disabled') + '>See suggestions</button>');
    }
    if (c.stage === 'done') {
      return openSheet('<div class="done-mark" id="done-mark"><svg viewBox="0 0 40 40" width="44" height="44" aria-hidden="true"><path d="M11 21l6 6 12-13" fill="none" stroke="#1E1B2E" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
        '<h2 style="text-align:center">Check-in saved</h2><p class="muted small" style="text-align:center;margin-top:-8px">Things to talk through with your vet:</p>' +
        '<div class="card stagger">' + c.suggestions.map((s) => todoHTML({ ic: s.ic, html: s.t })).join('') + '</div>' +
        '<p class="muted small" style="text-align:center">Next check-in: <b>' + fmtDate(nextCheckIn(), { weekday: 'short', month: 'short', day: 'numeric' }) + '</b></p>' +
        '<button class="btn btn-soft btn-wide" data-act="closeSheet">Done</button>');
    }
  }

  /* ---------------------------------------------------------------- report */
  function renderReport() {
    const a = activeAssessment();
    let h = '<div class="page-head"><h1 class="page-title">Vet report</h1><p class="page-sub">One page with {p} profile, history, scores, plan and itch chart. Save it as a PDF or print it for your vet.</p></div>';
    h += '<button class="btn btn-accent btn-wide" data-act="print">' + IC.print + ' Print or save as PDF</button>';
    const kv = [['Breed', PC.dog.breed], ['Age', ageLabel()], ['Sex', PC.dog.sex === 'female' ? 'Female' : PC.dog.sex === 'male' ? 'Male' : ''], ['Weight', PC.dog.weightKg ? PC.dog.weightKg + ' kg' : ''], ['Food', (DIET_LABEL[PC.diet.type] || '') + (PC.diet.brand ? ' (' + PC.diet.brand + ')' : '')], ['Medicines', PC.meds.map((m) => medName(m) + (m.current === 'y' ? ' (now)' : '')).join(', ')]].filter((x) => x[1]);
    h += '<div class="paper"><div class="label">Preview</div><h3 style="margin-top:6px">' + DN() + ': itch & skin report</h3>' +
      (kv.length ? '<dl class="kv">' + kv.map(([k, v]) => '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' : '<p class="small muted" style="margin-top:8px">Fill in the profile in the Check tab.</p>') +
      (a ? '<hr><div class="label" style="margin-bottom:10px">Pattern scores · ' + fmtDate(a.date) + '</div>' + scoreBars(a.scores) : '') +
      (PC.logs.length ? '<hr><div class="label" style="margin-bottom:8px">Itch, last 30 days</div>' + itchChart(30, 'Itch, last 30 days') : '') +
      (PC.checkins.length ? '<hr><div class="label" style="margin-bottom:6px">Recent check-ins</div>' + PC.checkins.slice().reverse().slice(0, 5).map((c) => '<p class="small"><b>' + fmtDate(c.date) + ':</b> ' + (c.redFlag ? 'Red flag: sent to vet' : esc(RESP[c.response] || c.response)) + '</p>').join('') : '') +
      '</div>';
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
      '<div class="list-title">Backup</div><div class="list">' +
      '<button class="list-row tap" data-act="export"><span class="grow">Export backup</span>' + IC.chev + '</button>' +
      '<label class="list-row tap" style="cursor:pointer"><span class="grow">Import backup</span>' + IC.chev + '<input type="file" accept="application/json,.json" data-act-file="import" hidden></label></div>' +
      '<div class="list-foot">Everything is saved on this phone only. Export a backup now and then, and before changing phones.</div>' +
      '<div class="list-title">About</div><div class="list"><div class="list-row"><p class="small" style="color:var(--ink-2);padding:4px 0">Made by fur-parents for ' + DN() + ' and every dog with the same skin troubles. <b>We\'re not vets.</b> The logic follows one integrative vet\'s approach (Dr. Steve Marsden\'s two-part webinar), which is not mainstream veterinary consensus. Pattern weights are early guesses (v' + esc(R.version) + '). The app never gives doses. Always confirm with your vet.</p></div></div>' +
      '<div class="list-title">Danger zone</div><div class="list"><button class="list-row tap danger" data-act="reset"><span class="grow">Delete everything on this phone</span></button></div>' +
      '<button class="btn btn-soft btn-wide" data-act="closeSheet">Done</button>');
  }

  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act; const id = el.dataset.id; const val = el.dataset.val;
    switch (act) {
      case 'tab': closeSheetSilently(); goTab(el.dataset.tab); break;
      case 'startCheck': UI.step = 0; lastProg = 0; closeSheetSilently(); goTab('check'); break;
      case 'wizExit': UI.step = null; render(); break;
      case 'wizBack': UI.step = Math.max(0, UI.step - 1); $('#main').scrollTop = 0; render(); break;
      case 'wizNext':
        if (STEPS[UI.step][0] === 'flags' && anyRedFlag()) { render(); break; }
        if (UI.step === STEPS.length - 2) runAssessment();
        UI.step++; $('#main').scrollTop = 0; render();
        if (UI.step === STEPS.length - 1) setTimeout(() => burstAt($('#panel-check .page-title')), 250);
        break;
      case 'wizDone': UI.step = null; goTab('today'); break;
      case 'clearFlags':
        PC.assessments.push({ id: uid(), date: todayStr(), rulesVersion: R.version, scores: {}, gate: 'G0', plan: null, signs: [] });
        PC.redFlags = {}; saveState(); UI.step = null; render(); break;
      case 'flag': PC.redFlags[id] = val; saveState(); render(true); break;
      case 'ans': PC.answers[id] = PC.answers[id] === val ? '' : val; saveState(); render(true); break;
      case 'dietyn': PC.diet[id] = val; saveState(); render(true); break;
      case 'setseg': setPath(id, val); saveState(); render(true); break;
      case 'set': {
        const path = el.dataset.path; const cur = getPath(path);
        let v = val; if (['dog.bcs', 'diet.plantPct'].includes(path)) v = Number(val);
        setPath(path, String(cur) === String(v) && path !== 'diet.type' ? (typeof v === 'number' ? null : '') : v);
        saveState(); render(true); break;
      }
      case 'toggle': { const arr = getPath(el.dataset.path); const i = arr.indexOf(val); if (i >= 0) arr.splice(i, 1); else arr.push(val); saveState(); render(true); break; }
      case 'region': PC.regions[id] = Number(val); saveState(); render(true); break;
      case 'phase': UI.phase = Number(val); render(true); break;
      case 'addMed': openMedSheet(id); break;
      case 'mset': UI.medEdit[id] = UI.medEdit[id] === val && id !== 'drug' ? '' : val; renderMedSheet(); break;
      case 'saveMed': {
        const m = UI.medEdit; delete m._new; const i = PC.meds.findIndex((x) => x.id === m.id);
        if (i >= 0) PC.meds[i] = m; else PC.meds.push(m); saveState(); closeSheet(); break;
      }
      case 'delMed': PC.meds = PC.meds.filter((x) => x.id !== UI.medEdit.id); saveState(); closeSheet(); break;
      case 'addLog': openLogSheet(id); break;
      case 'lset': UI.logEdit[id] = Number(val); renderLogSheet(); break;
      case 'ltoggle': { const a = UI.logEdit.ears; const i = a.indexOf(val); if (i >= 0) a.splice(i, 1); else a.push(val); renderLogSheet(); break; }
      case 'saveLog': {
        const l = UI.logEdit; delete l._new; l.itch = Number(l.itch);
        const clash = PC.logs.find((x) => x.date === l.date && x.id !== l.id);
        if (clash) PC.logs = PC.logs.filter((x) => x.id !== clash.id);
        const i = PC.logs.findIndex((x) => x.id === l.id); if (i >= 0) PC.logs[i] = l; else PC.logs.push(l);
        saveState(); burstAt(el); closeSheet(); toast('Logged. Nice work.'); break;
      }
      case 'delLog': { const l = UI.logEdit; if (l.photoId) IDB.del(l.photoId); PC.logs = PC.logs.filter((x) => x.id !== l.id); saveState(); closeSheet(); break; }
      case 'startCheckin': if (!activeAssessment()) { toast('Run a check first'); break; } openCheckin(); break;
      case 'cflag': UI.checkin.flags[id] = val; renderCheckinSheet(); break;
      case 'ciNext': UI.checkin.stage = 'q'; renderCheckinSheet(); break;
      case 'ciset': UI.checkin[el.dataset.k] = val; renderCheckinSheet(); break;
      case 'ciSave': {
        const c = UI.checkin; c.suggestions = responseLoop(c);
        PC.checkins.push({ id: uid(), date: todayStr(), response: c.response, tolerating: c.tolerating, diligent: c.diligent, note: c.note, redFlag: false, suggestions: c.suggestions });
        saveState(); c.stage = 'done'; renderCheckinSheet(); setTimeout(() => burstAt($('#done-mark')), 350); break;
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
    if (t.dataset.lbind) {
      UI.logEdit[t.dataset.lbind] = t.dataset.lbind === 'itch' ? Number(t.value) : t.value;
      if (t.dataset.lbind === 'itch') { $('#itch-val').textContent = t.value; $('#itch-word').textContent = itchWord(Number(t.value)); }
    }
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

  /* ------------------------------------------------------------ onboarding */
  function initWelcome() {
    const w = $('#welcome'); w.hidden = false;
    $('#welcome-scene').innerHTML = sceneSVG('welcome');
    const h1 = $('#welcome-h1');
    let n = 0;
    const split = (node) => {
      Array.from(node.childNodes).forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else { const s = document.createElement('span'); s.className = 'w'; s.style.animationDelay = (0.15 + n++ * 0.08) + 's'; s.textContent = part; frag.appendChild(s); }
          });
          c.replaceWith(frag);
        } else split(c);
      });
    };
    split(h1);
    let page = 0;
    const name = $('#welcome-name'), consent = $('#welcome-consent'), next = $('#ob-next'), back = $('#ob-back');
    name.value = PC.dog.name || '';
    const sexBtns = document.querySelectorAll('#welcome-sex [data-sex]');
    const paintSex = () => sexBtns.forEach((b) => { b.classList.toggle('on', b.dataset.sex === PC.dog.sex); b.setAttribute('aria-pressed', b.dataset.sex === PC.dog.sex); });
    sexBtns.forEach((b) => b.addEventListener('click', () => { PC.dog.sex = b.dataset.sex; saveState(); paintSex(); }));
    paintSex();
    const paint = () => {
      $('#ob-track').style.transform = 'translateX(' + (-page * 100) + '%)';
      document.querySelectorAll('#ob-dots i').forEach((d, i) => d.classList.toggle('on', i === page));
      document.querySelectorAll('.ob-page').forEach((p, i) => { p.inert = i !== page; });
      back.hidden = page === 0;
      next.textContent = ['Get started', 'Continue', 'Start the journey'][page];
      next.disabled = (page === 1 && !consent.checked) || (page === 2 && !name.value.trim());
      $('#welcome-scene').style.transform = page ? 'translateY(-38%)' : 'none';
    };
    name.addEventListener('input', paint); consent.addEventListener('change', paint);
    back.addEventListener('click', () => { page = Math.max(0, page - 1); paint(); });
    next.addEventListener('click', () => {
      if (page < 2) { page++; paint(); if (page === 2) setTimeout(() => name.focus(), 450); return; }
      PC.dog.name = name.value.trim(); PC.accepted = true; saveState();
      burstAt(next);
      setTimeout(() => { w.hidden = true; showApp(); }, 300);
    });
    $('#welcome-photo-input').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const pid = await savePhoto(f, 1100, 0.82); PC.dog.photoId = pid; saveState();
      $('#welcome-photo-img').setAttribute('data-photo', pid); hydratePhotos(w);
      $('#welcome-photo-hint span').textContent = 'Change photo';
    });
    paint();
  }
  function showApp() {
    $('#app').hidden = false;
    $('#main').addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
    goTab('today');
  }

  window.goTab = goTab;
  window.openSettings = openSettings;
  window.closeSheet = closeSheet;

  loadState();
  if (PC.accepted) showApp(); else initWelcome();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
