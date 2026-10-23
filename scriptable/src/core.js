// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: globe-americas;
/* ============================================================
   WAR ROOM — World & U.S. news monitor
   A self-contained Scriptable app + home-screen widget.

   Run in Scriptable  → full-screen app (WebView UI)
   Add as a widget    → ranked headlines; widget parameter
                        "world" or "us" picks the desk.

   No API keys, no accounts, no server. Feeds are fetched
   natively by Scriptable, so there are no CORS relays.

   GENERATED FILE — edit scriptable/src/* and run
   `node scriptable/build.js` in the newsmonitor repo.
   ============================================================ */

/* ============ USER SETTINGS ============ */
const WATCHLIST = [];          // e.g. ["Taiwan", "Federal Reserve"] — pinned + flagged
const CACHE_MINUTES = 8;       // reuse the cached pull if it is younger than this
const WIDGET_DESK = 'world';   // fallback desk when no widget parameter is set

/* ============ DESKS ============ */
const G = 'https://news.google.com/rss/';
const gtopic = t => G + 'headlines/section/topic/' + t + '?hl=en-US&gl=US&ceid=US:en';
const gsearch = (q, w) => G + 'search?q=' + encodeURIComponent(q + (w ? ' when:' + w : '')) + '&hl=en-US&gl=US&ceid=US:en';

