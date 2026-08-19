/* ============================================================
   app.js — War Room
   Depends on: engine-core.js (ENGINE), geo-world.js (WORLD),
   geo-usa.js (USA)
   ============================================================ */
(function () {
'use strict';
const E = window.ENGINE;
const SECTIONS = E.SECTIONS;
const DESKS = Object.keys(SECTIONS);

/* ---------------- config ---------------- */
const REFRESH_MS = 5 * 60 * 1000;
const MAX_AGE_HRS = 30;
const BREAKING_MIN = 150;
const PREFETCH_MAX_AGE = 40 * 60 * 1000;
const LS = { cache:'wr2_cache_', vel:'wr2_vel_', dismiss:'wr2_dismiss', watch:'wr2_watch',
             alerts:'wr2_alerts', notified:'wr2_notified', visit:'wr2_visit' };
const PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u),
  u => 'https://thingproxy.freeboard.io/fetch/' + u,
];

/* ---------------- keyword tiers ---------------- */
const KW = {
  crit:{10:['war','invasion','invade','nuclear','killed','dead','death toll','massacre','genocide','airstrike','air strike','missile','coup','assassinat','hostage','terror','earthquake','tsunami','catastroph','atrocit','bombing','bomb '],
        7:['crisis','conflict','attack','strike','shooting','explosion','collapse','emergency','evacuat','outbreak','famine','offensive','ceasefire','wildfire','flood','hurricane','cyclone','recession','default','sanction','uprising','martial law','siege','clash'],
        4:['election','protest','summit','talks','deal','court','ruling','ban','resign','warning','threat','tension','deploy','arrest','indict','probe','vote','referendum','border','troops','shutdown','treaty','diplomat'],
        2:['minister','president','government','policy','economy','markets','report','plan','meeting','parliament']},
  us:{10:['mass shooting','shooting','shot dead','killed','wildfire','tornado','hurricane','explosion','manhunt','assassinat','terror','hostage','state of emergency','plane crash'],
      7:['congress','senate','supreme court','white house','impeach','indict','indictment','shutdown','strike','protest','recall','lawsuit','verdict','recession','layoffs','inflation','border','flooding','evacuat','outage','fbi','doj','filibuster','veto','subpoena'],
      4:['president','governor','senator','election','campaign','vote','bill','policy','poll','congressman','mayor','ballot','primary','ruling','hearing','nominee'],
      2:['plan','report','economy','markets','study','state','federal','budget']}
};

/* trending entities per desk */
const ENTITIES = {
  world:['United Nations','NATO','European Union','White House','Kremlin','Pentagon','Hamas','Hezbollah','Taliban','Putin','Zelensky','Netanyahu','Trump','Xi Jinping','Modi','WHO','IMF','G7','OPEC','ICC'],
  us:['White House','Congress','Senate','Supreme Court','Trump','Biden','Harris','Republicans','Democrats','GOP','Federal Reserve','Wall Street','FBI','DOJ','ICE','Pentagon','Capitol Hill','Homeland Security']
};

/* ---------------- geo ---------------- */
function projFromBounds(lon0, lat0, lon1, lat1, W){
  const mid = (lat0 + lat1) / 2 * Math.PI / 180, k = Math.cos(mid);
  const s = W / ((lon1 - lon0) * k);
  const f = (lon, lat) => [ (lon - lon0) * k * s, (lat1 - lat) * s ];
  f.W = W; f.H = (lat1 - lat0) * s; return f;
}
const worldProj = (lon, lat) => [ (lon + 180) / 360 * 1000, (90 - lat) / 180 * 500 ];
worldProj.W = 1000; worldProj.H = 415;

function buildGeo(fc, idOf, project, aliasMap, opts){
  opts = opts || {};
  const nameById = {};
  fc.features.forEach(f => { nameById[idOf(f)] = f.properties.name; });
  const keyMap = new Map();
  Object.entries(aliasMap).forEach(([k, id]) => { const kk = k.trim(); if (!keyMap.has(kk)) keyMap.set(kk, id); });
  fc.features.forEach(f => { const nm = f.properties.name.toLowerCase(); if (nm.length > 3 && !keyMap.has(nm)) keyMap.set(nm, idOf(f)); });
  const keys = [...keyMap.entries()].sort((a, b) => b[0].length - a[0].length);

  function detect(text){
    const t = ' ' + text.toLowerCase() + ' ';
    const found = new Set();
    for (const [k, id] of keys){
      let idx = t.indexOf(k);
      while (idx !== -1){
        const before = t[idx - 1] || ' ', after = t[idx + k.length] || ' ';
        if (!/[a-z]/.test(before) && !/[a-z]/.test(after)){ if (id) found.add(id); break; }
        idx = t.indexOf(k, idx + 1);
      }
    }
    return [...found];
  }
  let svg = null;
  function ring(r){ let d = ''; for (let i = 0; i < r.length; i++){ const p = project(r[i][0], r[i][1]); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } return d + 'Z'; }
  function fpath(f){ const g = f.geometry, out = []; if (g.type === 'Polygon') g.coordinates.forEach(r => out.push(ring(r))); else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => out.push(ring(r)))); return out.join(''); }
  function buildSVG(){
    if (svg) return svg;
    let paths = '';
    for (const f of fc.features){
      if (opts.skip && opts.skip(f)) continue;
      paths += `<path class="region" data-id="${String(idOf(f)).replace(/"/g,'')}" data-name="${f.properties.name.replace(/"/g,'')}" d="${fpath(f)}"></path>`;
    }
    svg = `<svg class="geomap ${opts.cls||''}" viewBox="0 0 ${project.W} ${opts.viewH || project.H}" preserveAspectRatio="xMidYMid meet">${paths}</svg>`;
    return svg;
  }
  return { detect, buildSVG, name: id => nameById[id] || id };
}

