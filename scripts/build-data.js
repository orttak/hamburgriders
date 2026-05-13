#!/usr/bin/env node
/**
 * build-data.js
 * Reads the GTFS feed configured in config.json and outputs compact JSON
 * for today's Utrecht public transit trips to docs/data/.
 *
 * Output files:
 *   docs/data/meta.json        — build date, feed info, stats
 *   docs/data/stops.json       — stops within Utrecht bbox (for map display)
 *   docs/data/stop_coords.json — coords for ALL stops referenced by today's trips (for interpolation)
 *   docs/data/routes.json      — routes referenced by today's trips
 *   docs/data/trips.json       — trips active today with ordered stop times
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Config & paths
// ---------------------------------------------------------------------------
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const GTFS   = path.resolve(path.join(__dirname, '..', config.gtfsPath));
const OUT    = path.resolve(path.join(__dirname, '..', 'docs', 'data'));

fs.mkdirSync(OUT, { recursive: true });

const { minLon, minLat, maxLon, maxLat } = config.bbox;

// Today in YYYYMMDD format (local time)
const now = new Date();
const TODAY = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
const TODAY_LABEL = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal RFC-4180 CSV line parser — handles quoted fields with embedded commas */
function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }  // escaped quote
        else { inQuote = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  fields.push(cur);
  return fields;
}

/** Parse a CSV header line into a field→index map (strips BOM) */
function parseHeader(line) {
  return parseCSVLine(line).reduce((acc, f, i) => {
    acc[f.trim().replace(/^\uFEFF/, '')] = i;
    return acc;
  }, {});
}

/** Convert GTFS time string (HH:MM:SS, may exceed 24h) to seconds from midnight */
function timeToSeconds(t) {
  if (!t) return null;
  const s = t.trim();
  const parts = s.split(':');
  if (parts.length < 3) return null;
  return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
}