const SECTIONS = {
  world: {
    label: 'World', full: 'World Affairs', accent: '#E5484D', geo: 'world', kw: 'crit',
    feeds: [
      { n:'BBC World',     u:'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { n:'Guardian',      u:'https://www.theguardian.com/world/rss' },
      { n:'Al Jazeera',    u:'https://www.aljazeera.com/xml/rss/all.xml' },
      { n:'NPR World',     u:'https://feeds.npr.org/1004/rss.xml' },
      { n:'DW',            u:'https://rss.dw.com/rdf/rss-en-all' },
      { n:'France 24',     u:'https://www.france24.com/en/rss' },
      { n:'CNN World',     u:'https://rss.cnn.com/rss/edition_world.rss' },
      { n:'Sky News',      u:'https://feeds.skynews.com/feeds/rss/world.xml' },
      { n:'Independent',   u:'https://www.independent.co.uk/news/world/rss' },
      { n:'CBC',           u:'https://www.cbc.ca/webfeed/rss/rss-world' },
      { n:'Euronews',      u:'https://www.euronews.com/rss?level=theme&name=news' },
      { n:'Times of India',u:'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
      { n:'AP',            u:gtopic('WORLD') },
      { n:'Reuters',       u:gsearch('reuters world','2d') }
    ]
  },
  us: {
    label: 'U.S.', full: 'United States', accent: '#4C7DFF', geo: 'us', kw: 'us',
    feeds: [
      { n:'NPR National',    u:'https://feeds.npr.org/1003/rss.xml' },
      { n:'The Hill',        u:'https://thehill.com/news/feed/' },
      { n:'Politico',        u:'https://www.politico.com/rss/politicopicks.xml' },
      { n:'NYT U.S.',        u:'https://rss.nytimes.com/services/xml/rss/nyt/US.xml' },
      { n:'Washington Post', u:'https://feeds.washingtonpost.com/rss/national' },
      { n:'CBS News',        u:'https://www.cbsnews.com/latest/rss/us' },
      { n:'ABC News',        u:'https://feeds.abcnews.com/abcnews/usheadlines' },
      { n:'NBC News',        u:'https://feeds.nbcnews.com/nbcnews/public/news' },
      { n:'USA Today',       u:'https://rssfeeds.usatoday.com/usatoday-NewsTopStories' },
      { n:'Guardian U.S.',   u:'https://www.theguardian.com/us-news/rss' },
      { n:'CNN U.S.',        u:'https://rss.cnn.com/rss/cnn_us.rss' },
      { n:'Fox News',        u:'https://moxie.foxnews.com/google-publisher/politics.xml' },
      { n:'PBS NewsHour',    u:'https://www.pbs.org/newshour/feeds/rss/headlines' },
      { n:'U.S. Wire',       u:gtopic('NATION') }
    ]
  }
};
const DESKS = Object.keys(SECTIONS);

/* ============ SCORING VOCAB ============ */
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
const ENTITIES = {
  world:['United Nations','NATO','European Union','White House','Kremlin','Pentagon','Hamas','Hezbollah','Taliban','Putin','Zelensky','Netanyahu','Trump','Xi Jinping','Modi','WHO','IMF','G7','OPEC','ICC'],
  us:['White House','Congress','Senate','Supreme Court','Trump','Biden','Harris','Republicans','Democrats','GOP','Federal Reserve','Wall Street','FBI','DOJ','ICE','Pentagon','Capitol Hill','Homeland Security']
};

/* ============ EMBEDDED MAPS ============ */
const GEO = { world: __GEO_WORLD__, us: __GEO_US__ };

/* ============ PLACE ALIASES ============ */
const WORLD_ALIAS = __WORLD_ALIAS__;
const US_ALIAS = __US_ALIAS__;

function buildDetector(feats, alias){
  const keyMap = new Map();
  Object.keys(alias).forEach(k => { if (!keyMap.has(k)) keyMap.set(k, alias[k]); });
  feats.forEach(f => { const nm = f.n.toLowerCase(); if (nm.length > 3 && !keyMap.has(nm)) keyMap.set(nm, f.i); });
  const keys = Array.from(keyMap.entries()).sort((a,b) => b[0].length - a[0].length);
  return function (text){
    const t = ' ' + text.toLowerCase() + ' ', found = [];
    for (let n = 0; n < keys.length; n++){
      const k = keys[n][0], id = keys[n][1];
      let idx = t.indexOf(k);
      while (idx !== -1){
        const before = t[idx-1] || ' ', after = t[idx+k.length] || ' ';
        if (!/[a-z]/.test(before) && !/[a-z]/.test(after)){
          if (id && found.indexOf(id) === -1) found.push(id);
          break;
        }
        idx = t.indexOf(k, idx+1);
      }
    }
    return found;
  };
}
const DETECT = { world: buildDetector(GEO.world, WORLD_ALIAS), us: buildDetector(GEO.us, US_ALIAS) };

/* Names for ids the simplified map has no polygon for (absent from the source dataset). */
const EXTRA_NAMES = { BHR:'Bahrain', SGP:'Singapore' };
const NAMES = { world:{}, us:{} };
['world','us'].forEach(function (k){
  GEO[k].forEach(function (f){ NAMES[k][f.i] = f.n; });
  if (k === 'world') Object.keys(EXTRA_NAMES).forEach(function (i){ if (!NAMES[k][i]) NAMES[k][i] = EXTRA_NAMES[i]; });
});

/* ============ RSS / ATOM PARSER ============ */
const NAMED = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', '#39':"'", mdash:'—', ndash:'–', hellip:'…', rsquo:'’', lsquo:'‘', ldquo:'“', rdquo:'”' };
function decodeEntities(s){
  if (!s) return '';
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (m, e){
    if (e[0] === '#'){
      const code = (e[1] === 'x' || e[1] === 'X') ? parseInt(e.slice(2),16) : parseInt(e.slice(1),10);
      return isNaN(code) ? m : String.fromCodePoint(code);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
  });
}
function stripHtml(s){
  if (!s) return '';
  return decodeEntities(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,' '))
    .replace(/\s+/g,' ').trim();
}
function unwrapCDATA(s){ if (!s) return ''; const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/); return m ? m[1] : s; }
function tagOf(block, name){
  const m = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>','i'));
  return m ? m[1] : '';
}
function atomLink(block){
  const links = block.match(/<link\b[^>]*\/?>/gi) || [];
  let best = '';
  for (let i = 0; i < links.length; i++){
    const href = (links[i].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const rel = (links[i].match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!rel || rel === 'alternate') return href;
    if (!best) best = href;
  }
  return best;
}
function parseFeed(xml, sourceName){
  const out = [];
  if (!xml) return out;
  let blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi);
  const atom = !blocks;
  if (atom) blocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi);
  if (!blocks) return out;
  for (let i = 0; i < blocks.length; i++){
    const b = blocks[i];
    let title = stripHtml(unwrapCDATA(tagOf(b,'title')));
    if (!title) continue;
    let link = atom ? atomLink(b) : (stripHtml(unwrapCDATA(tagOf(b,'link'))) || atomLink(b));
    link = decodeEntities((link || '').trim());
    const dRaw = tagOf(b,'pubDate') || tagOf(b,'published') || tagOf(b,'updated') || tagOf(b,'dc:date') || '';
    let d = dRaw ? new Date(stripHtml(dRaw)) : null;
    if (!d || isNaN(d.getTime())) d = new Date();
    const desc = stripHtml(unwrapCDATA(tagOf(b,'description') || tagOf(b,'summary') || tagOf(b,'content') || '')).slice(0,260);
    let source = sourceName;
    if (/^(AP|Reuters|U\.S\. Wire)$/.test(sourceName)){
      const gm = title.match(/^(.*?)\s+-\s+([^-]{2,42})$/);
      if (gm){ title = gm[1].trim(); source = gm[2].trim(); }
    }
    out.push({ title:title, link:link, date:d.getTime(), desc:desc, source:source });
  }
  return out;
}