const WORLD_ALIAS = {
  'usa':'USA','u.s.':'USA','u.s':'USA','united states':'USA','america':'USA','american':'USA','washington':'USA','white house':'USA','pentagon':'USA','biden':'USA','trump':'USA','california':'USA','new york':'USA','texas':'USA','florida':'USA',
  'uk':'GBR','u.k.':'GBR','britain':'GBR','british':'GBR','england':'GBR','london':'GBR','scotland':'GBR','wales':'GBR','downing street':'GBR',
  'russia':'RUS','russian':'RUS','moscow':'RUS','kremlin':'RUS','putin':'RUS',
  'ukraine':'UKR','ukrainian':'UKR','kyiv':'UKR','kiev':'UKR','zelensky':'UKR',
  'china':'CHN','chinese':'CHN','beijing':'CHN','shanghai':'CHN','xi jinping':'CHN','hong kong':'CHN',
  'taiwan':'TWN','taiwanese':'TWN','taipei':'TWN','japan':'JPN','japanese':'JPN','tokyo':'JPN',
  'south korea':'KOR','korean':'KOR','seoul':'KOR','north korea':'PRK','pyongyang':'PRK','kim jong':'PRK',
  'india':'IND','indian':'IND','delhi':'IND','mumbai':'IND','modi':'IND',
  'pakistan':'PAK','pakistani':'PAK','islamabad':'PAK','karachi':'PAK',
  'afghanistan':'AFG','afghan':'AFG','kabul':'AFG','taliban':'AFG',
  'iran':'IRN','iranian':'IRN','tehran':'IRN','iraq':'IRQ','iraqi':'IRQ','baghdad':'IRQ',
  'israel':'ISR','israeli':'ISR','jerusalem':'ISR','tel aviv':'ISR','netanyahu':'ISR','idf':'ISR',
  'palestine':'PSE','palestinian':'PSE','gaza':'PSE','west bank':'PSE','hamas':'PSE',
  'lebanon':'LBN','lebanese':'LBN','beirut':'LBN','hezbollah':'LBN',
  'syria':'SYR','syrian':'SYR','damascus':'SYR','yemen':'YEM','yemeni':'YEM','houthi':'YEM','sanaa':'YEM',
  'saudi arabia':'SAU','saudi':'SAU','riyadh':'SAU','united arab emirates':'ARE','uae':'ARE','dubai':'ARE','abu dhabi':'ARE',
  'qatar':'QAT','doha':'QAT','turkey':'TUR','turkish':'TUR','ankara':'TUR','istanbul':'TUR','erdogan':'TUR',
  'egypt':'EGY','egyptian':'EGY','cairo':'EGY','germany':'DEU','german':'DEU','berlin':'DEU','munich':'DEU','scholz':'DEU',
  'france':'FRA','french':'FRA','paris':'FRA','macron':'FRA','italy':'ITA','italian':'ITA','rome':'ITA','meloni':'ITA',
  'spain':'ESP','spanish':'ESP','madrid':'ESP','barcelona':'ESP','portugal':'PRT','lisbon':'PRT',
  'netherlands':'NLD','dutch':'NLD','amsterdam':'NLD','belgium':'BEL','brussels':'BEL','poland':'POL','polish':'POL','warsaw':'POL',
  'sweden':'SWE','swedish':'SWE','stockholm':'SWE','norway':'NOR','oslo':'NOR','finland':'FIN','helsinki':'FIN','denmark':'DNK','copenhagen':'DNK',
  'ireland':'IRL','dublin':'IRL','greece':'GRC','greek':'GRC','athens':'GRC','switzerland':'CHE','swiss':'CHE','geneva':'CHE','zurich':'CHE','davos':'CHE',
  'austria':'AUT','vienna':'AUT','hungary':'HUN','budapest':'HUN','orban':'HUN','czech':'CZE','prague':'CZE','romania':'ROU','bucharest':'ROU',
  'serbia':'SRB','belgrade':'SRB','croatia':'HRV','bulgaria':'BGR',
  'canada':'CAN','canadian':'CAN','ottawa':'CAN','toronto':'CAN','trudeau':'CAN','mexico':'MEX','mexican':'MEX','mexico city':'MEX',
  'brazil':'BRA','brazilian':'BRA','brasilia':'BRA','sao paulo':'BRA','lula':'BRA','argentina':'ARG','buenos aires':'ARG','milei':'ARG',
  'colombia':'COL','bogota':'COL','venezuela':'VEN','caracas':'VEN','maduro':'VEN','chile':'CHL','santiago':'CHL','peru':'PER','lima':'PER',
  'cuba':'CUB','havana':'CUB','haiti':'HTI','ecuador':'ECU','bolivia':'BOL',
  'australia':'AUS','australian':'AUS','sydney':'AUS','canberra':'AUS','melbourne':'AUS','new zealand':'NZL','wellington':'NZL','auckland':'NZL',
  'indonesia':'IDN','jakarta':'IDN','philippines':'PHL','manila':'PHL','filipino':'PHL','vietnam':'VNM','hanoi':'VNM','thailand':'THA','bangkok':'THA','thai':'THA',
  'malaysia':'MYS','kuala lumpur':'MYS','singapore':'SGP','myanmar':'MMR','burma':'MMR','bangladesh':'BGD','dhaka':'BGD','sri lanka':'LKA','nepal':'NPL','kathmandu':'NPL',
  'nigeria':'NGA','nigerian':'NGA','lagos':'NGA','abuja':'NGA','south africa':'ZAF','johannesburg':'ZAF','cape town':'ZAF','pretoria':'ZAF',
  'kenya':'KEN','nairobi':'KEN','ethiopia':'ETH','addis ababa':'ETH','sudan':'SDN','khartoum':'SDN','somalia':'SOM','mogadishu':'SOM',
  'congo':'COD','democratic republic of the congo':'COD','ghana':'GHA','accra':'GHA','morocco':'MAR','rabat':'MAR','algeria':'DZA','algiers':'DZA','tunisia':'TUN','tunis':'TUN',
  'libya':'LBY','tripoli':'LBY','mali':'MLI','niger':'NER','chad':'TCD','zimbabwe':'ZWE','uganda':'UGA','tanzania':'TZA','rwanda':'RWA','senegal':'SEN','cameroon':'CMR',
  'kazakhstan':'KAZ','uzbekistan':'UZB','azerbaijan':'AZE','armenia':'ARM','georgia':'GEO','belarus':'BLR','minsk':'BLR','moldova':'MDA',
  'jordan':'JOR','amman':'JOR','kuwait':'KWT','bahrain':'BHR','oman':'OMN','mongolia':'MNG','cambodia':'KHM','laos':'LAO',
  'europe':null,'eu':null,'african':null,'middle east':null,'asia':null,'un':null,'nato':null
};
const US_ALIAS = {
  'nyc':'New York','new york city':'New York','manhattan':'New York','brooklyn':'New York','albany':'New York','buffalo':'New York',
  'los angeles':'California','san francisco':'California','san diego':'California','sacramento':'California','hollywood':'California','silicon valley':'California','oakland':'California',
  'chicago':'Illinois','houston':'Texas','dallas':'Texas','austin':'Texas','san antonio':'Texas','el paso':'Texas','fort worth':'Texas',
  'miami':'Florida','orlando':'Florida','tampa':'Florida','tallahassee':'Florida','jacksonville':'Florida',
  'boston':'Massachusetts','seattle':'Washington','tacoma':'Washington','spokane':'Washington','washington state':'Washington',
  'portland':'Oregon','atlanta':'Georgia','phoenix':'Arizona','tucson':'Arizona',
  'philadelphia':'Pennsylvania','philly':'Pennsylvania','pittsburgh':'Pennsylvania',
  'detroit':'Michigan','denver':'Colorado','las vegas':'Nevada','reno':'Nevada',
  'new orleans':'Louisiana','baton rouge':'Louisiana','nashville':'Tennessee','memphis':'Tennessee',
  'minneapolis':'Minnesota','baltimore':'Maryland','st. louis':'Missouri','st louis':'Missouri','kansas city':'Missouri',
  'cleveland':'Ohio','columbus':'Ohio','cincinnati':'Ohio','indianapolis':'Indiana',
  'charlotte':'North Carolina','raleigh':'North Carolina','milwaukee':'Wisconsin','madison':'Wisconsin',
  'salt lake city':'Utah','albuquerque':'New Mexico','oklahoma city':'Oklahoma','tulsa':'Oklahoma',
  'louisville':'Kentucky','birmingham':'Alabama','montgomery':'Alabama','little rock':'Arkansas',
  'des moines':'Iowa','omaha':'Nebraska','boise':'Idaho','honolulu':'Hawaii','anchorage':'Alaska',
  'richmond':'Virginia','charleston':'South Carolina','providence':'Rhode Island','hartford':'Connecticut',
  'newark':'New Jersey','jersey city':'New Jersey','trenton':'New Jersey',
  'washington':'District of Columbia','d.c.':'District of Columbia','dc':'District of Columbia','capitol hill':'District of Columbia','white house':'District of Columbia','the capitol':'District of Columbia'
};
const GEO = {
  world: buildGeo(window.WORLD, f => f.id, worldProj, WORLD_ALIAS, { skip: f => f.properties.name === 'Antarctica', viewH: 415 }),
  us:    buildGeo(window.USA, f => f.properties.name, projFromBounds(-125, 22, -66.9, 49.6, 1000), US_ALIAS, { cls:'us' })
};

