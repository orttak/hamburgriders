# hamburgriders

Animated public transport map for Hamburg, built from the daily HVV GTFS schedule feed.

The app processes the current GTFS feed, builds compact JSON data for the Hamburg area, and renders scheduled vehicle movements on a MapLibre/deck.gl map.

## Data Source

The GTFS data comes from the official Hamburg transparency portal:

[HVV Fahrplandaten GTFS April 2026 bis Dezember 2026](https://suche.transparenz.hamburg.de/dataset/hvv-fahrplandaten-gtfs-april-2026-bis-dezember-2026)

Data is generated during the build and is not intended to be maintained manually.

## Development

```bash
npm install
npm run build
npm run server
```

The production build is written to `dist/`.

## Credits

This project is based on work forked from [bertt/utrechtriders](https://github.com/bertt/utrechtriders), which itself credits and builds on the idea of [londonriders](https://anita.garden/londonriders/) by [anita](https://anita.garden/).

Adapted here for Hamburg using HVV GTFS data and a TypeScript/deck.gl implementation.

## License

MIT