/* ============ NETWORK ============ */
async function fetchFeed(feed){
  try {
    const r = new Request(feed.u);
    r.timeoutInterval = 15;
    r.headers = { 'User-Agent':'Mozilla/5.0 (iPhone) WarRoom/1.0', 'Accept':'application/rss+xml, application/xml, text/xml, */*' };
    const xml = await r.loadString();
    const items = parseFeed(xml, feed.n);
    return { name:feed.n, ok:true, empty:items.length === 0, items:items };
  } catch (e){
    return { name:feed.n, ok:false, empty:true, items:[] };
  }
}

/* ============ ANALYSIS ============ */
const STOP = ' the a an of to in on for and or as at by with from into over after new says say will has have amid could would this that than then who what when why how are was were be been being about against between during also more most '.split(' ');
function sig(title){
  return title.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
    .filter(function (w){ return w.length > 3 && STOP.indexOf(w) === -1; });
}
const keyOf = t => t.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,60);

function analyze(sec, raw, velPrev, velNext){
  const cfg = SECTIONS[sec], kw = KW[cfg.kw], detect = DETECT[cfg.geo], now = Date.now();
  const seen = {};
  let items = [];
  for (let i = 0; i < raw.length; i++){
    const it = raw[i];
    const ageH = (now - it.date)/3.6e6;
    if (ageH > 30 || ageH < -3) continue;
    const k = keyOf(it.title);
    if (!k || seen[k]) continue;
    seen[k] = 1;
    items.push(Object.assign({}, it, { key:k, ageH:ageH }));
  }
  items.forEach(function (it){
    const hay = (it.title + ' ' + it.desc).toLowerCase();
    let ks = 0, sev = '';
    Object.keys(kw).forEach(function (w){
      kw[w].forEach(function (term){
        if (hay.indexOf(term) !== -1){ ks += +w; if (+w >= 7 && !sev) sev = 'hi'; if (+w >= 10) sev = 'crit'; }
      });
    });
    it.kwScore = ks; it.sev = sev;
    it.geo = detect(it.title + ' ' + it.desc);
    it.ents = (ENTITIES[sec] || []).filter(function (e){ return hay.indexOf(e.toLowerCase()) !== -1; });
    it.sigwords = sig(it.title);
    it.base = ks*1.6 + Math.max(0, 26 - it.ageH*1.15);
    it.watch = WATCHLIST.some(function (w){ return hay.indexOf(String(w).toLowerCase()) !== -1; });
  });

  // corroboration clusters
  const n = items.length, parent = [];
  for (let i = 0; i < n; i++) parent[i] = i;
  function find(x){ while (parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++){
    const A = items[i], B = items[j];
    if (A.source === B.source) continue;
    let ov = 0;
    for (let z = 0; z < A.sigwords.length; z++) if (B.sigwords.indexOf(A.sigwords[z]) !== -1) ov++;
    const denom = Math.min(A.sigwords.length, B.sigwords.length) || 1;
    if (ov >= 3 && (ov/denom >= 0.4 || ov >= 4)) parent[find(i)] = find(j);
  }
  const groups = {};
  items.forEach(function (it, i){ const r = find(i); (groups[r] = groups[r] || []).push(it); });
  Object.keys(groups).forEach(function (g){
    const mem = groups[g], srcs = [];
    mem.forEach(function (m){ if (srcs.indexOf(m.source) === -1) srcs.push(m.source); });
    const freq = {};
    mem.forEach(function (m){ m.sigwords.forEach(function (w){ freq[w] = (freq[w]||0)+1; }); });
    const gsig = Object.keys(freq).sort(function (a,b){ return freq[b]-freq[a]; }).slice(0,4).sort().join('-') || mem[0].key;
    const prev = velPrev[gsig];
    const rising = !!prev && srcs.length > prev;
    velNext[gsig] = srcs.length;
    mem.forEach(function (m){
      m.nsrc = srcs.length;
      m.rising = rising;
      m.related = mem.filter(function (x){ return x !== m; })
        .map(function (x){ return { source:x.source, title:x.title, link:x.link }; });
      m.score = m.base + (srcs.length > 1 ? (srcs.length-1)*6 : 0) + (rising ? 12 : 0);
    });
  });

  items.sort(function (a,b){ return (b.watch-a.watch) || (b.score-a.score); });
  items = items.slice(0, 55);

  const regions = {};
  items.forEach(function (it){ it.geo.forEach(function (id){ regions[id] = (regions[id]||0)+1; }); });

  return {
    items: items.map(function (it){
      return { title:it.title, link:it.link, source:it.source, desc:it.desc, t:it.date,
               score:Math.round(it.score*10)/10, sev:it.sev, geo:it.geo, ents:it.ents,
               nsrc:it.nsrc, rising:it.rising, watch:it.watch, related:it.related.slice(0,6) };
    }),
    regions: regions
  };
}

/* ============ CACHE ============ */
const fm = FileManager.local();
const DIR = fm.joinPath(fm.cacheDirectory(), 'warroom');
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true);
const P_DATA = fm.joinPath(DIR, 'payload.json');
const P_VEL  = fm.joinPath(DIR, 'velocity.json');

