/* ============================================================
   app.js — WAR ROOM browser application
   Depends on: engine-core.js (window.ENGINE), geo-world.js
   (window.WORLD), geo-usa.js (window.USA)
   ============================================================ */
(function () {
'use strict';
const E = window.ENGINE;
const SECTIONS = E.SECTIONS;

/* ---------------- config ---------------- */
const REFRESH_MS   = 5 * 60 * 1000;
const MAX_AGE_HRS  = 30;
const BREAKING_MIN = 150;
const PREFETCH_MAX_AGE = 40 * 60 * 1000;   // use data/feeds.json if newer than this
const LS = {
  cache: 'wr_cache_', vel: 'wr_vel_', dismiss: 'wr_dismiss', watch: 'wr_watch',
  alerts: 'wr_alerts', notified: 'wr_notified', visit: 'wr_visit'
};
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
        4:['election','protest','summit','talks','deal','court','ruling','ban','resign','warning','threat','tension','deploy','arrest','indict','probe','vote','referendum','border','troops','shutdown'],
        2:['minister','president','government','policy','economy','markets','report','plan','meeting']},
  us:{10:['mass shooting','shooting','shot dead','killed','wildfire','tornado','hurricane','explosion','manhunt','assassinat','terror','hostage','state of emergency','plane crash'],
      7:['congress','senate','supreme court','white house','impeach','indict','indictment','shutdown','strike','protest','recall','lawsuit','verdict','recession','layoffs','inflation','border','flooding','evacuat','outage','fbi','doj','filibuster','veto'],
      4:['president','governor','senator','election','campaign','vote','bill','policy','poll','trump','biden','harris','congressman','mayor','ballot','primary','ruling'],
      2:['plan','report','economy','markets','study','state','federal','budget']},
  ai:{10:['agi','superintelligence','breakthrough','banned','lawsuit','sued','shuts down','emergency'],
      7:['launch','launches','released','release','unveils','unveil','raises','funding','acquire','acquisition','partnership','open source','open-source','gpt','claude','gemini','llama','frontier model','regulation','safety','deepfake','layoff'],
      4:['ai','model','chatbot','openai','anthropic','google','microsoft','meta','nvidia','startup','chip','agent','robot','automation','benchmark','training'],
      2:['tech','software','update','feature','tool','app','platform']},
  good:{10:['cure','cured','rescued','rescue','saved','lifesaving','record low','eradicat','breakthrough','historic first'],
        7:['recovery','restored','restore','milestone','first ever','donates','donated','million dollars','planted','protected','reunited','survived','thrives','revived','wins','award','discovered','discovery'],
        4:['positive','hope','helping','community','volunteer','kindness','success','improve','clean energy','renewable','conservation','wildlife','solar','education'],
        2:['new','study','plan','project','launch','opens']}
};

const SENT_POS = ['rescue','rescued','saved','cure','cured','breakthrough','hope','hopeful','win','wins','won','record','restored','recovery','recovering','thrive','thrives','donate','donated','uplifting','heartwarming','celebrate','celebration','historic','milestone','success','successful','improve','improved','protected','revived','reunited','survivor','survived','joy','kind','kindness','positive','progress','discovery','planted','clean','renewable','soar','soars','boost','helping','helps','healed','miracle','triumph'];
const SENT_NEG = ['killed','dead','death','dies','died','war','attack','shooting','massacre','crisis','disaster','tragedy','tragic','fear','collapse','crash','victim','arrested','fraud','scandal','lawsuit','abuse','fatal','wounded','injured','deadly','famine','outbreak','terror','genocide','bomb','missile','warns','warning','threat','recession','layoffs','crackdown','violence','shot'];

/* curated entities per desk (people/orgs) */
const ENTITIES = {
  ai:['OpenAI','Anthropic','Google','DeepMind','Microsoft','Meta','Nvidia','Apple','Amazon','xAI','Mistral','Hugging Face','Tesla','Samsung','TSMC','Intel','Perplexity','Midjourney','Cohere','Sam Altman','Elon Musk','Sundar Pichai','Jensen Huang','Mark Zuckerberg','Dario Amodei','Demis Hassabis','ChatGPT','Claude','Gemini','Copilot','Llama'],
  global:['United Nations','NATO','European Union','White House','Kremlin','Pentagon','Hamas','Hezbollah','Taliban','Putin','Zelensky','Netanyahu','Trump','Xi Jinping','Modi','WHO','IMF','World Bank','G7','OPEC'],
  us:['White House','Congress','Senate','Supreme Court','Trump','Biden','Harris','Republicans','Democrats','GOP','Federal Reserve','Wall Street','FBI','DOJ','ICE','Pentagon','SCOTUS','Elon Musk','Capitol Hill'],
  good:['NASA','WHO','UN','WWF','Red Cross']
};

