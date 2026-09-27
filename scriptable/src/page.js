/* ============================================================
   page.js — the UI that runs inside Scriptable's WebView.
   Pure rendering: all data arrives pre-analysed on window.DATA,
   map polygons on window.GEO. No network here.
   Escapes to Scriptable via emit(): link taps and refresh.
   ============================================================ */
(function () {
'use strict';

/* Bridge to Scriptable. evaluateJavaScript() installs window.__emit; the first
   time it does, we know the bridge is alive and can safely intercept taps.
   If it never appears, links are left alone and simply open in the web view. */
window.__bridge = window.__bridge || false;
Object.defineProperty(window, '__emitInstalled', {
  set: function (v){ window.__bridge = !!v; }, get: function (){ return window.__bridge; }
});
function bridgeAlive(){ return !!(window.__emit || window.__bridge); }
function emit(action){
  window.__bridge = true;
  if (window.__emit) window.__emit(action);
  else window.__queued = action;           // tapped between injections — queue it
}

const DATA = window.DATA, GEO = window.GEO;
if (!DATA || !DATA.desks || !GEO){
  document.body.innerHTML =
    '<div style="padding:60px 26px;text-align:center;color:#97A1B2;' +
    'font-family:-apple-system,sans-serif;font-size:14px;line-height:1.5">' +
    'War Room could not read its data.<br>Tap Reload, or re-run the script.</div>';
  throw new Error('missing payload');
}
const DESKS = DATA.order;
let current = DESKS[0];
const filters = {};
DESKS.forEach(d => filters[d] = { region:null, entity:null, q:'' });

const esc = s => (s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $ = id => document.getElementById(id);
const icon = n => '<svg><use href="#i-' + n + '"/></svg>';
function timeAgo(h){ const m = Math.round(h*60); if (m<1) return 'now'; if (m<60) return m+'m'; if (h<24) return Math.round(h)+'h'; return Math.round(h/24)+'d'; }

/* ---------- map projection ---------- */
const projW = (lon, lat) => [ (lon+180)/360*1000, (90-lat)/180*500 ];
const kUS = Math.cos(35.8*Math.PI/180), sUS = 1000/((-66.9+125)*kUS);
const projU = (lon, lat) => [ (lon+125)*kUS*sUS, (49.6-lat)*sUS ];
const MAPS = {
  world: { feats:GEO.world, proj:projW, w:1000, h:415 },
  us:    { feats:GEO.us,    proj:projU, w:1000, h:Math.round((49.6-22)*sUS) }
};
function mapSVG(kind){
  const m = MAPS[kind];
  const paths = m.feats.map(f => {
    const d = f.p.map(ring => 'M' + ring.split(' ').map(pt => {
      const c = pt.split(','), q = m.proj(+c[0], +c[1]);
      return q[0].toFixed(1) + ' ' + q[1].toFixed(1);
    }).join('L') + 'Z').join('');
    return '<path class="region" data-id="' + esc(f.i) + '" data-name="' + esc(f.n) + '" d="' + d + '"></path>';
  }).join('');
  return '<svg class="geomap ' + (kind === 'us' ? 'us' : '') + '" viewBox="0 0 ' + m.w + ' ' + m.h + '" preserveAspectRatio="xMidYMid meet">' + paths + '</svg>';
}
function regionName(kind, id){
  const d = DATA.desks[current];
  if (d && d.names && d.names[id]) return d.names[id];
  const f = MAPS[kind].feats.find(x => x.i === id);
  return (f && f.n) || id;
}

function heat(hex, t){
  const c = hex.replace('#',''), r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
  const br=22,bg=27,bb=37;
  return 'rgb(' + Math.round(br+(r-br)*t) + ',' + Math.round(bg+(g-bg)*t) + ',' + Math.round(bb+(b-bb)*t) + ')';
}
function sparkline(items){
  const now = Date.now(), b = new Array(24).fill(0);
  items.forEach(i => { const h = Math.floor((now - i.t)/3.6e6); if (h>=0 && h<24) b[23-h]++; });
  const mx = Math.max(1, ...b);
  return '<span class="spark">' + b.map((v,i) =>
    '<i class="' + (i===23?'last':'') + '" style="height:' + Math.max(2, Math.round(v/mx*18)) + 'px;animation-delay:' + (i*14) + 'ms"></i>').join('') + '</span>';
}
function countUp(el, to){
  const from = +(el.dataset.v || 0); el.dataset.v = to;
  if (from === to){ el.textContent = to; return; }
  const st = performance.now();
  (function step(t){
    const p = Math.min(1, (t-st)/620), e = 1-Math.pow(1-p,3);
    el.textContent = Math.round(from + (to-from)*e);
    if (p < 1) requestAnimationFrame(step);
  })(st);
}

/* ---------- build ---------- */
function deskDOM(sec){
  const d = DATA.desks[sec];
  const el = document.createElement('section');
  el.className = 'page'; el.id = 'page-' + sec;
  el.innerHTML =
    '<div class="stats">' +
      '<div class="stat accent"><div class="v" id="st-'+sec+'-top">0</div><div class="k">Top score</div></div>' +
      '<div class="stat"><div class="v" id="st-'+sec+'-n">0</div><div class="k">Stories</div></div>' +
      '<div class="stat"><div class="v" id="st-'+sec+'-b">0</div><div class="k">Breaking</div></div>' +
    '</div>' +
    '<div class="filters" data-filters></div>' +
    '<div class="grid">' +
      '<div class="card"><div class="card-h"><h2>Breaking</h2><span class="sub">last 2h</span>' +
        '<div class="right"><span class="tick" data-brkn>0</span></div></div>' +
        '<div class="list" data-alerts></div></div>' +
      '<div class="card"><div class="card-h"><h2>Ranked</h2><span class="sub">by importance</span>' +
        '<div class="right">' + sparkline(d.items) + '<span class="tick" data-storyn>0</span></div></div>' +
        '<div class="field" style="margin:12px 16px 4px">' + icon('search') +
          '<input type="text" data-search placeholder="Search ' + esc(d.full) + '…" autocomplete="off" autocapitalize="none"></div>' +
        '<div class="trend" data-trend></div>' +
        '<div class="list" data-stories></div></div>' +
      '<div class="card map-card"><div class="card-h"><h2>' + (d.geo==='us'?'State map':'World map') + '</h2>' +
        '<span class="sub">story density</span></div>' +
        '<div class="map-wrap">' + mapSVG(d.geo) + '</div>' +
        '<div class="legend"><span>Low</span><span class="scale">' +
          Array.from({length:7},(_,i)=>'<i style="background:'+heat(d.accent,.22+i/7*.78)+'"></i>').join('') +
        '</span><span>High</span><span class="hint">Tap a ' + (d.geo==='us'?'state':'country') + ' to filter</span></div>' +
        '<div class="ranks" data-ranks></div></div>' +
    '</div>' +
    '<div class="stamp">Updated ' + esc(DATA.stamp) + ' · ' + d.live + '/' + d.total + ' feeds live</div>';
  return el;
}

function render(sec){
  const d = DATA.desks[sec], f = filters[sec], el = $('page-'+sec);
  const now = Date.now();
  const withAge = it => Object.assign({}, it, { ageH:(now-it.t)/3.6e6 });

  /* breaking */
  const brk = d.items.map(withAge)
    .filter(i => i.ageH*60 <= 150 && (i.sev==='crit' || i.sev==='hi' || /\b(breaking|live|just in|urgent)\b/i.test(i.title)))
    .sort((a,b) => b.score-a.score).slice(0,12);
  el.querySelector('[data-alerts]').innerHTML = brk.length ? brk.map((i,x) =>
    '<a class="alert" data-x href="' + esc(i.link) + '" style="animation-delay:' + (x*40) + 'ms">' +
      '<div class="top"><span class="sev ' + (i.sev==='crit'?'':'warn') + '">' + (i.sev==='crit'?'Critical':'Alert') + '</span>' +
      '<span class="src">' + esc(i.source) + '</span><span class="ago">' + timeAgo(i.ageH) + ' ago</span></div>' +
      '<h4>' + esc(i.title) + '</h4>' +
      (i.geo.length ? '<div class="geos">' + i.geo.slice(0,3).map(g => '<span class="geo">' + esc(regionName(d.geo,g)) + '</span>').join('') + '</div>' : '') +
    '</a>').join('')
    : '<div class="empty-state">' + icon('quiet') + '<div>No breaking alerts.<br>The wire is quiet.</div></div>';
  el.querySelector('[data-brkn]').textContent = brk.length;

  /* filters */
  const pills = [];
  if (f.region) pills.push('<button class="fpill" data-clear="region">' + esc(regionName(d.geo,f.region)) + icon('x') + '</button>');
  if (f.entity) pills.push('<button class="fpill" data-clear="entity">' + esc(f.entity) + icon('x') + '</button>');
  el.querySelector('[data-filters]').innerHTML = pills.join('');

  /* trending */
  const counts = {};
  d.items.forEach(it => (it.ents || []).forEach(e => counts[e] = (counts[e]||0)+1));
  const tops = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,9);
  el.querySelector('[data-trend]').innerHTML = tops.length
    ? '<span class="tlabel">Trending</span>' + tops.map(([e,c]) =>
        '<button class="tchip ' + (f.entity===e?'on':'') + '" data-entity="' + esc(e) + '">' + esc(e) + '<i>' + c + '</i></button>').join('')
    : '';

  /* stories */
  let items = d.items.map(withAge);
  if (f.region) items = items.filter(i => i.geo.indexOf(f.region) !== -1);
  if (f.entity) items = items.filter(i => (i.ents||[]).indexOf(f.entity) !== -1);
  if (f.q){ const q = f.q.toLowerCase(); items = items.filter(i => (i.title + ' ' + i.desc).toLowerCase().indexOf(q) !== -1); }
  items.sort((a,b) => (b.watch-a.watch) || (b.score-a.score));
  const mx = items.length ? Math.max.apply(null, items.map(i => i.score)) : 1;

  el.querySelector('[data-stories]').innerHTML = items.length ? items.slice(0,50).map((i,x) => {
    const badges = (i.watch ? '<span class="badge watch">Watch</span>' : '') +
                   (i.rising ? '<span class="badge rise">Rising</span>' : '');
    const geos = i.geo.slice(0,3).map(g =>
      '<span class="geo ' + (f.region===g?'on':'') + '" data-region="' + esc(g) + '">' + esc(regionName(d.geo,g)) + '</span>').join('');
    const multi = i.nsrc > 1 ? '<span class="srcs" data-rel="' + x + '">' + i.nsrc + ' sources ' + icon('chev') + '</span>' : '';
    const rel = i.nsrc > 1 ? '<div class="rel" data-relbox="' + x + '"><div class="rel-in">' +
      (i.related||[]).map(r => '<a class="rel-item" data-x href="' + esc(r.link) + '"><span class="s">' + esc(r.source) + '</span><span class="t">' + esc(r.title) + '</span></a>').join('') +
      '</div></div>' : '';
    return '<div class="story ' + (i.watch?'pin':'') + ' ' + (i.rising?'flash':'') + '" style="animation-delay:' + (Math.min(x,14)*32) + 'ms">' +
      '<div class="rank">' + (x+1) + '</div><div>' +
      '<a data-x href="' + esc(i.link) + '"><h3>' + esc(i.title) + '</h3></a>' +
      '<div class="meta"><span class="src">' + esc(i.source) + '</span><span class="dot-sep"></span>' +
      '<span class="when">' + timeAgo(i.ageH) + ' ago</span>' + badges + multi + geos + '</div></div>' +
      '<div class="score"><span class="n">' + Math.round(i.score) + '</span>' +
      '<span class="bar"><i style="width:' + Math.max(6, Math.round(i.score/mx*100)) + '%;animation-delay:' + (Math.min(x,14)*32) + 'ms"></i></span></div>' +
      rel + '</div>';
  }).join('') : '<div class="empty-state">' + icon('search') + '<div>Nothing matches' + ((f.region||f.entity||f.q)?' this filter':'') + '.</div></div>';
  el.querySelector('[data-storyn]').textContent = items.length;

  countUp($('st-'+sec+'-n'), d.items.length);
  countUp($('st-'+sec+'-b'), brk.length);
  countUp($('st-'+sec+'-top'), items.length ? Math.round(items[0].score) : 0);

  /* map */
  const svg = el.querySelector('svg.geomap');
  const vals = Object.keys(d.regions).map(k => d.regions[k]);
  const top = vals.length ? Math.max.apply(null, vals) : 1;
  Array.prototype.forEach.call(svg.querySelectorAll('path.region'), p => {
    const id = p.getAttribute('data-id'), v = d.regions[id] || 0;
    if (v > 0){ p.style.fill = heat(d.accent, Math.min(1, .22 + (v/top)*.78)); p.classList.add('hot'); }
    else { p.style.fill = ''; p.classList.remove('hot'); }
    p.classList.toggle('sel', id === f.region);
  });
  const arr = Object.entries(d.regions).sort((a,b) => b[1]-a[1]).slice(0,7);
  el.querySelector('[data-ranks]').innerHTML = arr.length ? arr.map(([id,v],x) =>
    '<div class="rrow ' + (f.region===id?'on':'') + '" data-region="' + esc(id) + '"><span class="ri">' + (x+1) + '</span>' +
    '<span class="rn">' + esc(regionName(d.geo,id)) + '</span>' +
    '<span class="rb"><i style="width:' + Math.round(v/arr[0][1]*100) + '%;animation-delay:' + (x*50) + 'ms"></i></span>' +
    '<span class="rv">' + v + '</span></div>').join('')
    : '<div class="hint" style="padding:6px 0">No locations detected.</div>';
}

/* ---------- ticker ---------- */
function renderStrip(){
  const all = [];
  const now = Date.now();
  DESKS.forEach(sec => DATA.desks[sec].items.forEach(i => {
    const ageH = (now-i.t)/3.6e6;
    if (ageH*60 <= 210 && (i.sev==='crit'||i.sev==='hi')) all.push({ i, sec, s:i.score });
  }));
  all.sort((a,b) => b.s-a.s);
  const t = $('stripTrack');
  if (!all.length){ t.innerHTML = '<span class="strip-empty">No critical alerts — the wire is quiet.</span>'; t.style.animation = 'none'; return; }
  const top = all.slice(0,16);
  const html = top.map(o => '<span class="strip-item" data-x data-href="' + esc(o.i.link) + '"><em>' +
    esc(DATA.desks[o.sec].label) + '</em><b>' + esc(o.i.source) + '</b>' + esc(o.i.title) + '</span>').join('');
  t.innerHTML = html + html;
  t.style.animation = 'marquee ' + Math.max(46, top.length*7) + 's linear infinite';
}

/* ---------- nav ---------- */
function setAccent(sec){
  const a = DATA.desks[sec].accent, r = document.documentElement.style;
  r.setProperty('--accent', a);
  const c = a.replace('#',''); 
  r.setProperty('--glow', 'rgba(' + parseInt(c.slice(0,2),16) + ',' + parseInt(c.slice(2,4),16) + ',' + parseInt(c.slice(4,6),16) + ',.09)');
}
function go(sec){
  if (sec === current) return;
  current = sec;
  Array.prototype.forEach.call(document.querySelectorAll('.page'), p => p.classList.toggle('on', p.id === 'page-'+sec));
  Array.prototype.forEach.call(document.querySelectorAll('.tabbtn'), b => b.classList.toggle('on', b.dataset.page === sec));
  Array.prototype.forEach.call(document.querySelectorAll('.dtab'), b => b.classList.toggle('on', b.dataset.page === sec));
  setAccent(sec);
  $('deskName').textContent = DATA.desks[sec].full;
  render(sec);
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ---------- boot ---------- */
function init(){
  const main = $('main');
  DESKS.forEach(sec => main.appendChild(deskDOM(sec)));
  const tabs = DESKS.map(s => ({ p:s, label:DATA.desks[s].label, ic: s==='us' ? 'flag' : 'globe' }));
  $('tabbar').innerHTML = tabs.map(t =>
    '<button class="tabbtn ' + (t.p===current?'on':'') + '" data-page="' + t.p + '">' + icon(t.ic) + '<span>' + t.label + '</span></button>').join('');
  $('deskbar').innerHTML = tabs.map(t =>
    '<button class="dtab ' + (t.p===current?'on':'') + '" data-page="' + t.p + '">' + t.label + '</button>').join('') + '<div class="bar-sp"></div>';
  Array.prototype.forEach.call(document.querySelectorAll('.tabbtn,.dtab'), b => b.onclick = () => go(b.dataset.page));

  $('page-' + current).classList.add('on');
  setAccent(current);
  $('deskName').textContent = DATA.desks[current].full;

  /* badges */
  const now = Date.now();
  DESKS.forEach(sec => {
    const n = DATA.desks[sec].items.filter(i => (now-i.t)/3.6e6*60 <= 150 && (i.sev==='crit'||i.sev==='hi')).length;
    const btn = document.querySelector('.tabbtn[data-page="' + sec + '"]');
    if (n && btn){ const b = document.createElement('span'); b.className = 'nb'; b.textContent = n > 9 ? '9+' : n; btn.appendChild(b); }
  });

  /* one delegated handler for everything */
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-x]');
    if (link){
      const href = link.getAttribute('href') || link.getAttribute('data-href');
      if (!href) return;
      if (!bridgeAlive()){ return; }        // no bridge: let it open in the web view
      e.preventDefault();
      emit({ type:'open', url:href });
      return;
    }
    const rl = e.target.closest('#reload');
    if (rl){ rl.classList.add('busy'); emit({ type:'refresh' }); return; }
    const reg = e.target.closest('[data-region]');
    if (reg){ const f = filters[current], id = reg.getAttribute('data-region');
      f.region = f.region === id ? null : id; render(current); return; }
    const path = e.target.closest('path.region');
    if (path){ const f = filters[current], id = path.getAttribute('data-id');
      f.region = f.region === id ? null : id; render(current); return; }
    const ent = e.target.closest('[data-entity]');
    if (ent){ const f = filters[current], v = ent.getAttribute('data-entity');
      f.entity = f.entity === v ? null : v; render(current); return; }
    const clr = e.target.closest('[data-clear]');
    if (clr){ filters[current][clr.getAttribute('data-clear')] = null; render(current); return; }
    const rel = e.target.closest('[data-rel]');
    if (rel){ const box = document.querySelector('[data-relbox="' + rel.getAttribute('data-rel') + '"]');
      if (box){ box.classList.toggle('open'); rel.classList.toggle('open'); } return; }
  }, false);

  document.addEventListener('input', e => {
    const s = e.target.closest('[data-search]');
    if (s){ filters[current].q = s.value.trim(); render(current); }
  });

  DESKS.forEach(render);
  renderStrip();
  $('clock').textContent = DATA.stamp;
}
try {
  init();
} catch (err){
  const box = document.createElement('div');
  box.setAttribute('style','padding:40px 24px;color:#97A1B2;font-family:-apple-system,sans-serif;' +
    'font-size:13px;line-height:1.6;text-align:center');
  box.innerHTML = 'War Room hit a rendering error.<br><br>' +
    '<span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#E5484D">' +
    String(err && err.message || err).replace(/[&<>]/g, '') + '</span>';
  (document.getElementById('main') || document.body).appendChild(box);
}
})();
