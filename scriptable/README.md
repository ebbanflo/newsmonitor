# War Room for Scriptable

A **self-contained** version of War Room that runs entirely inside
[Scriptable](https://scriptable.app) on iOS. No web host, no GitHub Pages, no
GitHub Action, no CORS relays — Scriptable fetches the 28 RSS feeds natively.

One file: **`WarRoom.js`** (~115 KB, includes the maps).

| | |
|---|---|
| **Run in Scriptable** | Full-screen app — the same UI as the web version: breaking card, ranked stories, trending chips, search, and a tappable density map per desk. |
| **Add as a widget** | Ranked headlines on the Home Screen. Small / medium / large. |

## Install

1. Get the file onto your phone — either:
   - open [`WarRoom.js`](./WarRoom.js) on the iPhone, tap **Raw**, select all, copy; then in Scriptable tap **+** and paste; **or**
   - save it into **iCloud Drive → Scriptable/** from the Files app and it appears automatically.
2. Name the script **War Room**.
3. Tap ▶ to run it.

### Add the widget
Long-press the Home Screen → **+** → **Scriptable** → pick a size → drop it →
tap the widget → **Script: War Room**. Set **Parameter** to `world` or `us` to
choose the desk (blank uses `WIDGET_DESK`, default `world`). Leave *When
Interacting* on **Run Script** to open the full app on tap.

## Settings

Edit the block at the very top of `WarRoom.js`:

```js
const WATCHLIST = [];        // e.g. ["Taiwan", "Federal Reserve"] — pinned + flagged
const CACHE_MINUTES = 8;     // reuse the cached pull if younger than this
const WIDGET_DESK = 'world'; // desk used when the widget has no parameter
```

## How it behaves

- **First run** fetches all 28 feeds in parallel (a few seconds) and caches the
  result to Scriptable's local cache directory.
- **Reload** (top right) forces a fresh pull. The widget reuses the app's cache
  when it is younger than `CACHE_MINUTES`, so it stays fast and cheap.
- **Tapping a headline** opens it in an in-app Safari sheet; dismissing it
  returns you to War Room with your place intact.
- **Offline** it shows the last cached pull; feed failures are per-feed, so a
  dead outlet never takes the app down (the footer shows `live/total`).
- **Rising** badges compare each story cluster's outlet count against the
  previous run, stored in the same cache directory.

## Editing

`WarRoom.js` is generated. Sources live in `src/`:

```
src/core.js              feeds, parser, scoring, cache, widget, app loop
src/page.js              the UI that runs inside the WebView
src/page.css             design system (derived from the web app's styles.css)
src/geo-world.lite.json  simplified world polygons  (36 KB)
src/geo-usa.lite.json    simplified US states       (9 KB)
```

Rebuild with:

```bash
node scriptable/build.js
```

The build inlines the CSS, the page script, the map data, and pulls the place-alias
tables straight out of the web app's `app.js` so both versions stay in sync.
