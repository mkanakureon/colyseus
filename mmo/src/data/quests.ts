export interface QuestDef {
  id: string;
  name: string;
  giver: string;       // NPC ID
  description: string;
  objectives: QuestObjectiveDef[];
  rewards: { exp: number; gold: number; items?: { itemId: string; name: string; quantity: number }[] };
}

export interface QuestObjectiveDef {
  type: "defeat" | "collect" | "visit";
  targetId: string;
  targetName: string;
  required: number;
}

export const QUESTS: Record<string, QuestDef> = {
  "Q-001": {
    id: "Q-001", name: "森の脅威", giver: "npc-elder",
    description: "北の森のゴブリンを3体倒してくれんか",
    objectives: [{ type: "defeat", targetId: "goblin", targetName: "ゴブリン", required: 3 }],
    rewards: { exp: 30, gold: 50, items: [{ itemId: "potion-001", name: "回復薬", quantity: 2 }] },
  },
  "Q-002": {
    id: "Q-002", name: "薬草集め", giver: "npc-merchant",
    description: "薬草を5個集めてきてほしいの",
    objectives: [{ type: "collect", targetId: "herb-001", targetName: "薬草", required: 5 }],
    rewards: { exp: 20, gold: 30 },
  },
  "Q-003": {
    id: "Q-003", name: "遺跡調査", giver: "npc-elder",
    description: "古代遺跡の様子を見てきてくれんか",
    objectives: [{ type: "visit", targetId: "zone-005-ruins", targetName: "古代遺跡", required: 1 }],
    rewards: { exp: 50, gold: 100 },
  },
  "Q-004": {
    id: "Q-004", name: "商人護衛", giver: "npc-trader",
    description: "大コウモリを5体倒してくれ。交易路を安全にしたい",
    objectives: [{ type: "defeat", targetId: "bat", targetName: "大コウモリ", required: 5 }],
    rewards: { exp: 40, gold: 80, items: [{ itemId: "sword-iron", name: "鉄の剣", quantity: 1 }] },
  },
  "Q-005": {
    id: "Q-005", name: "鉄鉱石調達", giver: "npc-trader",
    description: "鉄鉱石を3個持ってきてくれ",
    objectives: [{ type: "collect", targetId: "iron-ore", targetName: "鉄鉱石", required: 3 }],
    rewards: { exp: 60, gold: 150 },
  },
};

/** Get quests offered by a given NPC */
export function getQuestsByNpc(npcId: string): QuestDef[] {
  return Object.values(QUESTS).filter(q => q.giver === npcId);
}
