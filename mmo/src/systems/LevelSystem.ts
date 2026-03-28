import type { GameData } from "../GameData.ts";
import { calculateLevelUpsFromTable } from "../GameData.ts";
import type { PlayerData } from "../persistence/PlayerPersistence.ts";

export interface LevelUpResult {
  levelsGained: number;
  newLevel: number;
  statChanges: { hp: number; mp: number; atk: number; def: number; mag: number; spd: number };
}

export class LevelSystem {
  constructor(private gameData: GameData) {}

  addExp(playerData: PlayerData, expGained: number): LevelUpResult | null {
    playerData.exp += expGained;

    const levelsGained = calculateLevelUpsFromTable(this.gameData.levels, playerData.level, playerData.exp);
    if (levelsGained === 0) return null;

    const classDef = this.gameData.classes[playerData.classType];
    if (!classDef) return null;

    const growth = classDef.growth;
    const totalGrowth = {
      hp: growth.hp * levelsGained,
      mp: growth.mp * levelsGained,
      atk: growth.atk * levelsGained,
      def: growth.def * levelsGained,
      mag: growth.mag * levelsGained,
      spd: growth.spd * levelsGained,
    };

    playerData.level += levelsGained;
    playerData.maxHp += totalGrowth.hp;
    playerData.hp = playerData.maxHp;
    playerData.maxMp += totalGrowth.mp;
    playerData.mp = playerData.maxMp;
    playerData.atk += totalGrowth.atk;
    playerData.def += totalGrowth.def;
    playerData.mag += totalGrowth.mag;
    playerData.spd += totalGrowth.spd;

    return { levelsGained, newLevel: playerData.level, statChanges: totalGrowth };
  }
}