/* ---------------- state ---------------- */
const STATE = {};
DESKS.forEach(s => STATE[s] = { items:[], regions:{}, feedStatus:{}, loaded:false, loading:false, ts:null, source:null });
let current = DESKS[0];
const filters = {};
DESKS.forEach(s => filters[s] = { region:null, entity:null, q:'' });
const seeded = {};

const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let dismissed = lsGet(LS.dismiss, {});
let watchlist = lsGet(LS.watch, []);
let notified  = lsGet(LS.notified, {});
let visits    = lsGet(LS.visit, {});
let alertsOn  = lsGet(LS.alerts, false);
const t0 = Date.now();
for (const k in dismissed) if (dismissed[k] < t0) delete dismissed[k];
for (const k in notified) if (notified[k] < t0) delete notified[k];

/* ---------------- utils ---------------- */
const esc = s => (s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const keyOf = t => t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
const $ = id => document.getElementById(id);
function timeAgo(h){ const m = Math.round(h * 60); if (m < 1) return 'now'; if (m < 60) return m + 'm'; if (h < 24) return Math.round(h) + 'h'; return Math.round(h / 24) + 'd'; }
const STOP = new Set('the a an of to in on for and or as at by with from into over after new says say will has have amid could would this that than then who what when why how are was were be been being about against between during also more most'.split(' '));
const sig = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
const icon = (n, cls) => `<svg class="${cls||''}"><use href="#i-${n}"/></svg>`;

/* ---------------- fetching ---------------- */
async function fetchText(url){
  for (const p of PROXIES){
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(p(url), { signal: ctrl.signal });
      clearTimeout(to);
      if (!r.ok) continue;
      const txt = await r.text();
      if (txt && txt.length > 200 && /<item|<entry|<rss|<feed/i.test(txt)) return txt;
    } catch {}
  }
  throw new Error('proxies exhausted');
}
async function proxyFetch(sec){
  const cfg = SECTIONS[sec], status = {};
  const res = await Promise.allSettled(cfg.feeds.map(async f => {
    try { const items = E.parseFeed(await fetchText(f.u), f.n); status[f.n] = items.length ? 'ok' : 'empty'; return items; }
    catch { status[f.n] = 'err'; return []; }
  }));
  const seen = new Set(), all = [];
  res.forEach(r => { if (r.status === 'fulfilled') r.value.forEach(it => {
    const k = keyOf(it.title); if (!k || seen.has(k)) return; seen.add(k); all.push(it);
  }); });
  return { items: all, status };
}

