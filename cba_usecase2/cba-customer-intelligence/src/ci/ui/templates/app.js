/* ===== Customer Intelligence Hub ===== */
const D = JSON.parse(document.getElementById('data').textContent);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, cls = '') => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
const fmt = n => Math.round(n).toLocaleString('en-AU');
const pc = (x, d = 0) => (x * 100).toFixed(d) + '%';
const BANKS = D.banks, ACC = D.accts, SENT = D.sents, AREAS = D.areas, OTHER = D.other;
const BCOL = ['#FFCC00', '#0A7CC1', '#8B1E3F', '#E4572E'];
const SCOL = ['#1B9E6B', '#D6453D', '#9AA0A6', '#F0A020'];
const PRIM = ['Onboarding', 'Statements', 'Transaction', 'Non Functional'];
const GENERIC = new Set(['Overall app experience (general praise / complaint)', 'Brand, pricing, policy & corporate conduct']);
const LSK = 'cbaci1';
const today = new Date().toISOString().slice(0, 10);

/* ---------- persistence ---------- */
let S = { acct: 'all', primary: 'all', metric: 'neg', role: 'lead', page: 'overview', focus: 'mobile', queue: [], jira: {}, cfg: {}, datasets: [], theme: '', mx: 'All' };
try { const raw = localStorage.getItem(LSK); if (raw) Object.assign(S, JSON.parse(raw)); } catch (e) { }
function save() {
  try {
    const out = JSON.stringify(S);
    if (out.length > 4500000) { toast('Dataset too large to keep after you close this page - it stays for this session.'); const lite = { ...S, datasets: [] }; localStorage.setItem(LSK, JSON.stringify(lite)); return; }
    localStorage.setItem(LSK, out);
  } catch (e) { }
}
function toast(msg) { const t = $('#toast'); t.innerHTML = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }
async function saveFile(filename, data) {
  try {
    const d = await claude.use('downloads');
    if (!d) { toast('Downloads are not available in this view. Use the copy button instead.'); return false; }
    await d.save({ filename, data }); return true;
  } catch (e) { if (e && e.code === 'declined') return false; toast('Could not save the file (' + esc(e && e.code || 'error') + ').'); return false; }
}
async function copyText(t, msg) {
  try { await navigator.clipboard.writeText(t); toast(msg || 'Copied to clipboard'); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg || 'Copied to clipboard'); } catch (_) { toast('Copy failed - select the text manually.'); } ta.remove(); }
}

