#!/usr/bin/env node
/* ============================================================
   scripts/fetch-feeds.js
   Runs in GitHub Actions (Node 20). Fetches every desk's feeds
   server-side (no CORS problem), parses with the SHARED engine,
   and writes data/feeds.json for the page to load directly.
   Also maintains data/history.json (per-story source counts over
   time) so the UI can compute cross-refresh coverage velocity.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const ENGINE = require('../engine-core.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const MAX_AGE_HRS = 30;
const PER_SECTION = 45;
const TIMEOUT = 15000;

function log(...a) { console.log('[fetch]', ...a); }

async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(feed.u, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WarRoomMonitor/1.0; +https://github.com)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const xml = await res.text();
    const items = ENGINE.parseFeed(xml, feed.n);
    return { ok: true, items };
  } catch (e) {
    return { ok: false, items: [], err: e.message };
  } finally { clearTimeout(to); }
}

function keyOf(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
}

async function run() {
  fs.mkdirSync(DATA, { recursive: true });
  const now = Date.now();
  const outSections = {};
  const status = {};

  for (const [sec, cfg] of Object.entries(ENGINE.SECTIONS)) {
    const results = await Promise.all(cfg.feeds.map(f => fetchFeed(f).then(r => ({ f, r }))));
    const seen = new Set();
    const items = [];
    for (const { f, r } of results) {
      status[f.n] = r.ok ? (r.items.length ? 'ok' : 'empty') : 'err';
      if (!r.ok) log('  ✗', sec, f.n, r.err);
      for (const it of r.items) {
        const ageH = (now - new Date(it.date).getTime()) / 3.6e6;
        if (ageH > MAX_AGE_HRS || ageH < -3) continue;
        const k = keyOf(it.title);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        items.push(it);
      }
    }
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    outSections[sec] = items.slice(0, PER_SECTION);
    log(sec, '→', outSections[sec].length, 'items from', cfg.feeds.length, 'feeds');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    status,
    sections: outSections
  };
  fs.writeFileSync(path.join(DATA, 'feeds.json'), JSON.stringify(payload));
  log('wrote data/feeds.json');

  /* ---- history for velocity ---- */
  let hist = {};
  try { hist = JSON.parse(fs.readFileSync(path.join(DATA, 'history.json'), 'utf8')); } catch (e) { }
  const nowIso = new Date().toISOString();
  for (const [sec, items] of Object.entries(outSections)) {
    hist[sec] = hist[sec] || {};
    for (const it of items) {
      const k = keyOf(it.title);
      const rec = hist[sec][k] || { first: nowIso, srcs: [] };
      if (!rec.srcs.includes(it.source)) rec.srcs.push(it.source);
      rec.last = nowIso;
      hist[sec][k] = rec;
    }
    // prune entries older than 24h
    for (const k of Object.keys(hist[sec])) {
      if (now - new Date(hist[sec][k].last).getTime() > 24 * 3.6e6) delete hist[sec][k];
    }
  }
  fs.writeFileSync(path.join(DATA, 'history.json'), JSON.stringify(hist));
  log('wrote data/history.json');
}

run().catch(e => { console.error(e); process.exit(1); });
