import { DataManager } from './DataManager';
import { ANIM_START_SEC, ANIM_END_SEC, DEFAULT_START } from './constants';

export class AnimationManager {
  public animTime = DEFAULT_START;
  public playing = true;
  public speed = 300;

  private lastTs: number | null = null;
  private lastDrawnTime = -1;
  private dataManager: DataManager;
  private onUpdate: (time: number, vehicles: any[], activeCount: number) => void;

  constructor(dataManager: DataManager, onUpdate: (time: number, vehicles: any[], activeCount: number) => void) {
    this.dataManager = dataManager;
    this.onUpdate = onUpdate;
  }

  start() {
    requestAnimationFrame(this.animFrame.bind(this));
  }

  private animFrame(ts: number) {
    if (this.playing) {
      if (this.lastTs !== null) {
        const dtMs = ts - this.lastTs;
        this.animTime += (dtMs / 1000) * this.speed;

        if (this.animTime > ANIM_END_SEC) this.animTime = ANIM_START_SEC;
      }
      this.lastTs = ts;
    }

    this.animTime = Math.max(ANIM_START_SEC, Math.min(ANIM_END_SEC, this.animTime));

    if (Math.abs(this.animTime - this.lastDrawnTime) >= 0.1) {
      const { vehicles, activeCount } = this.computeVehicles(this.animTime);
      this.onUpdate(this.animTime, vehicles, activeCount);
      this.lastDrawnTime = this.animTime;
    }

    requestAnimationFrame(this.animFrame.bind(this));
  }

  private computeVehicles(time: number) {
    const vehicles: any[] = [];
    let activeCount = 0;

    for (const trip of this.dataManager.tripPaths) {
      const start = trip.timestamps[0];
      const end = trip.timestamps[trip.timestamps.length - 1];

      if (time < start || time > end) continue;
      activeCount++;

      const pos = this.interpolate(trip, time);
      if (pos) {
        vehicles.push({
          id: trip.trip_id,
          route_id: trip.route_id,
          position: pos,
          color: trip.color,
          type: trip.transit_type,
          bus_type: trip.bus_type,
          headsign: trip.headsign
        });
      }
    }
    return { vehicles, activeCount };
  }

  private interpolate(trip: any, time: number): [number, number] | null {
    const ts = trip.timestamps;
    const path = trip.path;

    for (let i = 0; i < ts.length - 1; i++) {
      if (time >= ts[i] && time <= ts[i + 1]) {
        const duration = ts[i + 1] - ts[i];
        const t = duration > 0 ? (time - ts[i]) / duration : 0;
        const from = path[i];
        const to = path[i + 1];
        return [
          from[0] + t * (to[0] - from[0]),
          from[1] + t * (to[1] - from[1])
        ];
      }
    }
    return null;
  }

  resetLastTs() {
    this.lastTs = null;
  }
}
