# utrechtriders

A real-time animated map of all public transit (OV) movements in the municipality of Utrecht for today, based on a GTFS schedule feed.

🗺️ **Live demo:** [https://bertt.github.io/utrechtriders](https://bertt.github.io/utrechtriders)

Inspired by [londonriders](https://anita.garden/londonriders/) by [anita](https://anita.garden/).

---

## Screenshot

> *(moving transit bubbles on a dark map of Utrecht)*

---

## Features

- 🚍 **Animated trips** — colored bubbles move along their scheduled route in real time
- 🟢 **Route colors** — each bubble uses the official route color from the GTFS feed
- ⚪ **Stops** — all stops shown as small white dots with hover popups
- ⏱️ **Timeline** — scrub through the full day (05:00–05:00 next day), adjust speed, play/pause
- 📊 **Statistics** — live count of active trips and cumulative trips seen today
- 🎨 **Legend** — collapsible panel showing all active routes with their colors
- ℹ️ **About** — feed metadata and attribution

---

## Data

| Field | Value |
|---|---|
| Feed publisher | OVapi |
| Feed URL | https://www.ovapi.nl |
| Feed description | Netherlands national public transport GTFS |
| Bounding box | 4.995003, 52.049134 → 5.231209, 52.150129 (Utrecht municipality) |
| Typical trips/day | ~1300 |
| Typical stops | ~113 |
| Typical routes | ~30 |

The GTFS feed contains all public transit in the Netherlands. The build script filters it to only trips serving the Utrecht bounding box on the day of deployment.

**Data is not committed to this repository.** It is generated fresh on each push via GitHub Actions.

---

## How it works

```
GTFS feed (zip)
     │
     ▼
scripts/build-data.js        ← Node.js, run in GitHub Actions
     │
     ├── Filter stops within Utrecht bbox
     ├── Get active service_ids for today (calendar_dates.txt)
     ├── Filter trips active today with ≥1 Utrecht stop
     └── Stream stop_times.txt (line-by-line, ~18M rows)
     │
     ▼
docs/data/
     ├── meta.json      ← date, stats, feed info
     ├── stops.json     ← stops within bbox
     ├── routes.json    ← routes referenced by today's trips
     └── trips.json     ← trips with ordered stop times (seconds from midnight)
     │
     ▼
docs/index.html + app.js    ← MapLibre GL JS animation
     │
     ▼
GitHub Pages (https://bertt.github.io/utrechtriders)
```

### Trip animation

Each trip has an ordered list of stop times (arrival/departure in seconds from midnight).
For any given animation time T:
- A trip is **active** if `first_departure ≤ T ≤ last_arrival`
- Position is **linearly interpolated** between the two surrounding stops

### Times

GTFS times can exceed 24:00 (e.g. `25:30:00` = 01:30 the next day). These are kept as-is
(stored as seconds, e.g. 91800), so the timeline covers 05:00–29:00 (5am to 5am next day).

---

## Configuration

Edit `config.json` to switch GTFS feeds or adjust the bounding box:

```json
{
  "gtfsPath": "build/gtfs-nl",
  "bbox": {
    "minLon": 4.995003,
    "minLat": 52.049134,
    "maxLon": 5.231209,
    "maxLat": 52.150129
  },
  "title": "utrechtriders",
  "mapStyle": "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  "mapCenter": [5.121, 52.090],
  "mapZoom": 11,
  "feedInfo": {
    "publisher": "OVapi",
    "url": "http://www.ovapi.nl",
    "description": "Netherlands public transport GTFS feed"
  }
}
```

### Switching to a different GTFS feed

1. Update `gtfsUrl` in `config.json` to the new GTFS zip URL (or set the `GTFS_URL` repo secret to override)
2. Update `bbox`, `title`, `mapCenter`, `mapZoom`, and `feedInfo` in `config.json`
3. Push to `main` — GitHub Actions will download, process, and deploy automatically

---

## Local development

```bash
# Prerequisites: Node.js 18+, GTFS zip extracted to build/gtfs-nl/

# Build the data files
node scripts/build-data.js

# Serve the app locally
npx serve docs
# → open http://localhost:3000
```

---

## Deployment

Deployment is handled by GitHub Actions on every push to `main`:

1. Downloads the GTFS feed from `${{ secrets.GTFS_URL }}`
2. Runs `node scripts/build-data.js` to produce `docs/data/*.json`
3. Publishes `docs/` to the `gh-pages` branch via [peaceiris/actions-gh-pages](https://github.com/peaceiris/actions-gh-pages)

**GitHub repository secret (optional):** `GTFS_URL` — override the GTFS zip URL. If not set, the URL from `config.json` (`gtfsUrl`) is used as the default (`https://gtfs.ovapi.nl/nl/gtfs-nl.zip`).

---

## Tech stack

| Component | Technology |
|---|---|
| Map | [MapLibre GL JS](https://maplibre.org) 4.x |
| Basemap | [CARTO Dark Matter](https://carto.com/basemaps) |
| Data processing | Node.js (built-in `readline` + `fs`) |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages |

---

## License

MIT
