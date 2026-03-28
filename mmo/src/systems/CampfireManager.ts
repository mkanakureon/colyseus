import type { GameData } from "../GameData.ts";

export class CampfireManager {
  constructor(private gameData: GameData) {}

  private restingSince: Map<string, number> = new Map(); // sessionId → timestamp

  startResting(sessionId: string) {
    if (!this.restingSince.has(sessionId)) {
      this.restingSince.set(sessionId, Date.now());
    }
  }

  stopResting(sessionId: string) {
    this.restingSince.delete(sessionId);
  }

  isResting(sessionId: string): boolean {
    const since = this.restingSince.get(sessionId);
    if (!since) return false;
    const required = (this.gameData.meta.campfire?.requiredSeconds || 180) * 1000;
    return (Date.now() - since) >= required;
  }

  getExpMultiplier(sessionId: string, nearbyPlayerCount: number): number {
    if (!this.isResting(sessionId)) return 1.0;
    const minNearby = this.gameData.meta.campfire?.minPlayersNearby ?? 1;
    if (nearbyPlayerCount < minNearby) return 1.0;
    return this.gameData.meta.campfire?.expBonus || 1.2;
  }

  getRestingCount(): number {
    return this.restingSince.size;
  }
}
