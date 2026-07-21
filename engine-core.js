/* ============================================================
   engine-core.js  —  SHARED by the browser AND the Node
   pre-fetch script (scripts/fetch-feeds.js).
   Contains: desk/feed configuration + a dependency-free
   RSS/Atom parser that runs identically in both environments.
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

  /* ---------------- DESK / FEED CONFIG ---------------- */
  const SECTIONS = {
    global: {
      label: 'Global World', accent: '#ff3b3b', heat: '#ff3b3b', geo: 'world', kw: 'crit',
      feeds: [
        { n: 'BBC World', u: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
        { n: 'Guardian', u: 'https://www.theguardian.com/world/rss' },
        { n: 'Al Jazeera', u: 'https://www.aljazeera.com/xml/rss/all.xml' },
        { n: 'NPR', u: 'https://feeds.npr.org/1004/rss.xml' },
        { n: 'DW', u: 'https://rss.dw.com/rdf/rss-en-all' },
        { n: 'France 24', u: 'https://www.france24.com/en/rss' },
        { n: 'CNN World', u: 'http://rss.cnn.com/rss/edition_world.rss' },
        { n: 'Sky News', u: 'https://feeds.skynews.com/feeds/rss/world.xml' },
        { n: 'Independent', u: 'https://www.independent.co.uk/news/world/rss' },
        { n: 'CBC', u: 'https://www.cbc.ca/webfeed/rss/rss-world' },
        { n: 'Times of India', u: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
        { n: 'Euronews', u: 'https://www.euronews.com/rss?level=theme&name=news' },
        { n: 'AP (GNews)', u: gtopic('WORLD') },
        { n: 'Reuters (GNews)', u: gsearch('reuters world', '2d') },
      ]
    },
    us: {
      label: 'US National', accent: '#4a8bff', heat: '#4a8bff', geo: 'us', kw: 'us',
      feeds: [
        { n: 'NPR National', u: 'https://feeds.npr.org/1003/rss.xml' },
        { n: 'The Hill', u: 'https://thehill.com/news/feed/' },
        { n: 'Politico', u: 'https://www.politico.com/rss/politicopicks.xml' },
        { n: 'NYT US', u: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml' },
        { n: 'Washington Post', u: 'https://feeds.washingtonpost.com/rss/national' },
        { n: 'CBS News', u: 'https://www.cbsnews.com/latest/rss/us' },
        { n: 'ABC News', u: 'https://feeds.abcnews.com/abcnews/usheadlines' },
        { n: 'NBC News', u: 'http://feeds.nbcnews.com/nbcnews/public/news' },
        { n: 'USA Today', u: 'https://rssfeeds.usatoday.com/usatoday-NewsTopStories' },
        { n: 'Guardian US', u: 'https://www.theguardian.com/us-news/rss' },
        { n: 'CNN US', u: 'http://rss.cnn.com/rss/cnn_us.rss' },
        { n: 'Fox News', u: 'https://moxie.foxnews.com/google-publisher/politics.xml' },
        { n: 'PBS NewsHour', u: 'https://www.pbs.org/newshour/feeds/rss/headlines' },
        { n: 'US Wire (GNews)', u: gtopic('NATION') },
      ]
    },
    ai: {
      label: 'AI News', accent: '#3be0ff', heat: '#3be0ff', geo: 'world', kw: 'ai',
      feeds: [
        { n: 'TechCrunch AI', u: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
        { n: 'VentureBeat AI', u: 'https://venturebeat.com/category/ai/feed/' },
        { n: 'The Verge', u: 'https://www.theverge.com/rss/index.xml' },
        { n: 'Ars Technica', u: 'https://feeds.arstechnica.com/arstechnica/index' },
        { n: 'Wired', u: 'https://www.wired.com/feed/rss' },
        { n: 'MIT Tech Review', u: 'https://www.technologyreview.com/feed/' },
        { n: 'The Register', u: 'https://www.theregister.com/headlines.atom' },
        { n: 'Hacker News', u: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+OpenAI+OR+Anthropic&count=30' },
        { n: 'AI (GNews)', u: gsearch('artificial intelligence', '2d') },
        { n: 'LLMs (GNews)', u: gsearch('OpenAI OR Anthropic OR "large language model" OR Gemini', '2d') },
        { n: 'AI Policy (GNews)', u: gsearch('AI regulation OR AI safety', '3d') },
      ]
    },
    good: {
      label: 'Good News', accent: '#3bff9e', heat: '#3bff9e', geo: 'world', kw: 'good',
      feeds: [
        { n: 'Positive News', u: 'https://www.positive.news/feed/' },
        { n: 'Good News Network', u: 'https://www.goodnewsnetwork.org/feed/' },
        { n: 'Reasons to be Cheerful', u: 'https://reasonstobecheerful.world/feed/' },
        { n: 'Optimist Daily', u: 'https://www.optimistdaily.com/feed/' },
        { n: 'Uplifting (GNews)', u: gsearch('heartwarming OR uplifting OR "good news"', '3d') },
        { n: 'Breakthroughs (GNews)', u: gsearch('breakthrough OR cure OR rescued OR "record low"', '3d') },
        { n: 'Conservation (GNews)', u: gsearch('conservation win OR species recovery OR reforestation', '5d') },
      ]
    }
  };

  /* ---------------- ENTITY DECODE / STRIP ---------------- */
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
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
      String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim();
  }
  function unwrapCDATA(s) {
    if (!s) return '';
    const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    return (m ? m[1] : s);
  }

  /* ---------------- RSS / ATOM PARSER (dependency-free) ----------------
     Works identically in Node and the browser. Returns normalized items:
     { title, link, date (ISO string), desc, source }                    */
  function tag(block, name) {
    // matches <name ...>...</name> (first), case-insensitive
    const re = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i');
    const m = block.match(re);
    return m ? m[1] : '';
  }
  function atomLink(block) {
    // prefer rel="alternate" or no rel; take href
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
    // find <item> or <entry> blocks
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

      // Google News wraps source in the title as "Headline - Source"
      let source = sourceName;
      if (/GNews|Wire \(GNews\)/.test(sourceName)) {
        const gm = title.match(/^(.*?)\s+-\s+([^-]{2,42})$/);
        if (gm) { title = gm[1].trim(); source = gm[2].trim(); }
      }
      out.push({ title, link, date: d.toISOString(), desc, source });
    }
    return out;
  }

  return { SECTIONS, gsearch, gtopic, parseFeed, stripHtml, decodeEntities };
});
