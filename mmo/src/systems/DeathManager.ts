import type { GameData } from "../GameData.ts";
import type { PlayerData } from "../persistence/PlayerPersistence.ts";

export interface DeathPenalty { goldLost: number; respawnZone: string }

export class DeathManager {
  constructor(private gameData: GameData) {}

  applyPenalty(playerData: PlayerData): DeathPenalty {
    const rate = this.gameData.meta.deathPenaltyRate;
    const respawnZone = this.gameData.meta.respawnZone;

    const goldLost = Math.floor(playerData.gold * rate);
    playerData.gold -= goldLost;
    playerData.hp = playerData.maxHp;
    playerData.mp = playerData.maxMp;
    playerData.zoneId = respawnZone;

    return { goldLost, respawnZone };
  }
}