/* ---------------- GEO abstraction ---------------- */
function projFromBounds(lon0, lat0, lon1, lat1, W){
  const mid = (lat0 + lat1) / 2 * Math.PI / 180, k = Math.cos(mid);
  const xspan = (lon1 - lon0) * k, s = W / xspan, H = (lat1 - lat0) * s;
  const f = (lon, lat) => [ (lon - lon0) * k * s, (lat1 - lat) * s ];
  f.W = W; f.H = H; return f;
}
const worldProj = (lon, lat) => [ (lon + 180) / 360 * 1000, (90 - lat) / 180 * 500 ];
worldProj.W = 1000; worldProj.H = 415;

function buildGeo(fc, idOf, project, aliasMap, opts){
  opts = opts || {};
  const nameById = {};
  fc.features.forEach(f => { nameById[idOf(f)] = f.properties.name; });
  // build sorted alias keys — explicit aliases win over auto feature-name keys
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
  // build svg once
  let svg = null;
  function ring(r){ let d = ''; for (let i = 0; i < r.length; i++){ const p = project(r[i][0], r[i][1]); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } return d + 'Z'; }
  function fpath(f){ const g = f.geometry, out = []; if (g.type === 'Polygon') g.coordinates.forEach(r => out.push(ring(r))); else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => out.push(ring(r)))); return out.join(''); }
  function buildSVG(){
    if (svg) return svg;
    let paths = '';
    for (const f of fc.features){
      if (opts.skip && opts.skip(f)) continue;
      const id = idOf(f);
      paths += `<path class="region" data-id="${String(id).replace(/"/g,'')}" data-name="${f.properties.name.replace(/"/g,'')}" d="${fpath(f)}"></path>`;
    }
    const viewH = opts.viewH || project.H;
    svg = `<svg class="geomap ${opts.cls||''}" viewBox="0 0 ${project.W} ${viewH}" preserveAspectRatio="xMidYMid meet">${paths}</svg>`;
    return svg;
  }
  return { nameById, detect, buildSVG, name: id => nameById[id] || id };
}

/* world aliases (country name / capital / demonym / leader -> ISO3) */
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

/* US state aliases (state / city / DC -> state name) */
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
  us:    buildGeo(window.USA, f => f.properties.name, projFromBounds(-125, 22, -66.9, 49.6, 1000), US_ALIAS, { cls: 'us' })
};

/* ---------------- state ---------------- */
const STATE = {};
Object.keys(SECTIONS).forEach(s => STATE[s] = { items:[], regions:{}, feedStatus:{}, loaded:false, loading:false, ts:null, source:null });
let current = 'global';
const filters = { country:null, entity:null, search:'' };
let firstAnalyze = {};   // per-section seed guard for notifications

/* localStorage helpers */
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let dismissed = lsGet(LS.dismiss, {});            // key -> expiry ts
let watchlist = lsGet(LS.watch, []);
let notified  = lsGet(LS.notified, {});           // key -> expiry ts
let visits    = lsGet(LS.visit, {});
let alertsOn  = lsGet(LS.alerts, false);
// prune dismissed/notified
const nowMs = Date.now();
for (const k in dismissed) if (dismissed[k] < nowMs) delete dismissed[k];
for (const k in notified) if (notified[k] < nowMs) delete notified[k];

/* ---------------- utils ---------------- */
const esc = s => (s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const keyOf = t => t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
function timeAgo(h){ const m = Math.round(h * 60); if (m < 1) return 'now'; if (m < 60) return m + 'm ago'; if (h < 24) return Math.round(h) + 'h ago'; return Math.round(h / 24) + 'd ago'; }
const STOP = new Set('the a an of to in on for and or as at by with from into over after new says say will has have amid could would this that than then who what when why how are was were be been being about against between during also more most been'.split(' '));
const sig = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));

/* ---------------- fetch ---------------- */
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
  throw new Error('all proxies failed');
}
async function proxyFetchSection(sec){
  const cfg = SECTIONS[sec], status = {};
  const results = await Promise.allSettled(cfg.feeds.map(async f => {
    try { const items = E.parseFeed(await fetchText(f.u), f.n); status[f.n] = items.length ? 'ok' : 'empty'; return items; }
    catch { status[f.n] = 'err'; return []; }
  }));
  const seen = new Set(), all = [];
  results.forEach(r => { if (r.status === 'fulfilled') r.value.forEach(it => {
    const k = keyOf(it.title); if (!k || seen.has(k)) return; seen.add(k); all.push(it);
  }); });
  return { items: all, status };
}

