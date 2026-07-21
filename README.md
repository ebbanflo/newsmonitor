# WAR ROOM // Global News Monitor

A single-file, zero-build **war-room news dashboard** you can host on GitHub Pages.
It aggregates **32 free RSS/Atom feeds** across three desks, ranks stories by
importance, surfaces a real-time breaking corner + ticker, and paints a world
map red where the news is hot.

![status](https://img.shields.io/badge/status-live-ff3b3b) &nbsp; no keys · no tracking · 100% client-side

## Three desks

| Desk | What it watches | Map heat |
|------|-----------------|----------|
| **Global World** | BBC, Guardian, Al Jazeera, NPR, DW, France 24, CNN, Sky, Independent, CBC, Times of India, Euronews, AP & Reuters (via Google News) | red |
| **AI News** | TechCrunch, VentureBeat, The Verge, Ars Technica, Wired, MIT Tech Review, The Register, Hacker News + Google News (AI / LLMs / policy) | cyan |
| **Good News** | Positive News, Good News Network, Reasons to be Cheerful, Optimist Daily + Google News (uplifting / breakthroughs / conservation) | green |

Each desk has **all** of: importance-ranked stories, a breaking-news corner, and
a simplified world map highlighting the countries in the news.

## How it works

- **Importance score** = urgency-keyword weight + recency + **cross-outlet corroboration**
  (a story covered by multiple outlets is clustered and ranked higher, tagged `N× SOURCES`).
- **Breaking corner + ticker** = recent items (last ~2.5h) carrying critical/alert
  keywords or a `breaking/live/just in` marker.
- **Threat map** = an embedded, simplified world GeoJSON. Headlines are scanned for
  ~250 country names, capitals, demonyms and leaders; matching countries glow with
  intensity proportional to story volume. **Click any country** (or a story's flag
  chip) to filter that desk to stories about it.
- **Feeds** are fetched in the browser through a fallback chain of public CORS relays
  (allorigins → corsproxy → codetabs → thingproxy), parsed with the native `DOMParser`.
  Auto-refreshes every 5 minutes.

Everything — HTML, CSS, JS, and the world map — lives in `index.html`. No build step,
no dependencies, no API keys.

## Publish on GitHub Pages

1. Push `index.html` to your repo (this branch, or merge to `main`).
2. **Settings → Pages → Build and deployment → Source: _Deploy from a branch_**.
3. Pick the branch and the `/ (root)` folder, then **Save**.
4. Open `https://<user>.github.io/<repo>/` — the dashboard loads and starts pulling wire.

> Note: a few outlets rotate feed URLs or block certain relays; the dashboard degrades
> gracefully — each feed shows a live green/red status chip, and the rest keep flowing.
