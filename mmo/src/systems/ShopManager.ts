import type { GameData } from "../GameData.ts";
import type { PlayerData } from "../persistence/PlayerPersistence.ts";

export interface ShopItem { id: string; name: string; price: number; description?: string }
export interface ShopResult { success: boolean; error?: string }

export class ShopManager {
  constructor(private gameData: GameData) {}

  getShopItems(npcId: string): ShopItem[] | null {
    const shop = this.gameData.shops[npcId];
    if (!shop) return null;

    return shop.items.map(id => {
      const item = this.gameData.items[id];
      if (item) return { id: item.id, name: item.name, price: item.buyPrice, description: item.description };
      const equip = this.gameData.equipment[id];
      if (equip) return { id: equip.id, name: equip.name, price: equip.buyPrice };
      return null;
    }).filter((x): x is ShopItem => x !== null);
  }

  buy(playerData: PlayerData, npcId: string, itemId: string, quantity = 1): ShopResult {
    const shop = this.gameData.shops[npcId];
    if (!shop || !shop.items.includes(itemId)) return { success: false, error: "ITEM_NOT_IN_SHOP" };

    const itemDef = this.gameData.items[itemId];
    const equipDef = this.gameData.equipment[itemId];
    const price = itemDef?.buyPrice ?? equipDef?.buyPrice;
    const name = itemDef?.name ?? equipDef?.name;
    const type = equipDef ? "equipment" as const : (itemDef?.type ?? "consumable" as const);

    if (price === undefined || !name) return { success: false, error: "ITEM_NOT_IN_SHOP" };

    const totalCost = price * quantity;
    if (playerData.gold < totalCost) return { success: false, error: "INSUFFICIENT_GOLD" };

    playerData.gold -= totalCost;
    const existing = playerData.inventory.find(i => i.itemId === itemId);
    if (existing) { existing.quantity += quantity; }
    else { playerData.inventory.push({ itemId, name, quantity, type }); }

    return { success: true };
  }

  sell(playerData: PlayerData, itemId: string, quantity = 1): ShopResult {
    const invItem = playerData.inventory.find(i => i.itemId === itemId);
    if (!invItem || invItem.quantity < quantity) return { success: false, error: "ITEM_NOT_OWNED" };

    const itemDef = this.gameData.items[itemId];
    const equipDef = this.gameData.equipment[itemId];
    const sellPrice = itemDef?.sellPrice ?? equipDef?.sellPrice ?? 1;

    playerData.gold += sellPrice * quantity;
    invItem.quantity -= quantity;
    if (invItem.quantity <= 0) playerData.inventory = playerData.inventory.filter(i => i.itemId !== itemId);

    return { success: true };
  }
}
