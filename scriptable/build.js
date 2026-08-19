#!/usr/bin/env node
/* Assembles scriptable/src/* into the single paste-ready scriptable/WarRoom.js */
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const SRC = path.join(HERE, 'src');
const ROOT = path.join(HERE, '..');

const read = p => fs.readFileSync(p, 'utf8');

// pull the alias tables straight out of the web app so the two stay in sync
function extractAlias(name){
  const app = read(path.join(ROOT, 'app.js'));
  const start = app.indexOf('const ' + name + ' = {');
  if (start === -1) throw new Error('alias table not found: ' + name);
  const open = app.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < app.length; i++){
    if (app[i] === '{') depth++;
    else if (app[i] === '}'){ depth--; if (!depth) break; }
  }
  const body = app.slice(open, i + 1);
  const obj = eval('(' + body + ')');           // trusted local source
  // drop null-valued (ignored) aliases: the Scriptable detector skips them anyway
  const out = {};
  Object.keys(obj).forEach(k => { if (obj[k]) out[k.trim()] = obj[k]; });
  return out;
}

// the inline SVG sprite from index.html
function extractSprite(){
  const html = read(path.join(ROOT, 'index.html'));
  const m = html.match(/<svg style="display:none"[\s\S]*?<\/svg>/);
  if (!m) throw new Error('sprite not found');
  return m[0];
}

const minifyCSS = css => css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s*\n\s*/g, '\n')
  .replace(/\n{2,}/g, '\n')
  .trim();

let out = read(path.join(SRC, 'core.js'));
const subs = {
  __GEO_WORLD__: read(path.join(SRC, 'geo-world.lite.json')).trim(),
  __GEO_US__:    read(path.join(SRC, 'geo-usa.lite.json')).trim(),
  __WORLD_ALIAS__: JSON.stringify(extractAlias('WORLD_ALIAS')),
  __US_ALIAS__:    JSON.stringify(extractAlias('US_ALIAS')),
  __PAGE_CSS__:  JSON.stringify(minifyCSS(read(path.join(SRC, 'page.css')))),
  __PAGE_JS__:   JSON.stringify(read(path.join(SRC, 'page.js'))),
  __SPRITE__:    JSON.stringify(extractSprite().replace(/\s*\n\s*/g, '')),
};
Object.keys(subs).forEach(k => {
  if (out.indexOf(k) === -1) throw new Error('placeholder missing: ' + k);
  out = out.replace(k, () => subs[k]);
});

const dest = path.join(HERE, 'WarRoom.js');
fs.writeFileSync(dest, out);
console.log('built', path.relative(ROOT, dest), '—', (out.length / 1024).toFixed(1), 'KB');