/* ---------------- analysis ---------------- */
function sentiment(hay){ let s = 0; for (const w of SENT_POS) if (hay.includes(w)) s++; for (const w of SENT_NEG) if (hay.includes(w)) s--; return s; }

function analyze(sec, raw){
  const cfg = SECTIONS[sec], geo = GEO[cfg.geo], kw = KW[cfg.kw];
  const now = Date.now();
  let items = raw.map(it => ({ ...it })).filter(it => {
    const ageH = (now - new Date(it.date).getTime()) / 3.6e6;
    return ageH <= MAX_AGE_HRS && ageH >= -3;
  });
  // dedupe
  const seen = new Set();
  items = items.filter(it => { const k = keyOf(it.title); if (!k || seen.has(k)) return false; seen.add(k); return true; });

  items.forEach(it => {
    it.key = keyOf(it.title);
    it.ageH = (now - new Date(it.date).getTime()) / 3.6e6;
    const hay = (it.title + ' ' + it.desc).toLowerCase();
    let ks = 0, sev = '';
    for (const [w, list] of Object.entries(kw)) for (const term of list) if (hay.includes(term)){ ks += +w; if (+w >= 7 && !sev) sev = 'hi'; if (+w >= 10) sev = 'crit'; }
    it.kwScore = ks; it.sev = sev;
    it.sent = sentiment(hay);
    it.geo = geo.detect(it.title + ' ' + it.desc);
    it.sigwords = sig(it.title);
    const rec = Math.max(0, 26 - it.ageH * 1.15);
    it.base = ks * 1.6 + rec + (cfg.kw === 'good' ? it.sent * 3 : 0);
  });

  // good desk: drop clearly-negative stories
  if (cfg.kw === 'good') items = items.filter(it => it.sent > -2 && !/\b(killed|dead|dies|war|massacre|shooting)\b/.test(it.title.toLowerCase()));

  // corroboration -> connected components
  const n = items.length, parent = Array.from({ length: n }, (_, i) => i);
  const find = x => { while (parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const uni = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++){
    const A = items[i], B = items[j]; if (A.source === B.source) continue;
    const setB = new Set(B.sigwords); let ov = 0; for (const w of A.sigwords) if (setB.has(w)) ov++;
    const denom = Math.min(A.sigwords.length, B.sigwords.length) || 1;
    if (ov >= 3 && (ov / denom >= 0.4 || ov >= 4)) uni(i, j);
  }
  const groups = {};
  items.forEach((it, i) => { const r = find(i); (groups[r] = groups[r] || []).push(it); });

  // velocity snapshots
  const vprev = lsGet(LS.vel + sec, {});
  const vnext = {};
  Object.values(groups).forEach(members => {
    const sources = new Set(members.map(m => m.source));
    const nsrc = sources.size;
    // stable signature from most frequent sig words in the group
    const freq = {}; members.forEach(m => m.sigwords.forEach(w => freq[w] = (freq[w] || 0) + 1));
    const gsig = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]).sort().join('-') || members[0].key;
    const prev = vprev[gsig];
    const rising = !!prev && nsrc > prev.nsrc;
    const first = prev ? prev.first : now;
    vnext[gsig] = { nsrc, first, ts: now };
    const rep = members.slice().sort((a, b) => b.base - a.base)[0];
    members.forEach(m => {
      m.nsrc = nsrc; m.rising = rising; m.groupSig = gsig;
      m.related = members.filter(x => x !== m).map(x => ({ source: x.source, title: x.title, link: x.link }));
      m.isRep = (m === rep);
      m.score = m.base + (nsrc > 1 ? (nsrc - 1) * 6 : 0) + (rising ? 12 : 0);
    });
  });
  // prune + persist velocity (12h)
  for (const k in vprev) if (vnext[k] === undefined && vprev[k].ts && now - vprev[k].ts < 12 * 3.6e6) vnext[k] = vprev[k];
  lsSet(LS.vel + sec, vnext);

  // watchlist pin
  items.forEach(it => {
    it.watch = watchlist.length ? watchlist.some(w => (it.title + ' ' + it.desc).toLowerCase().includes(w.toLowerCase())) : false;
  });

  // region heat
  const regions = {};
  items.forEach(it => (it.geo || []).forEach(id => regions[id] = (regions[id] || 0) + 1));

  return { items, regions };
}

