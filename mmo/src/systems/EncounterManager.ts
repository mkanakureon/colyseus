import { ZONE_ENCOUNTERS, type EnemyDef, type ZoneEncounter } from "../data/encounters.ts";
import type { InventoryItem } from "../persistence/PlayerPersistence.ts";

export type ExploreResult =
  | { type: "battle"; enemy: EnemyDef }
  | { type: "item"; itemId: string; itemName: string; quantity: number }
  | { type: "nothing" }
  | { type: "error"; code: string; message: string };

export class EncounterManager {
  /** Roll for an encounter in the given zone */
  explore(zoneId: string, rng = Math.random): ExploreResult {
    const zone = ZONE_ENCOUNTERS[zoneId];
    if (!zone || zone.isSafe) {
      return { type: "error", code: "ZONE_SAFE", message: "This zone is safe, no encounters" };
    }

    const roll = rng();

    // Battle
    if (roll < zone.encounterRate) {
      const enemy = this.weightedRandom(zone, rng);
      if (enemy) return { type: "battle", enemy };
    }

    // Item find
    if (roll < zone.encounterRate + zone.itemFindRate && zone.findableItems.length > 0) {
      const item = zone.findableItems[Math.floor(rng() * zone.findableItems.length)];
      return { type: "item", itemId: item.itemId, itemName: item.name, quantity: item.quantity };
    }

    return { type: "nothing" };
  }

  /** Roll drops from a defeated enemy */
  rollDrops(enemy: EnemyDef, rng = Math.random): InventoryItem[] {
    const drops: InventoryItem[] = [];
    for (const drop of enemy.drops) {
      if (rng() < drop.chance) {
        drops.push({ itemId: drop.itemId, name: drop.name, quantity: 1, type: "key" });
      }
    }
    return drops;
  }

  private weightedRandom(zone: ZoneEncounter, rng: () => number): EnemyDef | null {
    const totalWeight = zone.enemies.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight === 0) return null;

    let roll = rng() * totalWeight;
    for (const entry of zone.enemies) {
      roll -= entry.weight;
      if (roll <= 0) return entry.enemy;
    }
    return zone.enemies[zone.enemies.length - 1].enemy;
  }
}