/* ---------- classifier (port of the workbook rules) ---------- */
const CL = (() => {
  const mk = (p, f = 'gi') => new RegExp(p, f);
  const tax = D.cls.taxonomy.map(([p, s, pats]) => ({ p, s, pats: pats.map(([r, w]) => [mk(r), w]) }));
  const B = {}; for (const k in D.cls.biz) B[k] = mk(D.cls.biz[k]);
  const bankword = mk(D.cls.bankword);
  const otherIdx = AREAS.length - 1;
  const aidx = {}; AREAS.forEach(([p, s], i) => aidx[s] = i);
  const POSW = 'good great excellent love loved easy best helpful fast smooth reliable thanks thank amazing awesome fantastic perfect happy pleased brilliant useful simple convenient quick nice wonderful secure'.split(' ');
  const NEGW = 'bad worst terrible awful useless slow crash crashes crashed broken bug bugs fail failed failing hate horrible poor rubbish garbage disappointing disappointed frustrating frustrated annoying scam fraud blocked locked stuck error waste ridiculous unacceptable pathetic problem problems issue issues complaint unable cannot'.split(' ');
  const NEG = new Set(['not', 'no', 'never', "isn't", "wasn't", "don't", "doesn't", "didn't", "can't", "won't"]);
  function test(re, t) { re.lastIndex = 0; return re.test(t); }
  function count(re, t) { re.lastIndex = 0; const m = t.match(re); return m ? m.length : 0; }
  function acct(t) {
    t = t.replace(B.BIZ_NEG, '');
    const t2 = t.replace(B.BIZ_IDIOM, ' ').replace(B.BIZ_TITLES, ' ');
    const job = test(B.JOB_CHATTER, t);
    if (test(B.SPECIFIC, t2)) return 0;
    if (!job && (test(B.GENERIC_STRONG, t2) || (test(B.OTHER_KW, t2) && !test(B.PERSONAL_EXPLICIT, t2)))) return 0;
    if (test(B.PERSONAL_KW, t)) return 1;
    return 2;
  }
  function area(t, rating) {
    let best = -1, bs = 0;
    tax.forEach((x, i) => {
      let sc = 0; for (const [re, w] of x.pats) sc += w * count(re, t);
      if (x.s.startsWith('Overall app experience')) sc *= .6;
      if (x.s.startsWith('Brand, pricing')) sc *= .8;
      if (sc > bs) { bs = sc; best = aidx[x.s]; }
    });
    if (best < 0) best = rating != null ? aidx['Overall app experience (general praise / complaint)'] : otherIdx;
    if (rating == null && !test(bankword, t)) best = otherIdx;
    return best;
  }
  function sent(t, rating) {
    if (rating != null) return rating >= 4 ? 0 : rating <= 2 ? 1 : 2;
    const w = t.toLowerCase().split(/[^a-z']+/); let sc = 0;
    w.forEach((x, i) => { const neg = NEG.has(w[i - 1]) || NEG.has(w[i - 2]); if (POSW.includes(x)) sc += neg ? -1 : 1; else if (NEGW.includes(x)) sc += neg ? 0.5 : -1; });
    return sc >= 1 ? 0 : sc <= -1 ? 1 : 2;
  }
  return { run: (text, rating) => { const t = String(text || ''); return { acct: acct(t), area: area(t, rating), sent: sent(t, rating) }; } };
})();

/* ---------- parsing helpers for imports ---------- */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
function normDate(v) {
  if (v == null || v === '') return today;
  if (typeof v === 'number') { if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10); if (v > 1e9 && v < 4e9) return new Date(v * 1000).toISOString().slice(0, 10); }
  const s = String(v).trim(); if (/^\d{9,10}$/.test(s)) return new Date(+s * 1000).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const t = Date.parse(s); return isNaN(t) ? today : new Date(t).toISOString().slice(0, 10);
}
const guess = (heads, names) => { const l = heads.map(h => String(h).toLowerCase().trim()); for (const n of names) { const i = l.indexOf(n); if (i >= 0) return i; } for (const n of names) { const i = l.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };

/* ---------- aggregation ---------- */
let A, TB, TA, RT, RTA, SRCM, MONTHS, VROWS;
const mkey = d => String(d).slice(0, 7);
function z() { return [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; }
function rebuild() {
  A = BANKS.map(() => AREAS.map(() => z()));
  TB = BANKS.map(() => ({})); TA = AREAS.map(() => ({})); RT = BANKS.map(() => ({})); RTA = AREAS.map(() => [0, 0]);
  SRCM = {};
  const ms = new Set(D.months);
  for (const [b, a, c, s, n] of D.agg) A[b][a][c][s] += n;
  for (const [b, m, c, s, n] of D.trend) { const k = D.months[m]; (TB[b][k] = TB[b][k] || z())[c][s] += n; }
  for (const [a, m, c, s, n] of D.trendArea) { const k = D.months[m]; (TA[a][k] = TA[a][k] || z())[c][s] += n; }
  for (const [b, m, sum, n] of D.rating) { const k = D.months[m]; const r = RT[b][k] = RT[b][k] || [0, 0]; r[0] += sum; r[1] += n; }
  for (const [a, sum, n] of D.ratingArea) { RTA[a][0] += sum; RTA[a][1] += n; }
  for (const [b, sr, s, n] of D.src) if (b === 0) { const k = D.srcs[sr]; (SRCM[k] = SRCM[k] || [0, 0, 0, 0])[s] += n; }
  VROWS = D.cba.map(r => ({ d: r[0], src: D.srcs[r[1]], r: r[2], c: r[3], a: r[4], s: r[5], t: r[6], user: false }));
  for (const ds of S.datasets) {
    if (ds.off) continue;
    for (const [d, rating, c, a, s, t, src] of ds.rows) {
      const b = ds.bank, k = mkey(d); ms.add(k);
      A[b][a][c][s]++; (TB[b][k] = TB[b][k] || z())[c][s]++;
      if (b === 0) { (TA[a][k] = TA[a][k] || z())[c][s]++; (SRCM[src] = SRCM[src] || [0, 0, 0, 0])[s]++; VROWS.push({ d, src, r: rating, c, a, s, t, user: true }); }
      if (rating != null) { const r = RT[b][k] = RT[b][k] || [0, 0]; r[0] += rating; r[1]++; }
    }
  }
  MONTHS = [...ms].sort();
  VROWS.sort((x, y) => y.d.localeCompare(x.d));
}
const accSet = () => ({ all: [0, 1, 2], Business: [0], Personal: [1], General: [2], BG: [0, 2] }[S.acct] || [0, 1, 2]);
function cell(b, a, acc = accSet()) {
  const c = [0, 0, 0, 0];
  for (const ci of acc) for (let s = 0; s < 4; s++) c[s] += A[b][a][ci][s];
  const n = c[0] + c[1] + c[2] + c[3];
  return { n, pos: c[0], neg: c[1], neu: c[2], mix: c[3], pp: n ? c[0] / n : 0, np: n ? c[1] / n : 0 };
}
function sumCells(list) { const o = { n: 0, pos: 0, neg: 0, neu: 0, mix: 0 }; for (const x of list) for (const k in o) o[k] += x[k]; o.pp = o.n ? o.pos / o.n : 0; o.np = o.n ? o.neg / o.n : 0; return o; }
const compCell = (a, acc) => sumCells([1, 2, 3].map(b => cell(b, a, acc)));
function bankTotal(b, acc = accSet(), skipOther = false) { const l = []; for (let a = 0; a < AREAS.length; a++) { if (skipOther && a === OTHER) continue; l.push(cell(b, a, acc)); } return sumCells(l); }
const TITLES = D.titles;      // injected from config/playbook.json by export_data.py
const EFFORT = D.effort;
const NOMOBILE = new Set(D.nomobile);

function areaRows(acc = accSet(), prim = 'all') {
  const rows = [];
  AREAS.forEach(([p, s], i) => {
    if (i === OTHER) return; if (prim !== 'all' && p !== prim) return;
    const cba = cell(0, i, acc), cmp = compCell(i, acc);
    const cells = [1, 2, 3].map(b => cell(b, i, acc));
    let best = null; cells.forEach((c, k) => { if (c.n >= 10 && (!best || c.pp > best.c.pp)) best = { b: k + 1, c }; });
    const gap = cba.n >= 10 && cmp.n >= 10 ? cba.np - cmp.np : 0;
    rows.push({ i, p, s, cba, cmp, cells, best, gap, raw: cba.n >= 10 ? cba.neg * (1 + Math.max(0, gap) * 2) : 0 });
  });
  const mx = Math.max(1, ...rows.map(r => r.raw)); rows.forEach(r => r.score = Math.round(r.raw / mx * 100));
  return rows;
}
const lastMonths = k => MONTHS.slice(-k);
function momentum(a, acc = accSet()) {
  const m = MONTHS; const cur = m.slice(-3), prev = m.slice(-6, -3);
  const agg = ks => { const c = [0, 0, 0, 0]; for (const k of ks) { const t = TA[a][k]; if (t) for (const ci of acc) for (let s = 0; s < 4; s++) c[s] += t[ci][s]; } const n = c[0] + c[1] + c[2] + c[3]; return { n, np: n ? c[1] / n : 0, neg: c[1] }; };
  const x = agg(cur), y = agg(prev); return { cur: x, prev: y, delta: x.np - y.np, ok: x.n >= 15 && y.n >= 15 };
}
const short = s => s.split(' (')[0].replace(' & ', ' & ');

/* ---------- insights ---------- */
function buildInsights() {
  const acc = accSet(), rows = areaRows(acc), out = [];
  const real = rows.filter(r => !GENERIC.has(r.s));
  const pain = [...real].sort((a, b) => b.cba.neg - a.cba.neg)[0];
  const totNeg = bankTotal(0, acc, true).neg || 1;
  if (pain && pain.cba.neg) out.push({ k: 'pain', tag: 'Biggest pain point', cls: 'c-neg', ic: 'alert', title: `${short(pain.s)} drives ${pc(pain.cba.neg / totNeg)} of negative feedback`, text: `${fmt(pain.cba.neg)} negative CBA comments (${pc(pain.cba.np)} of its ${fmt(pain.cba.n)} mentions). Competitors average ${pc(pain.cmp.np)} negative here.`, a: pain.i });
  const gaps = real.filter(r => r.cba.n >= 30 && r.cmp.n >= 30).sort((a, b) => b.gap - a.gap);
  if (gaps[0] && gaps[0].gap > 0) out.push({ k: 'gap', tag: 'Largest competitor gap', cls: 'c-warn', ic: 'compare', title: `${short(gaps[0].s)}: CBA is ${(gaps[0].gap * 100).toFixed(0)} pts more negative than peers`, text: `${pc(gaps[0].cba.np)} negative at CBA vs ${pc(gaps[0].cmp.np)} across ANZ, NAB and Westpac. This is the widest gap among areas with 30+ comments.`, a: gaps[0].i });
  const adv = real.map(r => ({ r, d: r.best && r.best.c.n >= 15 ? r.best.c.pp - r.cba.pp : -1 })).filter(x => x.d > 0).sort((a, b) => b.d - a.d)[0];
  if (adv) out.push({ k: 'adv', tag: 'Competitor advantage', cls: 'c-info', ic: 'trophy', title: `${BANKS[adv.r.best.b]} leads on ${short(adv.r.s)}`, text: `${pc(adv.r.best.c.pp)} positive at ${BANKS[adv.r.best.b]} vs ${pc(adv.r.cba.pp)} at CBA. See their app features in the area detail.`, a: adv.r.i });
  const str = real.filter(r => r.cba.n >= 30 && r.cmp.n >= 30).sort((a, b) => (b.cba.pp - b.cmp.pp) - (a.cba.pp - a.cmp.pp))[0];
  if (str && str.cba.pp > str.cmp.pp) out.push({ k: 'str', tag: 'Strength to protect', cls: 'c-pos', ic: 'shield', title: `CBA leads on ${short(str.s)}`, text: `${pc(str.cba.pp)} positive vs ${pc(str.cmp.pp)} for competitors across ${fmt(str.cba.n)} CBA comments. Keep investing here.`, a: str.i });
  const mom = real.map(r => ({ r, m: momentum(r.i, acc) })).filter(x => x.m.ok).sort((a, b) => b.m.delta - a.m.delta)[0];
  if (mom && mom.m.delta > 0.02) out.push({ k: 'mom', tag: 'Rising complaints', cls: 'c-neg', ic: 'up', title: `${short(mom.r.s)} complaints rising`, text: `Negative share is ${pc(mom.m.cur.np)} over the last 3 months vs ${pc(mom.m.prev.np)} in the 3 months before (+${(mom.m.delta * 100).toFixed(0)} pts).`, a: mom.r.i });
  else if (mom) out.push({ k: 'mom', tag: 'Momentum', cls: 'c-dark', ic: 'trend', title: 'No area shows a sharp rise in complaints', text: `The largest recent movement is ${short(mom.r.s)} at ${(mom.m.delta * 100).toFixed(0)} pts over the prior 3 months.`, a: mom.r.i });
  const accB = [0], bizRows = areaRows(accB).filter(r => r.cba.n >= 8 && !GENERIC.has(r.s)).sort((a, b) => b.cba.np - a.cba.np);
  if (bizRows[0]) out.push({ k: 'biz', tag: 'Business customers', cls: 'c-dark', ic: 'brief', title: `Business view: ${short(bizRows[0].s)} is the weakest area`, text: `${pc(bizRows[0].cba.np)} negative across ${fmt(bizRows[0].cba.n)} business-tagged comments.${D.text[bizRows[0].i] && D.text[bizRows[0].i].bizrec ? ' ' + D.text[bizRows[0].i].bizrec.replace(/^BUSINESS:\s*/, '').split('. ')[0] + '.' : ''}`, a: bizRows[0].i });
  const mobRows = rows.filter(r => !NOMOBILE.has(r.s) && D.text[r.i]).sort((a, b) => b.score - a.score)[0];
  if (mobRows) out.push({ k: 'mob', tag: 'Top app opportunity', cls: 'c-info', ic: 'phone', title: TITLES[mobRows.s] || short(mobRows.s), text: `Priority score ${mobRows.score}/100. ${D.text[mobRows.i].rec.split('. ')[0].replace(/\.$/, '')}.`, a: mobRows.i, rec: true });
  const order = S.role === 'po' ? ['pain', 'mom', 'mob', 'adv', 'gap', 'str', 'biz'] : ['gap', 'biz', 'str', 'pain', 'mom', 'adv', 'mob'];
  out.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  return out.slice(0, 6);
}
function execText() {
  const acc = accSet(), tot = bankTotal(0, acc), cmp = sumCells([1, 2, 3].map(b => bankTotal(b, acc)));
  const rows = areaRows(acc), real = rows.filter(r => !GENERIC.has(r.s));
  const top = [...real].sort((a, b) => b.cba.neg - a.cba.neg).slice(0, 3);
  const diff = (tot.np - cmp.np) * 100;
  const gaps = real.filter(r => r.cba.n >= 30 && r.cmp.n >= 30).sort((a, b) => b.gap - a.gap)[0];
  const better = real.filter(r => r.cba.n >= 10 && r.cmp.n >= 10 && r.gap < 0).length, total = real.filter(r => r.cba.n >= 10 && r.cmp.n >= 10).length;
  const seg = { all: 'all segments', Business: 'Business customers', Personal: 'Personal customers', General: 'General (unclassified) customers', BG: 'Business and General customers' }[S.acct];
  let t = `<p>Across <b>${fmt(tot.n)}</b> CBA comments from ${seg}, <b>${pc(tot.np)}</b> are negative and <b>${pc(tot.pp)}</b> positive. ANZ, NAB and Westpac combined are <b>${pc(cmp.np)}</b> negative, so CBA is <b>${Math.abs(diff).toFixed(1)} pts ${diff > 0 ? 'more' : 'less'} negative</b> than peers overall.</p>`;
  if (top.length) t += `<p>The heaviest complaint themes are <b>${top.map(r => short(r.s)).join('</b>, <b>')}</b>, together ${fmt(top.reduce((s, r) => s + r.cba.neg, 0))} negative comments. CBA is ahead of the competitor average in <b>${better} of ${total}</b> areas with enough data.</p>`;
  if (gaps && gaps.gap > 0) { const dt = D.text[gaps.i]; t += `<p>The biggest opportunity is <b>${short(gaps.s)}</b>, where CBA trails peers by ${(gaps.gap * 100).toFixed(0)} pts. ${dt ? esc(dt.rec.split('. ')[0].replace(/\.$/, '')) + '.' : ''}</p>`; }
  return t;
}

/* ---------- navigation & shell ---------- */
const PAGES = [['overview', 'Overview', 'dash'], ['competitors', 'Competitors', 'compare'], ['voice', 'Voice of customer', 'chat'], ['recommendations', 'Backlog', 'list'], ['connectors', 'Connectors', 'plug'], ['sources', 'Data sources', 'db']];
function buildNav() {
  $('#nav').innerHTML = PAGES.map(([id, l, i]) => `<button data-p="${id}" aria-current="${S.page === id ? 'page' : 'false'}">${ic(i, 'sm')}${l}${id === 'recommendations' && S.queue.length ? ` <span class="pill y">${S.queue.length}</span>` : ''}</button>`).join('');
  $$('#nav button').forEach(b => b.onclick = () => { location.hash = '#' + b.dataset.p; });
}
function go(p) {
  if (!PAGES.some(x => x[0] === p)) p = 'overview';
  S.page = p; $$('section.page').forEach(s => s.classList.toggle('on', s.id === 'page-' + p)); buildNav(); renderPage(p); window.scrollTo({ top: 0 });
}
function renderPage(p) { ({ overview: renderOverview, competitors: renderCompetitors, voice: renderVoice, recommendations: renderRecs, connectors: renderConnectors, sources: renderSources }[p] || (() => { }))(); }
function rerender() { rebuild(); buildNav(); renderPage(S.page); renderHero(); }
function setTheme(t) { S.theme = t; if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); const dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches); $('#themebtn').innerHTML = ic(dark ? 'sun' : 'moon'); save(); if (window.Chart) { charts.forEach(c => c.destroy()); charts = []; renderPage(S.page); } }
function renderHero() {
  const acc = accSet(); const tot = bankTotal(0, accSet()); const ds = S.datasets.filter(d => !d.off);
  $('#hero-p').textContent = S.role === 'po' ? 'See which app journeys frustrate customers most, what ANZ and NAB ship that CBA customers ask for, and push ready-made stories to your Jira backlog.' : 'Track sentiment by journey and segment, benchmark CBA against ANZ, NAB and Westpac, and decide where the next investment dollar should go.';
  $('#hero-meta').innerHTML = `<span>${ic('chat', 'sm')}${fmt(tot.n)} CBA comments</span><span>${ic('users', 'sm')}3 competitors</span><span>${ic('db', 'sm')}${D.srcs.length + ds.length} sources</span>`;
  $('#asof').textContent = 'Data as of ' + new Date(D.asof + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  $('#role-lead').setAttribute('aria-pressed', S.role === 'lead'); $('#role-po').setAttribute('aria-pressed', S.role === 'po');
}
const ACCCHIPS = [['all', 'All segments'], ['Business', 'Business'], ['Personal', 'Personal'], ['General', 'General'], ['BG', 'Business + General']];
function chips(el, list, key, after) {
  el.innerHTML = list.map(([v, l]) => `<button class="chip" data-v="${esc(v)}" aria-pressed="${S[key] === v}">${esc(l)}</button>`).join('');
  $$('button', el).forEach(b => b.onclick = () => { S[key] = b.dataset.v; save(); after(); renderHero(); });
}

/* ---------- charts ---------- */
let charts = [];
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function mkChart(id, cfg) {
  if (!window.Chart) { const c = $('#' + id); if (c) c.parentElement.innerHTML = '<div class="empty">Charts could not load.</div>'; return null; }
  const ch = new Chart($('#' + id), cfg); charts.push(ch); return ch;
}
function chartBase() { if (!window.Chart) return { ink: '#111', line: '#ddd', muted: '#666' }; const ink = cssv('--ink'), line = cssv('--line'), muted = cssv('--muted'); Chart.defaults.color = muted; Chart.defaults.font.family = "'Inter',system-ui,sans-serif"; Chart.defaults.borderColor = line; return { ink, line, muted }; }

/* ---------- OVERVIEW ---------- */
function renderOverview() {
  charts.forEach(c => c.destroy()); charts = [];
  const acc = accSet(); const tot = bankTotal(0, acc), cmp = sumCells([1, 2, 3].map(b => bankTotal(b, acc)));
  const diff = (tot.np - cmp.np) * 100;
  const rt = bi => { let s = 0, n = 0; for (const k in RT[bi]) { s += RT[bi][k][0]; n += RT[bi][k][1]; } return n ? s / n : 0; };
  const rows = areaRows(acc); const behind = rows.filter(r => r.cba.n >= 10 && r.cmp.n >= 10 && r.gap > 0.02).length;
  const mom = (() => { const c = lastMonths(3), p = MONTHS.slice(-6, -3); const f = ks => { const x = [0, 0, 0, 0]; for (const k of ks) { const t = TB[0][k]; if (t) for (const ci of acc) for (let s = 0; s < 4; s++) x[s] += t[ci][s]; } const n = x[0] + x[1] + x[2] + x[3]; return n ? x[1] / n : 0; }; return f(c) - f(p); })();
  $('#kpis').innerHTML = [
    ['chat', fmt(tot.n), 'CBA comments analysed', `<span class="flat">${fmt(tot.n + cmp.n)} incl. competitors</span>`],
    ['alert', pc(tot.np), 'Negative sentiment', `<span class="${diff > 0 ? 'up' : 'down'}">${ic(diff > 0 ? 'up' : 'down', 'sm')}${Math.abs(diff).toFixed(1)} pts ${diff > 0 ? 'above' : 'below'} peers</span>`],
    ['star', rt(0).toFixed(2), 'CBA average star rating', `<span class="flat">ANZ ${rt(1).toFixed(2)} · NAB ${rt(2).toFixed(2)} · WBC ${rt(3).toFixed(2)}</span>`],
    ['target', fmt(behind), 'Areas where CBA trails peers', `<span class="${mom > 0.01 ? 'up' : mom < -0.01 ? 'down' : 'flat'}">${ic(mom > 0 ? 'up' : 'down', 'sm')}Negative share ${mom >= 0 ? '+' : ''}${(mom * 100).toFixed(1)} pts vs prior 3 months</span>`]
  ].map(([i, v, l, d]) => `<div class="card kpi"><div class="ico">${ic(i, 'lg')}</div><div><div class="v">${v}</div><div class="l">${l}</div><div class="d">${d}</div></div></div>`).join('');
  chips($('#ov-acct'), ACCCHIPS, 'acct', () => { renderOverview(); });
  const ins = buildInsights();
  $('#insights').innerHTML = ins.map((x, k) => `<div class="card ins" data-i="${k}" tabindex="0" role="button"><div class="ico ${x.cls}">${ic(x.ic)}</div><div><div class="tag">${esc(x.tag)}</div><h4>${esc(x.title)}</h4><p>${esc(x.text)}</p><div class="go">${x.rec ? 'See recommendation' : 'Open area details'} ${ic('arrow', 'sm')}</div></div></div>`).join('') || '<div class="empty">Not enough data in this segment for insights.</div>';
  $$('#insights .ins').forEach(el => { const x = ins[+el.dataset.i]; const f = () => openArea(x.a); el.onclick = f; el.onkeydown = e => { if (e.key === 'Enter') f(); }; });
  $('#exec-text').innerHTML = execText();
  const b = chartBase();
  /* trend */
  const ms = MONTHS.slice(-12);
  const trendSeries = fn => ms.map(k => { const x = [0, 0, 0, 0]; fn(k, x); const n = x[0] + x[1] + x[2] + x[3]; return n >= 30 ? +(x[1] / n * 100).toFixed(1) : null; });
  const sumB = (bi, k, x) => { const t = TB[bi][k]; if (t) for (const ci of acc) for (let s = 0; s < 4; s++) x[s] += t[ci][s]; };
  mkChart('ch-trend', { type: 'line', data: { labels: ms.map(k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }); }), datasets: [{ label: 'CBA', data: trendSeries((k, x) => sumB(0, k, x)), borderColor: '#E6B800', backgroundColor: '#FFCC00', borderWidth: 3, tension: .3, pointRadius: 4, spanGaps: true }, { label: 'ANZ + NAB + Westpac', data: trendSeries((k, x) => { for (const bi of [1, 2, 3]) sumB(bi, k, x); }), borderColor: b.muted, borderDash: [6, 4], borderWidth: 2, tension: .3, pointRadius: 3, spanGaps: true }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y}% negative` } } }, scales: { y: { ticks: { callback: v => v + '%' }, beginAtZero: true } } } });
  /* donut */
  mkChart('ch-donut', { type: 'doughnut', data: { labels: SENT, datasets: [{ data: [tot.pos, tot.neg, tot.neu, tot.mix], backgroundColor: SCOL, borderWidth: 2, borderColor: cssv('--surface') }] }, options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
  /* pain */
  const pain = rows.filter(r => !GENERIC.has(r.s)).sort((a, b) => b.cba.neg - a.cba.neg).slice(0, 10);
  mkChart('ch-pain', { type: 'bar', data: { labels: pain.map(r => short(r.s)), datasets: [{ label: 'Negative comments', data: pain.map(r => r.cba.neg), backgroundColor: '#D6453D', borderRadius: 6 }, { label: 'Positive comments', data: pain.map(r => r.cba.pos), backgroundColor: '#1B9E6B', borderRadius: 6 }] }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { beginAtZero: true } }, onClick: (e, els) => { if (els.length) openArea(pain[els[0].index].i); }, onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; } } });
  /* rating */
  mkChart('ch-rating', { type: 'bar', data: { labels: BANKS, datasets: [{ data: BANKS.map((_, i) => +rt(i).toFixed(2)), backgroundColor: BCOL, borderRadius: 8, borderColor: '#111', borderWidth: 1 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 1, max: 5 } } } });
  /* sources */
  const srcs = Object.entries(SRCM).map(([k, v]) => [k, v, v.reduce((a, c) => a + c, 0)]).sort((a, c) => c[2] - a[2]).slice(0, 7);
  mkChart('ch-src', { type: 'bar', data: { labels: srcs.map(x => x[0].replace('Reddit r/', 'r/')), datasets: SENT.map((s, i) => ({ label: s, data: srcs.map(x => x[1][i]), backgroundColor: SCOL[i] })) }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true } } } });
  initAI();
}
async function initAI() {
  const btn = $('#ai-btn'); let sample = null; try { sample = await claude.use('sample'); } catch (e) { }
  if (!sample) { btn.hidden = true; return; } btn.hidden = false;
  btn.onclick = async () => {
    const out = $('#ai-out'); out.hidden = false; out.textContent = 'Thinking…'; btn.disabled = true;
    const rows = areaRows().filter(r => r.cba.n >= 10).sort((a, b) => b.score - a.score).slice(0, 8).map(r => `${r.s}: CBA n=${r.cba.n}, ${pc(r.cba.np)} negative, peers ${pc(r.cmp.np)} negative, score ${r.score}`).join('\n');
    const prompt = `You are advising a bank's Banking Portfolio Lead and App Product Owner. Using only the data below, write a briefing of at most 180 words: 3 bullet findings, then 3 prioritised actions for the mobile app. No preamble.\n\nSegment: ${S.acct}\nSummary: ${$('#exec-text').innerText}\nTop areas by priority:\n${rows}`;
    try { await sample(prompt, { onText: ({ text }) => { out.textContent = text; }, modelTier: 'default' }); } catch (e) { out.textContent = e && e.code === 'not_granted' ? 'Claude briefing was not enabled for this view.' : 'The briefing could not be generated right now.'; }
    btn.disabled = false;
  };
}

/* ---------- COMPETITORS ---------- */
function renderCompetitors() {
  charts.forEach(c => c.destroy()); charts = [];
  chips($('#c-acct'), ACCCHIPS, 'acct', renderCompetitors);
  chips($('#c-prim'), [['all', 'All categories'], ...PRIM.map(p => [p, p])], 'primary', renderCompetitors);
  chips($('#c-metric'), [['neg', '% negative'], ['pos', '% positive'], ['vol', 'Volume']], 'metric', renderCompetitors);
  const acc = accSet(), rows = areaRows(acc, S.primary); const maxN = Math.max(1, ...rows.flatMap(r => [r.cba, ...r.cells].map(c => c.n)));
  const col = (c, m) => { if (c.n < 10) return 'background:var(--soft);color:var(--muted)'; if (m === 'neg') return `background:rgba(214,69,61,${(.08 + .6 * Math.min(1, c.np / .7)).toFixed(2)})`; if (m === 'pos') return `background:rgba(27,158,107,${(.08 + .6 * Math.min(1, c.pp / .7)).toFixed(2)})`; return `background:rgba(255,204,0,${(.12 + .75 * c.n / maxN).toFixed(2)})`; };
  const val = (c, m) => c.n < 10 ? '–' : m === 'neg' ? pc(c.np) : m === 'pos' ? pc(c.pp) : fmt(c.n);
  let h = `<thead><tr><th>Area</th>${BANKS.map((b, i) => `<th><span class="dotbank" style="background:${BCOL[i]};${i === 0 ? 'border:1px solid #111' : ''}"></span>${b}</th>`).join('')}<th>CBA vs peers</th></tr></thead><tbody>`;
  let grp = '';
  rows.forEach(r => {
    if (r.p !== grp) { grp = r.p; h += `<tr class="grp"><td colspan="6">${esc(grp)}</td></tr>`; }
    const all = [r.cba, ...r.cells]; let bestI = -1;
    if (S.metric !== 'vol') { const ok = all.map((c, i) => [c, i]).filter(x => x[0].n >= 10); if (ok.length > 1) bestI = ok.reduce((a, x) => (S.metric === 'neg' ? x[0].np < a[0].np : x[0].pp > a[0].pp) ? x : a)[1]; }
    h += `<tr class="row" data-a="${r.i}" tabindex="0"><td><b>${esc(short(r.s))}</b></td>${all.map((c, i) => `<td class="cell" style="${col(c, S.metric)}">${val(c, S.metric)}${bestI === i ? `<span class="best">${ic('trophy', 'sm')}</span>` : ''}<small>n=${fmt(c.n)}</small></td>`).join('')}<td class="cell">${r.cba.n >= 10 && r.cmp.n >= 10 ? `<span class="${r.gap > 0 ? 'up' : 'down'}">${r.gap > 0 ? '+' : ''}${(r.gap * 100).toFixed(0)} pts</span>` : '–'}</td></tr>`;
  });
  $('#heat').innerHTML = h + '</tbody>';
  $$('#heat tr.row').forEach(tr => { tr.onclick = () => openArea(+tr.dataset.a); tr.onkeydown = e => { if (e.key === 'Enter') openArea(+tr.dataset.a); }; });
  /* position list */
  const bt = BANKS.map((_, b) => bankTotal(b, acc, true)); const maxNp = Math.max(.01, ...bt.map(x => x.np));
  const real = rows.filter(r => r.cba.n >= 10 && r.cmp.n >= 10), bet = real.filter(r => r.gap < 0).length;
  $('#pos-sub').textContent = `CBA beats the competitor average in ${bet} of ${real.length} areas shown.`;
  $('#pos-list').innerHTML = bt.map((x, i) => `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700"><span><span class="dotbank" style="background:${BCOL[i]}"></span>${BANKS[i]}</span><span>${pc(x.np)} negative · ${pc(x.pp)} positive</span></div><div style="height:10px;background:var(--soft);border-radius:99px;overflow:hidden;margin-top:5px"><div style="height:100%;width:${(x.np / maxNp * 100).toFixed(0)}%;background:${BCOL[i]}"></div></div><small style="color:var(--muted)">${fmt(x.n)} comments</small></div>`).join('');
  const b = chartBase();
  const pr = PRIM.map(p => { const idx = AREAS.map((a, i) => [a[0], i]).filter(x => x[0] === p && x[1] !== OTHER).map(x => x[1]); return BANKS.map((_, bi) => { const c = sumCells(idx.map(i => cell(bi, i, acc))); return +(c.np * 100).toFixed(1); }); });
  mkChart('ch-prim', { type: 'bar', data: { labels: PRIM, datasets: BANKS.map((bn, bi) => ({ label: bn, data: pr.map(r => r[bi]), backgroundColor: BCOL[bi], borderRadius: 5, borderColor: bi === 0 ? '#111' : 'transparent', borderWidth: bi === 0 ? 1 : 0 })) }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: v => v + '%' }, beginAtZero: true } } } });
  /* matrix */
  const themes = ['All', ...new Set(D.matrix.map(r => r[0]))];
  chips($('#mx-theme'), themes.map(t => [t, t]), 'mx', renderCompetitors);
  const mr = D.matrix.filter(r => S.mx === 'All' || r[0] === S.mx);
  $('#matrix').innerHTML = `<thead><tr><th>Theme</th><th>Feature</th><th>ANZ</th><th>NAB</th><th>Westpac (NZ, indicative)</th><th>Source</th></tr></thead><tbody>${mr.map(r => `<tr><td><span class="pill">${esc(r[0])}</span></td><td><b>${esc(r[1])}</b></td>${[2, 3, 4].map(k => `<td class="${r[k].startsWith('-') ? 'no' : ''}">${r[k] === '-' ? '–' : esc(r[k])}</td>`).join('')}<td style="color:var(--muted);font-size:12px">${esc(r[5])}</td></tr>`).join('')}</tbody>`;
}