/* ---------------- notifications ---------------- */
let audioCtx = null;
function beep(){
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square'; o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    o.start(); o.stop(audioCtx.currentTime + 0.36);
  } catch {}
}
function maybeAlert(sec){
  const S = STATE[sec];
  const cand = S.items.filter(it =>
    (it.watch || ((it.sev === 'crit' || it.sev === 'hi') && it.ageH * 60 <= BREAKING_MIN))
  );
  const firstTime = !firstAnalyze[sec];
  firstAnalyze[sec] = true;
  const fresh = cand.filter(it => !notified[it.key]);
  fresh.forEach(it => { notified[it.key] = Date.now() + 6 * 3.6e6; });
  lsSet(LS.notified, notified);
  if (firstTime || !alertsOn || !fresh.length) return; // seed silently on first pass
  beep();
  if ('Notification' in window && Notification.permission === 'granted'){
    const top = fresh.sort((a, b) => b.score - a.score)[0];
    try { new Notification((top.watch ? '★ WATCH · ' : '🚨 BREAKING · ') + SECTIONS[sec].label, { body: top.source + ' — ' + top.title, tag: top.key }); } catch {}
  }
}

/* ---------------- render ---------------- */
function loadingHTML(){ return '<div class="loading"><div class="bars"><i></i><i></i><i></i><i></i><i></i></div><div>ESTABLISHING FEED UPLINK…</div></div>'; }

function sparkHTML(items){
  const now = Date.now(), buckets = new Array(24).fill(0);
  items.forEach(it => { const h = Math.floor((now - new Date(it.date).getTime()) / 3.6e6); if (h >= 0 && h < 24) buckets[23 - h]++; });
  const max = Math.max(1, ...buckets);
  return '<span class="spark" title="stories per hour, last 24h">' +
    buckets.map((v, i) => `<i class="${i === 23 ? 'now' : ''}" style="height:${Math.max(1, Math.round(v / max * 16))}px"></i>`).join('') + '</span>';
}

function renderSection(sec){
  const S = STATE[sec], cfg = SECTIONS[sec], geo = GEO[cfg.geo];
  const el = document.getElementById('sec-' + sec); if (!el) return;

  if (S.loading && !S.loaded){
    el.querySelector('.stories-list').innerHTML = loadingHTML();
    el.querySelector('.breaking-list').innerHTML = loadingHTML();
    return;
  }
  const fc = (sec === current) ? filters : { country:null, entity:null, search:'' };

  /* BREAKING */
  const breaking = S.items.filter(i => i.ageH * 60 <= BREAKING_MIN && (i.sev === 'crit' || i.sev === 'hi' || /\b(breaking|live|just in|urgent)\b/i.test(i.title)))
    .sort((a, b) => b.score - a.score).slice(0, 14);
  el.querySelector('.breaking-list').innerHTML = breaking.length ? breaking.map(i => {
    const flags = (i.geo || []).slice(0, 3).map(id => `<span class="flag geo">${esc(geo.name(id))}</span>`).join('');
    return `<a class="brk" href="${esc(i.link)}" target="_blank" rel="noopener">
      <div class="brk-top"><span class="sev ${i.sev === 'crit' ? '' : 'hi'}">${i.sev === 'crit' ? 'CRITICAL' : 'ALERT'}</span>
      <span class="src">${esc(i.source)}</span><span class="ago">${timeAgo(i.ageH)}</span></div>
      <div class="htxt">${esc(i.title)}</div>${flags ? `<div class="flags">${flags}</div>` : ''}</a>`;
  }).join('') : '<div class="empty">No breaking alerts right now.<br>Monitoring…</div>';
  el.querySelector('.brk-count').textContent = breaking.length;

  /* ENTITIES */
  const entBox = el.querySelector('.entities');
  const entList = ENTITIES[sec] || [];
  if (entList.length){
    const counts = {};
    S.items.forEach(it => { const hay = (it.title + ' ' + it.desc).toLowerCase(); entList.forEach(e => { if (hay.includes(e.toLowerCase())) counts[e] = (counts[e] || 0) + 1; }); });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    entBox.style.display = top.length ? 'flex' : 'none';
    entBox.innerHTML = '<span class="elabel">TRENDING</span>' + top.map(([e, c]) =>
      `<span class="echip ${fc.entity === e ? 'on' : ''}" data-ent="${esc(e)}">${esc(e)} <span class="en">${c}</span></span>`).join('');
  } else { entBox.style.display = 'none'; }

  /* STORIES */
  let items = S.items.filter(i => !dismissed[i.key]);
  if (fc.entity) items = items.filter(i => (i.title + ' ' + i.desc).toLowerCase().includes(fc.entity.toLowerCase()));
  if (fc.country) items = items.filter(i => (i.geo || []).includes(fc.country));
  if (fc.search){ const q = fc.search.toLowerCase(); items = items.filter(i => (i.title + ' ' + i.desc).toLowerCase().includes(q)); }
  const lastVisit = visits[sec] || Date.now();
  items.sort((a, b) => (b.watch - a.watch) || (b.score - a.score));
  const maxScore = items.length ? Math.max(...items.map(i => i.score)) : 1;
  el.querySelector('.stories-list').innerHTML = items.length ? items.slice(0, 60).map((i, idx) => {
    const pct = Math.max(6, Math.round(i.score / maxScore * 100));
    const flags = (i.geo || []).slice(0, 4).map(id => `<span class="flag geo" data-id="${esc(id)}">${esc(geo.name(id))}</span>`).join('');
    const isNew = new Date(i.date).getTime() > lastVisit;
    const tags = [
      i.watch ? '<span class="tag watch">WATCH</span>' : '',
      i.rising ? '<span class="tag rising">RISING</span>' : '',
      isNew ? '<span class="tag new">NEW</span>' : ''
    ].join('');
    const multi = i.nsrc > 1 ? `<span class="chip multi" data-rel="${esc(i.key)}">${i.nsrc}× SOURCES ▾</span>` : '';
    const related = i.nsrc > 1 ? `<div class="related" data-relbox="${esc(i.key)}">${(i.related || []).map(r =>
      `<a class="rel-item" href="${esc(r.link)}" target="_blank" rel="noopener"><span class="rs">▸ ${esc(r.source)}</span><span>${esc(r.title)}</span></a>`).join('')}</div>` : '';
    return `<div class="story ${i.watch ? 'pinned' : ''} ${i.rising ? 'just-in' : ''}" data-key="${esc(i.key)}">
      <div class="rank">${String(idx + 1).padStart(2, '0')}</div>
      <div class="body">
        <a class="head" href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>
        <div class="meta"><span class="chip src">▸ ${esc(i.source)}</span><span class="chip">${timeAgo(i.ageH)}</span>${tags}${multi}${flags}</div>
        ${related}
      </div>
      <div class="score-wrap"><span class="score-n">${Math.round(i.score)}</span><span class="score-bar"><i style="width:${pct}%"></i></span></div>
      <div class="dismiss" data-dismiss="${esc(i.key)}" title="dismiss">✕</div>
    </div>`;
  }).join('') : `<div class="empty">No stories match.${(fc.country || fc.entity || fc.search) ? '<br>Try clearing filters.' : ''}</div>`;
  el.querySelector('.st-count').textContent = items.length;
  el.querySelector('.spark-slot').innerHTML = sparkHTML(S.items);

  /* MAP */
  renderMapHeat(sec);
  renderTopRegions(sec);

  el.querySelector('.feed-status').innerHTML = cfg.feeds.map(f => {
    const st = S.feedStatus[f.n] || 'load';
    return `<span class="fs ${st}">${esc(f.n)}</span>`;
  }).join('');
  updateHeader();
}

