/* ============================================================
   engine-core.js  —  SHARED by the browser AND the Node
   pre-fetch script (scripts/fetch-feeds.js).
   Desk/feed configuration + a dependency-free RSS/Atom parser
   that runs identically in both environments.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node
  else { root.ENGINE = api; }                                                // Browser
})(typeof self !== 'undefined' ? self : this, function () {

  const G = 'https://news.google.com/rss/';
  const gsearch = (q, when) =>
    G + 'search?q=' + encodeURIComponent(q + (when ? (' when:' + when) : '')) +
    '&hl=en-US&gl=US&ceid=US:en';
  const gtopic = t => G + 'headlines/section/topic/' + t + '?hl=en-US&gl=US&ceid=US:en';

  /* ---------------- DESKS ---------------- */
  const SECTIONS = {
    world: {
      label: 'World', full: 'World Affairs', accent: '#E5484D', geo: 'world', kw: 'crit',
      feeds: [
        { n: 'BBC World', u: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
        { n: 'Guardian', u: 'https://www.theguardian.com/world/rss' },
        { n: 'Al Jazeera', u: 'https://www.aljazeera.com/xml/rss/all.xml' },
        { n: 'NPR World', u: 'https://feeds.npr.org/1004/rss.xml' },
        { n: 'DW', u: 'https://rss.dw.com/rdf/rss-en-all' },
        { n: 'France 24', u: 'https://www.france24.com/en/rss' },
        { n: 'CNN World', u: 'http://rss.cnn.com/rss/edition_world.rss' },
        { n: 'Sky News', u: 'https://feeds.skynews.com/feeds/rss/world.xml' },
        { n: 'Independent', u: 'https://www.independent.co.uk/news/world/rss' },
        { n: 'CBC', u: 'https://www.cbc.ca/webfeed/rss/rss-world' },
        { n: 'Euronews', u: 'https://www.euronews.com/rss?level=theme&name=news' },
        { n: 'Times of India', u: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
        { n: 'AP', u: gtopic('WORLD') },
        { n: 'Reuters', u: gsearch('reuters world', '2d') },
      ]
    },
    us: {
      label: 'U.S.', full: 'United States', accent: '#4C7DFF', geo: 'us', kw: 'us',
      feeds: [
        { n: 'NPR National', u: 'https://feeds.npr.org/1003/rss.xml' },
        { n: 'The Hill', u: 'https://thehill.com/news/feed/' },
        { n: 'Politico', u: 'https://www.politico.com/rss/politicopicks.xml' },
        { n: 'NYT U.S.', u: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml' },
        { n: 'Washington Post', u: 'https://feeds.washingtonpost.com/rss/national' },
        { n: 'CBS News', u: 'https://www.cbsnews.com/latest/rss/us' },
        { n: 'ABC News', u: 'https://feeds.abcnews.com/abcnews/usheadlines' },
        { n: 'NBC News', u: 'http://feeds.nbcnews.com/nbcnews/public/news' },
        { n: 'USA Today', u: 'https://rssfeeds.usatoday.com/usatoday-NewsTopStories' },
        { n: 'Guardian U.S.', u: 'https://www.theguardian.com/us-news/rss' },
        { n: 'CNN U.S.', u: 'http://rss.cnn.com/rss/cnn_us.rss' },
        { n: 'Fox News', u: 'https://moxie.foxnews.com/google-publisher/politics.xml' },
        { n: 'PBS NewsHour', u: 'https://www.pbs.org/newshour/feeds/rss/headlines' },
        { n: 'U.S. Wire', u: gtopic('NATION') },
      ]
    }
  };

  /* ---------------- ENTITY DECODE / STRIP ---------------- */
  const NAMED = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', '#39':"'", mdash:'—', ndash:'–', hellip:'…', rsquo:'’', lsquo:'‘', ldquo:'“', rdquo:'”' };
  function decodeEntities(s) {
    if (!s) return '';
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isNaN(code) ? m : String.fromCodePoint(code);
      }
      return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
    });
  }
  function stripHtml(s) {
    if (!s) return '';
    return decodeEntities(
      String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim();
  }
  function unwrapCDATA(s) {
    if (!s) return '';
    const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    return (m ? m[1] : s);
  }

  /* ---------------- RSS / ATOM PARSER ---------------- */
  function tag(block, name) {
    const re = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i');
    const m = block.match(re);
    return m ? m[1] : '';
  }
  function atomLink(block) {
    const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map(m => m[1]);
    let best = '';
    for (const attrs of links) {
      const href = (attrs.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!href) continue;
      const rel = (attrs.match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!rel || rel === 'alternate') return href;
      if (!best) best = href;
    }
    return best;
  }
  function parseFeed(xml, sourceName) {
    const out = [];
    if (!xml || typeof xml !== 'string') return out;
    let blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi);
    const atom = !blocks;
    if (atom) blocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi);
    if (!blocks) return out;

    for (const b of blocks) {
      let title = stripHtml(unwrapCDATA(tag(b, 'title')));
      if (!title) continue;
      let link = atom ? atomLink(b) : (stripHtml(unwrapCDATA(tag(b, 'link'))) || atomLink(b));
      link = decodeEntities((link || '').trim());
      const dRaw = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') ||
        tag(b, 'dc:date') || tag(b, 'date') || '';
      let d = dRaw ? new Date(stripHtml(dRaw)) : null;
      if (!d || isNaN(d)) d = new Date();
      let desc = stripHtml(unwrapCDATA(
        tag(b, 'description') || tag(b, 'summary') || tag(b, 'media:description') || tag(b, 'content') || ''
      )).slice(0, 260);

      // Google News wraps the outlet into the title as "Headline - Source"
      let source = sourceName;
      if (/^(AP|Reuters|U\.S\. Wire)$/.test(sourceName)) {
        const gm = title.match(/^(.*?)\s+-\s+([^-]{2,42})$/);
        if (gm) { title = gm[1].trim(); source = gm[2].trim(); }
      }
      out.push({ title, link, date: d.toISOString(), desc, source });
    }
    return out;
  }

  return { SECTIONS, gsearch, gtopic, parseFeed, stripHtml, decodeEntities };
});
