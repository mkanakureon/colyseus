import type { GameData } from "../GameData.ts";

export type ChaosLevel = "low" | "medium" | "high" | "critical";

export interface ChaosEffects {
  shopDiscount: number;
  expBonus: number;
  encounterRateMultiplier: number;
}

const DEFAULT_EFFECTS: Record<ChaosLevel, ChaosEffects> = {
  low:      { shopDiscount: 0.1, expBonus: 1.0, encounterRateMultiplier: 1.0 },
  medium:   { shopDiscount: 0.0, expBonus: 1.1, encounterRateMultiplier: 1.2 },
  high:     { shopDiscount: 0.0, expBonus: 1.3, encounterRateMultiplier: 1.5 },
  critical: { shopDiscount: 0.0, expBonus: 1.5, encounterRateMultiplier: 2.0 },
};

export class ChaosManager {
  constructor(private gameData: GameData) {}

  private killCount = 0;
  private lastDecayAt = Date.now();

  onEnemyKilled(count = 1) { this.killCount += count; }

  getKillCount(): number { this.applyDecay(); return this.killCount; }

  getLevel(): ChaosLevel {
    this.applyDecay();
    const t = this.gameData.meta.chaos?.thresholds || { low: 0, medium: 100, high: 300, critical: 500 };
    if (this.killCount >= t.critical) return "critical";
    if (this.killCount >= t.high) return "high";
    if (this.killCount >= t.medium) return "medium";
    return "low";
  }

  getEffects(): ChaosEffects {
    const level = this.getLevel();
    const effects = this.gameData.meta.chaos?.effects;
    return effects?.[level] || DEFAULT_EFFECTS[level];
  }

  // For testing
  setKillCount(n: number) { this.killCount = n; this.lastDecayAt = Date.now(); }

  private applyDecay() {
    const decayPerHour = this.gameData.meta.chaos?.decayPerHour || 10;
    const hours = (Date.now() - this.lastDecayAt) / 3600000;
    const decay = Math.floor(hours * decayPerHour);
    if (decay > 0) {
      this.killCount = Math.max(0, this.killCount - decay);
      this.lastDecayAt = Date.now();
    }
  }
}