/* ---------------- analysis ---------------- */
function analyze(sec, raw){
  const cfg = SECTIONS[sec], geo = GEO[cfg.geo], kw = KW[cfg.kw], now = Date.now();
  let items = (raw || []).map(it => ({ ...it })).filter(it => {
    const a = (now - new Date(it.date).getTime()) / 3.6e6;
    return a <= MAX_AGE_HRS && a >= -3;
  });
  const seen = new Set();
  items = items.filter(it => { const k = keyOf(it.title); if (!k || seen.has(k)) return false; seen.add(k); return true; });

  items.forEach(it => {
    it.key = keyOf(it.title);
    it.ageH = (now - new Date(it.date).getTime()) / 3.6e6;
    const hay = (it.title + ' ' + it.desc).toLowerCase();
    let ks = 0, sev = '';
    for (const [w, list] of Object.entries(kw)) for (const term of list) if (hay.includes(term)){ ks += +w; if (+w >= 7 && !sev) sev = 'hi'; if (+w >= 10) sev = 'crit'; }
    it.kwScore = ks; it.sev = sev;
    it.geo = geo.detect(it.title + ' ' + it.desc);
    it.sigwords = sig(it.title);
    it.base = ks * 1.6 + Math.max(0, 26 - it.ageH * 1.15);
  });

  // corroboration clusters (union-find)
  const n = items.length, parent = Array.from({ length:n }, (_, i) => i);
  const find = x => { while (parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++){
    const A = items[i], B = items[j]; if (A.source === B.source) continue;
    const sb = new Set(B.sigwords); let ov = 0; for (const w of A.sigwords) if (sb.has(w)) ov++;
    const denom = Math.min(A.sigwords.length, B.sigwords.length) || 1;
    if (ov >= 3 && (ov / denom >= 0.4 || ov >= 4)) parent[find(i)] = find(j);
  }
  const groups = {};
  items.forEach((it, i) => { const r = find(i); (groups[r] = groups[r] || []).push(it); });

  const vprev = lsGet(LS.vel + sec, {}), vnext = {};
  Object.values(groups).forEach(mem => {
    const nsrc = new Set(mem.map(m => m.source)).size;
    const freq = {}; mem.forEach(m => m.sigwords.forEach(w => freq[w] = (freq[w] || 0) + 1));
    const gsig = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]).sort().join('-') || mem[0].key;
    const prev = vprev[gsig];
    const rising = !!prev && nsrc > prev.nsrc;
    vnext[gsig] = { nsrc, first: prev ? prev.first : now, ts: now };
    mem.forEach(m => {
      m.nsrc = nsrc; m.rising = rising;
      m.related = mem.filter(x => x !== m).map(x => ({ source:x.source, title:x.title, link:x.link }));
      m.score = m.base + (nsrc > 1 ? (nsrc - 1) * 6 : 0) + (rising ? 12 : 0);
    });
  });
  for (const k in vprev) if (vnext[k] === undefined && vprev[k].ts && now - vprev[k].ts < 12 * 3.6e6) vnext[k] = vprev[k];
  lsSet(LS.vel + sec, vnext);

  items.forEach(it => { it.watch = watchlist.some(w => (it.title + ' ' + it.desc).toLowerCase().includes(w.toLowerCase())); });

  const regions = {};
  items.forEach(it => (it.geo || []).forEach(id => regions[id] = (regions[id] || 0) + 1));
  return { items, regions };
}

/* ---------------- alerts ---------------- */
let actx = null;
function chime(){
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    [0, .13].forEach((t, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = i ? 784 : 523.25;
      o.connect(g); g.connect(actx.destination);
      const s = actx.currentTime + t;
      g.gain.setValueAtTime(.0001, s);
      g.gain.exponentialRampToValueAtTime(.13, s + .02);
      g.gain.exponentialRampToValueAtTime(.0001, s + .32);
      o.start(s); o.stop(s + .34);
    });
  } catch {}
}
function maybeAlert(sec){
  const S = STATE[sec];
  const cand = S.items.filter(i => i.watch || ((i.sev === 'crit' || i.sev === 'hi') && i.ageH * 60 <= BREAKING_MIN));
  const first = !seeded[sec]; seeded[sec] = true;
  const fresh = cand.filter(i => !notified[i.key]);
  fresh.forEach(i => notified[i.key] = Date.now() + 6 * 3.6e6);
  lsSet(LS.notified, notified);
  if (first || !alertsOn || !fresh.length) return;
  chime();
  if ('Notification' in window && Notification.permission === 'granted'){
    const top = fresh.sort((a, b) => b.score - a.score)[0];
    try { new Notification((top.watch ? 'Watchlist · ' : 'Breaking · ') + SECTIONS[sec].label, { body: top.source + ' — ' + top.title, tag: top.key }); } catch {}
  }
}

