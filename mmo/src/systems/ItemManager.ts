import type { GameData } from "../GameData.ts";
import type { PlayerData, InventoryItem } from "../persistence/PlayerPersistence.ts";

export interface ItemUseResult {
  success: boolean;
  error?: string;
  effect?: { type: string; value: number };
  log?: string;
}

export class ItemManager {
  constructor(private gameData: GameData) {}

  useItem(playerData: PlayerData, itemId: string): ItemUseResult {
    const master = this.gameData.items[itemId];
    if (!master) return { success: false, error: "ITEM_NOT_FOUND" };
    if (master.type !== "consumable" || !master.effect) return { success: false, error: "ITEM_NOT_USABLE" };

    const invItem = playerData.inventory.find(i => i.itemId === itemId);
    if (!invItem || invItem.quantity <= 0) return { success: false, error: "ITEM_NOT_OWNED" };

    invItem.quantity--;
    if (invItem.quantity <= 0) playerData.inventory = playerData.inventory.filter(i => i.itemId !== itemId);

    const effect = master.effect;
    let log = "";
    if (effect.type === "heal_hp") {
      const before = playerData.hp;
      playerData.hp = Math.min(playerData.maxHp, playerData.hp + effect.value);
      log = `${master.name}を使った！ HP が ${playerData.hp - before} 回復した！`;
    } else if (effect.type === "heal_mp") {
      const before = playerData.mp;
      playerData.mp = Math.min(playerData.maxMp, playerData.mp + effect.value);
      log = `${master.name}を使った！ MP が ${playerData.mp - before} 回復した！`;
    }

    return { success: true, effect, log };
  }

  addToInventory(playerData: PlayerData, items: InventoryItem[]): void {
    for (const item of items) {
      const existing = playerData.inventory.find(i => i.itemId === item.itemId);
      if (existing) { existing.quantity += item.quantity; }
      else { playerData.inventory.push({ ...item }); }
    }
  }
}
