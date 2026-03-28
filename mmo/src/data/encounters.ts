export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  gold: number;
  drops: { itemId: string; name: string; chance: number }[];
}

export interface ZoneEncounter {
  zoneId: string;
  isSafe: boolean;           // true = no encounters (villages)
  encounterRate: number;     // 0.0-1.0 chance of battle on explore
  itemFindRate: number;      // chance of finding an item
  findableItems: { itemId: string; name: string; quantity: number }[];
  enemies: { enemy: EnemyDef; weight: number }[];
}

export const ENEMIES: Record<string, EnemyDef> = {
  goblin: {
    id: "goblin", name: "ゴブリン", hp: 40, atk: 7, def: 3, exp: 10, gold: 5,
    drops: [
      { itemId: "herb-001", name: "薬草", chance: 0.5 },
      { itemId: "goblin-fang", name: "ゴブリンの牙", chance: 0.2 },
    ],
  },
  bat: {
    id: "bat", name: "大コウモリ", hp: 25, atk: 10, def: 2, exp: 8, gold: 3,
    drops: [
      { itemId: "bat-wing", name: "コウモリの翼", chance: 0.4 },
    ],
  },
  orc: {
    id: "orc", name: "オーク", hp: 80, atk: 12, def: 8, exp: 30, gold: 20,
    drops: [
      { itemId: "iron-ore", name: "鉄鉱石", chance: 0.4 },
      { itemId: "orc-axe", name: "オークの戦斧", chance: 0.05 },
    ],
  },
  skeleton: {
    id: "skeleton", name: "スケルトン", hp: 60, atk: 9, def: 6, exp: 15, gold: 8,
    drops: [
      { itemId: "bone", name: "骨", chance: 0.5 },
    ],
  },
  mummy: {
    id: "mummy", name: "ミイラ", hp: 70, atk: 11, def: 5, exp: 20, gold: 12,
    drops: [
      { itemId: "bandage", name: "古い包帯", chance: 0.3 },
    ],
  },
  golem: {
    id: "golem", name: "ゴーレム", hp: 120, atk: 15, def: 15, exp: 50, gold: 30,
    drops: [
      { itemId: "iron-ore", name: "鉄鉱石", chance: 0.6 },
      { itemId: "golem-core", name: "ゴーレムの核", chance: 0.1 },
    ],
  },
};

export const ZONE_ENCOUNTERS: Record<string, ZoneEncounter> = {
  "zone-001-village": {
    zoneId: "zone-001-village", isSafe: true,
    encounterRate: 0, itemFindRate: 0,
    findableItems: [], enemies: [],
  },
  "zone-002-forest": {
    zoneId: "zone-002-forest", isSafe: false,
    encounterRate: 0.5, itemFindRate: 0.2,
    findableItems: [{ itemId: "herb-001", name: "薬草", quantity: 1 }],
    enemies: [
      { enemy: ENEMIES.goblin, weight: 60 },
      { enemy: ENEMIES.bat, weight: 30 },
      { enemy: ENEMIES.orc, weight: 10 },
    ],
  },
  "zone-003-market": {
    zoneId: "zone-003-market", isSafe: true,
    encounterRate: 0, itemFindRate: 0,
    findableItems: [], enemies: [],
  },
  "zone-005-ruins": {
    zoneId: "zone-005-ruins", isSafe: false,
    encounterRate: 0.6, itemFindRate: 0.15,
    findableItems: [{ itemId: "iron-ore", name: "鉄鉱石", quantity: 1 }],
    enemies: [
      { enemy: ENEMIES.skeleton, weight: 50 },
      { enemy: ENEMIES.mummy, weight: 35 },
      { enemy: ENEMIES.golem, weight: 15 },
    ],
  },
};
