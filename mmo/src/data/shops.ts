export interface ShopDef {
  npcId: string;
  npcName: string;
  zoneId: string;
  items: string[];  // itemId or equipmentId
}

export const SHOPS: Record<string, ShopDef> = {
  "npc-merchant": {
    npcId: "npc-merchant", npcName: "商人マリア", zoneId: "zone-001-village",
    items: ["potion-001", "herb-001", "sword-wood", "armor-cloth"],
  },
  "npc-trader": {
    npcId: "npc-trader", npcName: "旅商人ロイド", zoneId: "zone-003-market",
    items: ["potion-002", "ether-001", "sword-iron", "armor-chain"],
  },
};
