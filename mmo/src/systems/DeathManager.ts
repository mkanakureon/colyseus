import type { PlayerData } from "../persistence/PlayerPersistence.ts";

export interface DeathPenalty {
  goldLost: number;
  respawnZone: string;
}

const GOLD_PENALTY_RATE = 0.1; // 10%
const RESPAWN_ZONE = "zone-001-village";

export class DeathManager {
  /** Apply death penalty. Mutates playerData in place. */
  applyPenalty(playerData: PlayerData): DeathPenalty {
    const goldLost = Math.floor(playerData.gold * GOLD_PENALTY_RATE);
    playerData.gold -= goldLost;
    playerData.hp = playerData.maxHp;
    playerData.mp = playerData.maxMp;
    playerData.zoneId = RESPAWN_ZONE;

    return { goldLost, respawnZone: RESPAWN_ZONE };
  }
}