function readJSON(p, dflt){
  try { if (fm.fileExists(p)) return JSON.parse(fm.readString(p)); } catch (e){}
  return dflt;
}
function writeJSON(p, v){ try { fm.writeString(p, JSON.stringify(v)); } catch (e){} }

/* ============ BUILD PAYLOAD ============ */
async function buildPayload(deskFilter){
  const velAll = readJSON(P_VEL, {});
  const payload = { generatedAt: Date.now(), order: DESKS, desks: {} };
  const want = deskFilter ? [deskFilter] : DESKS;

  for (let d = 0; d < want.length; d++){
    const sec = want[d], cfg = SECTIONS[sec];
    const results = await Promise.all(cfg.feeds.map(fetchFeed));
    let raw = [], live = 0;
    const status = {};
    results.forEach(function (r){
      status[r.name] = r.ok ? (r.empty ? 'empty' : 'ok') : 'err';
      if (r.ok && !r.empty) live++;
      raw = raw.concat(r.items);
    });
    const velPrev = velAll[sec] || {}, velNext = {};
    const a = analyze(sec, raw, velPrev, velNext);
    velAll[sec] = velNext;
    payload.desks[sec] = {
      label: cfg.label, full: cfg.full, accent: cfg.accent, geo: cfg.geo,
      items: a.items, regions: a.regions, status: status, names: NAMES[cfg.geo],
      live: live, total: cfg.feeds.length
    };
  }
  writeJSON(P_VEL, velAll);
  return payload;
}

async function getPayload(force, deskFilter){
  const cached = readJSON(P_DATA, null);
  const fresh = cached && (Date.now() - cached.generatedAt) < CACHE_MINUTES*60*1000;
  const complete = cached && DESKS.every(function (d){ return cached.desks && cached.desks[d]; });
  if (!force && fresh && complete) return cached;
  try {
    const p = await buildPayload(deskFilter);
    if (deskFilter && cached && cached.desks){         // widget refreshed one desk only
      p.desks = Object.assign({}, cached.desks, p.desks);
    }
    if (!deskFilter) writeJSON(P_DATA, p);
    return p;
  } catch (e){
    if (cached) return cached;
    throw e;
  }
}

/* ============ HTML ============ */
const PAGE_CSS = __PAGE_CSS__;
const PAGE_JS  = __PAGE_JS__;
const SPRITE   = __SPRITE__;