function mixHeat(hex, t){
  const c = hex.replace('#', ''); const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
  const br=20,bg=27,bb=40;
  return `rgb(${Math.round(br+(r-br)*t)},${Math.round(bg+(g-bg)*t)},${Math.round(bb+(b-bb)*t)})`;
}
function renderMapHeat(sec){
  const S = STATE[sec], el = document.getElementById('sec-' + sec), svg = el.querySelector('svg.geomap'); if (!svg) return;
  const heat = SECTIONS[sec].heat, vals = Object.values(S.regions), max = vals.length ? Math.max(...vals) : 1;
  const selId = (sec === current) ? filters.country : null;
  svg.querySelectorAll('path.region').forEach(p => {
    const id = p.getAttribute('data-id'), v = S.regions[id] || 0;
    if (v > 0){ p.style.fill = mixHeat(heat, Math.min(1, 0.25 + (v / max) * 0.75)); p.classList.add('hot'); }
    else { p.style.fill = ''; p.classList.remove('hot'); }
    p.classList.toggle('sel', id === selId);
  });
}
function renderTopRegions(sec){
  const S = STATE[sec], el = document.getElementById('sec-' + sec), geo = GEO[SECTIONS[sec].geo];
  const arr = Object.entries(S.regions).sort((a, b) => b[1] - a[1]).slice(0, 8), max = arr.length ? arr[0][1] : 1;
  el.querySelector('.top-countries').innerHTML = arr.length ? arr.map(([id, v], i) =>
    `<div class="tc-row" data-id="${esc(id)}"><span class="tc-rank">${i + 1}</span><span class="tc-name">${esc(geo.name(id))}</span>
     <span class="tc-bar"><i style="width:${Math.round(v / max * 100)}%"></i></span><span class="tc-n">${v}</span></div>`).join('')
    : '<div class="empty" style="padding:14px">No geo-tagged stories yet</div>';
}

