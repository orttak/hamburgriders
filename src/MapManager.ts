import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer } from '@deck.gl/layers';
import { DataManager } from './DataManager';
import { TYPE_ORDER, TRANSIT_CONFIG } from './constants';
import type { Route } from './types';

const MOBILE_VIEWPORT_QUERY = '(max-width: 700px) and (orientation: portrait)';

export class MapManager {
  public map: maplibregl.Map | null = null;
  private deckOverlay: MapboxOverlay | null = null;
  private tripPopup: maplibregl.Popup | null = null;
  private stopPopup: maplibregl.Popup | null = null;
  private dataManager: DataManager;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  initMap() {
    this.map = new maplibregl.Map({
      container: 'map',
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [10.0, 53.55],
      zoom: 9,
      attributionControl: {
        compact: true
      }
    });

    this.deckOverlay = new MapboxOverlay({
      interleaved: true,
      layers: []
    });

    this.map.addControl(new maplibregl.NavigationControl({
      showCompass: true,
      showZoom: true
    }), 'bottom-left');
    this.map.addControl(new maplibregl.FullscreenControl({
      container: document.body
    }), 'bottom-left');
    this.map.addControl(this.deckOverlay);
    this.initMobileAttribution();

    this.tripPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    this.stopPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 6 });

    return new Promise<void>((resolve) => {
      this.map!.on('load', () => {
        this.initMobileAttribution();
        this.addMapLibreStopsLayers();
        resolve();
      });
    });
  }

  private initMobileAttribution() {
    if (!window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) return;

    window.requestAnimationFrame(() => {
      const attribution = document.querySelector('.maplibregl-ctrl-attrib');
      if (!attribution) return;

      attribution.classList.add('maplibregl-compact');
      attribution.classList.remove('maplibregl-compact-show');
      attribution.classList.remove('app-attrib-open');
      attribution.removeAttribute('open');
      const button = attribution.querySelector('.maplibregl-ctrl-attrib-button');
      button?.setAttribute('aria-expanded', 'false');
      if (button?.getAttribute('data-app-bound') === 'true') return;

      button?.setAttribute('data-app-bound', 'true');
      button?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = !attribution.classList.contains('app-attrib-open');
        attribution.classList.toggle('app-attrib-open', open);
        attribution.classList.toggle('maplibregl-compact-show', open);
        button.setAttribute('aria-expanded', open.toString());
      });
    });
  }

  private addMapLibreStopsLayers() {
    if (!this.map) return;

    TYPE_ORDER.forEach(type => {
      const cfg = TRANSIT_CONFIG[type];
      if (!cfg) return;
      const stops = this.dataManager.getTransitStops(type);
      const safeId = type.toLowerCase().replace(/-/g, '');

      this.map!.addSource(`stops-${safeId}`, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: stops.map(s => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
            properties: { id: s.id, name: s.name, transit_type: type }
          }))
        }
      });

      // 1. MapLibre Native Heatmap (Always visible by default)
      this.map!.addLayer({
        id: `stops-${safeId}-heatmap`,
        type: 'heatmap',
        source: `stops-${safeId}`,
        maxzoom: 15,
        paint: {
          'heatmap-weight': [
            'interpolate', ['linear'], ['zoom'],
            0, 0.3, 7, 1.0, 10, 1.3, 12, 0.4, 14, 0.08, 15, 0
          ],
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            0, 0.5, 10, 1.0, 12, 0.4, 14, 0.1, 15, 0
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   `rgba(${cfg.rgb[0]},${cfg.rgb[1]},${cfg.rgb[2]},0)`,
            0.1, `rgba(${cfg.rgb[0]},${cfg.rgb[1]},${cfg.rgb[2]},0.08)`,
            0.3, `rgba(${cfg.rgb[0]},${cfg.rgb[1]},${cfg.rgb[2]},0.15)`,
            0.5, `rgba(${cfg.rgb[0]},${cfg.rgb[1]},${cfg.rgb[2]},0.22)`,
            0.7, `rgba(${cfg.rgb[0]},${cfg.rgb[1]},${cfg.rgb[2]},0.28)`,
            1,   `rgba(${cfg.rgb[0]},${cfg.rgb[1]},${cfg.rgb[2]},0.38)`
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            0, 10, 5, 18, 10, 30, 13, 0
          ],
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            0, 0.7, 7, 0.55, 10, 0.30, 12, 0.10, 14, 0.01, 15, 0
          ]
        }
      });

      // 2. Stop markers (Always visible by default)
      this.map!.addLayer({
        id: `stops-${safeId}-circles`,
        type: 'circle',
        source: `stops-${safeId}`,
        minzoom: 10,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, type === 'Bus' ? 0.5 : 1.5,
            14, type === 'Bus' ? 1.5 : 3,
            16, type === 'Bus' ? 3 : 6
          ],
          'circle-color': cfg.hex,
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.08, 12, 0.18, 14, 0.55, 16, 0.75
          ],
          'circle-stroke-width': type === 'Bus' ? 0.2 : 0.8,
          'circle-stroke-color': '#fff'
        }
      });

      this.map!.on('mouseenter', `stops-${safeId}-circles`, e => {
        const feature = e.features?.[0];
        if (!feature?.properties) return;

        this.map!.getCanvas().style.cursor = 'pointer';
        const props = feature.properties;
        this.stopPopup!
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="popup-title" style="color:${cfg.hex}">${props.name}</div>` +
            `<div class="popup-row"><span class="popup-key">Type:</span><span class="popup-val">${type}</span></div>` +
            `<div class="popup-row"><span class="popup-key">ID:</span><span class="popup-val">${props.id}</span></div>`
          )
          .addTo(this.map!);
      });
      this.map!.on('mouseleave', `stops-${safeId}-circles`, () => {
        this.map!.getCanvas().style.cursor = '';
        this.stopPopup!.remove();
      });
    });
  }

  updateDeckLayers(
    currentTime: number,
    routeVisible: Record<string, boolean>,
    typeVisible: Record<string, boolean>,
    busTypeVisible: Record<string, boolean>,
    vehicles: any[]
  ) {
    if (!this.map || !this.deckOverlay) return;

    // 1. Stops are ALWAYS visible as static infrastructure (independent of vehicle layer toggles)
    // We don't hide them even if typeVisible is false, because that now only controls vehicles.

    // 2. Update deck.gl dynamic vehicle layer based on UI toggles
    const filteredVehicles = vehicles.filter(v => {
      if (!typeVisible[v.type]) return false;
      if (v.type === 'Bus' && !busTypeVisible[v.bus_type || 'StandardBus']) return false;
      if (v.type !== 'Bus' && !routeVisible[v.route_id]) return false;
      return true;
    });

    const layers = [
      new ScatterplotLayer({
        id: 'vehicles-layer',
        data: filteredVehicles,
        getPosition: (d: any) => d.position,
        getFillColor: (d: any): [number, number, number, number] => [
          d.color[0],
          d.color[1],
          d.color[2],
          255
        ],
        getLineColor: [255, 255, 255, 220],
        stroked: true,
        lineWidthMinPixels: 1,
        getRadius: (d: any) => (d.type === 'Bus' ? 4 : 8),
        radiusMinPixels: 3,
        pickable: true,
        onHover: (info: any) => this.handleTripHover(info)
      })
    ];

    this.deckOverlay.setProps({ layers });
  }

  private handleTripHover(info: any) {
    if (info.object) {
      const { object, coordinate } = info;
      const route = this.dataManager.routes[object.route_id] as Route | undefined;
      const dotColor = `rgb(${object.color.join(',')})`;
      
      this.map!.getCanvas().style.cursor = 'pointer';
      this.tripPopup!
        .setLngLat(coordinate)
        .setHTML(
          `<div class="popup-title">` +
            `<span class="popup-color-dot" style="background:${dotColor}"></span>` +
            `${route?.short_name ? route.short_name + ' – ' : ''}${object.headsign || ''}` +
          `</div>` +
          `<div class="popup-row"><span class="popup-key">Route:</span><span class="popup-val">${route?.long_name || '–'}</span></div>` +
          `<div class="popup-row"><span class="popup-key">Trip ID:</span><span class="popup-val">${object.trip_id}</span></div>` +
          `<div class="popup-row"><span class="popup-key">Agency:</span><span class="popup-val">${route?.agency_id || '–'}</span></div>`
        )
        .addTo(this.map!);
    } else {
      this.map!.getCanvas().style.cursor = '';
      this.tripPopup!.remove();
    }
  }
}