function stamp(ts){
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}
function jsonForScript(v){
  return JSON.stringify(v)
    .replace(/</g, '\\u003c')      // never let "</script>" terminate the tag
    .replace(/\u2028/g, '\\u2028')  // line separators are illegal in older JS literals
    .replace(/\u2029/g, '\\u2029');
}
function buildHTML(payload){
  const data = {
    order: payload.order, stamp: stamp(payload.generatedAt), desks: payload.desks
  };
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1">' +
    '<title>War Room</title><style>' + PAGE_CSS + '</style></head><body>' +
    SPRITE +
    '<header class="appbar"><div class="appbar-in">' +
      '<div class="wordmark"><svg class="mark"><use href="#i-mark"/></svg>' +
      '<div><div class="wm-t">War Room</div><div class="wm-s" id="deskName">World Affairs</div></div></div>' +
      '<div class="bar-sp"></div>' +
      '<div class="clock" id="clock"></div>' +
      '<button class="reload" id="reload"><svg><use href="#i-refresh"/></svg>Reload</button>' +
    '</div></header>' +
    '<div class="strip"><div class="strip-tag"><i></i>Breaking</div>' +
      '<div class="strip-track" id="stripTrack"></div></div>' +
    '<nav class="deskbar" id="deskbar"></nav>' +
    '<main id="main"></main>' +
    '<nav class="tabbar" id="tabbar"></nav>' +
    '<script>window.DATA=' + jsonForScript(data) + ';window.GEO=' + jsonForScript(GEO) + ';<\/script>' +
    '<script>' + PAGE_JS + '<\/script></body></html>';
}

function buildSplash(msg){
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>' +
    'html,body{margin:0;height:100%;background:#0A0C11;color:#EDF0F5;' +
    '-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,sans-serif}' +
    '.w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}' +
    '.m{width:56px;height:56px;border-radius:14px;border:2px solid #E5484D;display:flex;align-items:center;' +
    'justify-content:center;box-shadow:0 0 40px rgba(229,72,77,.25)}' +
    '.m i{width:12px;height:12px;border-radius:50%;background:#E5484D;animation:p 1.4s ease-in-out infinite}' +
    '.t{font-size:13px;font-weight:680;letter-spacing:.18em;text-transform:uppercase}' +
    '.s{font-family:ui-serif,Georgia,serif;font-style:italic;font-size:13px;color:#616B7C;text-align:center;padding:0 30px}' +
    '@keyframes p{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}' +
    '</style></head><body><div class="w"><div class="m"><i></i></div>' +
    '<div class="t">War Room</div><div class="s">' + msg + '</div></div></body></html>';
}

/* ============ WIDGET ============ */
const C = {
  bg:  new Color('#0A0C11'), text: new Color('#EDF0F5'), dim: new Color('#97A1B2'),
  faint: new Color('#616B7C'), red: new Color('#E5484D'), blue: new Color('#4C7DFF'), amber: new Color('#F5A623')
};
function buildWidget(payload, sec, family){
  const d = payload.desks[sec];
  const accent = sec === 'us' ? C.blue : C.red;
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(13, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 20*60*1000);

  const now = Date.now();
  const items = (d && d.items) ? d.items : [];
  const brk = items.filter(function (i){ return (now-i.t)/6e4 <= 150 && (i.sev==='crit'||i.sev==='hi'); });

  // header
  const head = w.addStack(); head.centerAlignContent();
  const ttl = head.addText('WAR ROOM');
  ttl.font = new Font('Menlo-Bold', 9); ttl.textColor = accent;
  head.addSpacer(6);
  const dk = head.addText(d ? d.label.toUpperCase() : sec.toUpperCase());
  dk.font = new Font('Menlo', 9); dk.textColor = C.faint;
  head.addSpacer();
  if (brk.length){
    const bd = head.addText('● ' + brk.length);
    bd.font = new Font('Menlo-Bold', 9); bd.textColor = C.red;
  }
  w.addSpacer(family === 'small' ? 6 : 9);

  const rows = family === 'small' ? 2 : (family === 'large' ? 7 : 3);
  const titleSize = family === 'small' ? 11 : 13;
  const shown = items.slice(0, rows);

  if (!shown.length){
    const t = w.addText('No stories cached yet — open the app once.');
    t.font = new Font('Menlo', 10); t.textColor = C.dim;
  }
  shown.forEach(function (it, idx){
    if (idx) w.addSpacer(family === 'small' ? 5 : 7);
    const row = w.addStack(); row.layoutHorizontally(); row.topAlignContent();
    if (family !== 'small'){
      const n = row.addText(String(idx+1));
      n.font = new Font('Menlo', 9); n.textColor = C.faint;
      n.lineLimit = 1;
      row.addSpacer(7);
    }
    const col = row.addStack(); col.layoutVertically();
    const h = col.addText(it.title);
    h.font = new Font('Georgia-Bold', titleSize);
    h.textColor = (it.sev === 'crit') ? C.text : C.text;
    h.lineLimit = family === 'small' ? 3 : 2;
    if (family !== 'small'){
      col.addSpacer(3);
      const meta = col.addStack(); meta.centerAlignContent();
      const s = meta.addText(it.source.toUpperCase());
      s.font = new Font('Menlo-Bold', 8); s.textColor = accent; s.lineLimit = 1;
      meta.addSpacer(6);
      const mins = Math.max(0, Math.round((now-it.t)/6e4));
      const ago = mins < 60 ? mins + 'm' : Math.round(mins/60) + 'h';
      const tm = meta.addText(ago + ' ago');
      tm.font = new Font('Menlo', 8); tm.textColor = C.faint;
      if (it.rising){ meta.addSpacer(6); const r = meta.addText('RISING'); r.font = new Font('Menlo-Bold', 8); r.textColor = C.amber; }
      if (it.watch){ meta.addSpacer(6); const r = meta.addText('WATCH'); r.font = new Font('Menlo-Bold', 8); r.textColor = C.red; }
    }
  });

  w.addSpacer();
  const foot = w.addStack(); foot.centerAlignContent();
  const up = foot.addText('updated ' + stamp(payload.generatedAt));
  up.font = new Font('Menlo', 8); up.textColor = C.faint;
  foot.addSpacer();
  if (d){
    const fl = foot.addText(d.live + '/' + d.total);
    fl.font = new Font('Menlo', 8); fl.textColor = C.faint;
  }
  return w;
}

