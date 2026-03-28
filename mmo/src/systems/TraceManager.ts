export interface Footprint {
  playerName: string;
  direction: string;
  timestamp: number;
  expiresAt: number;
}

export interface Tombstone {
  playerName: string;
  level: number;
  timestamp: number;
  expiresAt: number;
  prayers: number;
}

const FOOTPRINT_DURATION = 10 * 60 * 1000; // 10 min
const TOMBSTONE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export class TraceManager {
  private footprints: Map<string, Footprint[]> = new Map();
  private tombstones: Map<string, Tombstone[]> = new Map();

  leaveFootprint(zoneId: string, playerName: string, direction: string) {
    const fp = this.footprints.get(zoneId) || [];
    fp.push({ playerName, direction, timestamp: Date.now(), expiresAt: Date.now() + FOOTPRINT_DURATION });
    this.footprints.set(zoneId, fp);
  }

  placeTombstone(zoneId: string, playerName: string, level: number) {
    const ts = this.tombstones.get(zoneId) || [];
    ts.push({ playerName, level, timestamp: Date.now(), expiresAt: Date.now() + TOMBSTONE_DURATION, prayers: 0 });
    this.tombstones.set(zoneId, ts);
  }

  pray(zoneId: string, index: number): Tombstone | null {
    const ts = this.getActiveTombstones(zoneId);
    if (index < 0 || index >= ts.length) return null;
    ts[index].prayers++;
    return ts[index];
  }

  getTraces(zoneId: string): { footprints: Footprint[]; tombstones: Tombstone[] } {
    return {
      footprints: this.getActiveFootprints(zoneId),
      tombstones: this.getActiveTombstones(zoneId),
    };
  }

  private getActiveFootprints(zoneId: string): Footprint[] {
    const now = Date.now();
    const fp = (this.footprints.get(zoneId) || []).filter(f => f.expiresAt > now);
    this.footprints.set(zoneId, fp);
    return fp;
  }

  private getActiveTombstones(zoneId: string): Tombstone[] {
    const now = Date.now();
    const ts = (this.tombstones.get(zoneId) || []).filter(t => t.expiresAt > now);
    this.tombstones.set(zoneId, ts);
    return ts;
  }
}