/* ---------- AREA DRAWER ---------- */
let drawerTab = 0;
function openArea(i) {
  const [prim, name] = AREAS[i], dt = D.text[i] || {}; const acc = accSet();
  const cba = cell(0, i, acc), cmp = compCell(i, acc), cells = [1, 2, 3].map(b => cell(b, i, acc)), gap = cba.n >= 10 && cmp.n >= 10 ? cba.np - cmp.np : 0;
  const best = cells.map((c, k) => ({ b: k + 1, c })).filter(x => x.c.n >= 10).sort((a, b) => b.c.pp - a.c.pp)[0];
  const mo = momentum(i, acc); const inQ = S.queue.includes(name);
  const dyn = [];
  if (cba.n) dyn.push(`<div class="callout ${gap > 0.02 ? 'neg' : gap < -0.02 ? 'pos' : ''}"><b>${fmt(cba.n)}</b> CBA comments in this segment: <b>${pc(cba.np)}</b> negative and <b>${pc(cba.pp)}</b> positive. ${cmp.n >= 10 ? `Peers sit at ${pc(cmp.np)} negative, so CBA is <b>${Math.abs(gap * 100).toFixed(0)} pts ${gap > 0 ? 'worse' : 'better'}</b>.` : 'Too few competitor comments to benchmark.'}</div>`);
  if (best && best.c.pp > cba.pp) dyn.push(`<div class="callout info"><b>${BANKS[best.b]}</b> is the competitor to watch here with ${pc(best.c.pp)} positive (n=${fmt(best.c.n)}).</div>`);
  if (mo.ok) dyn.push(`<div class="callout ${mo.delta > 0.02 ? 'neg' : mo.delta < -0.02 ? 'pos' : ''}">Over the last 3 months the negative share is <b>${pc(mo.cur.np)}</b> vs <b>${pc(mo.prev.np)}</b> before${Math.abs(mo.delta) < 0.02 ? ' - broadly stable' : mo.delta > 0 ? ' - <b>rising</b>' : ' - <b>improving</b>'}.</div>`);
  const feat = (dt.feat || '').split(/(?=(?:ANZ|NAB Connect|NAB|Westpac NZ \(indicative\)):)/).map(s => s.trim()).filter(Boolean);
  const biz = (S.acct === 'Business' || S.acct === 'BG' || S.acct === 'all') && dt.bizintel;
  const dr = $('#drawer');
  dr.innerHTML = `<div class="dh"><small>${esc(prim)}</small><h3>${esc(name)}</h3><button class="x" aria-label="Close" id="d-x">${ic('x')}</button></div><div class="db">
    <div class="minis"><div class="mini"><b>${fmt(cba.n)}</b><span>CBA comments</span></div><div class="mini"><b style="color:var(--neg)">${pc(cba.np)}</b><span>negative</span></div><div class="mini"><b style="color:var(--pos)">${pc(cba.pp)}</b><span>positive</span></div><div class="mini"><b>${cmp.n >= 10 ? (gap > 0 ? '+' : '') + (gap * 100).toFixed(0) : '–'}</b><span>pts vs peers</span></div></div>
    ${dyn.join('')}
    <div class="sec-t">${ic('compare', 'sm')}Bank comparison</div>
    <div style="display:grid;gap:8px">${[cba, ...cells].map((c, k) => `<div style="display:grid;grid-template-columns:86px 1fr 90px;gap:10px;align-items:center;font-size:13px"><b><span class="dotbank" style="background:${BCOL[k]}"></span>${BANKS[k]}</b><div style="display:flex;height:12px;border-radius:99px;overflow:hidden;background:var(--soft)"><div style="width:${c.n ? c.pp * 100 : 0}%;background:var(--pos)"></div><div style="width:${c.n ? c.neu / c.n * 100 : 0}%;background:var(--neu)"></div><div style="width:${c.n ? c.mix / c.n * 100 : 0}%;background:var(--mix)"></div><div style="width:${c.n ? c.np * 100 : 0}%;background:var(--neg)"></div></div><span style="text-align:right;color:var(--muted)">${c.n >= 10 ? pc(c.np) + ' neg' : 'n<10'}</span></div>`).join('')}</div>
    <div class="sec-t">${ic('chat', 'sm')}What CBA customers say</div>
    <div class="callout pos"><b>Positives.</b> ${esc(dt.pos || '')}</div><div class="callout neg"><b>Negatives.</b> ${esc(dt.neg || '')}</div>
    <div class="sec-t">${ic('users', 'sm')}Voice of customer</div>
    <div class="tabs2" id="d-tabs">${BANKS.map((b, k) => `<button data-k="${k}" aria-pressed="${drawerTab === k}">${b}</button>`).join('')}</div><div id="d-quotes"></div>
    <div class="sec-t">${ic('trophy', 'sm')}What competitors offer</div><div class="callout">${esc(dt.comp || '')}</div>${biz ? `<div class="callout info"><b>Business customers.</b> ${esc(dt.bizintel)}</div>` : ''}
    <div class="sec-t">${ic('phone', 'sm')}Competitor mobile app features</div>${feat.length ? feat.map(f => { const m = f.match(/^([^:]+):\s*(.*)$/); return m ? `<div class="quote"><span class="pill y">${esc(m[1])}</span> ${esc(m[2])}</div>` : `<div class="quote">${esc(f)}</div>`; }).join('') : '<div class="quote">No mobile feature coverage for this area.</div>'}
    <div class="sec-t">${ic('target', 'sm')}Recommended actions</div>
    <div class="callout pos"><b>For the app.</b> ${esc(dt.rec || '')}</div>${S.acct !== 'Personal' && D.text[i] && D.text[i].bizrec ? `<div class="callout info">${esc(D.text[i].bizrec)}</div>` : ''}<div class="callout">${esc(dt.imp || '')}</div>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn y" id="d-add" ${i === OTHER ? 'disabled' : ''}>${ic(inQ ? 'check' : 'plus', 'sm')}${inQ ? 'In Jira queue' : 'Add to Jira queue'}</button><button class="btn ghost" id="d-voice">${ic('chat', 'sm')}See all CBA comments</button></div>
  </div>`;
  const quotes = () => {
    const ex = (D.ex[`${BANKS[drawerTab]}|${i}`]) || { pos: [], neg: [] };
    let q = [];
    if (drawerTab === 0) { const rows = VROWS.filter(r => r.a === i && acc.includes(r.c) && r.t.length > 40 && r.t.length < 260); const pos = rows.filter(r => r.s === 0).slice(0, 2), neg = rows.filter(r => r.s === 1).slice(0, 3); q = [...neg.map(r => ['neg', r.d, r.src, r.t]), ...pos.map(r => ['pos', r.d, r.src, r.t])]; }
    else q = [...ex.neg.map(r => ['neg', r[0], D.srcs[r[1]], r[2]]), ...ex.pos.map(r => ['pos', r[0], D.srcs[r[1]], r[2]])];
    $('#d-quotes').innerHTML = q.length ? q.map(([t, d, s, x]) => `<div class="quote"><span class="pill ${t}">${t === 'neg' ? 'Negative' : 'Positive'}</span> ${esc(x)}<small>${esc(s)} · ${esc(d)}</small></div>`).join('') : '<div class="quote">No examples available.</div>';
  };
  quotes();
  $$('#d-tabs button').forEach(b => b.onclick = () => { drawerTab = +b.dataset.k; $$('#d-tabs button').forEach(x => x.setAttribute('aria-pressed', x === b)); quotes(); });
  $('#d-x').onclick = closeDrawer; $('#d-add').onclick = () => { toggleQueue(name); openArea(i); };
  $('#d-voice').onclick = () => { closeDrawer(); VS.area = i; location.hash = '#voice'; };
  $('#overlay').classList.add('on'); dr.classList.add('on'); dr.setAttribute('aria-hidden', 'false'); dr.scrollTop = 0;
}
function closeDrawer() { $('#overlay').classList.remove('on'); $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); }
function toggleQueue(name) { const k = S.queue.indexOf(name); if (k >= 0) S.queue.splice(k, 1); else S.queue.push(name); save(); buildNav(); toast(k >= 0 ? 'Removed from the Jira queue' : `Added to the Jira queue (<b>${S.queue.length}</b>)`); }