/* ============ MAIN ============ */
const LISTEN =
  '(function(){' +
  ' window.__emit=function(a){var c=completion;window.__emit=null;c(JSON.stringify(a));};' +
  ' if(window.__queued){var q=window.__queued;window.__queued=null;window.__emit(q);}' +
  '})();';

async function runApp(){
  const wv = new WebView();
  const BASE = 'https://warroom.local';

  // Show something instantly — the first pull can take a few seconds on cellular.
  try { await wv.loadHTML(buildSplash('Contacting 28 newsrooms…'), BASE); } catch (e){}

  let dismissed = false;
  const presented = wv.present(true);
  presented.then(function (){ dismissed = true; });

  let payload = null, loadErr = null;
  try { payload = await getPayload(false); }
  catch (e){ loadErr = e; }

  if (payload){
    try { await wv.loadHTML(buildHTML(payload), BASE); } catch (e){ loadErr = e; }
  }
  if (!payload){
    try {
      await wv.loadHTML(buildSplash('Could not reach any feeds.<br>' +
        'Check your connection and tap Reload.<br><br>' +
        String(loadErr && loadErr.message || '')), BASE);
    } catch (e){}
  }

  // Action pump. Runs alongside the presentation; if the bridge is unavailable
  // the app still works (links simply open inside the web view instead).
  (async function pump(){
    while (!dismissed){
      let raw = null;
      try { raw = await wv.evaluateJavaScript(LISTEN, true); }
      catch (e){ return; }                 // no bridge — degrade, never tear down
      if (raw === null || raw === undefined || dismissed) return;
      let a = null;
      try { a = JSON.parse(raw); } catch (e){ continue; }
      if (!a || !a.type) continue;
      if (a.type === 'open' && a.url){
        try { await Safari.openInApp(a.url, false); } catch (e){}
      } else if (a.type === 'refresh'){
        try {
          const p = await getPayload(true);
          payload = p;
          await wv.loadHTML(buildHTML(p), BASE);
        } catch (e){
          try { await wv.evaluateJavaScript('document.getElementById("reload")&&document.getElementById("reload").classList.remove("busy")'); } catch (e2){}
        }
      }
    }
  })();

  // The presentation governs how long the script lives. Completing while the
  // view is still up would dismiss it and leave a black screen.
  await presented;
  Script.complete();
}

async function runWidget(){
  const sec = (args.widgetParameter && SECTIONS[args.widgetParameter.trim()])
    ? args.widgetParameter.trim() : WIDGET_DESK;
  let payload;
  try { payload = await getPayload(false, sec); }
  catch (e){ payload = readJSON(P_DATA, { generatedAt:Date.now(), desks:{} }); }
  const w = buildWidget(payload, sec, config.widgetFamily || 'medium');
  Script.setWidget(w);
  Script.complete();
}

if (config.runsInWidget) {
  await runWidget();
} else {
  try {
    await runApp();
  } catch (e){
    const al = new Alert();
    al.title = 'War Room — error';
    al.message = String((e && (e.message || e)) || 'unknown') +
      '\n\nPlease send this text along with your iOS version.';
    al.addAction('OK');
    await al.present();
    Script.complete();
  }
}
