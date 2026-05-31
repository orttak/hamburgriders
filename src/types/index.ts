/**
 * Core type definitions for the Hamburg GTFS App.
 */

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface FeedInfo {
  publisher: string;
  version: string;
  startDate: string;
  endDate: string;
  url: string;
  description: string;
}

export interface AppMeta {
  date: string;
  dateLabel: string;
  title: string;
  stats: {
    totalTrips: number;
    totalStops: number;
    totalRoutes: number;
  };
  feed: FeedInfo;
  bbox: BBox;
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  transit_type?: string;
}

export interface Route {
  id: string;
  short_name: string;
  long_name: string;
  color: string;
  text_color: string;
  agency_id: string;
  transit_type: string;
  bus_type?: string | undefined;
}

export interface StopTime {
  stop_id: string;
  arr: number | null;
  dep: number | null;
}

export interface Trip {
  trip_id: string;
  route_id: string;
  headsign: string;
  stops: StopTime[];
}

export type StopCoordsMap = Record<string, [number, number]>;

export interface AnimationState {
  animTime: number;
  playing: boolean;
  speed: number;
}

export interface TripPath {
  trip_id: string;
  route_id: string;
  path: [number, number][];
  timestamps: number[];
  color: [number, number, number];
  headsign: string;
  transit_type: string;
  bus_type?: string | undefined;
}