/* ---------------- rendering ---------------- */
function heatColor(hex, t){
  const c = hex.replace('#',''), r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
  const br = 22, bg = 27, bb = 37;
  return `rgb(${Math.round(br+(r-br)*t)},${Math.round(bg+(g-bg)*t)},${Math.round(bb+(b-bb)*t)})`;
}
function skeleton(n){
  return Array.from({length:n}, () => `<div class="skel"><div class="sk r"></div><div><div class="sk l1"></div><div class="sk l2"></div><div class="sk l3"></div></div></div>`).join('');
}
function sparkline(items, accent){
  const now = Date.now(), b = new Array(24).fill(0);
  items.forEach(i => { const h = Math.floor((now - new Date(i.date).getTime()) / 3.6e6); if (h >= 0 && h < 24) b[23 - h]++; });
  const max = Math.max(1, ...b);
  return `<span class="spark" title="stories per hour, last 24h">` +
    b.map((v, i) => `<i class="${i===23?'last':''}" style="height:${Math.max(2, Math.round(v/max*18))}px;animation-delay:${i*14}ms"></i>`).join('') + `</span>`;
}
function countUp(el, to){
  const from = +(el.dataset.v || 0);
  if (from === to){ el.textContent = to; return; }
  el.dataset.v = to;
  const dur = 620, st = performance.now();
  (function step(t){
    const p = Math.min(1, (t - st) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  })(st);
}

function deskDOM(sec){
  const cfg = SECTIONS[sec], geo = GEO[cfg.geo];
  const el = document.createElement('section');
  el.className = 'page'; el.id = 'page-' + sec;
  el.innerHTML = `
    <div class="stats">
      <div class="stat accent"><div class="v" id="st-${sec}-top">0</div><div class="k">Top score</div></div>
      <div class="stat"><div class="v" id="st-${sec}-stories">0</div><div class="k">Stories</div></div>
      <div class="stat"><div class="v" id="st-${sec}-brk">0</div><div class="k">Breaking</div></div>
    </div>
    <div class="filters" data-filters></div>
    <div class="grid">
      <div class="card">
        <div class="card-h"><h2>Breaking</h2><span class="sub">last 2h</span>
          <div class="right"><span class="tick" data-brkn>0</span></div></div>
        <div class="list" data-alerts>${skeleton(3)}</div>
      </div>
      <div class="card">
        <div class="card-h"><h2>Ranked</h2><span class="sub">by importance</span>
          <div class="right">${sparkline([], cfg.accent)}<span class="tick" data-storyn>0</span></div></div>
        <div class="field" style="margin:12px 16px 4px">${icon('search')}
          <input type="text" data-search placeholder="Search ${esc(cfg.full)}…" autocomplete="off" autocapitalize="none"></div>
        <div class="trend" data-trend></div>
        <div class="list" data-stories>${skeleton(6)}</div>
      </div>
      <div class="card map-card">
        <div class="card-h"><h2>${cfg.geo === 'us' ? 'State map' : 'World map'}</h2><span class="sub">story density</span></div>
        <div class="map-wrap">${geo.buildSVG()}</div>
        <div class="legend"><span>Low</span>
          <span class="scale">${Array.from({length:7},(_,i)=>`<i style="background:${heatColor(cfg.accent,.22+i/7*.78)}"></i>`).join('')}</span>
          <span>High</span><span class="hint">Tap a ${cfg.geo === 'us' ? 'state' : 'country'} to filter</span></div>
        <div class="ranks" data-ranks></div>
      </div>
    </div>`;
  return el;
}

function render(sec){
  const S = STATE[sec], cfg = SECTIONS[sec], geo = GEO[cfg.geo], f = filters[sec];
  const el = $('page-' + sec); if (!el) return;

  if (!S.loaded && S.loading) return;

  /* breaking */
  const brk = S.items.filter(i => i.ageH * 60 <= BREAKING_MIN && (i.sev === 'crit' || i.sev === 'hi' || /\b(breaking|live|just in|urgent)\b/i.test(i.title)))
    .sort((a, b) => b.score - a.score).slice(0, 12);
  el.querySelector('[data-alerts]').innerHTML = brk.length ? brk.map((i, x) => `
    <a class="alert" href="${esc(i.link)}" target="_blank" rel="noopener" style="animation-delay:${x*40}ms">
      <div class="top"><span class="sev ${i.sev==='crit'?'':'warn'}">${i.sev==='crit'?'Critical':'Alert'}</span>
        <span class="src">${esc(i.source)}</span><span class="ago">${timeAgo(i.ageH)} ago</span></div>
      <h4>${esc(i.title)}</h4>
      ${(i.geo||[]).length ? `<div class="geos">${i.geo.slice(0,3).map(g=>`<span class="geo">${esc(geo.name(g))}</span>`).join('')}</div>` : ''}
    </a>`).join('') : `<div class="empty-state">${icon('quiet')}<div>No breaking alerts.<br>The wire is quiet.</div></div>`;
  el.querySelector('[data-brkn]').textContent = brk.length;

  /* filter pills */
  const pills = [];
  if (f.region) pills.push(`<button class="fpill" data-clear="region">${esc(geo.name(f.region))}${icon('x')}</button>`);
  if (f.entity) pills.push(`<button class="fpill" data-clear="entity">${esc(f.entity)}${icon('x')}</button>`);
  el.querySelector('[data-filters]').innerHTML = pills.join('');

  /* trending entities */
  const ents = ENTITIES[sec] || [];
  const counts = {};
  S.items.forEach(it => { const hay = (it.title + ' ' + it.desc).toLowerCase();
    ents.forEach(en => { if (hay.includes(en.toLowerCase())) counts[en] = (counts[en] || 0) + 1; }); });
  const topEnts = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 9);
  const trendBox = el.querySelector('[data-trend]');
  trendBox.innerHTML = topEnts.length
    ? `<span class="tlabel">Trending</span>` + topEnts.map(([en, c]) =>
        `<button class="tchip ${f.entity===en?'on':''}" data-entity="${esc(en)}">${esc(en)}<i>${c}</i></button>`).join('')
    : '';

  /* stories */
  let items = S.items.filter(i => !dismissed[i.key]);
  if (f.region) items = items.filter(i => (i.geo || []).includes(f.region));
  if (f.entity) items = items.filter(i => (i.title + ' ' + i.desc).toLowerCase().includes(f.entity.toLowerCase()));
  if (f.q){ const q = f.q.toLowerCase(); items = items.filter(i => (i.title + ' ' + i.desc).toLowerCase().includes(q)); }
  const lastVisit = visits[sec] || Date.now();
  items.sort((a, b) => (b.watch - a.watch) || (b.score - a.score));
  const max = items.length ? Math.max(...items.map(i => i.score)) : 1;

  el.querySelector('[data-stories]').innerHTML = items.length ? items.slice(0, 50).map((i, x) => {
    const fresh = new Date(i.date).getTime() > lastVisit;
    const badges = [
      i.watch ? '<span class="badge watch">Watch</span>' : '',
      i.rising ? '<span class="badge rise">Rising</span>' : '',
      fresh ? '<span class="badge fresh">New</span>' : ''
    ].join('');
    const geos = (i.geo || []).slice(0, 3).map(g =>
      `<span class="geo ${f.region===g?'on':''}" data-region="${esc(g)}">${esc(geo.name(g))}</span>`).join('');
    const multi = i.nsrc > 1
      ? `<span class="srcs" data-rel="${esc(i.key)}">${i.nsrc} sources ${icon('chev')}</span>` : '';
    const rel = i.nsrc > 1 ? `<div class="rel" data-relbox="${esc(i.key)}"><div class="rel-in">${
      (i.related||[]).map(r => `<a class="rel-item" href="${esc(r.link)}" target="_blank" rel="noopener"><span class="s">${esc(r.source)}</span><span class="t">${esc(r.title)}</span></a>`).join('')
    }</div></div>` : '';
    return `<div class="story ${i.watch?'pin':''} ${i.rising?'flash':''}" style="animation-delay:${Math.min(x,14)*32}ms">
      <div class="rank">${x + 1}</div>
      <div>
        <a href="${esc(i.link)}" target="_blank" rel="noopener"><h3>${esc(i.title)}</h3></a>
        <div class="meta"><span class="src">${esc(i.source)}</span><span class="dot-sep"></span>
          <span class="when">${timeAgo(i.ageH)} ago</span>${badges}${multi}${geos}</div>
      </div>
      <div class="score"><span class="n">${Math.round(i.score)}</span>
        <span class="bar"><i style="width:${Math.max(6,Math.round(i.score/max*100))}%;animation-delay:${Math.min(x,14)*32}ms"></i></span></div>
      ${rel}
    </div>`;
  }).join('') : `<div class="empty-state">${icon('search')}<div>Nothing matches${(f.region||f.entity||f.q)?' this filter':''}.</div></div>`;
  el.querySelector('[data-storyn]').textContent = items.length;
  el.querySelector('.card-h .right .spark')?.replaceWith(
    new DOMParser().parseFromString(sparkline(S.items, cfg.accent), 'text/html').body.firstChild);

  /* stats */
  countUp($(`st-${sec}-stories`), S.items.length);
  countUp($(`st-${sec}-brk`), brk.length);
  countUp($(`st-${sec}-top`), items.length ? Math.round(items[0].score) : 0);

  /* map */
  const svg = el.querySelector('svg.geomap');
  const vals = Object.values(S.regions), mx = vals.length ? Math.max(...vals) : 1;
  svg.querySelectorAll('path.region').forEach(p => {
    const id = p.getAttribute('data-id'), v = S.regions[id] || 0;
    if (v > 0){ p.style.fill = heatColor(cfg.accent, Math.min(1, .22 + (v / mx) * .78)); p.classList.add('hot'); }
    else { p.style.fill = ''; p.classList.remove('hot'); }
    p.classList.toggle('sel', id === f.region);
  });
  const arr = Object.entries(S.regions).sort((a, b) => b[1] - a[1]).slice(0, 7);
  el.querySelector('[data-ranks]').innerHTML = arr.length ? arr.map(([id, v], x) =>
    `<div class="rrow ${f.region===id?'on':''}" data-region="${esc(id)}"><span class="ri">${x+1}</span>
     <span class="rn">${esc(geo.name(id))}</span>
     <span class="rb"><i style="width:${Math.round(v/arr[0][1]*100)}%;animation-delay:${x*50}ms"></i></span>
     <span class="rv">${v}</span></div>`).join('')
    : `<div class="hint" style="padding:6px 0">No locations detected yet.</div>`;
}