/* ---------------- ticker + header ---------------- */
function updateTicker(){
  let brk = [];
  Object.keys(SECTIONS).forEach(sec => STATE[sec].items
    .filter(i => i.ageH * 60 <= BREAKING_MIN * 1.4 && (i.sev === 'crit' || i.sev === 'hi'))
    .forEach(i => brk.push({ ...i, sec })));
  brk.sort((a, b) => b.score - a.score); brk = brk.slice(0, 18);
  const track = document.getElementById('tickerTrack');
  if (!brk.length){ track.innerHTML = '<span class="ticker-empty">No breaking alerts across desks — situation nominal. Monitoring…</span>'; track.style.animation = 'none'; return; }
  const one = brk.map(i => `<span class="ticker-item" data-link="${esc(i.link)}"><span class="tsec">${esc(SECTIONS[i.sec].label)}</span><b>${esc(i.source)}</b> ${esc(i.title)}</span>`).join('');
  track.innerHTML = one + one;
  track.style.animation = 'ticker ' + Math.max(40, brk.length * 6) + 's linear infinite';
}
function updateHeader(){
  let feeds = 0, stories = 0, breaking = 0;
  Object.keys(SECTIONS).forEach(sec => {
    const S = STATE[sec];
    feeds += Object.values(S.feedStatus).filter(v => v === 'ok').length;
    stories += S.items.length;
    breaking += S.items.filter(i => i.ageH * 60 <= BREAKING_MIN && (i.sev === 'crit' || i.sev === 'hi')).length;
  });
  document.getElementById('stat-feeds').textContent = feeds;
  document.getElementById('stat-stories').textContent = stories;
  document.getElementById('stat-breaking').textContent = breaking;
}
function updateSync(){
  const box = document.getElementById('sync'); if (!box) return;
  const srcs = Object.values(STATE).map(s => s.source).filter(Boolean);
  const ts = Object.values(STATE).map(s => s.ts).filter(Boolean).sort((a, b) => b - a)[0];
  let cls = 'sync', label = 'STANDBY';
  if (srcs.includes('wire')){ label = 'WIRE LIVE'; }
  else if (srcs.includes('proxy')){ label = 'RELAY LIVE'; }
  else if (srcs.includes('cache')){ cls = 'sync cache'; label = 'CACHED'; }
  if (ts){ const age = (Date.now() - ts) / 60000; if (age > 12 && cls === 'sync'){ cls = 'sync stale'; } label += ' · ' + timeAgo(age / 60); }
  box.className = cls;
  box.innerHTML = `<span class="sled"></span>${label}`;
  document.getElementById('foot-sync').textContent = ts ? new Date(ts).toLocaleTimeString() : 'never';
}

/* ---------------- load ---------------- */
let prefetch = null, prefetchTried = false;
async function tryPrefetch(){
  if (prefetchTried) return prefetch; prefetchTried = true;
  try {
    const r = await fetch('./data/feeds.json', { cache: 'no-store' });
    if (r.ok){ const j = await r.json(); if (j && j.generatedAt && (Date.now() - new Date(j.generatedAt).getTime()) < PREFETCH_MAX_AGE && j.sections) prefetch = j; }
  } catch {}
  return prefetch;
}
async function loadSection(sec, force){
  const S = STATE[sec];
  if (S.loading) return;
  if (S.loaded && !force) return;
  S.loading = true;
  if (!S.loaded) renderSection(sec);

  const pre = await tryPrefetch();
  let raw, status, source;
  if (pre && pre.sections[sec] && pre.sections[sec].length){
    raw = pre.sections[sec]; status = pre.status || {}; source = 'wire';
    // ensure every configured feed shows a status
    SECTIONS[sec].feeds.forEach(f => { if (!(f.n in status)) status[f.n] = 'ok'; });
  } else {
    const res = await proxyFetchSection(sec); raw = res.items; status = res.status; source = 'proxy';
  }
  const { items, regions } = analyze(sec, raw);
  S.items = items; S.regions = regions; S.feedStatus = status;
  S.loaded = true; S.loading = false; S.ts = Date.now(); S.source = source;
  lsSet(LS.cache + sec, { ts: S.ts, raw: raw.slice(0, 60), status });
  document.getElementById('cnt-' + sec).textContent = items.length;
  maybeAlert(sec);
  renderSection(sec); updateTicker(); updateSync();
}
function hydrateCache(sec){
  const c = lsGet(LS.cache + sec, null); if (!c || !c.raw) return false;
  const { items, regions } = analyze(sec, c.raw);
  const S = STATE[sec];
  S.items = items; S.regions = regions; S.feedStatus = c.status || {}; S.loaded = true; S.ts = c.ts; S.source = 'cache';
  firstAnalyze[sec] = true; // don't alert from cache
  document.getElementById('cnt-' + sec).textContent = items.length;
  return true;
}

