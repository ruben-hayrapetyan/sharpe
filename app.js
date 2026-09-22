/* Sharpe
 * Hub with three modes:
 *   - Green Book: one problem per topic per round (crops of the book's own pages)
 *   - Mental Math: Zetamac-style timed arithmetic sprint
 *   - Number Sense: same sprint engine over squares, cubes, powers of 2, 1/n, percents…
 */
(() => {
  'use strict';
  const GB = window.GB;
  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app');

  const byId = Object.fromEntries(GB.problems.map(p => [p.id, p]));
  const topicOf = Object.fromEntries(GB.topics.map(t => [t.id, t]));
  const byTopic = {};
  GB.problems.forEach(p => (byTopic[p.topic] ||= []).push(p));
  const GRADES = { 1: 'Missed', 2: 'Partly', 3: 'Got it' };

  /* ── storage (always wrapped: it can be unavailable) ── */
  const KEY = 'greenbook-drill.v1';   // key kept so earlier progress survives the rename
  const defaults = () => ({
    probs: {}, topics: {}, rounds: [], days: [],
    settings: { count: 8, off: [], timer: true, scale: .62, titles: true, chatOpen: false },
    sprint: {
      arith: { dur: 120, add: { on: true, a: [2, 100], b: [2, 100] }, sub: { on: true }, mul: { on: true, a: [2, 12], b: [2, 100] }, div: { on: true } },
      facts: { dur: 60, cats: ['squares', 'cubes', 'pow2', 'frac', 'pct', 'mul2'] },
      hist: {}
    },
    fermi: { count: 10, off: [], seen: {}, hist: [] },
    chats: {}
  });
  const merge = (d, s) => {
    if (Array.isArray(d) || typeof d !== 'object' || d === null) return s === undefined ? d : s;
    const out = { ...d };
    if (s && typeof s === 'object') for (const k of Object.keys(s)) out[k] = k in d ? merge(d[k], s[k]) : s[k];
    return out;
  };
  let store = load();
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return merge(defaults(), s); } catch (e) { /* ignore */ } return defaults(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }
  const cfg = () => store.settings;

  const dkey = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  function markDay() { const t = dkey(new Date()); if (!store.days.includes(t)) { store.days = store.days.concat(t).slice(-400); save(); } }
  function streak() {
    const set = new Set(store.days); let n = 0; const d = new Date();
    if (!set.has(dkey(d))) d.setDate(d.getDate() - 1);
    while (set.has(dkey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ── shared helpers ─────────────────────────────────── */
  const rand = () => Math.random();
  const ri = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const live = msg => { $('#live').textContent = msg; };
  const img = (x, alt) => `<img class="scan" src="${x.src}" width="${x.w}" height="${x.h}" style="--w:${x.w}" alt="${esc(alt)}" draggable="false">`;

  let view = 'hub';
  let round = null;      // Green Book round
  let sp = null;         // running sprint
  let spResult = null;
  let sprintKind = 'arith';
  let tick = null;
  const stopTimers = () => { clearInterval(tick); tick = null; };

  function setScale(v) {
    cfg().scale = Math.min(1, Math.max(.4, Math.round(v * 100) / 100));
    document.documentElement.style.setProperty('--scale', cfg().scale);
    save();
  }

  /* ═══════════════ HUB ═══════════════ */
  function bestOf(key) { const h = store.sprint.hist[key]; return h && h.length ? Math.max(...h.map(r => r.score)) : null; }
  function bestAny(kind) {
    let best = null;
    for (const k of Object.keys(store.sprint.hist)) if (k.startsWith(kind + '|')) { const b = bestOf(k); if (b !== null && (best === null || b > best)) best = b; }
    return best;
  }
  function renderHub() {
    const seen = Object.keys(store.probs).length;
    const st = streak();
    const runs = Object.values(store.sprint.hist).reduce((a, h) => a + h.length, 0);
    const card = (act, glyph, name, desc, stat) => `<button class="mode" data-action="${act}">
      <span class="glyph">${glyph}</span>
      <span class="mode-name">${name}</span>
      <span class="mode-desc">${desc}</span>
      <span class="mode-stat">${stat}</span></button>`;
    const bm = bestAny('arith'), bf = bestAny('facts');
    const fh = store.fermi.hist; const fSeen = Object.keys(store.fermi.seen).length;
    const fStat = fh.length ? `Avg <b>${Math.round(100 * fh.slice(-10).reduce((a, r) => a + r.pts, 0) / fh.slice(-10).reduce((a, r) => a + r.max, 0))}%</b> · ${fSeen} of ${FERMI.questions.length} seen` : `${FERMI.questions.length} questions`;
    app.innerHTML = `<div class="view">
      <p class="eyebrow">${st ? `${st}-day streak` : 'Ready when you are'}</p>
      <h1>Sharpen the quick stuff.</h1>
      <p class="lede">Timed mental math, number-sense drills, Fermi estimation, and one-question-per-topic interview problems from the Green Book.</p>
      <div class="modes">
        ${card('mode-arith', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>', 'Mental Math', 'Zetamac-style sprint. Add, subtract, multiply, divide with ranges you set.', bm === null ? 'No runs yet' : `Best <b>${bm}</b>`)}
        ${card('mode-facts', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 12 5l7 14M8 14h8"/></svg>', 'Number Sense', 'Squares, cubes, powers of 2, 1/n as %, percents. Build recall speed.', bf === null ? 'No runs yet' : `Best <b>${bf}</b>`)}
        ${card('mode-gb', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19"/></svg>', 'Green Book', `${GB.problems.length} interview problems across ${GB.topics.length} topics. One per topic each round.`, `${seen} of ${GB.problems.length} seen`)}
        ${card('mode-fermi', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h4l3-10 4 14 3-8h4"/></svg>', 'Fermi', 'Estimate the impossible to the nearest power of ten. 5 / 3 / 1 scoring.', fStat)}
      </div>
      <p class="foot">${runs} sprint${runs === 1 ? '' : 's'} logged · progress is saved on this device</p>
    </div>`;
  }

  /* ═══════════════ SPRINT ENGINE ═══════════════ */
  const DURS = [30, 60, 120, 300];
  const FACT_CATS = {
    squares: { name: 'Squares', hint: '11–35', gen: () => { const n = ri(11, 35); return { q: `${n}<sup>2</sup>`, ans: n * n }; } },
    cubes: { name: 'Cubes', hint: '2–15', gen: () => { const n = ri(2, 15); return { q: `${n}<sup>3</sup>`, ans: n ** 3 }; } },
    pow2: { name: 'Powers of 2', hint: '2ⁿ and log₂', gen: () => { const n = ri(2, 16); return rand() < .6 ? { q: `2<sup>${n}</sup>`, ans: 2 ** n } : { q: `log<sub>2</sub> ${2 ** n}`, ans: n }; } },
    frac: { name: '1/n as %', hint: 'to 0.1', gen: () => { const n = [3, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20][ri(0, 14)]; return { q: `1 ÷ ${n}<span class="unit">in %</span>`, ans: 100 / n, tol: .06 }; } },
    pct: { name: 'Percent of', hint: '15% of 340', gen: () => { const p = [5, 10, 15, 20, 25, 30, 35, 40, 60, 75, 80, 90, 120, 150][ri(0, 13)]; const N = 20 * ri(2, 40); return { q: `${p}% of ${N}`, ans: p * N / 100 }; } },
    mul2: { name: 'Mid multiplication', hint: '12–25 × 12–25', gen: () => { const a = ri(12, 25), b = ri(12, 25); return { q: `${a} × ${b}`, ans: a * b }; } }
  };
  const TAG_NAMES = { add: 'Addition', sub: 'Subtraction', mul: 'Multiplication', div: 'Division', ...Object.fromEntries(Object.entries(FACT_CATS).map(([k, v]) => [k, v.name])) };

  const rng = ([a, b]) => (a <= b ? [a, b] : [b, a]);
  function makeArith(c) {
    const ops = ['add', 'sub', 'mul', 'div'].filter(o => c[o].on);
    return () => {
      const op = ops[ri(0, ops.length - 1)];
      if (op === 'add' || op === 'sub') {
        const a = ri(...rng(c.add.a)), b = ri(...rng(c.add.b));
        return op === 'add' ? { q: `${a} + ${b}`, ans: a + b, tag: 'add' } : { q: `${a + b} − ${a}`, ans: b, tag: 'sub' };
      }
      const a = ri(...rng(c.mul.a)), b = ri(...rng(c.mul.b));
      return op === 'mul' ? { q: `${a} × ${b}`, ans: a * b, tag: 'mul' } : { q: `${a * b} ÷ ${a}`, ans: b, tag: 'div' };
    };
  }
  function makeFacts(c) {
    const cats = c.cats.filter(k => FACT_CATS[k]);
    return () => { const k = cats[ri(0, cats.length - 1)]; return { ...FACT_CATS[k].gen(), tag: k }; };
  }
  function sprintKey(kind) {
    const c = store.sprint[kind];
    if (kind === 'facts') return `facts|${c.dur}|${c.cats.slice().sort().join(',')}`;
    const parts = ['add', 'sub', 'mul', 'div'].filter(o => c[o].on).map(o => o === 'add' ? `add${rng(c.add.a)}x${rng(c.add.b)}` : o === 'mul' ? `mul${rng(c.mul.a)}x${rng(c.mul.b)}` : o);
    return `arith|${c.dur}|${parts.join(',')}`;
  }
  const canRun = kind => kind === 'facts' ? store.sprint.facts.cats.length > 0 : ['add', 'sub', 'mul', 'div'].some(o => store.sprint.arith[o].on);

  function renderSetup(kind) {
    const c = store.sprint[kind];
    const key = sprintKey(kind);
    const best = bestOf(key);
    const last = (store.sprint.hist[key] || []).slice(-1)[0];
    const durSeg = `<div class="seg" role="group" aria-label="Duration">${DURS.map(d => `<button data-action="dur" data-n="${d}" aria-pressed="${c.dur === d}">${d >= 60 ? d / 60 + 'm' : d + 's'}</button>`).join('')}</div>`;
    let body = '';
    if (kind === 'arith') {
      const range = (op, side, lab) => `<label class="rg"><span>${lab}</span>
        <input class="num" type="number" inputmode="numeric" data-rg="${op}.${side}.0" value="${c[op][side][0]}"><i>to</i>
        <input class="num" type="number" inputmode="numeric" data-rg="${op}.${side}.1" value="${c[op][side][1]}"></label>`;
      const opRow = (op, name, sym, extra, note) => `<div class="row op">
        <div class="op-head"><button class="switch" role="switch" aria-checked="${c[op].on}" aria-label="${name}" data-action="op" data-op="${op}"></button>
          <div><div class="row-label"><span class="sym">${sym}</span> ${name}</div>${note ? `<div class="row-sub">${note}</div>` : ''}</div></div>
        <div class="rgs">${extra}</div></div>`;
      body = `<section class="panel">
        ${opRow('add', 'Addition', '+', range('add', 'a', 'Left') + range('add', 'b', 'Right'))}
        ${opRow('sub', 'Subtraction', '−', '', 'Inverse of addition, same ranges')}
        ${opRow('mul', 'Multiplication', '×', range('mul', 'a', 'Left') + range('mul', 'b', 'Right'))}
        ${opRow('div', 'Division', '÷', '', 'Inverse of multiplication, same ranges')}
      </section>`;
    } else {
      body = `<section class="panel"><div class="map-head"><h2>Drills</h2><span class="row-sub">Pick what to mix</span></div>
        <div class="map"><div class="chips">${Object.entries(FACT_CATS).map(([k, v]) => `<button class="chip" data-action="cat" data-k="${k}" aria-pressed="${c.cats.includes(k)}">${v.name}<small>${v.hint}</small></button>`).join('')}</div></div></section>`;
    }
    app.innerHTML = `<div class="view">
      <p class="eyebrow">${kind === 'arith' ? 'Mental Math' : 'Number Sense'}</p>
      <h1>${kind === 'arith' ? 'Sprint the arithmetic.' : 'Make it automatic.'}</h1>
      <p class="lede">Type the answer — it advances the instant it's right. <kbd>Enter</kbd> skips a question. Score is correct answers before time runs out.</p>
      <section class="panel"><div class="row">
        <div><div class="row-label">Duration</div><div class="row-sub">${best === null ? 'No runs with these settings yet' : `Best ${best}${last ? ` · last ${last.score}` : ''}`}</div></div>${durSeg}
      </div></section>
      ${body}
      <div class="cta"><button class="btn primary big" data-action="sprint-start" ${canRun(kind) ? '' : 'disabled'}>Start <kbd>↵</kbd></button>
        <button class="btn ghost big" data-action="hub">Back</button></div>
    </div>`;
  }

  function startSprint(kind) {
    if (!canRun(kind)) return;
    const c = store.sprint[kind];
    sp = { kind, key: sprintKey(kind), gen: kind === 'facts' ? makeFacts(c) : makeArith(c), dur: c.dur * 1000, log: [], skipped: 0, cur: null, qStart: 0, t0: 0, over: false };
    view = 'sprint-play'; renderPlay();
  }
  function nextQ() { sp.cur = sp.gen(); sp.qStart = Date.now(); const el = $('#prob'); if (el) el.innerHTML = sp.cur.q; const i = $('#ans'); if (i) { i.value = ''; i.focus(); } }

  function renderPlay() {
    stopTimers();
    $('.stepper').hidden = true;
    app.innerHTML = `<div class="view play">
      <div class="hud"><div><div class="k">Score</div><div class="v mono" id="score">0</div></div>
        <div class="hud-r"><div class="k">Time</div><div class="v mono" id="left">${fmt(sp.dur)}</div></div></div>
      <div class="timebar"><span id="bar"></span></div>
      <div class="stage"><div class="prob mono" id="prob" aria-live="off"></div>
        <input id="ans" class="answer mono" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Answer" placeholder="…"></div>
      <p class="foot"><kbd>Enter</kbd> skip · <kbd>Esc</kbd> quit</p></div>`;
    sp.t0 = Date.now();
    nextQ();
    const ans = $('#ans');
    ans.addEventListener('input', () => {
      const s = ans.value.trim().replace(',', '.');
      if (!s || s === '-' || s.endsWith('.')) return;
      const v = Number(s);
      if (!Number.isFinite(v) || Math.abs(v - sp.cur.ans) > (sp.cur.tol || 0) + 1e-9) return;
      sp.log.push({ q: sp.cur.q, tag: sp.cur.tag, ms: Date.now() - sp.qStart, ok: true });
      $('#score').textContent = sp.log.filter(r => r.ok).length;
      nextQ();
    });
    ans.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); sp.log.push({ q: sp.cur.q, tag: sp.cur.tag, ms: Date.now() - sp.qStart, ok: false }); sp.skipped++; nextQ(); }
      else if (e.key === 'Escape') { stopTimers(); view = 'sprint-setup'; render(); }
    });
    ans.addEventListener('blur', () => { if (view === 'sprint-play' && !sp.over) setTimeout(() => $('#ans') && $('#ans').focus(), 0); });
    const upd = () => {
      const left = Math.max(0, sp.dur - (Date.now() - sp.t0));
      $('#left').textContent = fmt(left); $('#bar').style.transform = `scaleX(${left / sp.dur})`;
      if (left <= 0) finishSprint();
    };
    upd(); tick = setInterval(upd, 100);
  }

  function finishSprint() {
    stopTimers(); sp.over = true;
    const ok = sp.log.filter(r => r.ok);
    const prevBest = bestOf(sp.key);
    const score = ok.length;
    const h = store.sprint.hist[sp.key] || [];
    h.push({ t: Date.now(), score, skipped: sp.skipped });
    store.sprint.hist[sp.key] = h.slice(-30);
    markDay(); save();
    const tags = {};
    sp.log.forEach(r => { const t = tags[r.tag] ||= { n: 0, ms: 0, skip: 0 }; if (r.ok) { t.n++; t.ms += r.ms; } else t.skip++; });
    spResult = {
      kind: sp.kind, score, skipped: sp.skipped, prevBest, isBest: score > (prevBest ?? -1) && score > 0, dur: sp.dur,
      avg: ok.length ? ok.reduce((a, r) => a + r.ms, 0) / ok.length : 0,
      slow: ok.slice().sort((a, b) => b.ms - a.ms).slice(0, 5),
      tags: Object.entries(tags).map(([k, v]) => ({ k, n: v.n, avg: v.n ? v.ms / v.n : 0, skip: v.skip })).sort((a, b) => b.avg - a.avg)
    };
    view = 'sprint-result'; render();
  }

  function renderResult() {
    const r = spResult;
    const multi = r.tags.length > 1;
    app.innerHTML = `<div class="view">
      <p class="eyebrow">${r.isBest ? 'New best' : 'Time'}</p>
      <h1><span class="mono big-score">${r.score}</span> correct</h1>
      <p class="lede">${r.dur / 1000}s sprint · ${r.avg ? (r.avg / 1000).toFixed(2) + 's average' : 'no answers'}${r.skipped ? ` · ${r.skipped} skipped` : ''}${r.prevBest !== null && !r.isBest ? ` · best ${r.prevBest}` : ''}</p>
      <div class="tiles">
        <div class="tile"><div class="k">Correct</div><div class="v" style="color:var(--good)">${r.score}</div></div>
        <div class="tile"><div class="k">Skipped</div><div class="v" style="color:var(--mid)">${r.skipped}</div></div>
        <div class="tile"><div class="k">Per minute</div><div class="v mono" style="font-size:24px;padding-top:4px">${(r.score / (r.dur / 60000)).toFixed(1)}</div></div>
        <div class="tile"><div class="k">Avg time</div><div class="v mono" style="font-size:24px;padding-top:4px">${r.avg ? (r.avg / 1000).toFixed(2) + 's' : '–'}</div></div>
      </div>
      ${multi ? `<section class="panel"><div class="map-head"><h2>By type</h2><span class="row-sub">slowest first</span></div><ul class="results">${r.tags.map(t => `<li><div class="line"><span class="t">${esc(TAG_NAMES[t.k] || t.k)}</span><span class="s">${t.n} correct${t.skip ? `, ${t.skip} skipped` : ''}</span><span class="time">${t.n ? (t.avg / 1000).toFixed(2) + 's' : '–'}</span></div></li>`).join('')}</ul></section>` : ''}
      ${r.slow.length ? `<section class="panel"><div class="map-head"><h2>Slowest answers</h2></div><ul class="results">${r.slow.map(x => `<li><div class="line"><span class="t mono">${x.q}</span><span class="s">${esc(TAG_NAMES[x.tag] || '')}</span><span class="time">${(x.ms / 1000).toFixed(2)}s</span></div></li>`).join('')}</ul></section>` : ''}
      <div class="cta"><button class="btn primary big" data-action="sprint-start">Again <kbd>↵</kbd></button>
        <button class="btn big" data-action="sprint-setup">Settings</button><button class="btn ghost big" data-action="hub">Home</button></div>
    </div>`;
    live(`Sprint over. ${r.score} correct.`); window.scrollTo({ top: 0 });
  }


  /* ═══════════════ FERMI ═══════════════ */
  const FERMI = window.FERMI;
  const fById = Object.fromEntries(FERMI.questions.map(q => [q.id, q]));
  const rich = t => esc(t).replace(/&lt;(\/?)(sup|sub)&gt;/g, '<$1$2>');   // only sup/sub survive
  const fPts = d => (d === 0 ? 5 : d === 1 ? 3 : d === 2 ? 1 : 0);
  let fp = null, fpResult = null;

  function renderFermiSetup() {
    const f = store.fermi; const on = k => !f.off.includes(k);
    const pool = FERMI.questions.filter(q => on(q.s));
    const unseen = pool.filter(q => !(q.id in f.seen)).length;
    const counts = [5, 10, 20, 30];
    const chips = Object.entries(FERMI.sources).map(([k, v]) => {
      const n = FERMI.questions.filter(q => q.s === k).length;
      return `<button class="chip" data-action="fermi-src" data-k="${esc(k)}" aria-pressed="${on(k)}">${esc(v.name)}<small>${n}</small></button>`;
    }).join('');
    const hist = f.hist.slice(-1)[0];
    app.innerHTML = `<div class="view">
      <p class="eyebrow">Fermi</p><h1>Order of magnitude.</h1>
      <p class="lede">Answer with the <b>power of ten</b>: 400 is 4×10², so the answer is <span class="mono">2</span>. Exact scores 5, one off scores 3, two off scores 1. Negative exponents are fine (<span class="mono">-3</span>).</p>
      <section class="panel">
        <div class="row"><div><div class="row-label">Questions per round</div><div class="row-sub">${pool.length} in pool · ${unseen} not seen yet${hist ? ` · last round ${hist.pts}/${hist.max}` : ''}</div></div>
          <div class="seg" role="group" aria-label="Questions per round">${counts.map(c => `<button data-action="fermi-count" data-n="${c}" aria-pressed="${f.count === c}">${c}</button>`).join('')}</div></div>
        <div class="row"><div class="row-sub">Unseen questions come first, so you cycle through the whole bank.</div>
          <button class="btn primary big" data-action="fermi-start" ${pool.length ? '' : 'disabled'}>Start <kbd>↵</kbd></button></div>
      </section>
      <section class="panel"><div class="map-head"><h2>Sources</h2><span class="row-sub">Tap to include or skip</span></div><div class="map"><div class="chips">${chips}</div></div></section>
      <div class="cta"><button class="btn ghost big" data-action="hub">Back</button></div>
      <p class="foot">Questions from <a href="https://fermi-questions.andrechek.com/" target="_blank" rel="noopener">fermi-questions.andrechek.com</a> (Eric Andrechek, GPL-3), collected from Science Olympiad and other Fermi tests.</p>
    </div>`;
  }

  function startFermi() {
    const f = store.fermi;
    const pool = FERMI.questions.filter(q => !f.off.includes(q.s));
    if (!pool.length) return;
    const shuffled = pool.map(q => ({ q, r: rand() + (q.id in f.seen ? 1 : 0) })).sort((a, b) => a.r - b.r).map(x => x.q);
    fp = { ids: shuffled.slice(0, Math.min(f.count, shuffled.length)).map(q => q.id), i: 0, results: [], answered: null, t0: Date.now() };
    view = 'fermi-play'; render();
  }

  function renderFermiPlay() {
    const q = fById[fp.ids[fp.i]]; const n = fp.ids.length; const src = FERMI.sources[q.s];
    const pts = fp.results.reduce((a, r) => a + r.pts, 0);
    const steps = fp.ids.map((_, i) => { const r = fp.results[i]; return `<span class="step ${r ? (r.pts >= 3 ? 'g3' : r.pts ? 'g2' : 'g1') : i === fp.i ? 'now' : ''}"></span>`; }).join('');
    const a = fp.answered;
    app.innerHTML = `<div class="view play">
      <div class="steps" aria-hidden="true">${steps}</div>
      <div class="meta"><span class="topic-tag"><span class="num">${fp.i + 1}/${n}</span>${esc(src.name)}</span><span class="clock">${pts} pts</span></div>
      <section class="sheet">
        <div class="sheet-body fq">${rich(q.q)}</div>
        <div class="fq-ans">
          <label class="fq-label" for="fans">10<sup>?</sup></label>
          <input id="fans" class="answer mono" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="exponent" ${a ? 'readonly' : ''} value="${a ? esc(a.raw) : ''}" aria-label="Power of ten">
        </div>
        ${a ? `<div class="fq-result ${a.pts >= 3 ? 'ok' : a.pts ? 'mid' : 'bad'}">
          <div class="fq-pts mono">+${a.pts}</div>
          <div><b>${a.skipped ? 'Skipped' : a.d === 0 ? 'Dead on.' : `${a.d} order${a.d === 1 ? '' : 's'} ${a.guess > q.a ? 'too high' : 'too low'}.`}</b>
            <div class="row-sub">Answer <span class="mono">10<sup>${q.a}</sup></span>${a.skipped ? '' : ` · you said <span class="mono">${a.guess}</span>`} · <a href="${esc(src.link)}" target="_blank" rel="noopener">${esc(src.name)}</a></div></div></div>
          <div class="actions"><span class="spacer"></span><button class="btn primary" data-action="fermi-next">${fp.i + 1 >= n ? 'Finish' : 'Next'} <kbd>↵</kbd></button></div>`
        : `<div class="actions"><span class="spacer"></span><button class="btn ghost" data-action="fermi-skip">I don't know</button>
          <button class="btn primary" data-action="fermi-submit">Submit <kbd>↵</kbd></button></div>`}
      </section></div>`;
    const inp = $('#fans'); inp.focus();
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); fp.answered ? fermiNext() : fermiSubmit(); }
      else if (e.key === 'Escape') { view = 'fermi-setup'; render(); }
    });
    live(`Question ${fp.i + 1} of ${n}.`);
    chatSync();
  }

  function parseExp(raw) {
    const s = raw.trim().toLowerCase().replace('−', '-');
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    const m = s.match(/^-?\d*\.?\d+e(-?\d+)$/);         // 4e2 -> 2
    return m ? parseInt(m[1], 10) : null;
  }
  function fermiSubmit() {
    const raw = $('#fans').value; const g = parseExp(raw);
    if (g === null) { const el = $('#fans'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
    const q = fById[fp.ids[fp.i]]; const d = Math.abs(g - q.a);
    fp.answered = { raw, guess: g, d, pts: fPts(d), skipped: false }; renderFermiPlay();
  }
  function fermiSkip() { fp.answered = { raw: '', guess: null, d: null, pts: 0, skipped: true }; renderFermiPlay(); }
  function fermiNext() {
    const q = fById[fp.ids[fp.i]]; const a = fp.answered;
    fp.results.push({ id: q.id, guess: a.guess, d: a.d, pts: a.pts, skipped: a.skipped });
    store.fermi.seen[q.id] = a.pts;
    if (fp.i + 1 >= fp.ids.length) return finishFermi();
    fp.i++; fp.answered = null; save(); renderFermiPlay();
  }
  function finishFermi() {
    const rs = fp.results; const graded = rs.filter(r => !r.skipped);
    const pts = rs.reduce((a, r) => a + r.pts, 0); const max = rs.length * 5;
    store.fermi.hist = store.fermi.hist.concat({ t: Date.now(), pts, max, n: rs.length }).slice(-50);
    markDay(); save();
    fpResult = {
      pts, max, exact: rs.filter(r => r.d === 0).length, skipped: rs.length - graded.length, rs,
      avgErr: graded.length ? graded.reduce((a, r) => a + r.d, 0) / graded.length : null,
      bias: graded.length ? graded.reduce((a, r) => a + (r.guess - fById[r.id].a), 0) / graded.length : null
    };
    view = 'fermi-result'; render();
  }

  function renderFermiResult() {
    const r = fpResult;
    const bias = r.bias === null ? '–' : Math.abs(r.bias) < .25 ? 'balanced' : `${r.bias > 0 ? 'high' : 'low'} ${Math.abs(r.bias).toFixed(1)}`;
    const items = r.rs.map(x => {
      const q = fById[x.id]; const c = x.pts >= 3 ? 'g3' : x.pts ? 'g2' : 'g1';
      return `<li><div class="line fr"><span class="pill ${c}">+${x.pts}</span>
        <span><div class="s" style="text-align:left">${esc(FERMI.sources[q.s].name)}</div><div class="fq-mini">${rich(q.q)}</div></span>
        <span class="time">10<sup>${q.a}</sup><br>${x.skipped ? 'skipped' : `you ${x.guess}`}</span></div></li>`;
    }).join('');
    app.innerHTML = `<div class="view">
      <p class="eyebrow">Round complete</p><h1><span class="mono big-score">${r.pts}</span> / ${r.max} points</h1>
      <p class="lede">${Math.round(100 * r.pts / r.max)}% of the maximum. ${r.avgErr === null ? '' : `You averaged ${r.avgErr.toFixed(1)} orders of magnitude off.`}</p>
      <div class="tiles">
        <div class="tile"><div class="k">Dead on</div><div class="v" style="color:var(--good)">${r.exact}</div></div>
        <div class="tile"><div class="k">Avg error</div><div class="v mono" style="font-size:24px;padding-top:4px">${r.avgErr === null ? '–' : r.avgErr.toFixed(1)}</div></div>
        <div class="tile"><div class="k">Tendency</div><div class="v mono" style="font-size:22px;padding-top:5px">${bias}</div></div>
        <div class="tile"><div class="k">Skipped</div><div class="v" style="color:var(--mid)">${r.skipped}</div></div>
      </div>
      <section class="panel"><ul class="results">${items}</ul></section>
      <div class="cta"><button class="btn primary big" data-action="fermi-start">Next round <kbd>↵</kbd></button>
        <button class="btn big" data-action="mode-fermi">Settings</button><button class="btn ghost big" data-action="hub">Home</button></div></div>`;
    live('Round complete.'); window.scrollTo({ top: 0 });
  }

  /* ═══════════════ GREEN BOOK ═══════════════ */
  function activeTopics() { return GB.topics.filter(t => !cfg().off.includes(t.id) && byTopic[t.id]); }
  function pickTopics(k) {
    const pool = activeTopics(); const now = Date.now();
    const lasts = pool.map(t => store.topics[t.id] || 0).filter(Boolean);
    const span = Math.max(now - (lasts.length ? Math.min(...lasts) : now), 1);
    return pool.map(t => { const last = store.topics[t.id]; return { t, score: rand() + (last ? (now - last) / span : 1.2) }; })
      .sort((a, b) => b.score - a.score).slice(0, k).map(x => x.t);
  }
  function pickProblem(topic) {
    const list = byTopic[topic.id];
    const weights = list.map(p => {
      const r = store.probs[p.id]; if (!r) return 4;
      const g = r.g[r.g.length - 1]; const w = g === 1 ? 2.5 : g === 2 ? 1.6 : .6;
      return Date.now() - r.last < 36e5 ? w * .1 : w;
    });
    let x = rand() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { x -= weights[i]; if (x <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function interleave(topics) {
    const left = topics.slice().sort(() => rand() - .5); const out = [];
    while (left.length) {
      const prev = out.length ? out[out.length - 1].chapter : -1;
      const ok = left.filter(t => t.chapter !== prev); const src = ok.length ? ok : left;
      const t = src[Math.floor(rand() * src.length)]; left.splice(left.indexOf(t), 1); out.push(t);
    }
    return out;
  }
  const mkRound = ids => ({ ids, i: 0, results: [], revealed: false, hint: false, t0: Date.now(), qStart: Date.now() });
  function newRound() {
    const pool = activeTopics(); if (!pool.length) return null;
    const k = Math.min(cfg().count || pool.length, pool.length);
    return mkRound(interleave(pickTopics(k)).map(t => pickProblem(t).id));
  }

  const topicLine = t => `<span class="topic-tag"><span class="num">${t.id}</span>${esc(t.name)}<span class="ch">· ${esc(GB.chapters[t.chapter])}</span></span>`;
  function lastGradeOfTopic(tid) {
    let best = null;
    (byTopic[tid] || []).forEach(p => { const r = store.probs[p.id]; if (r && (!best || r.last > best.last)) best = r; });
    return best ? best.g[best.g.length - 1] : 0;
  }

  function renderGbHome() {
    const pool = activeTopics(); const total = GB.problems.length; const seen = Object.keys(store.probs).length;
    const counts = [5, 8, 12, 20, 0]; const k = Math.min(cfg().count || pool.length, pool.length);
    const chapters = GB.chapters.map((name, ci) => {
      const ts = GB.topics.filter(t => t.chapter === ci); const allOn = ts.every(t => !cfg().off.includes(t.id));
      const chips = ts.map(t => {
        const list = byTopic[t.id] || []; const s = list.filter(p => store.probs[p.id]).length; const on = !cfg().off.includes(t.id);
        return `<button class="chip" data-action="toggle-topic" data-id="${t.id}" aria-pressed="${on}" title="${esc(t.name)} — ${s} of ${list.length} problems seen">
          <span class="dot g${lastGradeOfTopic(t.id)}"></span>${esc(t.name)}<small>${s}/${list.length}</small></button>`;
      }).join('');
      return `<div class="chapter"><div class="chapter-title"><span>${esc(name)}</span><button data-action="toggle-chapter" data-ci="${ci}">${allOn ? 'none' : 'all'}</button></div><div class="chips">${chips}</div></div>`;
    }).join('');
    app.innerHTML = `<div class="view">
      <p class="eyebrow">Green Book · Practical Guide to Quantitative Finance Interviews</p>
      <h1>One question per topic.</h1>
      <p class="lede">Each round pulls a single problem from a different section of the book, so nothing repeats an idea until you've covered the whole map.</p>
      <section class="panel">
        <div class="row"><div><div class="row-label">Questions per round</div><div class="row-sub">${pool.length} topics enabled · ${seen} of ${total} problems seen</div></div>
          <div class="seg" role="group" aria-label="Questions per round">${counts.map(c => `<button data-action="count" data-n="${c}" aria-pressed="${cfg().count === c}">${c || 'All'}</button>`).join('')}</div></div>
        <div class="row"><div><div class="row-label">Timer</div><div class="row-sub">Show elapsed time on each question</div></div>
          <button class="switch" role="switch" aria-checked="${cfg().timer}" aria-label="Timer" data-action="timer"></button></div>
        <div class="row"><div><div class="row-label">Problem titles</div><div class="row-sub">Show the book's title on each question (may hint at the trick)</div></div>
          <button class="switch" role="switch" aria-checked="${cfg().titles}" aria-label="Problem titles" data-action="titles"></button></div>
        <div class="row"><div class="row-sub">${pool.length ? `Round: ${k} question${k === 1 ? '' : 's'}, each from a different topic.` : 'Enable at least one topic below.'}</div>
          <button class="btn primary big" data-action="start" ${pool.length ? '' : 'disabled'}>Start round <kbd>↵</kbd></button></div>
      </section>
      <section class="panel"><div class="map-head"><h2>Topic map</h2><span class="row-sub">Tap to include or skip a topic</span></div><div class="map">${chapters}</div></section>
      <div class="cta"><button class="btn ghost" data-action="hub">Back</button></div>
    </div>`;
  }

  function renderQuiz() {
    const p = byId[round.ids[round.i]]; const t = topicOf[p.topic]; const n = round.ids.length;
    const steps = round.ids.map((_, i) => { const r = round.results[i]; return `<span class="step ${r ? 'g' + r.g : i === round.i ? 'now' : ''}"></span>`; }).join('');
    const ctx = p.ctx ? byId[p.ctx] : null;
    const src = [p.title, `p. ${p.page}`].filter(Boolean).join(' · ');
    const title = cfg().titles && p.title ? `<span class="ptitle">${esc(p.title)}</span>` : '';
    app.innerHTML = `<div class="view">
      <div class="steps" aria-hidden="true">${steps}</div>
      <div class="meta">${topicLine(t)}<span class="clock" id="clock">${cfg().timer ? '0:00' : `${round.i + 1} / ${n}`}</span></div>
      ${ctx ? `<section class="sheet ctx"><div class="sheet-head"><span>Context — from the original problem</span></div><div class="sheet-body">${img(ctx.q, 'Original problem for context')}</div></section>` : ''}
      <section class="sheet">
        <div class="sheet-head"><span>Question ${round.i + 1} of ${n}</span>${title}</div>
        <div class="sheet-body">${img(p.q, 'Question')}</div>
        ${round.hint && p.hint ? `<div class="hint-note"><details open><summary>Book hint</summary>${img(p.hint, 'Hint')}</details></div>` : ''}
        ${round.revealed ? '' : `<div class="actions">
          ${p.hint && !round.hint ? `<button class="btn ghost" data-action="hint">Show hint <kbd>H</kbd></button>` : ''}<span class="spacer"></span>
          <button class="btn ghost" data-action="skip">Skip <kbd>S</kbd></button>
          <button class="btn primary" data-action="reveal">Reveal solution <kbd>Space</kbd></button></div>`}
      </section>
      ${round.revealed ? `<section class="sheet reveal">
        <div class="sheet-head"><b>Solution</b><span class="source">${esc(src)}</span></div>
        <div class="sheet-body">${img(p.s, 'Solution')}</div>
        <div class="grade"><div class="grade-label">How did you do?</div>
          <button class="gbtn g1" data-action="grade" data-g="1"><b><i></i>Missed <kbd>1</kbd></b><span>Couldn't get there</span></button>
          <button class="gbtn g2" data-action="grade" data-g="2"><b><i></i>Partly <kbd>2</kbd></b><span>Right idea, shaky finish</span></button>
          <button class="gbtn g3" data-action="grade" data-g="3"><b><i></i>Got it <kbd>3</kbd></b><span>Solved it cleanly</span></button></div>
      </section>` : ''}
    </div>`;
    live(`Question ${round.i + 1} of ${n}. ${t.name}.`);
    if (cfg().timer) startClock();
    if (round.revealed) { const s = $('.sheet.reveal'); if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' }); } else window.scrollTo({ top: 0 });
  }
  function startClock() {
    stopTimers(); const el = $('#clock');
    const upd = () => { if (el && el.isConnected) el.textContent = fmt(Date.now() - round.qStart); else stopTimers(); };
    upd(); tick = setInterval(upd, 1000);
  }

  function renderSummary() {
    const rs = round.results; const cnt = g => rs.filter(r => r.g === g).length; const took = fmt(Date.now() - round.t0);
    const items = rs.map((r, i) => {
      const p = byId[r.id]; const t = topicOf[p.topic];
      return `<li><button data-action="review" data-i="${i}"><span class="pill ${r.g ? 'g' + r.g : ''}">${r.g ? GRADES[r.g] : 'Skipped'}</span>
        <span><div class="t">${esc(t.name)}</div><div class="s">${esc(p.title || GB.chapters[t.chapter])} · p. ${p.page}</div></span><span class="time">${fmt(r.ms)}</span></button></li>`;
    }).join('');
    const missed = rs.filter(r => r.g !== 3).length;
    app.innerHTML = `<div class="view">
      <p class="eyebrow">Round complete</p><h1>${cnt(3)} of ${rs.length} clean.</h1>
      <p class="lede">${rs.length} topics, ${rs.length} different ideas, ${took} total. Tap any row to look at the problem and solution again.</p>
      <div class="tiles">
        <div class="tile"><div class="k">Got it</div><div class="v" style="color:var(--good)">${cnt(3)}</div></div>
        <div class="tile"><div class="k">Partly</div><div class="v" style="color:var(--mid)">${cnt(2)}</div></div>
        <div class="tile"><div class="k">Missed</div><div class="v" style="color:var(--bad)">${cnt(1)}</div></div>
        <div class="tile"><div class="k">Time</div><div class="v mono" style="font-size:24px;padding-top:4px">${took}</div></div></div>
      <section class="panel"><ul class="results">${items}</ul></section>
      <div class="cta"><button class="btn primary big" data-action="start">Next round <kbd>↵</kbd></button>
        ${missed ? `<button class="btn big" data-action="retry">Retry ${missed} not-clean</button>` : ''}
        <button class="btn ghost big" data-action="mode-gb">Topic map</button><button class="btn ghost big" data-action="hub">Home</button></div></div>`;
    live('Round complete.'); window.scrollTo({ top: 0 });
  }

  function advance(g) {
    const p = byId[round.ids[round.i]]; const ms = Date.now() - round.qStart; const now = Date.now();
    round.results.push({ id: p.id, g, ms });
    store.topics[p.topic] = now;
    if (g) { const r = store.probs[p.id] || { g: [], last: 0 }; r.g = r.g.concat(g).slice(-6); r.last = now; store.probs[p.id] = r; }
    else if (!store.probs[p.id]) store.probs[p.id] = { g: [], last: now };
    if (round.i + 1 >= round.ids.length) {
      store.rounds = store.rounds.concat({ t: now, n: round.results.length, got: round.results.filter(r => r.g === 3).length }).slice(-50);
      markDay(); save(); view = 'gb-summary';
    } else { round.i++; round.revealed = false; round.hint = false; round.qStart = Date.now(); save(); }
    render();
  }

  function openReview(i) {
    const r = round.results[i]; const p = byId[r.id]; const t = topicOf[p.topic]; const d = $('#review');
    d.innerHTML = `<div class="dlg-head"><div>${topicLine(t)}</div><button class="btn ghost" data-action="close">Close <kbd>Esc</kbd></button></div>
      <div class="dlg-body">
        ${p.ctx ? `<section class="sheet ctx"><div class="sheet-head"><span>Context</span></div><div class="sheet-body">${img(byId[p.ctx].q, 'Context')}</div></section>` : ''}
        <section class="sheet"><div class="sheet-head"><span>Question</span>${p.title ? `<span class="ptitle">${esc(p.title)}</span>` : ''}</div><div class="sheet-body">${img(p.q, 'Question')}</div>
          ${p.hint ? `<div class="hint-note"><details><summary>Book hint</summary>${img(p.hint, 'Hint')}</details></div>` : ''}</section>
        <section class="sheet"><div class="sheet-head"><b>Solution</b><span class="source">p. ${p.page}</span></div><div class="sheet-body">${img(p.s, 'Solution')}</div></section>
      </div>`;
    d.showModal();
  }


  /* ═══════════════ ASK CLAUDE ═══════════════
   * Side panel for the problem you're on (Green Book + Fermi only). Every message carries that
   * problem's context. Spoilers are gated: the book's solution / the reference answer are only
   * sent once you've revealed or answered. Runs through the local Claude Code CLI (native app).
   */
  const bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.claude;
  const TUTOR = `You are a quant-interview tutor built into the Sharpe practice app. The student is working on exactly one problem, described below; help with that problem only.
- Be concise. Default to a hint or a question that moves them one step forward. Give the full answer or solution only if they ask for it (e.g. "just tell me"), or if the state below says they have already revealed it or answered.
- When images are attached, read them first: they are scans of the source and the math can be dense. If something is unreadable, say what you can't read instead of guessing.
- Never claim to know the book's solution or the reference answer unless it is provided below.
- Write math in plain text or Unicode (×, √, ², Σ, π, ≤). Do not use LaTeX or $ delimiters. Short paragraphs and short lists are fine; no headings.
- If the student states an answer, check it against your own working and say plainly whether it is right and where any error is.`;
  const chat = { open: !!store.settings.chatOpen, req: null, available: undefined };
  const chatsOf = () => store.chats;
  const plain = h => { let t = String(h); for (let i = 0; i < 6; i++) t = t.replace(/<sup>((?:(?!<sup>).)*?)<\/sup>/g, '^($1)'); return t.replace(/<sub>(.*?)<\/sub>/g, '_($1)').replace(/<[^>]+>/g, ''); };

  function chatTarget() {
    if (view === 'gb-quiz' && round) { const p = byId[round.ids[round.i]]; return { kind: 'gb', key: 'gb:' + p.id, p }; }
    if (view === 'fermi-play' && fp) { const q = fById[fp.ids[fp.i]]; return { kind: 'fermi', key: 'fermi:' + q.id, q }; }
    return null;
  }

  // What Claude gets to see right now (also shown to you under the chat box).
  function contextFor(t) {
    const images = []; const L = []; const sees = [];
    if (t.kind === 'gb') {
      const p = t.p; const tp = topicOf[p.topic];
      L.push('PROBLEM CONTEXT',
        'Source: "A Practical Guide to Quantitative Finance Interviews" (Xinfeng Zhou), book page ' + p.page + '.',
        `Topic: ${tp.id} ${tp.name} (${GB.chapters[tp.chapter]}).`);
      if (p.title) L.push(`Book title: ${p.title}.`);
      images.push({ label: 'question', src: p.q.src }); sees.push('question');
      if (p.ctx) { images.push({ label: 'original_problem_for_context', src: byId[p.ctx].q.src }); L.push('This is a follow-up question; original_problem_for_context shows the setup it refers to.'); sees.push('original problem'); }
      const prev = store.probs[p.id];
      if (prev && prev.g.length) L.push(`The student's previous self-grades on this problem (oldest first): ${prev.g.map(g => GRADES[g]).join(', ')}.`);
      L.push(`Time on this problem so far: ${fmt(Date.now() - round.qStart)}.`);
      if (round.hint && p.hint) { images.push({ label: 'book_hint', src: p.hint.src }); L.push('The student opened the book\'s hint (attached as book_hint).'); sees.push('hint'); }
      if (round.revealed) {
        images.push({ label: 'book_solution', src: p.s.src }); sees.push('book solution');
        L.push('The student has REVEALED the book\'s solution (attached as book_solution). You may discuss it openly; the book can be terse or contain typos.');
      } else L.push('The student has NOT revealed the book\'s solution, and you do not have it. Solve from the question itself and do not spoil the final answer unless asked.');
    } else {
      const q = t.q; const src = FERMI.sources[q.s]; const a = fp.answered;
      L.push('PROBLEM CONTEXT',
        'Problem type: Fermi estimation (Science Olympiad style). The student answers with the power of ten, i.e. the exponent of the scientific-notation value (400 = 4×10² → 2). Scoring: exact 5 points, one order off 3, two off 1.',
        `Question: ${plain(q.q)}`, `Source: ${src.name}.`);
      sees.push('question');
      if (!a) L.push('The student has NOT answered yet; the reference answer is withheld. Help them structure the estimate (key quantities, sensible orders of magnitude, sanity checks) without stating the final exponent.');
      else if (a.skipped) { L.push(`The student skipped. Reference exponent: ${q.a} (i.e. about 10^${q.a}).`); sees.push('reference answer'); }
      else { L.push(`The student answered ${a.guess} (${a.d === 0 ? 'exact' : a.d + ' off'}, ${a.pts} points). Reference exponent: ${q.a} (about 10^${q.a}).`); sees.push('your answer', 'reference answer'); }
      if (a) L.push('The reference answer is one accepted estimate and depends on assumptions; if you think it is off, say so and give your own estimate.');
    }
    return { text: L.join('\n'), images, sees };
  }

  function mdHtml(src) {
    const codes = [];
    let s = String(src).replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => { codes.push(c.replace(/\n$/, '')); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
    const html = s.split(/\n{2,}/).map(block => {
      const lines = block.split('\n');
      if (lines.every(l => /^\s*[-*•]\s+/.test(l))) return '<ul>' + lines.map(l => `<li>${l.replace(/^\s*[-*•]\s+/, '')}</li>`).join('') + '</ul>';
      if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) return '<ol>' + lines.map(l => `<li>${l.replace(/^\s*\d+[.)]\s+/, '')}</li>`).join('') + '</ol>';
      return `<p>${lines.join('<br>')}</p>`;
    }).join('');
    return html.replace(/<p>\u0000(\d+)\u0000<\/p>|\u0000(\d+)\u0000/g, (_, a, b) => `<pre><code>${esc(codes[+(a ?? b)])}</code></pre>`);
  }

  const SUGGEST = {
    gb: ['Give me a hint', 'What\'s the key idea here?', 'Check my approach'],
    gbRevealed: ['Walk me through the book\'s solution', 'Why does that step work?', 'Is there a faster way?'],
    fermi: ['How should I break this down?', 'What quantities do I need to estimate?', 'Sanity-check my estimate'],
    fermiDone: ['Why was I off?', 'Walk me through a good estimate']
  };

  const tok = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

  function renderChat() {
    const t = chatTarget(); const log = $('#chatlog'); if (!t) return;
    const ctx = contextFor(t);
    const title = t.kind === 'gb' ? `${topicOf[t.p.topic].id} · ${t.p.title || topicOf[t.p.topic].name}` : `Fermi · ${FERMI.sources[t.q.s].name}`;
    $('#chatctx').textContent = title;
    $('#chatsees').innerHTML = `<span>Claude sees:</span> ${ctx.sees.map(x => `<i>${esc(x)}</i>`).join('')}`;
    const msgs = (chatsOf()[t.key] || { msgs: [] }).msgs;
    const req = chat.req && chat.req.key === t.key ? chat.req : null;
    const busyElsewhere = chat.req && chat.req.key !== t.key;
    let h = '';
    if (bridge && chat.available === false) h += `<div class="chat-note bad">Couldn't find the Claude Code CLI. Install it and sign in (run <code>claude</code> once in Terminal), then reopen this panel.</div>`;
    if (!bridge) h += `<div class="chat-note">Ask Claude runs through your local Claude Code login, so it's available in the <b>Sharpe app</b> (not in a plain browser tab).</div>`;
    if (!msgs.length && !req) {
      const key = t.kind === 'gb' ? (round.revealed ? 'gbRevealed' : 'gb') : (fp.answered ? 'fermiDone' : 'fermi');
      h += `<div class="chat-empty"><p>Ask anything about <b>this problem</b>. Claude has it in front of it${t.kind === 'gb' ? ', including the page scan' : ''}.</p><div class="sugg">${SUGGEST[key].map(x => `<button data-action="chat-suggest" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`;
    }
    h += msgs.map(m => `<div class="msg ${m.role}">${m.role === 'user' ? `<p>${esc(m.text)}</p>` : m.role === 'error' ? `<p>${esc(m.text)}</p>` : mdHtml(m.text) + (m.usage ? `<div class="usage">${tok(m.usage.i)} in · ${tok(m.usage.o)} out</div>` : '')}</div>`).join('');
    if (req) h += `<div class="msg assistant live">${req.text ? mdHtml(req.text) : ''}${req.status ? `<div class="status"><span class="pulse"></span>${esc(req.status)}</div>` : '<span class="caret"></span>'}</div>`;
    if (busyElsewhere) h += `<div class="chat-note">Claude is still answering your previous question…</div>`;
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.innerHTML = h;
    if (near || req) log.scrollTop = log.scrollHeight;
    $('#chatsend').hidden = !!chat.req; $('#chatstop').hidden = !chat.req;
    $('#chatin').disabled = !bridge;
  }

  function chatSync() {
    const t = chatTarget();
    const btn = $('#askbtn'); btn.hidden = !t;
    const show = !!t && chat.open;
    document.body.classList.toggle('chat-open', show);
    $('#chat').hidden = !show;
    btn.setAttribute('aria-pressed', show);
    if (show) { renderChat(); if (bridge && chat.available === undefined) bridge.postMessage({ type: 'probe', id: 'probe' }); }
  }
  function toggleChat(force) {
    chat.open = force === undefined ? !chat.open : force; store.settings.chatOpen = chat.open; save(); chatSync();
    if (chat.open && chatTarget()) setTimeout(() => $('#chatin').focus(), 30);
  }

  function sendChat(text) {
    text = String(text || '').trim(); const t = chatTarget();
    if (!text || !t || chat.req || !bridge) return;
    const entry = (chatsOf()[t.key] ||= { msgs: [] });
    const ctx = contextFor(t);
    const transcript = entry.msgs.filter(m => m.role !== 'error').slice(-8).map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n\n');
    const prompt = `${ctx.text}\n\n${transcript ? 'Conversation so far:\n\n' + transcript + '\n\n' : ''}Student: ${text}`;
    entry.msgs.push({ role: 'user', text });
    const id = 'r' + Date.now().toString(36);
    chat.req = { id, key: t.key, text: '', status: 'Thinking…', stopped: false };
    $('#chatin').value = ''; autoGrow();
    save(); renderChat();
    bridge.postMessage({ type: 'ask', id, system: TUTOR, prompt, images: ctx.images });
  }

  function finishReq(code, stderr) {
    const r = chat.req; if (!r) return; chat.req = null;
    const entry = (chatsOf()[r.key] ||= { msgs: [] });
    if (r.error) entry.msgs.push({ role: 'error', text: r.error });
    else if (r.text) entry.msgs.push({ role: 'assistant', text: r.text + (r.stopped ? '\n\n(stopped)' : ''), usage: r.usage });
    else if (!r.stopped) entry.msgs.push({ role: 'error', text: (stderr || '').trim() || `Claude exited with code ${code} without an answer.` });
    entry.msgs = entry.msgs.slice(-40);
    const keys = Object.keys(chatsOf()); if (keys.length > 40) keys.slice(0, keys.length - 40).forEach(k => delete chatsOf()[k]);
    save(); if (chatTarget()) renderChat();
  }

  window.__sharpeClaude = (id, line) => {
    let o; try { o = JSON.parse(line); } catch (e) { return; }
    if (id === 'probe') { if (o.type === '__probe') { chat.available = !!o.ok; if (chat.open && chatTarget()) renderChat(); } return; }
    const r = chat.req; if (!r || r.id !== id) return;
    if (o.type === 'stream_event') {
      const e = o.event || {};
      if (e.type === 'content_block_start' && e.content_block) r.status = e.content_block.type === 'tool_use' ? 'Reading the problem…' : e.content_block.type === 'thinking' ? 'Thinking…' : r.status;
      else if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta') { r.text += e.delta.text; r.status = ''; }
      renderChat();
    } else if (o.type === 'assistant') {
      if (!r.text) { const t = ((o.message && o.message.content) || []).filter(c => c.type === 'text').map(c => c.text).join(''); if (t) { r.text = t; r.status = ''; renderChat(); } }
    } else if (o.type === 'result') {
      if (o.is_error) r.error = String(o.result || 'Claude returned an error.'); else if (!r.text && o.result) r.text = String(o.result);
      const u = o.usage;
      if (u) r.usage = { i: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), o: u.output_tokens || 0 };
    } else if (o.type === '__error') { r.error = o.message; finishReq(1, ''); }
    else if (o.type === '__exit') finishReq(o.code, o.stderr);
  };

  const autoGrow = () => { const t = $('#chatin'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 140) + 'px'; t.style.overflowY = t.scrollHeight + 2 > 140 ? 'auto' : 'hidden'; };
  $('#chatform').addEventListener('submit', e => { e.preventDefault(); sendChat($('#chatin').value); });
  $('#chatin').addEventListener('input', autoGrow);
  $('#chatin').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat($('#chatin').value); }
    else if (e.key === 'Escape') e.target.blur();
  });

  /* ═══════════════ ROUTER ═══════════════ */
  const views = {
    hub: renderHub, 'gb-home': renderGbHome, 'gb-quiz': renderQuiz, 'gb-summary': renderSummary,
    'sprint-setup': () => renderSetup(sprintKind), 'sprint-play': renderPlay, 'sprint-result': renderResult,
    'fermi-setup': renderFermiSetup, 'fermi-play': renderFermiPlay, 'fermi-result': renderFermiResult
  };
  function render() {
    $('.stepper').hidden = !view.startsWith('gb');
    if (view !== 'sprint-play' && view !== 'gb-quiz') stopTimers();
    if (view === 'sprint-play') $('.stepper').hidden = true;
    views[view]();
    chatSync();
  }
  const go = v => { view = v; render(); };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]'); if (!b) return;
    switch (b.dataset.action) {
      case 'hub': case 'home': go('hub'); break;
      case 'mode-arith': sprintKind = 'arith'; go('sprint-setup'); break;
      case 'mode-facts': sprintKind = 'facts'; go('sprint-setup'); break;
      case 'mode-gb': go('gb-home'); break;
      case 'mode-fermi': go('fermi-setup'); break;
      case 'fermi-start': startFermi(); break;
      case 'fermi-count': store.fermi.count = +b.dataset.n; save(); render(); break;
      case 'fermi-src': { const o = store.fermi.off; const k = b.dataset.k; store.fermi.off = o.includes(k) ? o.filter(x => x !== k) : o.concat(k); save(); render(); break; }
      case 'fermi-submit': fermiSubmit(); break;
      case 'fermi-skip': fermiSkip(); break;
      case 'fermi-next': fermiNext(); break;
      case 'sprint-setup': go('sprint-setup'); break;
      case 'sprint-start': startSprint(view === 'sprint-result' ? spResult.kind : sprintKind); break;
      case 'dur': store.sprint[sprintKind].dur = +b.dataset.n; save(); render(); break;
      case 'op': { const o = store.sprint.arith[b.dataset.op]; o.on = !o.on; save(); render(); break; }
      case 'cat': { const c = store.sprint.facts.cats; const k = b.dataset.k; store.sprint.facts.cats = c.includes(k) ? c.filter(x => x !== k) : c.concat(k); save(); render(); break; }
      case 'start': round = newRound(); if (round) go('gb-quiz'); break;
      case 'retry': round = mkRound(round.results.filter(r => r.g !== 3).map(r => r.id)); go('gb-quiz'); break;
      case 'count': cfg().count = +b.dataset.n; save(); render(); break;
      case 'timer': cfg().timer = !cfg().timer; save(); render(); break;
      case 'titles': cfg().titles = !cfg().titles; save(); render(); break;
      case 'toggle-topic': { const id = b.dataset.id; const off = cfg().off; cfg().off = off.includes(id) ? off.filter(x => x !== id) : off.concat(id); save(); render(); break; }
      case 'toggle-chapter': {
        const ids = GB.topics.filter(t => t.chapter === +b.dataset.ci).map(t => t.id); const allOn = ids.every(id => !cfg().off.includes(id));
        cfg().off = allOn ? [...new Set(cfg().off.concat(ids))] : cfg().off.filter(x => !ids.includes(x)); save(); render(); break;
      }
      case 'reveal': round.revealed = true; render(); break;
      case 'hint': round.hint = true; render(); break;
      case 'skip': advance(0); break;
      case 'grade': advance(+b.dataset.g); break;
      case 'review': openReview(+b.dataset.i); break;
      case 'close': $('#review').close(); break;
      case 'theme': {
        const cur = document.documentElement.dataset.theme;
        const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        cfg().theme = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = cfg().theme; save(); break;
      }
      case 'chat-toggle': toggleChat(); break;
      case 'chat-close': toggleChat(false); break;
      case 'chat-clear': { const t = chatTarget(); if (t) { delete chatsOf()[t.key]; save(); renderChat(); } break; }
      case 'chat-suggest': sendChat(b.dataset.q); break;
      case 'chat-stop': if (chat.req) { chat.req.stopped = true; bridge.postMessage({ type: 'cancel', id: chat.req.id }); } break;
      case 'scale-up': setScale(cfg().scale + .06); break;
      case 'scale-down': setScale(cfg().scale - .06); break;
    }
  });

  // range inputs: update live, re-render (to normalise) on commit
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-rg]'); if (!el) return;
    const [op, side, i] = el.dataset.rg.split('.'); const v = parseInt(el.value, 10);
    if (Number.isFinite(v)) { store.sprint.arith[op][side][+i] = Math.max(0, Math.min(1e6, v)); save(); }
  });
  document.addEventListener('change', e => { if (e.target.closest('[data-rg]')) render(); });

  $('#review').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { if (chatTarget()) { e.preventDefault(); toggleChat(); } return; }
    if (e.target.closest('textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ($('#review').open || view === 'sprint-play') return;
    const typing = e.target.closest('input, textarea');
    const k = e.key;
    if (!typing && (k === '+' || k === '=') && view.startsWith('gb')) return setScale(cfg().scale + .06);
    if (!typing && (k === '-' || k === '_') && view.startsWith('gb')) return setScale(cfg().scale - .06);
    if (k === 'Enter' && !e.target.closest('button') && !typing) {
      if (view === 'gb-home' || view === 'gb-summary') return $('[data-action="start"]')?.click();
      if (view === 'sprint-setup') return startSprint(sprintKind);
      if (view === 'sprint-result') return startSprint(spResult.kind);
      if (view === 'fermi-setup' || view === 'fermi-result') return startFermi();
      if (view === 'fermi-play' && fp.answered) return fermiNext();
    }
    if (view !== 'gb-quiz') return;
    if (!round.revealed) {
      if (k === ' ' || k === 'Enter') { e.preventDefault(); round.revealed = true; render(); }
      else if (k === 'h' || k === 'H') { if (byId[round.ids[round.i]].hint) { round.hint = true; render(); } }
      else if (k === 's' || k === 'S') advance(0);
    } else if (k === '1' || k === '2' || k === '3') advance(+k);
    else if (k === 'ArrowRight' || k === 'n' || k === 'N') advance(0);
  });

  document.documentElement.style.setProperty('--scale', cfg().scale);
  render();
})();