function renderStrip(){
  let all = [];
  DESKS.forEach(sec => STATE[sec].items
    .filter(i => i.ageH * 60 <= BREAKING_MIN * 1.4 && (i.sev === 'crit' || i.sev === 'hi'))
    .forEach(i => all.push({ ...i, sec })));
  all.sort((a, b) => b.score - a.score); all = all.slice(0, 16);
  const t = $('stripTrack');
  if (!all.length){ t.innerHTML = '<span class="strip-empty">No critical alerts — the wire is quiet.</span>'; t.style.animation = 'none'; return; }
  const html = all.map(i => `<span class="strip-item" data-link="${esc(i.link)}"><em>${esc(SECTIONS[i.sec].label)}</em><b>${esc(i.source)}</b>${esc(i.title)}</span>`).join('');
  t.innerHTML = html + html;
  t.style.animation = `marquee ${Math.max(46, all.length * 7)}s linear infinite`;
}

function renderWatch(){
  $('watchChips').innerHTML = watchlist.map(w =>
    `<span class="wchip">${esc(w)}<span data-unwatch="${esc(w)}">${icon('x')}</span></span>`).join('');
  $('alertToggle').classList.toggle('on', alertsOn);
  const rows = [];
  let ok = 0, total = 0;
  DESKS.forEach(sec => {
    SECTIONS[sec].feeds.forEach(f => {
      const st = STATE[sec].feedStatus[f.n] || 'load';
      if (st === 'ok') ok++;
      total++;
      rows.push(`<span class="fchip ${st}"><i></i>${esc(f.n)}</span>`);
    });
  });
  $('feedHealth').innerHTML = rows.join('');
  $('feedCount').textContent = ok + ' / ' + total + ' live';
  const ts = DESKS.map(s => STATE[s].ts).filter(Boolean).sort((a, b) => b - a)[0];
  $('syncTxt').textContent = 'Last sync: ' + (ts ? new Date(ts).toLocaleString() : 'never');
}

function updateLive(){
  const srcs = DESKS.map(s => STATE[s].source).filter(Boolean);
  const ts = DESKS.map(s => STATE[s].ts).filter(Boolean).sort((a, b) => b - a)[0];
  const pill = $('livePill');
  let cls = 'livepill', txt = 'Standby';
  if (srcs.includes('wire')) txt = 'Live';
  else if (srcs.includes('proxy')) txt = 'Relay';
  else if (srcs.includes('cache')){ cls += ' cache'; txt = 'Cached'; }
  if (ts && (Date.now() - ts) / 60000 > 12 && !cls.includes('cache')) cls += ' stale';
  pill.className = cls; $('liveTxt').textContent = txt;
}