/* ---------------- UI ---------------- */
function buildSectionDOM(sec){
  const cfg = SECTIONS[sec], geo = GEO[cfg.geo];
  const div = document.createElement('div');
  div.className = 'section' + (sec === current ? ' active' : '');
  div.id = 'sec-' + sec; div.style.setProperty('--accent', cfg.accent);
  const mapTitle = cfg.geo === 'us' ? 'STATE MAP' : 'THREAT MAP';
  div.innerHTML = `
    <div class="grid">
      <div class="panel area-breaking">
        <div class="panel-h breaking-h"><span class="ph-accent"></span><b>BREAKING</b> · ${cfg.label}<span class="ph-r"><span class="brk-count">0</span> alerts</span></div>
        <div class="breaking-list">${loadingHTML()}</div>
      </div>
      <div class="panel area-stories">
        <div class="panel-h"><span class="ph-accent"></span><b>RANKED STORIES</b> · by importance
          <span class="ph-r"><span class="spark-slot"></span><span class="st-count">0</span></span></div>
        <div class="entities" style="display:none"></div>
        <div class="stories-list">${loadingHTML()}</div>
        <div class="feed-status"></div>
      </div>
      <div class="panel area-map">
        <div class="panel-h"><span class="ph-accent"></span><b>${mapTitle}</b> · story density<span class="ph-r" id="mapfilter-${sec}"></span></div>
        <div class="map-wrap">${geo.buildSVG()}</div>
        <div class="map-legend"><span>LOW</span>
          <span class="legend-scale">${Array.from({ length: 8 }, (_, i) => `<i style="background:${mixHeat(cfg.heat, 0.25 + i / 8 * 0.75)}"></i>`).join('')}</span>
          <span>HIGH</span><span style="margin-left:auto;color:var(--txt3)">click a ${cfg.geo === 'us' ? 'state' : 'country'} to filter ▸</span></div>
        <div class="top-countries"></div>
      </div>
    </div>`;
  return div;
}
function setCountryFilter(id){
  filters.country = (filters.country === id) ? null : id;
  const tag = document.getElementById('mapfilter-' + current);
  const geo = GEO[SECTIONS[current].geo];
  if (tag) tag.innerHTML = filters.country ? `<span style="color:var(--accent);cursor:pointer" data-clearc>✕ ${esc(geo.name(filters.country))}</span>` : '';
  renderSection(current);
}
function setEntityFilter(e){ filters.entity = (filters.entity === e) ? null : e; renderSection(current); }

function switchTab(sec){
  if (sec === current) return;
  visits[current] = Date.now(); lsSet(LS.visit, visits);     // mark previous desk as visited
  current = sec; filters.country = null; filters.entity = null;
  document.getElementById('searchInput').value = ''; filters.search = '';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.sec === sec));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'sec-' + sec));
  if (visits[sec] === undefined){ visits[sec] = Date.now(); lsSet(LS.visit, visits); }
  loadSection(sec, false); renderSection(sec); updateSync();
}

function renderWatchChips(){
  const box = document.getElementById('watchChips');
  box.innerHTML = watchlist.map(w => `<span class="wchip">★ ${esc(w)} <b data-unwatch="${esc(w)}">✕</b></span>`).join('');
}
function toggleAlerts(){
  alertsOn = !alertsOn; lsSet(LS.alerts, alertsOn);
  const btn = document.getElementById('alertsBtn');
  btn.classList.toggle('on', alertsOn);
  btn.querySelector('.tlabel').textContent = alertsOn ? 'ALERTS ON' : 'ALERTS';
  if (alertsOn){
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    beep();
  }
}

