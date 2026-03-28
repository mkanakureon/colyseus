import type { GameData, EnemyDef, ZoneEncounterDef } from "../GameData.ts";
import type { InventoryItem } from "../persistence/PlayerPersistence.ts";

export type ExploreResult =
  | { type: "battle"; enemy: EnemyDef }
  | { type: "item"; itemId: string; itemName: string; quantity: number }
  | { type: "nothing" }
  | { type: "error"; code: string; message: string };

export class EncounterManager {
  constructor(private gameData: GameData) {}

  explore(zoneId: string, rng = Math.random): ExploreResult {
    const zone = this.gameData.encounters[zoneId];
    if (!zone) {
      // Check if zone exists but is safe
      const zDef = this.gameData.zones.find(z => z.id === zoneId);
      if (zDef && zDef.isSafe) return { type: "error", code: "ZONE_SAFE", message: "This zone is safe, no encounters" };
      return { type: "error", code: "ZONE_SAFE", message: "This zone is safe, no encounters" };
    }

    const roll = rng();

    if (roll < zone.encounterRate) {
      const enemy = this.weightedRandom(zone, rng);
      if (enemy) return { type: "battle", enemy };
    }

    if (roll < zone.encounterRate + zone.itemFindRate && zone.findableItems.length > 0) {
      const item = zone.findableItems[Math.floor(rng() * zone.findableItems.length)];
      const itemDef = this.gameData.items[item.itemId];
      return { type: "item", itemId: item.itemId, itemName: itemDef?.name ?? item.itemId, quantity: item.quantity };
    }

    return { type: "nothing" };
  }

  rollDrops(enemy: { drops: { itemId: string; chance: number }[] }, rng = Math.random): InventoryItem[] {
    const drops: InventoryItem[] = [];
    for (const drop of enemy.drops) {
      if (rng() < drop.chance) {
        const itemDef = this.gameData.items[drop.itemId];
        drops.push({ itemId: drop.itemId, name: itemDef?.name ?? drop.itemId, quantity: 1, type: "key" });
      }
    }
    return drops;
  }

  private weightedRandom(zone: ZoneEncounterDef, rng: () => number): EnemyDef | null {
    const totalWeight = zone.enemies.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight === 0) return null;

    let roll = rng() * totalWeight;
    for (const entry of zone.enemies) {
      roll -= entry.weight;
      if (roll <= 0) {
        const enemy = this.gameData.enemies[entry.enemyId];
        return enemy ?? null;
      }
    }
    const lastEntry = zone.enemies[zone.enemies.length - 1];
    return this.gameData.enemies[lastEntry.enemyId] ?? null;
  }
}