/* ---------------- loading ---------------- */
let pre = null, preTried = false;
async function getPrefetch(){
  if (preTried) return pre; preTried = true;
  try {
    const r = await fetch('./data/feeds.json', { cache:'no-store' });
    if (r.ok){ const j = await r.json();
      if (j && j.generatedAt && (Date.now() - new Date(j.generatedAt).getTime()) < PREFETCH_MAX_AGE && j.sections) pre = j; }
  } catch {}
  return pre;
}
async function load(sec, force){
  const S = STATE[sec];
  if (S.loading || (S.loaded && !force)) return;
  S.loading = true;
  const p = await getPrefetch();
  let raw, status, source;
  if (p && p.sections[sec] && p.sections[sec].length){
    raw = p.sections[sec]; status = Object.assign({}, p.status); source = 'wire';
    SECTIONS[sec].feeds.forEach(f => { if (!(f.n in status)) status[f.n] = 'ok'; });
  } else {
    const r = await proxyFetch(sec); raw = r.items; status = r.status; source = 'proxy';
  }
  const a = analyze(sec, raw);
  S.items = a.items; S.regions = a.regions; S.feedStatus = status;
  S.loaded = true; S.loading = false; S.ts = Date.now(); S.source = source;
  lsSet(LS.cache + sec, { ts:S.ts, raw: raw.slice(0, 60), status });
  maybeAlert(sec);
  render(sec); renderStrip(); renderWatch(); updateLive(); updateTabBadges();
}
function hydrate(sec){
  const c = lsGet(LS.cache + sec, null);
  if (!c || !c.raw) return false;
  const a = analyze(sec, c.raw);
  const S = STATE[sec];
  S.items = a.items; S.regions = a.regions; S.feedStatus = c.status || {};
  S.loaded = true; S.ts = c.ts; S.source = 'cache'; seeded[sec] = true;
  return true;
}

/* ---------------- navigation ---------------- */
function setAccent(sec){
  const c = SECTIONS[sec] ? SECTIONS[sec].accent : '#E5484D';
  document.documentElement.style.setProperty('--accent', c);
}
function go(page){
  if (page === current) return;
  if (SECTIONS[current]) { visits[current] = Date.now(); lsSet(LS.visit, visits); }
  current = page;
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + page));
  document.querySelectorAll('.tabbtn').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  document.querySelectorAll('.dtab').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  if (SECTIONS[page]){
    setAccent(page);
    $('deskName').textContent = SECTIONS[page].full;
    if (visits[page] === undefined){ visits[page] = Date.now(); lsSet(LS.visit, visits); }
    load(page, false); render(page);
  } else {
    $('deskName').textContent = 'Watchlist';
    renderWatch();
  }
  updateTabBadges();
  window.scrollTo({ top:0, behavior:'smooth' });
}
function updateTabBadges(){
  DESKS.forEach(sec => {
    const btn = document.querySelector(`.tabbtn[data-page="${sec}"]`); if (!btn) return;
    const n = STATE[sec].items.filter(i => i.ageH * 60 <= BREAKING_MIN && (i.sev === 'crit' || i.sev === 'hi')).length;
    let b = btn.querySelector('.nb');
    if (n){ if (!b){ b = document.createElement('span'); b.className = 'nb'; btn.appendChild(b); } b.textContent = n > 9 ? '9+' : n; }
    else if (b) b.remove();
    const dt = document.querySelector(`.dtab[data-page="${sec}"] .n`);
    if (dt) dt.textContent = STATE[sec].items.length || '';
  });
}

/* ---------------- pull to refresh ---------------- */
function initPTR(){
  let sy = 0, pulling = false, dist = 0;
  const ptr = $('ptr'), main = $('main'), TH = 72;
  addEventListener('touchstart', e => {
    if (window.scrollY > 2 || refreshing) return;
    sy = e.touches[0].clientY; pulling = true; dist = 0;
  }, { passive:true });
  addEventListener('touchmove', e => {
    if (!pulling) return;
    dist = e.touches[0].clientY - sy;
    if (dist <= 0){ pulling = false; reset(); return; }
    if (window.scrollY > 2){ pulling = false; reset(); return; }
    const d = Math.min(110, dist * .52);
    ptr.style.height = d + 'px'; ptr.style.opacity = Math.min(1, d / 46);
    ptr.classList.toggle('armed', d >= TH * .52);
    main.style.transform = `translateY(${d * .5}px)`;
  }, { passive:true });
  addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    const armed = ptr.classList.contains('armed');
    if (armed){
      ptr.classList.remove('armed'); ptr.classList.add('loading');
      $('ptrTxt').textContent = 'Refreshing';
      ptr.style.height = '44px'; ptr.style.opacity = '1'; main.style.transform = 'translateY(22px)';
      refreshAll().then(() => { setTimeout(reset, 320); });
    } else reset();
  });
  function reset(){
    ptr.style.transition = 'height .3s cubic-bezier(.22,1,.36,1), opacity .3s';
    main.style.transition = 'transform .35s cubic-bezier(.22,1,.36,1)';
    ptr.style.height = '0'; ptr.style.opacity = '0';
    ptr.classList.remove('armed','loading'); $('ptrTxt').textContent = 'Pull to refresh';
    main.style.transform = '';
    setTimeout(() => { ptr.style.transition = ''; main.style.transition = ''; }, 380);
  }
}

/* ---------------- refresh ---------------- */
let refreshing = false, nextAt = Date.now() + REFRESH_MS;
async function refreshAll(){
  if (refreshing) return;
  refreshing = true;
  $('btnRefresh').classList.add('spinning');
  nextAt = Date.now() + REFRESH_MS; preTried = false; pre = null;
  const order = [current, ...DESKS.filter(s => s !== current)].filter(s => SECTIONS[s]);
  for (const s of order) await load(s, true);
  $('btnRefresh').classList.remove('spinning');
  refreshing = false;
}