/** Stream a CSV file line by line, calling rowCb(fields, header) for each data row */
function streamCSV(filePath, rowCb) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });
    let header = null;
    rl.on('line', line => {
      if (!header) { header = parseHeader(line); return; }
      if (!line.trim()) return;
      rowCb(parseCSVLine(line), header);
    });
    rl.on('close', resolve);
    rl.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Building data for ${TODAY} (${TODAY_LABEL})`);

  // ---- Step 1: Load ALL stops into memory (5MB, fits easily) ---------------
  // We need coords for all stops to enable trip interpolation across bbox boundary.
  console.log('Step 1: Loading all stops...');
  const allStopsMap  = new Map(); // stop_id → {id, name, lat, lon}
  const bboxStopsMap = new Map(); // stop_id → {id, name, lat, lon} (bbox only, for display)

  await streamCSV(path.join(GTFS, 'stops.txt'), (fields, h) => {
    const lat = parseFloat(fields[h.stop_lat]);
    const lon = parseFloat(fields[h.stop_lon]);
    if (isNaN(lat) || isNaN(lon)) return;
    const stop = {
      id:   (fields[h.stop_id]   || '').trim(),
      name: (fields[h.stop_name] || '').trim(),
      lat,
      lon
    };
    if (!stop.id) return;
    allStopsMap.set(stop.id, stop);
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
      bboxStopsMap.set(stop.id, stop);
    }
  });
  console.log(`  Total stops loaded: ${allStopsMap.size}, in bbox: ${bboxStopsMap.size}`);

  // ---- Step 2: Get active service_ids for today ----------------------------
  console.log('Step 2: Loading active service IDs for today...');
  const activeServiceIds = new Set();

  await streamCSV(path.join(GTFS, 'calendar_dates.txt'), (fields, h) => {
    if ((fields[h.date] || '').trim() === TODAY && (fields[h.exception_type] || '').trim() === '1') {
      activeServiceIds.add((fields[h.service_id] || '').trim());
    }
  });
  console.log(`  Active service IDs: ${activeServiceIds.size}`);

  // ---- Step 3: Load all routes ---------------------------------------------
  console.log('Step 3: Loading routes...');
  const routesMap = new Map();

  await streamCSV(path.join(GTFS, 'routes.txt'), (fields, h) => {
    const id = (fields[h.route_id] || '').trim();
    if (!id) return;
    routesMap.set(id, {
      id,
      short_name: (fields[h.route_short_name] || '').trim(),
      long_name:  (fields[h.route_long_name]  || '').trim(),
      color:      ((fields[h.route_color]      || '').trim()) || '4a90d9',
      text_color: ((fields[h.route_text_color] || '').trim()) || 'ffffff',
      agency_id:  (fields[h.agency_id]         || '').trim()
    });
  });
  console.log(`  Routes: ${routesMap.size}`);

  // ---- Step 4: Load trips active today -------------------------------------
  console.log('Step 4: Loading trips active today...');
  const tripsMap = new Map();

  await streamCSV(path.join(GTFS, 'trips.txt'), (fields, h) => {
    const serviceId = (fields[h.service_id] || '').trim();
    if (!activeServiceIds.has(serviceId)) return;
    const tripId = (fields[h.trip_id] || '').trim();
    if (!tripId) return;
    tripsMap.set(tripId, {
      trip_id:  tripId,
      route_id: (fields[h.route_id]      || '').trim(),
      headsign: (fields[h.trip_headsign] || '').trim(),
      service_id: serviceId
    });
  });
  console.log(`  Trips active today: ${tripsMap.size}`);

  // ---- Step 5: Stream stop_times (large file) ------------------------------
  console.log('Step 5: Streaming stop_times (large file — please wait)...');

  const tripStopTimes = new Map(); // trip_id → [{stop_id, arr, dep, seq}]
  let linesRead = 0;

  await streamCSV(path.join(GTFS, 'stop_times.txt'), (fields, h) => {
    linesRead++;
    if (linesRead % 2_000_000 === 0) process.stdout.write(`  ...${linesRead / 1_000_000}M rows\n`);

    const tripId = (fields[h.trip_id] || '').trim();
    if (!tripsMap.has(tripId)) return;

    const stopId = (fields[h.stop_id] || '').trim();
    const arr    = timeToSeconds(fields[h.arrival_time]);
    const dep    = timeToSeconds(fields[h.departure_time]);
    const seq    = parseInt(fields[h.stop_sequence], 10);

    if (!tripStopTimes.has(tripId)) tripStopTimes.set(tripId, []);
    tripStopTimes.get(tripId).push({ stop_id: stopId, arr, dep, seq });
  });

  console.log(`  Read ${linesRead} stop_time rows`);

  // Filter: trips with ≥1 stop in Utrecht bbox
  const utrechtTripIds = new Set();
  for (const [tripId, stopTimes] of tripStopTimes) {
    if (stopTimes.some(st => bboxStopsMap.has(st.stop_id))) {
      utrechtTripIds.add(tripId);
    }
  }
  console.log(`  Trips with at least one Utrecht stop: ${utrechtTripIds.size}`);

  // ---- Step 6: Build output structures -------------------------------------
  console.log('Step 6: Building output data...');

  const trips = [];
  const usedRouteIds = new Set();
  const usedStopIds  = new Set();

  for (const tripId of utrechtTripIds) {
    const trip = tripsMap.get(tripId);
    if (!trip) continue;
    usedRouteIds.add(trip.route_id);

    const stopTimes = (tripStopTimes.get(tripId) || [])
      .sort((a, b) => a.seq - b.seq)
      .map(st => {
        usedStopIds.add(st.stop_id);
        return { stop_id: st.stop_id, arr: st.arr, dep: st.dep };
      });

    trips.push({
      trip_id:  trip.trip_id,
      route_id: trip.route_id,
      headsign: trip.headsign,
      stops:    stopTimes
    });
  }

  // Output stops for display (bbox only)
  const outputDisplayStops = Array.from(bboxStopsMap.values());

  // Output stop_coords for interpolation (all stops referenced by filtered trips)
  // Format: {stop_id: [lat, lon]} — compact
  const outputStopCoords = {};
  for (const stopId of usedStopIds) {
    const s = allStopsMap.get(stopId);
    if (s) outputStopCoords[stopId] = [s.lat, s.lon];
  }

  const outputRoutes = [];
  for (const routeId of usedRouteIds) {
    if (routesMap.has(routeId)) outputRoutes.push(routesMap.get(routeId));
  }

  // ---- Step 7: Read feed_info ----------------------------------------------
  let feedPublisher = config.feedInfo.publisher;
  let feedVersion = '', feedStartDate = '', feedEndDate = '';

  try {
    await streamCSV(path.join(GTFS, 'feed_info.txt'), (fields, h) => {
      feedPublisher = (fields[h.feed_publisher_name] || feedPublisher).trim();
      feedVersion   = (fields[h.feed_version]        || '').trim();
      feedStartDate = (fields[h.feed_start_date]     || '').trim();
      feedEndDate   = (fields[h.feed_end_date]       || '').trim();
    });
  } catch (_) { /* feed_info.txt is optional */ }

  const coordCount = Object.keys(outputStopCoords).length;

  // ---- Step 8: Write output files ------------------------------------------
  console.log('Step 7: Writing output files...');

  const meta = {
    date:      TODAY,
    dateLabel: TODAY_LABEL,
    title:     config.title,
    stats: {
      totalTrips:  trips.length,
      totalStops:  outputDisplayStops.length,
      totalRoutes: outputRoutes.length
    },
    feed: {
      publisher: feedPublisher,
      version:   feedVersion,
      startDate: feedStartDate,
      endDate:   feedEndDate,
      url:       config.feedInfo.url || '',
      description: config.feedInfo.description || ''
    },
    bbox: config.bbox
  };

  fs.writeFileSync(path.join(OUT, 'meta.json'),        JSON.stringify(meta));
  fs.writeFileSync(path.join(OUT, 'stops.json'),       JSON.stringify(outputDisplayStops));
  fs.writeFileSync(path.join(OUT, 'stop_coords.json'), JSON.stringify(outputStopCoords));
  fs.writeFileSync(path.join(OUT, 'routes.json'),      JSON.stringify(outputRoutes));
  fs.writeFileSync(path.join(OUT, 'trips.json'),       JSON.stringify(trips));

  console.log([
    `✓ Done!`,
    `  meta.json        — ${TODAY_LABEL}`,
    `  stops.json       — ${outputDisplayStops.length} display stops`,
    `  stop_coords.json — ${coordCount} interpolation coords`,
    `  routes.json      — ${outputRoutes.length} routes`,
    `  trips.json       — ${trips.length} trips`
  ].join('\n'));
}

main().catch(err => { console.error(err); process.exit(1); });
