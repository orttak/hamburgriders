import { AppMeta, Stop, Route, Trip, StopCoordsMap, TripPath } from './types';
import { VEHICLE_TYPE_COLORS } from './constants';

export class DataManager {
  public meta: AppMeta | null = null;
  public stops: Stop[] = [];
  public sbahnStops: Stop[] = [];
  public ubahnStops: Stop[] = [];
  public regionalStops: Stop[] = [];
  public busStops: Stop[] = [];
  public stopCoords: StopCoordsMap = {};
  public routes: Record<string, Route> = {};
  public trips: Trip[] = [];
  public tripPaths: TripPath[] = [];

  async loadData() {
    console.log('Fetching initial data files...');
    
    const [
      metaData, 
      stopsData, 
      coordsData, 
      routesData, 
      tripsData
    ] = await Promise.all([
      this.fetchJson('data/meta.json'),
      this.fetchJson('data/stops.json'),
      this.fetchJson('data/stop_coords.json'),
      this.fetchJson('data/routes.json'),
      this.fetchJson('data/trips.json')
    ]);

    this.meta = metaData;
    this.stops = stopsData;
    this.stopCoords = coordsData;
    this.trips = tripsData;

    this.routes = {};
    for (const r of routesData) {
      this.routes[r.id] = r;
    }

    this.categorizeStops();
    console.log(`Loaded ${this.stops.length} stops, ${this.trips.length} trips.`);
    this.processTripPaths();
  }

  private categorizeStops() {
    const stopToTypes = new Map<string, Set<string>>();
    
    for (const trip of this.trips) {
      const route = this.routes[trip.route_id];
      if (!route) continue;
      
      for (const st of trip.stops) {
        if (!stopToTypes.has(st.stop_id)) {
          stopToTypes.set(st.stop_id, new Set());
        }
        stopToTypes.get(st.stop_id)!.add(route.bus_type ? 'Bus' : route.transit_type);
      }
    }

    this.sbahnStops = [];
    this.ubahnStops = [];
    this.regionalStops = [];
    this.busStops = [];

    for (const stop of this.stops) {
      const types = stopToTypes.get(stop.id);
      if (!types) continue;

      if (types.has('S-Bahn')) this.sbahnStops.push({ ...stop, transit_type: 'S-Bahn' });
      if (types.has('U-Bahn')) this.ubahnStops.push({ ...stop, transit_type: 'U-Bahn' });
      if (types.has('Regional')) this.regionalStops.push({ ...stop, transit_type: 'Regional' });
      if (types.has('Bus')) this.busStops.push({ ...stop, transit_type: 'Bus' });
    }
  }

  private async fetchJson(url: string) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status} ${r.statusText}`);
    return r.json();
  }

  private processTripPaths() {
    this.tripPaths = [];
    for (const trip of this.trips) {
      const route = this.routes[trip.route_id];
      if (!route) continue;

      const path: [number, number][] = [];
      const timestamps: number[] = [];

      for (const s of trip.stops) {
        const coords = this.stopCoords[s.stop_id];
        if (!coords) continue;

        const time = s.arr ?? s.dep;
        if (time === null) continue;

        path.push([coords[1], coords[0]]); // deck.gl uses [lon, lat]
        timestamps.push(time);
      }

      if (path.length < 2) continue;

      this.tripPaths.push({
        trip_id: trip.trip_id,
        route_id: trip.route_id,
        path,
        timestamps,
        color: this.hexToRgb(this.getRouteColor(route)),
        headsign: trip.headsign || '',
        transit_type: route.bus_type ? 'Bus' : (route.transit_type || 'Bus'),
        bus_type: route.bus_type ? this.getBusType(route) : undefined
      });
    }
    console.log(`Processed ${this.tripPaths.length} trip paths for deck.gl.`);
  }

  private hexToRgb(hex: string): [number, number, number] {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
  }

  getTransitStops(type: string): Stop[] {
    switch (type) {
      case 'S-Bahn': return this.sbahnStops;
      case 'U-Bahn': return this.ubahnStops;
      case 'Regional': return this.regionalStops;
      case 'Bus': return this.busStops;
      default: return [];
    }
  }

  private getBusType(route: Route) {
    if (route.bus_type === 'XpressBus' || route.bus_type === 'SchnellBus') return 'ExpressBus';
    return route.bus_type || 'StandardBus';
  }

  private getRouteColor(route: Route) {
    if (route.bus_type) return VEHICLE_TYPE_COLORS[this.getBusType(route)] || route.color || '4a90d9';
    return VEHICLE_TYPE_COLORS[route.transit_type] || route.color || '4a90d9';
  }
}