/* ---------------- boot ---------------- */
function init(){
  const main = $('main'), watchPage = $('page-watch');
  DESKS.forEach(sec => main.insertBefore(deskDOM(sec), watchPage));

  // tab bars
  const tabs = [...DESKS.map(s => ({ p:s, label:SECTIONS[s].label, ic: s === 'us' ? 'flag' : 'globe' })),
                { p:'watch', label:'Watch', ic:'star' }];
  $('tabbar').innerHTML = tabs.map(t =>
    `<button class="tabbtn ${t.p===current?'on':''}" data-page="${t.p}">${icon(t.ic)}<span>${t.label}</span></button>`).join('');
  $('deskbar').innerHTML = tabs.map(t =>
    `<button class="dtab ${t.p===current?'on':''}" data-page="${t.p}">${t.label}<span class="n"></span></button>`).join('') +
    '<div class="bar-sp"></div>';
  document.querySelectorAll('.tabbtn,.dtab').forEach(b => b.onclick = () => go(b.dataset.page));

  $('page-' + current).classList.add('on');
  setAccent(current);
  $('deskName').textContent = SECTIONS[current].full;
  $('aboutTxt').textContent = `War Room aggregates ${DESKS.reduce((a,s)=>a+SECTIONS[s].feeds.length,0)} free news feeds across ${DESKS.length} desks. `
    + 'Importance is scored from urgency language, recency, cross-outlet corroboration and coverage velocity. '
    + 'Country and state heat reflects weighted story mentions. No accounts, no tracking, no API keys.';

  // delegated interactions
  main.addEventListener('click', e => {
    const region = e.target.closest('[data-region]');
    if (region){ const f = filters[current]; if (!SECTIONS[current]) return;
      const id = region.getAttribute('data-region');
      f.region = f.region === id ? null : id; render(current); return; }
    const path = e.target.closest('path.region');
    if (path && SECTIONS[current]){ const f = filters[current], id = path.getAttribute('data-id');
      f.region = f.region === id ? null : id; render(current); return; }
    const ent = e.target.closest('[data-entity]');
    if (ent && SECTIONS[current]){ const f = filters[current], v = ent.getAttribute('data-entity');
      f.entity = f.entity === v ? null : v; render(current); return; }
    const clr = e.target.closest('[data-clear]');
    if (clr){ filters[current][clr.getAttribute('data-clear')] = null; render(current); return; }
    const rel = e.target.closest('[data-rel]');
    if (rel){ const box = main.querySelector(`[data-relbox="${CSS.escape(rel.getAttribute('data-rel'))}"]`);
      if (box){ box.classList.toggle('open'); rel.classList.toggle('open'); } return; }
    const un = e.target.closest('[data-unwatch]');
    if (un){ const w = un.getAttribute('data-unwatch'); watchlist = watchlist.filter(x => x !== w);
      lsSet(LS.watch, watchlist); reScoreWatch(); renderWatch(); return; }
  });

  // map tooltip
  const tip = $('maptip');
  main.addEventListener('pointermove', e => {
    const p = e.target.closest('path.region');
    if (p && SECTIONS[current]){
      const id = p.getAttribute('data-id'), v = STATE[current].regions[id] || 0;
      tip.innerHTML = `<div class="n">${esc(p.getAttribute('data-name'))}</div><div class="c">${v} ${v===1?'story':'stories'}</div>`;
      tip.classList.add('on');
      tip.style.left = Math.min(innerWidth - 170, e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 16) + 'px';
    } else tip.classList.remove('on');
  });
  main.addEventListener('pointerleave', () => tip.classList.remove('on'));

  // search (per desk)
  main.addEventListener('input', e => {
    const s = e.target.closest('[data-search]');
    if (s && SECTIONS[current]){ filters[current].q = s.value.trim(); render(current); }
  });

  // watch input
  $('watchInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim();
    if (v && !watchlist.some(w => w.toLowerCase() === v.toLowerCase())){
      watchlist.push(v); lsSet(LS.watch, watchlist); reScoreWatch(); renderWatch();
    }
    e.target.value = '';
    e.target.blur();
  });
  $('alertToggle').onclick = () => {
    alertsOn = !alertsOn; lsSet(LS.alerts, alertsOn);
    $('alertToggle').classList.toggle('on', alertsOn);
    if (alertsOn){
      chime();
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    }
  };
  $('btnRefresh').onclick = () => refreshAll();
  $('stripTrack').addEventListener('click', e => {
    const it = e.target.closest('.strip-item');
    if (it && it.dataset.link) window.open(it.dataset.link, '_blank', 'noopener');
  });

  initPTR();
}
function reScoreWatch(){
  DESKS.forEach(sec => {
    STATE[sec].items.forEach(i => i.watch = watchlist.some(w => (i.title + ' ' + i.desc).toLowerCase().includes(w.toLowerCase())));
  });
  if (SECTIONS[current]) render(current);
}

function tickClock(){
  const d = new Date();
  $('clock').textContent = d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

init();
DESKS.forEach(sec => hydrate(sec));
DESKS.forEach(sec => { if (visits[sec] === undefined) visits[sec] = Date.now(); });
lsSet(LS.visit, visits);
render(current); renderStrip(); renderWatch(); updateLive(); updateTabBadges();
tickClock(); setInterval(tickClock, 10000);

load(current, true);
DESKS.filter(s => s !== current).forEach((s, i) => setTimeout(() => load(s, true), 1400 * (i + 1)));
setInterval(() => { if (Date.now() >= nextAt) refreshAll(); }, 5000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - (STATE[current].ts || 0) > REFRESH_MS) refreshAll();
});

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

window.__WR = { STATE, analyze, GEO, filters, go, render, get current(){ return current; } };
})();