function initUI(){
  const main = document.getElementById('main');
  Object.keys(SECTIONS).forEach(sec => main.appendChild(buildSectionDOM(sec)));
  document.getElementById('foot-outlets').textContent = Object.values(SECTIONS).reduce((a, c) => a + c.feeds.length, 0);
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchTab(t.dataset.sec));

  // delegated interactions
  main.addEventListener('click', e => {
    const path = e.target.closest('path.region'); if (path){ setCountryFilter(path.getAttribute('data-id')); return; }
    const tc = e.target.closest('.tc-row'); if (tc){ setCountryFilter(tc.getAttribute('data-id')); return; }
    const fl = e.target.closest('.flag.geo'); if (fl && fl.dataset.id){ e.preventDefault(); setCountryFilter(fl.dataset.id); return; }
    const ent = e.target.closest('.echip'); if (ent){ setEntityFilter(ent.dataset.ent); return; }
    const clc = e.target.closest('[data-clearc]'); if (clc){ setCountryFilter(filters.country); return; }
    const dis = e.target.closest('[data-dismiss]'); if (dis){ const k = dis.getAttribute('data-dismiss'); dismissed[k] = Date.now() + 12 * 3.6e6; lsSet(LS.dismiss, dismissed); renderSection(current); return; }
    const rel = e.target.closest('[data-rel]'); if (rel){ const box = document.querySelector(`[data-relbox="${CSS.escape(rel.getAttribute('data-rel'))}"]`); if (box) box.classList.toggle('open'); return; }
  });
  // map tooltip
  const tip = document.getElementById('maptip');
  main.addEventListener('mousemove', e => {
    const path = e.target.closest('path.region');
    if (path){
      const id = path.getAttribute('data-id'), v = STATE[current].regions[id] || 0;
      tip.innerHTML = `<div class="mt-c">${esc(path.getAttribute('data-name'))}</div><div class="mt-n">${v} stor${v === 1 ? 'y' : 'ies'}</div>`;
      tip.style.opacity = '1'; const r = main.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px';
    } else tip.style.opacity = '0';
  });
  main.addEventListener('mouseleave', () => tip.style.opacity = '0');

  // ticker click
  document.getElementById('tickerTrack').addEventListener('click', e => {
    const it = e.target.closest('.ticker-item'); if (it && it.dataset.link) window.open(it.dataset.link, '_blank', 'noopener');
  });

  // controls
  const search = document.getElementById('searchInput');
  search.addEventListener('input', () => { filters.search = search.value.trim(); renderSection(current); });
  const watchInput = document.getElementById('watchInput');
  watchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ const v = watchInput.value.trim(); if (v && !watchlist.includes(v)){ watchlist.push(v); lsSet(LS.watch, watchlist); renderWatchChips(); Object.keys(SECTIONS).forEach(s => { if (STATE[s].loaded) { const a = analyze(s, lsGet(LS.cache + s, {}).raw || STATE[s].items.map(i=>({title:i.title,link:i.link,date:i.date,desc:i.desc,source:i.source}))); STATE[s].items = a.items; STATE[s].regions = a.regions; } }); renderSection(current); } watchInput.value = ''; }
  });
  document.getElementById('watchChips').addEventListener('click', e => {
    const b = e.target.closest('[data-unwatch]'); if (b){ const w = b.getAttribute('data-unwatch'); watchlist = watchlist.filter(x => x !== w); lsSet(LS.watch, watchlist); renderWatchChips(); Object.keys(SECTIONS).forEach(s => { STATE[s].items.forEach(it => it.watch = watchlist.some(w2 => (it.title+' '+it.desc).toLowerCase().includes(w2.toLowerCase()))); }); renderSection(current); }
  });
  renderWatchChips();
  const ab = document.getElementById('alertsBtn'); ab.onclick = toggleAlerts;
  ab.classList.toggle('on', alertsOn); ab.querySelector('.tlabel').textContent = alertsOn ? 'ALERTS ON' : 'ALERTS';
  document.getElementById('refreshBtn').onclick = () => refreshAll(true);
}

/* ---------------- clock + refresh ---------------- */
function tickClock(){
  const d = new Date();
  document.getElementById('clock-utc').textContent = d.toISOString().slice(11, 19) + 'Z';
  document.getElementById('clock-local').textContent = d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) + ' LOCAL';
}
let nextRefresh = Date.now() + REFRESH_MS;
function tickCountdown(){
  const s = Math.max(0, Math.round((nextRefresh - Date.now()) / 1000));
  document.getElementById('countdown').textContent = '(' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + ')';
}
async function refreshAll(force){
  const btn = document.getElementById('refreshBtn'); btn.classList.add('spin');
  nextRefresh = Date.now() + REFRESH_MS; prefetchTried = false; prefetch = null;
  const order = [current, ...Object.keys(SECTIONS).filter(s => s !== current)];
  for (const sec of order) await loadSection(sec, true);
  updateHeader(); updateTicker(); updateSync();
  btn.classList.remove('spin');
}

/* ---------------- boot ---------------- */
initUI();
Object.keys(SECTIONS).forEach(sec => { if (hydrateCache(sec)) {} });   // instant paint from cache
Object.keys(SECTIONS).forEach(sec => { if (visits[sec] === undefined){ visits[sec] = Date.now(); } });
lsSet(LS.visit, visits);
renderSection(current); updateTicker(); updateSync();

tickClock(); setInterval(tickClock, 1000);
tickCountdown(); setInterval(tickCountdown, 1000);

loadSection('global', true);
setTimeout(() => loadSection('us', true), 1500);
setTimeout(() => loadSection('ai', true), 3000);
setTimeout(() => loadSection('good', true), 4500);
setInterval(() => { if (Date.now() >= nextRefresh) refreshAll(true); }, 5000);

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

// expose a little for tests
window.__WR = { STATE, analyze, GEO, filters, switchTab };
})();