/* ---------- VOICE ---------- */
const VS = { q: '', area: -1, sent: -1, acct: -1, src: '', page: 0 };
function vFiltered() { const q = VS.q.toLowerCase(); return VROWS.filter(r => (VS.area < 0 || r.a === VS.area) && (VS.sent < 0 || r.s === VS.sent) && (VS.acct < 0 || r.c === VS.acct) && (!VS.src || r.src === VS.src) && (!q || r.t.toLowerCase().includes(q))); }
function renderVoice() {
  $('#v-area').innerHTML = '<option value="-1">All areas</option>' + AREAS.map(([p, s], i) => `<option value="${i}">${esc(i === OTHER ? 'Other / unclassified' : s)}</option>`).join('');
  const srcs = [...new Set(VROWS.map(r => r.src))].sort(); $('#v-src').innerHTML = '<option value="">All sources</option>' + srcs.map(s => `<option>${esc(s)}</option>`).join('');
  $('#v-area').value = VS.area; $('#v-sent').value = VS.sent; $('#v-acct').value = VS.acct; $('#v-src').value = VS.src; $('#v-q').value = VS.q;
  drawVoice();
}
function drawVoice() {
  const rows = vFiltered(), per = 25, pages = Math.max(1, Math.ceil(rows.length / per)); VS.page = Math.min(VS.page, pages - 1);
  const sl = rows.slice(VS.page * per, VS.page * per + per);
  $('#v-table').innerHTML = `<thead><tr><th>Date</th><th>Source</th><th>Rating</th><th>Segment</th><th>Area</th><th>Sentiment</th><th style="min-width:380px">Comment</th></tr></thead><tbody>${sl.map(r => `<tr><td>${esc(r.d)}</td><td>${esc(r.src)}${r.user ? ' <span class="pill y">imported</span>' : ''}</td><td>${r.r ? '★'.repeat(r.r) : '–'}</td><td>${ACC[r.c]}</td><td>${esc(r.a === OTHER ? 'Other' : short(AREAS[r.a][1]))}</td><td><span class="pill ${['pos', 'neg', 'neu', 'mix'][r.s]}">${SENT[r.s]}</span></td><td>${esc(r.t)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No comments match.</td></tr>'}</tbody>`;
  $('#v-count').textContent = `${fmt(rows.length)} comments · page ${VS.page + 1} of ${pages}`;
  $('#v-prev').disabled = VS.page === 0; $('#v-next').disabled = VS.page >= pages - 1;
}
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');

/* ---------- RECOMMENDATIONS ---------- */
function recItems() {
  const acc = accSet(); let rows = areaRows(acc).filter(r => r.cba.n >= 10 && D.text[r.i] && !r.s.startsWith('Overall app experience'));
  if (S.focus === 'mobile') rows = rows.filter(r => !NOMOBILE.has(r.s));
  return rows.sort((a, b) => b.score - a.score);
}
function acs(i) { const t = D.text[i]; const parts = (t.rec + ' ' + (S.acct !== 'Personal' ? t.bizrec.replace(/^BUSINESS:\s*/, '') : '')).split(/(?<=\.)\s+|;\s+/).map(s => s.trim()).filter(s => s.length > 20).map(s => s.charAt(0).toUpperCase() + s.slice(1)); return parts.slice(0, 4); }
function renderRecs() {
  chips($('#r-focus'), [['mobile', 'Mobile app focus'], ['all', 'All areas']], 'focus', renderRecs);
  chips($('#r-acct'), ACCCHIPS, 'acct', renderRecs);
  const items = recItems();
  $('#recs').innerHTML = items.map((r, k) => {
    const name = r.s, dt = D.text[r.i], q = S.queue.includes(name);
    return `<div class="card rec"><div><div class="ring" style="--p:${r.score}"><span>${r.score}</span></div><div style="text-align:center;font-size:10.5px;color:var(--muted);margin-top:4px;font-weight:700">PRIORITY</div></div>
      <div><div style="color:var(--muted);font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">#${k + 1} · ${esc(r.p)}</div><h4>${esc(TITLES[name] || short(name))}</h4>
      <div class="meta"><span class="pill neg">${fmt(r.cba.neg)} negative comments</span><span class="pill">${pc(r.cba.np)} negative</span><span class="pill ${r.gap > 0.02 ? 'neg' : 'pos'}">${r.cmp.n >= 10 ? (r.gap > 0 ? '+' : '') + (r.gap * 100).toFixed(0) + ' pts vs peers' : 'no peer data'}</span><span class="pill y">Effort ${EFFORT[name] || 'M'}</span>${r.best && r.best.c.pp > r.cba.pp ? `<span class="pill">${ic('trophy', 'sm')} ${BANKS[r.best.b]} leads</span>` : ''}</div>
      <p><b>Problem.</b> ${esc(dt.neg)}</p><p><b>Benchmark.</b> ${esc((dt.feat || dt.comp).split('. ')[0])}.</p>
      <ul>${acs(r.i).map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>
      <div class="act" style="display:flex;flex-direction:column;gap:8px;align-items:flex-end"><label style="display:flex;gap:8px;align-items:center;font-weight:700;font-size:13px"><input type="checkbox" class="chk" data-n="${esc(name)}" ${q ? 'checked' : ''}>Add to Jira</label><button class="btn ghost sm" data-a="${r.i}">Details</button></div></div>`;
  }).join('') || '<div class="card empty">No recommendations for this segment yet - try “All segments”.</div>';
  $$('#recs .chk').forEach(c => c.onchange = () => { const n = c.dataset.n; const has = S.queue.includes(n); if (c.checked && !has) S.queue.push(n); if (!c.checked && has) S.queue.splice(S.queue.indexOf(n), 1); save(); buildNav(); qBtn(); });
  $$('#recs [data-a]').forEach(b => b.onclick = () => openArea(+b.dataset.a));
  $('#r-all').onclick = () => { items.slice(0, 5).forEach(r => { if (!S.queue.includes(r.s)) S.queue.push(r.s); }); save(); buildNav(); renderRecs(); };
  $('#r-jira').onclick = () => { location.hash = '#connectors'; };
  qBtn();
}
function qBtn() { $('#r-jira-t').textContent = `Send to Jira (${S.queue.length})`; }

/* ---------- JIRA payloads ---------- */
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
function issueFor(name) {
  const i = AREAS.findIndex(a => a[1] === name); const dt = D.text[i]; const acc = accSet();
  const cba = cell(0, i, acc), cmp = compCell(i, acc); const rows = areaRows(acc); const row = rows.find(r => r.i === i) || { score: 0 };
  const prio = row.score >= 70 ? 'Highest' : row.score >= 50 ? 'High' : row.score >= 30 ? 'Medium' : 'Low';
  const ex = VROWS.filter(r => r.a === i && r.s === 1 && r.t.length > 40 && r.t.length < 240).slice(0, 2).map(r => r.t);
  const sections = [
    ['Problem', [dt.neg]],
    ['Evidence', [`${fmt(cba.n)} CBA comments in this area (${pc(cba.np)} negative, ${pc(cba.pp)} positive); competitors ${pc(cmp.np)} negative. Priority score ${row.score}/100.`].concat(ex.map(e => `Customer: “${e}”`))],
    ['Competitor benchmark', [dt.comp, ...(dt.feat ? [dt.feat] : [])]],
    ['Recommendation', [dt.rec].concat(S.acct !== 'Personal' && dt.bizrec ? [dt.bizrec] : [])],
    ['Acceptance criteria (draft)', acs(i)]
  ];
  const J = S.jira || {};
  const labels = ['customer-intelligence', 'voc', slug(AREAS[i][0]), slug(name)].concat((J.labels || '').split(',').map(x => x.trim().replace(/\s+/g, '-')).filter(Boolean)).filter(l => l);
  return { name, summary: `[CBA App] ${TITLES[name] || short(name)}`, sections, prio, labels: [...new Set(labels)].slice(0, 8), score: row.score };
}
const plainDesc = it => it.sections.map(([h, ps]) => `${h}\n` + ps.map(p => '- ' + p).join('\n')).join('\n\n');
const wikiDesc = it => it.sections.map(([h, ps]) => `h3. ${h}\n` + ps.map(p => '* ' + p).join('\n')).join('\n\n');
const adfDoc = it => ({ type: 'doc', version: 1, content: it.sections.flatMap(([h, ps]) => [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: h }] }, { type: 'bulletList', content: ps.map(p => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: p }] }] })) }]) });
function jiraPayload() {
  const J = S.jira || {}; const api = J.api || '3';
  return { issueUpdates: S.queue.map(issueFor).map(it => { const f = { project: { key: J.key || 'PROJ' }, summary: it.summary, issuetype: { name: J.type || 'Story' }, labels: it.labels, priority: { name: it.prio }, description: api === '3' ? adfDoc(it) : wikiDesc(it) }; if (J.comp) f.components = [{ name: J.comp }]; if (J.parent) f.parent = { key: J.parent }; return { fields: f }; }) };
}
function jiraCSV() {
  const J = S.jira || {}; const items = S.queue.map(issueFor); const L = 6;
  const head = ['Summary', 'Description', 'Issue Type', 'Priority', ...Array(L).fill('Labels'), 'Component/s', 'Parent', 'Project Key'];
  return toCSV([head, ...items.map(it => [it.summary, plainDesc(it), J.type || 'Story', it.prio, ...Array.from({ length: L }, (_, k) => it.labels[k] || ''), J.comp || '', J.parent || '', J.key || ''])]);
}

