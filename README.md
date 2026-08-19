# War Room — World &amp; U.S. Monitor

A live news monitor built as an **installable iOS home-screen app** (and a full
desktop dashboard from the same URL). It aggregates **28 free RSS/Atom feeds**
across two desks, ranks stories by importance, flags breaking news, and heats a
map where the news is happening. No accounts, no tracking, no API keys.

## Two desks

| Desk | Sources | Map |
|------|---------|-----|
| **World** | BBC, Guardian, Al Jazeera, NPR, DW, France 24, CNN, Sky, Independent, CBC, Euronews, Times of India, AP, Reuters | world — country heat (red) |
| **U.S.** | NPR, The Hill, Politico, NYT, Washington Post, CBS, ABC, NBC, USA Today, Guardian US, CNN, Fox, PBS, U.S. wire | 50 states + D.C. — state heat (blue) |

Each desk carries a breaking-news card, importance-ranked stories, trending
entity chips, a search field, and a clickable density map. A third **Watch** tab
holds the keyword watchlist, alert switch, live feed health, and sync status.

## How stories are ranked

`importance = urgency language + recency + cross-outlet corroboration + coverage velocity`

- **Rising** — a story cluster that gained a new outlet since the last refresh.
- **`N sources`** — tap to expand every outlet carrying the same story.
- **Watch** — pinned to the top of every desk, alert-eligible.
- **New** — published since you last opened that desk.
- Geo detection matches ~250 country aliases (World) or state/city/D.C. aliases (U.S.).

## Install on iPhone

1. Open the site in **Safari** (this must be Safari, not Chrome).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch it from the Home Screen — it opens full-screen with no browser chrome,
   its own launch screen, and works offline from cache.

Built for iOS: safe-area layout for notch and home indicator, bottom tab bar,
pull-to-refresh, native New York/SF Pro typography, and a status bar that blends
into the app.

## Reliability

A **GitHub Action** (`.github/workflows/feeds.yml`) fetches and parses every feed
server-side each 10 minutes into `data/feeds.json`, so the app paints instantly
with no CORS relays involved. If that snapshot is missing or stale, the app falls
back to fetching feeds in-browser through public CORS relays. Last-good data is
cached in `localStorage`. The status pill reads **Live** (pre-fetch), **Relay**
(browser fallback), or **Cached**.

## Files

```
index.html            app shell, iOS meta, launch screens
styles.css            design system
app.js                desks, scoring, maps, interaction
engine-core.js        shared feed list + RSS/Atom parser (browser + Node)
geo-world.js          world countries      geo-usa.js   US states (AK/HI inset)
sw.js                 offline shell        manifest.webmanifest
scripts/fetch-feeds.js          server-side pre-fetch
.github/workflows/feeds.yml     10-minute refresh
data/feeds.json                 generated snapshot
```

## Publish

**Settings → Pages → Deploy from a branch → `main` / `(root)`.**
Scheduled pre-fetch requires *Settings → Actions → General → Workflow permissions
→ Read and write*.
