import type { EnemyDef } from "./encounters.ts";

export interface BossDef extends EnemyDef {
  isBoss: true;
  zoneId: string;
  canFlee: false;
  specialAttack?: {
    name: string;
    damage: number;
    aoe: boolean;       // hits all players
    frequency: number;  // every N turns
    log: string;
  };
}

export const BOSSES: Record<string, BossDef> = {
  "boss-orc-king": {
    id: "boss-orc-king", name: "オークキング", hp: 200, atk: 18, def: 10, exp: 100, gold: 50,
    isBoss: true, zoneId: "zone-002-forest", canFlee: false,
    drops: [{ itemId: "orc-axe", name: "オークの戦斧", chance: 1.0 }],
    specialAttack: {
      name: "大振り", damage: 25, aoe: false, frequency: 3,
      log: "[e:angry]オークキングの大振り！",
    },
  },
  "boss-golem-guardian": {
    id: "boss-golem-guardian", name: "ゴーレムガーディアン", hp: 350, atk: 22, def: 20, exp: 200, gold: 100,
    isBoss: true, zoneId: "zone-005-ruins", canFlee: false,
    drops: [{ itemId: "golem-core", name: "ゴーレムの核", chance: 1.0 }],
    specialAttack: {
      name: "地震", damage: 15, aoe: true, frequency: 2,
      log: "[e:serious]ゴーレムガーディアンが地面を叩いた！全体に地震攻撃！",
    },
  },
  "boss-dragon": {
    id: "boss-dragon", name: "火竜ヴォルカン", hp: 500, atk: 30, def: 18, exp: 500, gold: 300,
    isBoss: true, zoneId: "zone-009-volcano", canFlee: false,
    drops: [{ itemId: "dragon-scale", name: "竜鱗", chance: 1.0 }],
    specialAttack: {
      name: "火炎ブレス", damage: 30, aoe: true, frequency: 3,
      log: "[e:angry]火竜ヴォルカンが火炎ブレスを放った！全体に炎が襲いかかる！",
    },
  },
};