/* ---------- CONNECTORS ---------- */
function jiraReady() { const J = S.jira || {}; return /^https:\/\/[^\s/]+/.test(J.site || '') && /^[A-Za-z][A-Za-z0-9_]+$/.test(J.key || ''); }
function renderConnectors() {
  const J = S.jira || {};
  $('#j-site').value = J.site || ''; $('#j-key').value = J.key || ''; $('#j-type').value = J.type || 'Story'; $('#j-api').value = J.api || '3'; $('#j-parent').value = J.parent || ''; $('#j-comp').value = J.comp || ''; $('#j-labels').value = J.labels || '';
  const st = $('#jira-status'); const ok = jiraReady(); st.textContent = ok ? 'Configured' : J.site || J.key ? 'Incomplete' : 'Not configured'; st.className = 'status ' + (ok ? 'on' : J.site || J.key ? 'warn' : '');
  drawQueue();
  const more = [
    ['Confluence', '#1868DB', 'doc', 'Copy a Markdown insight page to paste into Confluence.', 'Copy page', () => copyText(digestMD(), 'Insight page copied - paste it into Confluence')],
    ['Slack / Teams', '#611F69', 'chat', 'Copy a short weekly digest for your channel.', 'Copy digest', () => copyText(digestText(), 'Digest copied - paste it into Slack or Teams')],
    ['Excel / Power BI', '#107C41', 'table', 'Download the area scorecard as CSV for your reporting model.', 'Download CSV', async () => { if (await saveFile('cba-area-scorecard.csv', scoreCSV())) toast('Scorecard saved'); }],
    ['ServiceNow', '#4A7A2E', 'cloud', 'Import incident and case text as customer feedback.', 'Add data', () => { location.hash = '#sources'; setTimeout(() => openSource('servicenow'), 200); }],
    ['Email briefing', '#B8860B', 'mail', 'Copy an executive email briefing to send to stakeholders.', 'Copy email', () => copyText(emailText(), 'Email briefing copied')],
    ['Data warehouse', '#555', 'db', 'Export every classified CBA comment for your lakehouse or BI tool.', 'Export all', async () => { if (await saveFile('cba-classified-comments.csv', voiceCSV(VROWS))) toast('Export saved'); }]
  ];
  $('#more-conn').innerHTML = more.map((m, k) => `<div class="card conn"><div class="top"><div class="logo" style="background:${m[1]}">${ic(m[2] === 'doc' ? 'list' : m[2], 'lg')}</div><div><h3>${m[0]}</h3></div><span class="status on">Ready</span></div><p style="margin:0;color:var(--muted);font-size:13.5px">${m[3]}</p><div><button class="btn y sm" data-k="${k}">${m[4]}</button></div></div>`).join('');
  $$('#more-conn button').forEach(b => b.onclick = more[+b.dataset.k][5]);
}
function drawQueue() {
  $('#q-count').textContent = S.queue.length;
  $('#q-list').innerHTML = S.queue.map(n => { const it = issueFor(n); return `<div class="quote" style="display:flex;gap:10px;align-items:center"><span class="pill y">${it.prio}</span><div style="flex:1"><b>${esc(it.summary)}</b><small>${esc(it.labels.join(', '))}</small></div><button class="iconbtn" data-n="${esc(n)}" aria-label="Remove">${ic('x', 'sm')}</button></div>`; }).join('') || '<div class="empty">No items yet. Select recommendations on the Backlog tab.</div>';
  $$('#q-list [data-n]').forEach(b => b.onclick = () => { S.queue.splice(S.queue.indexOf(b.dataset.n), 1); save(); buildNav(); drawQueue(); });
  const has = S.queue.length > 0; ['q-csv', 'q-json', 'q-curl', 'q-clear'].forEach(id => $('#' + id).disabled = !has);
  $('#q-pre').textContent = has ? JSON.stringify(jiraPayload(), null, 2).slice(0, 6000) : 'Select recommendations to preview the Jira payload.';
}
function scoreCSV() { const rows = areaRows(); return toCSV([['Primary area', 'Area', 'CBA comments', 'CBA % negative', 'CBA % positive', 'Peers comments', 'Peers % negative', 'Gap (pts)', 'Priority score'], ...rows.map(r => [r.p, r.s, r.cba.n, (r.cba.np * 100).toFixed(1), (r.cba.pp * 100).toFixed(1), r.cmp.n, (r.cmp.np * 100).toFixed(1), (r.gap * 100).toFixed(1), r.score])]); }
function voiceCSV(rows) { return toCSV([['Date', 'Source', 'Rating', 'Segment', 'Area', 'Sentiment', 'Comment'], ...rows.map(r => [r.d, r.src, r.r == null ? '' : r.r, ACC[r.c], AREAS[r.a][1], SENT[r.s], r.t])]); }
const stripTags = h => h.replace(/<[^>]+>/g, '');
function digestText() { const ins = buildInsights(); return `CBA customer intelligence digest (${D.asof})\n\n` + ins.map(x => `• ${x.title} - ${x.text}`).join('\n'); }
function digestMD() { const ins = buildInsights(); return `# Customer intelligence - ${D.asof}\n\n${stripTags(execText().replace(/<\/p>/g, '\n\n'))}\n## Key insights\n\n` + ins.map(x => `- **${x.title}** - ${x.text}`).join('\n') + '\n\n## Recommended backlog\n\n' + recItems().slice(0, 8).map((r, k) => `${k + 1}. **${TITLES[r.s] || r.s}** (score ${r.score}, ${pc(r.cba.np)} negative)`).join('\n'); }
function emailText() { return `Subject: Customer intelligence briefing - ${D.asof}\n\nHi team,\n\n${stripTags(execText().replace(/<\/p>/g, '\n\n'))}\nTop priorities:\n${recItems().slice(0, 5).map((r, k) => `${k + 1}. ${TITLES[r.s] || r.s} (score ${r.score})`).join('\n')}\n\nRegards`; }

