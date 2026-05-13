/**
 * utrechtriders — app.js
 * MapLibre GL animation of Utrecht public transit trips.
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ANIM_START_SEC = 18000;  // 05:00 — timeline start
const ANIM_END_SEC   = 104400; // 05:00 next day (= 29 h from midnight) — timeline end
const DEFAULT_START  = 25200;  // 07:00 — animation begins here

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let meta       = null;
let stops      = [];
let stopCoords = null;  // {stop_id: [lat, lon]} — all stops referenced by trips
let routes     = {};    // route_id → route object
let trips      = [];

let animTime  = DEFAULT_START;
let playing   = true;
let lastTs    = null;    // previous RAF timestamp (ms)
let speed     = 60;      // animation speed multiplier (real seconds per wall second)
let lastDrawnTime = -1;  // suppress redraw when unchanged

// Trip state tracking — reset on backward scrub
let seenTripsTime = 0;   // animTime at which seenTrips was last valid
let seenTrips = new Set();

let map      = null;
let tripPopup = null;
let stopPopup = null;

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function loadData() {
  const [metaData, stopsData, coordsData, routesData, tripsData] = await Promise.all([
    fetch('data/meta.json').then(r => r.json()),
    fetch('data/stops.json').then(r => r.json()),
    fetch('data/stop_coords.json').then(r => r.json()),
    fetch('data/routes.json').then(r => r.json()),
    fetch('data/trips.json').then(r => r.json())
  ]);

  meta       = metaData;
  stops      = stopsData;
  stopCoords = coordsData;
  trips      = tripsData;

  routes = {};
  for (const r of routesData) routes[r.id] = r;

  // Update page title and date label
  document.getElementById('date-label').textContent = meta.dateLabel;
  document.title = `${meta.title} — ${meta.dateLabel}`;
  document.getElementById('stat-total').textContent = meta.stats.totalTrips;

  // About modal feed info
  const f = meta.feed;
  document.getElementById('about-feed').innerHTML =
    `<strong>${f.publisher}</strong>${f.version ? ` (v${f.version})` : ''}<br>` +
    `Coverage: ${formatDate(f.startDate)} – ${formatDate(f.endDate)}<br>` +
    (f.url ? `<a href="${f.url}" target="_blank" rel="noopener">${f.url}</a>` : '');
}

function formatDate(d) {
  if (!d || d.length !== 8) return d || '';
  return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
}

// ---------------------------------------------------------------------------
// Map initialisation
// ---------------------------------------------------------------------------
function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [5.121, 52.090],
    zoom: 11,
    attributionControl: true
  });

  tripPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  stopPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 6 });

  map.on('load', () => {
    addStopsLayer();
    addTripsLayer();
    buildLegend();
    requestAnimationFrame(animFrame);
  });
}

// ---------------------------------------------------------------------------
// Stops layer — small static white dots
// ---------------------------------------------------------------------------
function addStopsLayer() {
  map.addSource('stops', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: stops.map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: { id: s.id, name: s.name }
      }))
    }
  });

  map.addLayer({
    id: 'stops-layer',
    type: 'circle',
    source: 'stops',
    paint: {
      'circle-radius': 3,
      'circle-color': '#ffffff',
      'circle-opacity': 0.7,
      'circle-stroke-width': 0.5,
      'circle-stroke-color': '#555'
    }
  });

  map.on('mouseenter', 'stops-layer', e => {
    map.getCanvas().style.cursor = 'pointer';
    const p = e.features[0].properties;
    stopPopup
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="popup-title">${p.name || 'Stop'}</div>` +
        `<div class="popup-row"><span class="popup-key">ID:</span><span class="popup-val">${p.id}</span></div>`
      )
      .addTo(map);
  });
  map.on('mouseleave', 'stops-layer', () => {
    map.getCanvas().style.cursor = '';
    stopPopup.remove();
  });
}

// ---------------------------------------------------------------------------
// Trips layer — animated colored circles
// ---------------------------------------------------------------------------
function addTripsLayer() {
  map.addSource('trips-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  map.addLayer({
    id: 'trips-layer',
    type: 'circle',
    source: 'trips-source',
    paint: {
      'circle-radius': 6,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.9,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': ['get', 'stroke']
    }
  });

  map.on('mouseenter', 'trips-layer', e => {
    map.getCanvas().style.cursor = 'pointer';
    const p = e.features[0].properties;
    const dotColor = p.color || '#4a90d9';
    tripPopup
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="popup-title">` +
          `<span class="popup-color-dot" style="background:${dotColor}"></span>` +
          `${p.route_short ? p.route_short + ' – ' : ''}${p.headsign || ''}` +
        `</div>` +
        `<div class="popup-row"><span class="popup-key">Route:</span><span class="popup-val">${p.route_long || '–'}</span></div>` +
        `<div class="popup-row"><span class="popup-key">Trip ID:</span><span class="popup-val">${p.trip_id}</span></div>` +
        `<div class="popup-row"><span class="popup-key">Agency:</span><span class="popup-val">${p.agency || '–'}</span></div>`
      )
      .addTo(map);
  });
  map.on('mouseleave', 'trips-layer', () => {
    map.getCanvas().style.cursor = '';
    tripPopup.remove();
  });
}

// ---------------------------------------------------------------------------
// Trip position interpolation — handles dwell time + travel segments
// ---------------------------------------------------------------------------
function getTripPosition(trip, timeSec) {
  const s = trip.stops;
  if (!s || s.length === 0) return null;

  for (let i = 0; i < s.length; i++) {
    const arr = s[i].arr ?? s[i].dep;
    const dep = s[i].dep ?? s[i].arr;
    if (arr == null || dep == null) continue;

    // Dwell: vehicle is sitting at stop i between arrival and departure
    if (timeSec >= arr && timeSec <= dep) {
      const c = stopCoords[s[i].stop_id];
      return c ? { lat: c[0], lon: c[1] } : null;
    }

    // Travel: vehicle moving from stop i to stop i+1
    if (i < s.length - 1) {
      const nextArr = s[i + 1].arr ?? s[i + 1].dep;
      if (nextArr == null) continue;
      if (timeSec > dep && timeSec < nextArr) {
        const from = stopCoords[s[i].stop_id];
        const to   = stopCoords[s[i + 1].stop_id];
        if (!from || !to) continue;
        const duration = nextArr - dep;
        const t = duration > 0 ? (timeSec - dep) / duration : 0;
        return {
          lat: from[0] + t * (to[0] - from[0]),
          lon: from[1] + t * (to[1] - from[1])
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Compute active trip features for current animation time
// ---------------------------------------------------------------------------
function computeFeatures(timeSec) {
  const features = [];
  let activeTripCount = 0;

  for (const trip of trips) {
    const s = trip.stops;
    if (!s || s.length === 0) continue;

    const firstDep = s[0].dep ?? s[0].arr;
    const lastArr  = s[s.length - 1].arr ?? s[s.length - 1].dep;
    if (firstDep == null || lastArr == null) continue;
    if (timeSec < firstDep || timeSec > lastArr) continue;

    // Trip is active
    seenTrips.add(trip.trip_id);
    activeTripCount++;

    const pos = getTripPosition(trip, timeSec);
    if (!pos) continue;

    const route = routes[trip.route_id] || {};
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] },
      properties: {
        trip_id:     trip.trip_id,
        headsign:    trip.headsign || '',
        route_short: route.short_name || '',
        route_long:  route.long_name  || '',
        agency:      route.agency_id  || '',
        color:       '#' + (route.color      || '4a90d9'),
        stroke:      '#' + (route.text_color || 'ffffff')
      }
    });
  }

  return { features, activeTripCount };
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
function animFrame(ts) {
  if (playing) {
    if (lastTs !== null) {
      const dtMs = ts - lastTs;
      const prevTime = animTime;
      animTime += (dtMs / 1000) * speed;

      if (animTime > ANIM_END_SEC) animTime = ANIM_START_SEC; // wrap

      // Reset cumulative count on wrap/backward
      if (animTime < prevTime) {
        seenTrips = new Set();
        seenTripsTime = animTime;
      }
    }
    lastTs = ts;
  }

  // Clamp
  animTime = Math.max(ANIM_START_SEC, Math.min(ANIM_END_SEC, animTime));

  // Only redraw if time has actually changed
  if (Math.abs(animTime - lastDrawnTime) >= 1) {
    updateMap();
    lastDrawnTime = animTime;
  }

  requestAnimationFrame(animFrame);
}

// ---------------------------------------------------------------------------
// Update map display
// ---------------------------------------------------------------------------
function updateMap() {
  // Sync slider and clock display
  const slider = document.getElementById('timeline-slider');
  slider.value = animTime;
  document.getElementById('time-display').textContent = secToGTFSTime(animTime);

  const { features, activeTripCount } = computeFeatures(animTime);

  map.getSource('trips-source').setData({
    type: 'FeatureCollection',
    features
  });

  document.getElementById('stat-active').textContent     = activeTripCount;
  document.getElementById('stat-cumulative').textContent = seenTrips.size;
}

// ---------------------------------------------------------------------------
// Time formatting — shows GTFS time (can exceed 24:00)
// ---------------------------------------------------------------------------
function secToGTFSTime(sec) {
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------
function buildLegend() {
  const container = document.getElementById('legend-items');
  const sortedRoutes = Object.values(routes).sort((a, b) =>
    (a.short_name || '').localeCompare(b.short_name || '', undefined, { numeric: true })
  );

  for (const r of sortedRoutes) {
    const shortLabel = r.short_name || r.id;
    const longLabel  = r.long_name || '';
    const truncated  = longLabel.length > 28 ? longLabel.substring(0, 28) + '…' : longLabel;

    const item = document.createElement('div');
    item.className = 'legend-item';
    item.title = longLabel || shortLabel;
    item.innerHTML =
      `<span class="legend-swatch" style="background:#${r.color || '4a90d9'}"></span>` +
      `<span class="legend-route-name"><strong>${shortLabel}</strong>` +
      (truncated ? ` <small style="color:#666">${truncated}</small>` : '') +
      `</span>`;
    container.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// UI event handlers
// ---------------------------------------------------------------------------
function initUI() {
  // Play / pause
  const btn = document.getElementById('play-pause');
  btn.addEventListener('click', () => {
    playing = !playing;
    lastTs  = null;
    btn.textContent = playing ? '⏸ Pause' : '▶ Play';
  });

  // Timeline scrubber
  document.getElementById('timeline-slider').addEventListener('input', e => {
    const newTime = parseFloat(e.target.value);
    // Reset cumulative count when user scrubs backward
    if (newTime < animTime) {
      seenTrips = new Set();
      seenTripsTime = newTime;
    }
    animTime = newTime;
    lastTs = null;
    lastDrawnTime = -1; // force redraw
  });

  // Speed selector
  document.getElementById('speed-select').addEventListener('change', e => {
    speed = parseFloat(e.target.value);
  });

  // Legend toggle
  const legendPanel = document.getElementById('legend');
  const legendBtn   = document.getElementById('legend-btn');
  legendBtn.addEventListener('click', () => {
    legendPanel.classList.toggle('visible');
    legendBtn.classList.toggle('active');
  });

  // About modal
  const overlay  = document.getElementById('modal-overlay');
  document.getElementById('about-btn').addEventListener('click',   () => overlay.classList.add('visible'));
  document.getElementById('modal-close').addEventListener('click', () => overlay.classList.remove('visible'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('visible'); });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async () => {
  initUI();
  await loadData();
  initMap();
})();
