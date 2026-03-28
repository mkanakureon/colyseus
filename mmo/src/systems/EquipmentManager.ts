import { EQUIPMENT, type EquipSlot, type EquipmentDef } from "../data/equipment.ts";
import type { PlayerData } from "../persistence/PlayerPersistence.ts";

export interface EquipResult {
  success: boolean;
  error?: string;
  unequipped?: string; // itemId of previously equipped item (returned to inventory)
}

export interface EquipmentBonus {
  atk: number;
  def: number;
  mag: number;
  spd: number;
}

export class EquipmentManager {
  /** Equip an item from inventory. Mutates playerData. */
  equip(playerData: PlayerData, itemId: string): EquipResult {
    const equipDef = EQUIPMENT[itemId];
    if (!equipDef) {
      return { success: false, error: "NOT_EQUIPMENT" };
    }

    // Must be in inventory
    const invItem = playerData.inventory.find(i => i.itemId === itemId);
    if (!invItem || invItem.quantity <= 0) {
      return { success: false, error: "ITEM_NOT_OWNED" };
    }

    // Ensure equipment field exists
    if (!playerData.equipment) {
      playerData.equipment = { weapon: null, armor: null, accessory: null };
    }

    // Unequip current in same slot
    let unequipped: string | undefined;
    const currentId = playerData.equipment[equipDef.slot];
    if (currentId) {
      // Return to inventory
      const existing = playerData.inventory.find(i => i.itemId === currentId);
      if (existing) {
        existing.quantity++;
      } else {
        const currentDef = EQUIPMENT[currentId];
        playerData.inventory.push({
          itemId: currentId,
          name: currentDef?.name ?? currentId,
          quantity: 1,
          type: "equipment",
        });
      }
      unequipped = currentId;
    }

    // Remove from inventory
    invItem.quantity--;
    if (invItem.quantity <= 0) {
      playerData.inventory = playerData.inventory.filter(i => i.itemId !== itemId);
    }

    // Set equipped
    playerData.equipment[equipDef.slot] = itemId;

    return { success: true, unequipped };
  }

  /** Unequip item from slot. Returns to inventory. */
  unequip(playerData: PlayerData, slot: EquipSlot): EquipResult {
    if (!playerData.equipment) {
      return { success: false, error: "NOTHING_EQUIPPED" };
    }

    const currentId = playerData.equipment[slot];
    if (!currentId) {
      return { success: false, error: "NOTHING_EQUIPPED" };
    }

    // Return to inventory
    const existing = playerData.inventory.find(i => i.itemId === currentId);
    if (existing) {
      existing.quantity++;
    } else {
      const def = EQUIPMENT[currentId];
      playerData.inventory.push({
        itemId: currentId,
        name: def?.name ?? currentId,
        quantity: 1,
        type: "equipment",
      });
    }

    playerData.equipment[slot] = null;
    return { success: true, unequipped: currentId };
  }

  /** Calculate total equipment bonus */
  getBonus(playerData: PlayerData): EquipmentBonus {
    const bonus: EquipmentBonus = { atk: 0, def: 0, mag: 0, spd: 0 };
    if (!playerData.equipment) return bonus;

    for (const slot of ["weapon", "armor", "accessory"] as EquipSlot[]) {
      const id = playerData.equipment[slot];
      if (id) {
        const def = EQUIPMENT[id];
        if (def) {
          bonus.atk += def.atk;
          bonus.def += def.def;
          bonus.mag += def.mag;
          bonus.spd += def.spd;
        }
      }
    }
    return bonus;
  }

  /** Get effective stats (base + equipment) */
  getEffectiveStats(playerData: PlayerData): { atk: number; def: number; mag: number; spd: number } {
    const bonus = this.getBonus(playerData);
    return {
      atk: playerData.atk + bonus.atk,
      def: playerData.def + bonus.def,
      mag: playerData.mag + bonus.mag,
      spd: playerData.spd + bonus.spd,
    };
  }
}