/* ---------- DATA SOURCES ---------- */
const CHANNELS = [
  { id: 'appstore', name: 'Apple App Store', color: '#1D8FF2', icon: 'phone', desc: 'Customer reviews of your iOS app by storefront.', fields: [['appId', 'App ID', '310251202'], ['country', 'Storefront', 'au']], map: { text: ['review', 'content', 'text', 'body', 'comment'], date: ['date', 'updated', 'created'], rating: ['rating', 'score', 'stars'] }, snip: f => `# Apple publishes recent reviews as an RSS/JSON feed\ncurl "https://itunes.apple.com/${f.country || 'au'}/rss/customerreviews/id=${f.appId || '<APP_ID>'}/sortBy=mostRecent/json" -o appstore.json\n# Convert entries to CSV (author, updated, rating, title, content) and upload it here.` },
  { id: 'googleplay', name: 'Google Play', color: '#0F9D58', icon: 'phone', desc: 'Android app reviews with developer replies.', fields: [['pkg', 'Package name', 'com.commbank.netbank'], ['country', 'Country', 'au']], map: { text: ['content', 'review', 'text', 'comment'], date: ['at', 'date', 'created'], rating: ['score', 'rating', 'stars'] }, snip: f => `# pip install google-play-scraper pandas\nfrom google_play_scraper import reviews, Sort\nimport pandas as pd\nrows,_ = reviews('${f.pkg || '<PACKAGE>'}', lang='en', country='${f.country || 'au'}', sort=Sort.NEWEST, count=5000)\npd.DataFrame(rows)[['userName','at','score','content','replyContent']].to_csv('googleplay.csv', index=False)` },
  { id: 'reddit', name: 'Reddit', color: '#FF4500', icon: 'chat', desc: 'Posts and comments from banking subreddits.', fields: [['sub', 'Subreddit', 'CommBank'], ['kw', 'Keywords', 'commbank, netbank']], map: { text: ['body', 'selftext', 'text', 'comment', 'title'], date: ['created_utc', 'created', 'date'], rating: [] }, snip: f => `# Use the Reddit API (PRAW) or a public archive such as Arctic Shift\n# pip install praw pandas\nimport praw, pandas as pd\nr = praw.Reddit(client_id='...', client_secret='...', user_agent='voc-research')\nrows=[(c.created_utc, c.body) for c in r.subreddit('${f.sub || 'CommBank'}').comments(limit=1000)]\npd.DataFrame(rows, columns=['created_utc','body']).to_csv('reddit.csv', index=False)` },
  { id: 'servicenow', name: 'ServiceNow', color: '#4A7A2E', icon: 'cloud', desc: 'Incidents, cases and complaints raised by customers.', fields: [['inst', 'Instance', 'yourbank.service-now.com'], ['table', 'Table', 'sn_customerservice_case']], map: { text: ['description', 'short_description', 'comments', 'text'], date: ['opened_at', 'sys_created_on', 'date'], rating: [] }, snip: f => `# ServiceNow Table API (use a read-only service account)\ncurl -u "$SN_USER:$SN_PASS" "https://${f.inst || '<instance>.service-now.com'}/api/now/table/${f.table || 'sn_customerservice_case'}?sysparm_fields=opened_at,short_description,description&sysparm_limit=5000&sysparm_display_value=true&sysparm_query=category=feedback^ORcategory=complaint" -H "Accept: text/csv" -o servicenow.csv` },
  { id: 'productreview', name: 'ProductReview / Trustpilot', color: '#00B67A', icon: 'star', desc: 'Public consumer review sites.', fields: [['url', 'Listing URL', 'https://www.productreview.com.au/...']], map: { text: ['review', 'content', 'body', 'text'], date: ['date', 'created', 'published'], rating: ['rating', 'stars', 'score'] }, snip: f => '# Export reviews from the vendor dashboard or licensed API, then upload the CSV here.' },
  { id: 'social', name: 'Social media', color: '#111', icon: 'users', desc: 'X, Facebook, LinkedIn and Instagram mentions.', fields: [['q', 'Search query', '@CommBank OR #commbank']], map: { text: ['text', 'content', 'post', 'message', 'comment'], date: ['date', 'created_at', 'time'], rating: [] }, snip: f => '# Export mentions from your social listening tool (CSV) and upload here.' },
  { id: 'contact', name: 'Contact centre & chat', color: '#7A3FF2', icon: 'bell', desc: 'Call summaries, chat transcripts and complaints.', fields: [['sys', 'Source system', 'Genesys / Salesforce']], map: { text: ['summary', 'transcript', 'text', 'notes', 'comment'], date: ['date', 'created', 'start'], rating: ['csat', 'rating', 'score'] }, snip: f => '# Export de-identified summaries from your contact-centre platform. Remove personal data first.' },
  { id: 'custom', name: 'Survey / any file', color: '#E6B800', icon: 'table', desc: 'NPS/CSAT verbatims or any CSV, Excel or JSON.', fields: [['n', 'Dataset name', 'Q4 NPS survey']], map: { text: ['comment', 'verbatim', 'text', 'feedback', 'review'], date: ['date', 'created', 'submitted'], rating: ['rating', 'score', 'nps', 'csat'] }, snip: f => '# Any CSV, XLSX or JSON with a text column works. Add a date and rating column if you have them.' }
];
function renderSources() {
  $('#src-cards').innerHTML = CHANNELS.map(c => { const n = S.datasets.filter(d => d.channel === c.id && !d.off).reduce((s, d) => s + d.rows.length, 0); const built = { appstore: 'Apple App Store (AU)', googleplay: 'Google Play', reddit: 'Reddit r/CommBank', productreview: 'ProductReview.com.au' }[c.id]; const bn = built ? D.srcs.filter(s => s.startsWith(built.split(' (')[0].replace('Reddit r/CommBank', 'Reddit'))).length : 0;
    return `<div class="card conn"><div class="top"><div class="logo" style="background:${c.color};color:${c.id === 'custom' ? '#111' : '#fff'}">${ic(c.icon, 'lg')}</div><div><h3 style="font-size:16px">${esc(c.name)}</h3></div></div><p style="margin:0;color:var(--muted);font-size:13.5px;flex:1">${esc(c.desc)}</p><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="status ${n || bn ? 'on' : ''}" style="margin:0">${n ? fmt(n) + ' imported' : bn ? 'Built-in data' : 'Not connected'}</span><button class="btn y sm" data-c="${c.id}" style="margin-left:auto">${ic('plus', 'sm')}Add data</button></div></div>`; }).join('');
  $$('#src-cards [data-c]').forEach(b => b.onclick = () => openSource(b.dataset.c));
  const built = {}; D.src.forEach(([b, sr, s, n]) => { const k = D.srcs[sr]; const o = built[k] = built[k] || { n: 0, banks: new Set() }; o.n += n; o.banks.add(BANKS[b]); });
  const bl = Object.entries(built).sort((a, c) => c[1].n - a[1].n);
  $('#src-table').innerHTML = `<thead><tr><th>Dataset</th><th>Type</th><th>Banks</th><th>Rows</th><th>Added</th><th>Status</th><th></th></tr></thead><tbody>${S.datasets.map((d, k) => `<tr><td><b>${esc(d.name)}</b></td><td><span class="pill y">Imported</span> ${esc(CHANNELS.find(c => c.id === d.channel)?.name || '')}</td><td>${BANKS[d.bank]}</td><td>${fmt(d.rows.length)}</td><td>${esc(d.added)}</td><td><label style="display:flex;gap:6px;align-items:center;font-weight:700"><input type="checkbox" class="chk" data-t="${k}" ${d.off ? '' : 'checked'}>${d.off ? 'Off' : 'Active'}</label></td><td><button class="iconbtn" data-d="${k}" aria-label="Delete dataset">${ic('trash', 'sm')}</button></td></tr>`).join('')}${bl.map(([k, o]) => `<tr><td><b>${esc(k)}</b></td><td><span class="pill">Built-in</span></td><td>${[...o.banks].join(', ')}</td><td>${fmt(o.n)}</td><td>${D.asof}</td><td><span class="status on" style="margin:0">Active</span></td><td></td></tr>`).join('')}</tbody>`;
  $$('#src-table [data-t]').forEach(c => c.onchange = () => { S.datasets[+c.dataset.t].off = !c.checked; save(); rerender(); });
  $$('#src-table [data-d]').forEach(b => b.onclick = () => { if (confirm('Delete this imported dataset?')) { S.datasets.splice(+b.dataset.d, 1); save(); rerender(); toast('Dataset removed'); } });
}
let IMP = null;
function openSource(id) {
  const ch = CHANNELS.find(c => c.id === id); const cfg = (S.cfg[id] = S.cfg[id] || {});
  IMP = { ch, bank: 0, name: ch.name, rows: null, heads: [], map: { text: -1, date: -1, rating: -1 }, classified: null };
  const box = $('#modal-box');
  box.innerHTML = `<div class="mh"><div class="logo" style="background:${ch.color};color:${ch.id === 'custom' ? '#111' : '#fff'};width:44px;height:44px">${ic(ch.icon)}</div><h3 style="flex:1">${esc(ch.name)}</h3><button class="iconbtn" id="m-x" aria-label="Close" style="background:#111;color:var(--yellow);border-color:#111">${ic('x')}</button></div><div class="mb">
    <div class="steps"><span class="on" id="s1"><i>1</i>Connection</span><span id="s2"><i>2</i>Upload &amp; map</span><span id="s3"><i>3</i>Review &amp; add</span></div>
    <div class="note"><svg class="ic sm"><use href="#i-shield"/></svg><div>Live pulls need a secure backend, so this page works from files. Save your connection details, run the collector snippet in your pipeline, then upload the export. Remove personal data before importing.</div></div>
    <div class="sec-t">${ic('link', 'sm')}Connection details</div>
    <div class="row2">${ch.fields.map(f => `<div class="field"><label for="f-${f[0]}">${esc(f[1])}</label><input type="text" id="f-${f[0]}" placeholder="${esc(f[2])}" value="${esc(cfg[f[0]] || '')}"></div>`).join('')}
      <div class="field"><label for="m-bank">Feedback is about</label><select id="m-bank">${BANKS.map((b, i) => `<option value="${i}">${b}${i === 0 ? ' (our bank)' : ' (competitor)'}</option>`).join('')}</select></div></div>
    <div class="field"><label for="m-name">Dataset name</label><input type="text" id="m-name" value="${esc(ch.name)}"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" id="m-save">${ic('check', 'sm')}Save connection</button><button class="btn ghost sm" id="m-snip">${ic('copy', 'sm')}Copy collector snippet</button></div>
    <pre id="m-pre"></pre>
    <div class="sec-t">${ic('up2', 'sm')}Upload feedback file</div>
    <div class="drop" id="drop"><div style="font-weight:700;margin-bottom:6px">Drag a CSV, Excel or JSON file here</div><div style="color:var(--muted);font-size:13px;margin-bottom:12px">or</div><input type="file" id="m-file" accept=".csv,.tsv,.txt,.json,.xlsx,.xls" hidden><button class="btn y sm" id="m-pick">${ic('up2', 'sm')}Choose file</button></div>
    <div class="field" style="margin-top:12px"><label for="m-paste">…or paste comments (one per line, or CSV with a header)</label><textarea id="m-paste" placeholder="The app keeps logging me out&#10;Love the new tap to pay feature"></textarea><div><button class="btn ghost sm" id="m-parse" style="margin-top:8px">Parse pasted text</button></div></div>
    <div id="m-map"></div><div id="m-review"></div></div>`;
  const up = () => { $('#m-pre').textContent = ch.snip(Object.fromEntries(ch.fields.map(f => [f[0], $('#f-' + f[0]).value.trim()]))); }; up();
  ch.fields.forEach(f => $('#f-' + f[0]).oninput = up);
  $('#m-x').onclick = closeModal; $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
  $('#m-save').onclick = () => { ch.fields.forEach(f => cfg[f[0]] = $('#f-' + f[0]).value.trim()); save(); toast('Connection details saved in this browser'); };
  $('#m-snip').onclick = () => copyText($('#m-pre').textContent, 'Snippet copied');
  $('#m-bank').onchange = e => IMP.bank = +e.target.value; $('#m-name').oninput = e => IMP.name = e.target.value;
  const dz = $('#drop'); $('#m-pick').onclick = () => $('#m-file').click();
  $('#m-file').onchange = e => e.target.files[0] && readFile(e.target.files[0]);
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
  $('#m-parse').onclick = () => { const t = $('#m-paste').value.trim(); if (!t) return toast('Paste some text first'); const rows = parseCSV(t); const multi = rows.length > 1 && rows[0].length > 1; setRows(multi ? rows : [['text'], ...t.split(/\r?\n/).filter(Boolean).map(x => [x])]); };
  $('#modal').classList.add('on');
}
function closeModal() { $('#modal').classList.remove('on'); }
function readFile(f) {
  const name = f.name.toLowerCase(); const rd = new FileReader();
  if (/\.xlsx?$/.test(name)) {
    if (!window.XLSX) return toast('Excel support could not load. Save the sheet as CSV and upload that.');
    rd.onload = () => { try { const wb = XLSX.read(rd.result, { type: 'array', cellDates: true }); const ws = wb.Sheets[wb.SheetNames[0]]; setRows(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })); } catch (e) { toast('Could not read that workbook.'); } };
    rd.readAsArrayBuffer(f);
  } else {
    rd.onload = () => { const t = String(rd.result); if (name.endsWith('.json')) { try { let j = JSON.parse(t); if (!Array.isArray(j)) j = j.data || j.reviews || j.entries || j.result || Object.values(j).find(Array.isArray) || []; if (!j.length) return toast('No rows found in that JSON.'); const heads = [...new Set(j.flatMap(o => Object.keys(o)))]; setRows([heads, ...j.map(o => heads.map(h => typeof o[h] === 'object' ? JSON.stringify(o[h]) : o[h]))]); } catch (e) { toast('That JSON file could not be read.'); } } else setRows(parseCSV(t)); };
    rd.readAsText(f);
  }
}
function setRows(rows) {
  rows = rows.filter(r => r && r.some(x => String(x).trim() !== '')); if (rows.length < 2) return toast('No data rows found.');
  const heads = rows[0].map(h => String(h)); IMP.heads = heads; IMP.rows = rows.slice(1);
  const g = IMP.ch.map; IMP.map = { text: guess(heads, g.text), date: guess(heads, g.date), rating: g.rating.length ? guess(heads, g.rating) : -1 };
  if (IMP.map.text < 0) { let best = 0, bl = 0; heads.forEach((h, i) => { const l = IMP.rows.slice(0, 50).reduce((s, r) => s + String(r[i] || '').length, 0); if (l > bl) { bl = l; best = i; } }); IMP.map.text = best; }
  $('#s1').classList.remove('on'); $('#s2').classList.add('on');
  const opts = (sel, none) => `${none ? '<option value="-1">- none -</option>' : ''}` + heads.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('');
  $('#m-map').innerHTML = `<div class="sec-t">${ic('table', 'sm')}Map columns <span class="pill">${fmt(IMP.rows.length)} rows</span></div><div class="row2"><div class="field"><label>Comment text *</label><select id="mp-text">${opts(IMP.map.text)}</select></div><div class="field"><label>Date</label><select id="mp-date">${opts(IMP.map.date, 1)}</select></div></div><div class="row2"><div class="field"><label>Star rating (1-5)</label><select id="mp-rating">${opts(IMP.map.rating, 1)}</select></div><div class="field" style="justify-content:end"><button class="btn dark" id="mp-go" style="background:#111;color:var(--yellow)">${ic('spark', 'sm')}Classify &amp; preview</button></div></div>`;
  $('#mp-go').onclick = classifyImport; $('#m-review').innerHTML = '';
  $('#m-map').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function classifyImport() {
  IMP.map = { text: +$('#mp-text').value, date: +$('#mp-date').value, rating: +$('#mp-rating').value };
  const out = []; let skipped = 0;
  for (const r of IMP.rows) {
    const t = String(r[IMP.map.text] ?? '').replace(/\s+/g, ' ').trim(); if (t.length < 3) { skipped++; continue; }
    let rating = null; if (IMP.map.rating >= 0) { const v = parseFloat(r[IMP.map.rating]); if (v >= 1 && v <= 5) rating = Math.round(v); }
    const c = CL.run(t, rating); out.push([normDate(IMP.map.date >= 0 ? r[IMP.map.date] : null), rating, c.acct, c.area, c.sent, t.length > 300 ? t.slice(0, 299) + '…' : t, IMP.name]);
  }
  IMP.classified = out;
  const sc = [0, 0, 0, 0], ac = {}; out.forEach(r => { sc[r[4]]++; if (r[3] !== OTHER) ac[r[3]] = (ac[r[3]] || 0) + 1; });
  const top = Object.entries(ac).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $('#s2').classList.remove('on'); $('#s3').classList.add('on');
  $('#m-review').innerHTML = `<div class="sec-t">${ic('check', 'sm')}Review</div><div class="minis"><div class="mini"><b>${fmt(out.length)}</b><span>rows to add</span></div><div class="mini"><b style="color:var(--pos)">${pc(sc[0] / (out.length || 1))}</b><span>positive</span></div><div class="mini"><b style="color:var(--neg)">${pc(sc[1] / (out.length || 1))}</b><span>negative</span></div><div class="mini"><b>${fmt(skipped)}</b><span>skipped (empty)</span></div></div>
   <div style="font-size:13px;margin-bottom:10px"><b>Top areas:</b> ${top.map(([a, n]) => `<span class="pill">${esc(short(AREAS[a][1]))} · ${n}</span>`).join(' ') || 'none identified'}</div>
   <div style="overflow:auto;border:1px solid var(--line);border-radius:12px"><table class="list"><thead><tr><th>Date</th><th>Area</th><th>Sentiment</th><th>Comment</th></tr></thead><tbody>${out.slice(0, 6).map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[3] === OTHER ? 'Other' : short(AREAS[r[3]][1]))}</td><td><span class="pill ${['pos', 'neg', 'neu', 'mix'][r[4]]}">${SENT[r[4]]}</span></td><td>${esc(r[5].slice(0, 140))}</td></tr>`).join('')}</tbody></table></div>
   <div style="display:flex;gap:10px;margin-top:14px"><button class="btn y" id="m-add" ${out.length ? '' : 'disabled'}>${ic('plus', 'sm')}Add ${fmt(out.length)} rows to the dashboard</button><button class="btn ghost" id="m-cancel">Cancel</button></div>`;
  $('#m-cancel').onclick = closeModal;
  $('#m-add').onclick = () => { S.datasets.push({ id: 'd' + Date.now(), channel: IMP.ch.id, name: IMP.name || IMP.ch.name, bank: IMP.bank, added: today, rows: IMP.classified }); save(); closeModal(); rerender(); toast(`Added <b>${fmt(IMP.classified.length)}</b> rows. Charts and insights are updated.`); };
  $('#m-review').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- wire-up ---------- */
function init() {
  rebuild(); renderHero(); buildNav();
  setTheme(S.theme || '');
  $('#themebtn').onclick = () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches); setTheme(dark ? 'light' : 'dark'); };
  $('#role-lead').onclick = () => { S.role = 'lead'; save(); S.focus = 'all'; renderHero(); renderPage(S.page); };
  $('#role-po').onclick = () => { S.role = 'po'; S.focus = 'mobile'; save(); renderHero(); renderPage(S.page); };
  $('#overlay').onclick = closeDrawer; document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeModal(); } });
  $$('footer [data-go]').forEach(a => a.onclick = () => { location.hash = '#' + a.dataset.go; });
  $('#v-q').oninput = e => { VS.q = e.target.value; VS.page = 0; drawVoice(); };
  [['v-area', 'area'], ['v-sent', 'sent'], ['v-acct', 'acct']].forEach(([id, k]) => $('#' + id).onchange = e => { VS[k] = +e.target.value; VS.page = 0; drawVoice(); });
  $('#v-src').onchange = e => { VS.src = e.target.value; VS.page = 0; drawVoice(); };
  $('#v-prev').onclick = () => { VS.page--; drawVoice(); }; $('#v-next').onclick = () => { VS.page++; drawVoice(); };
  $('#v-exp').onclick = async () => { if (await saveFile('cba-comments-filtered.csv', voiceCSV(vFiltered()))) toast('Comments exported'); };
  const jf = () => { S.jira = { site: $('#j-site').value.trim().replace(/\/+$/, ''), key: $('#j-key').value.trim().toUpperCase(), type: $('#j-type').value, api: $('#j-api').value, parent: $('#j-parent').value.trim(), comp: $('#j-comp').value.trim(), labels: $('#j-labels').value.trim() }; };
  $('#j-save').onclick = () => { jf(); if (S.jira.site && !/^https:\/\//.test(S.jira.site)) { toast('The Jira site URL must start with https://'); return; } save(); renderConnectors(); toast(jiraReady() ? 'Jira settings saved - you are ready to export' : 'Saved. Add a site URL and project key to finish.'); };
  $('#j-clear').onclick = () => { S.jira = {}; save(); renderConnectors(); };
  ['j-type', 'j-api'].forEach(id => $('#' + id).onchange = () => { jf(); save(); drawQueue(); });
  const needJ = () => { jf(); save(); if (!S.jira.key) { toast('Add a Jira project key first, then save settings.'); return false; } return true; };
  $('#q-csv').onclick = async () => { if (!needJ()) return; if (await saveFile('cba-backlog-jira.csv', jiraCSV())) toast('Jira CSV saved - import it from Jira › Import issues from CSV'); };
  $('#q-json').onclick = () => { if (!needJ()) return; copyText(JSON.stringify(jiraPayload(), null, 2), 'Bulk-create JSON copied'); };
  $('#q-curl').onclick = () => { if (!needJ()) return; const J = S.jira; copyText(`# 1) save the copied JSON as backlog.json\n# 2) set JIRA_EMAIL and JIRA_API_TOKEN in your shell (never paste tokens into chat or web pages)\ncurl -X POST "${J.site || 'https://yourcompany.atlassian.net'}/rest/api/${J.api || '3'}/issue/bulk" \\\n  -H "Content-Type: application/json" \\\n  -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \\\n  -d @backlog.json`, 'cURL copied'); };
  $('#q-clear').onclick = () => { S.queue = []; save(); buildNav(); drawQueue(); };
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));
  go(location.hash.slice(1) || 'overview');
}
init();
