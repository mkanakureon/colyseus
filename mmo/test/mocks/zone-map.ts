export interface ZoneDefinition {
  id: string;
  name: string;
  description: string;
  maxPlayers: number;
  adjacentZones: { direction: string; zoneId: string }[];
  npcs: NPCDefinition[];
}

export interface NPCDefinition {
  id: string;
  name: string;
  expression: string;
  pose: string;
  x: number;
  y: number;
  dialogue: string[];
}

export const TEST_ZONES: ZoneDefinition[] = [
  {
    id: "zone-001-village",
    name: "はじまりの村",
    description: "穏やかな村。冒険者たちの拠点。",
    maxPlayers: 50,
    adjacentZones: [
      { direction: "north", zoneId: "zone-002-forest" },
      { direction: "east", zoneId: "zone-003-market" },
    ],
    npcs: [
      {
        id: "npc-elder",
        name: "長老ヨハン",
        expression: "normal",
        pose: "standing",
        x: 400,
        y: 300,
        dialogue: [
          "[e:smile]ようこそ、旅人よ。[click]この村は平和じゃが...[e:serious]北の森には気をつけるのじゃ。",
          "[e:sad]最近、森から魔物が出るようになってのう...[click][e:smile]お主なら大丈夫じゃろう！",
        ],
      },
      {
        id: "npc-merchant",
        name: "商人マリア",
        expression: "smile",
        pose: "relaxed",
        x: 600,
        y: 350,
        dialogue: [
          "[e:smile][p:wave]いらっしゃい！[click]何かお探しかしら？",
        ],
      },
    ],
  },
  {
    id: "zone-002-forest",
    name: "霧の森",
    description: "薄暗い森。魔物が出没する。",
    maxPlayers: 30,
    adjacentZones: [
      { direction: "south", zoneId: "zone-001-village" },
    ],
    npcs: [],
  },
  {
    id: "zone-003-market",
    name: "交易広場",
    description: "各地から商人が集まる活気ある広場。",
    maxPlayers: 100,
    adjacentZones: [
      { direction: "west", zoneId: "zone-001-village" },
    ],
    npcs: [
      {
        id: "npc-trader",
        name: "旅商人ロイド",
        expression: "grin",
        pose: "cool",
        x: 500,
        y: 400,
        dialogue: [
          "[e:grin]よう！珍しいもんが入ったぜ。[click][e:wink]今なら特別価格だ。",
        ],
      },
    ],
  },
];

export function getZone(zoneId: string): ZoneDefinition | undefined {
  return TEST_ZONES.find(z => z.id === zoneId);
}

export function getAdjacentZone(currentZoneId: string, direction: string): string | undefined {
  const zone = getZone(currentZoneId);
  return zone?.adjacentZones.find(a => a.direction === direction)?.zoneId;
}
