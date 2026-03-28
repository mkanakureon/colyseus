/**
 * GameData — 全ゲームデータを束ねる型 + ローダー + バリデーション
 *
 * games/{game-name}/ ディレクトリの JSON を読み込む。
 * Systems はこの GameData を constructor で受け取り、直接 data/* を import しない。
 */
import fs from "fs";
import path from "path";

// ── 型定義 ──

export interface GameMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  startZone: string;
  startGold: number;
  deathPenaltyRate: number;
  respawnZone: string;
  chatRateLimit: number;
  maxMessageLength: number;
  startInventory: { itemId: string; name: string; quantity: number; type: string }[];
}

export interface ClassDef {
  name: string;
  hp: number; mp: number; atk: number; def: number; mag: number; spd: number;
  growth: { hp: number; mp: number; atk: number; def: number; mag: number; spd: number };
}

export interface LevelEntry { level: number; totalExp: number }

export interface ZoneDef {
  id: string;
  name: string;
  description: string;
  maxPlayers: number;
  isSafe: boolean;
  adjacentZones: { direction: string; zoneId: string }[];
  npcs: NpcDef[];
}

export interface NpcDef {
  id: string;
  name: string;
  expression: string;
  pose: string;
  x: number; y: number;
  dialogue: string[];
  shop?: string | null;
  quests?: string[];
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number; atk: number; def: number;
  exp: number; gold: number;
  drops: { itemId: string; chance: number }[];
}

export interface ZoneEncounterDef {
  encounterRate: number;
  itemFindRate: number;
  findableItems: { itemId: string; quantity: number }[];
  enemies: { enemyId: string; weight: number }[];
}

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  type: "consumable" | "equipment" | "material" | "key";
  usableInBattle: boolean;
  effect?: { type: "heal_hp" | "heal_mp"; value: number };
  buyPrice: number;
  sellPrice: number;
}

export interface EquipmentDef {
  id: string;
  name: string;
  slot: "weapon" | "armor" | "accessory";
  atk: number; def: number; mag: number; spd: number;
  buyPrice: number; sellPrice: number;
}

export interface ShopDef {
  npcId: string;
  npcName: string;
  items: string[];
}

export interface QuestDef {
  id: string;
  name: string;
  giver: string;
  description: string;
  objectives: { type: "defeat" | "collect" | "visit"; targetId: string; targetName: string; required: number }[];
  rewards: { exp: number; gold: number; items?: { itemId: string; name: string; quantity: number }[] };
}

export interface BossDef extends EnemyDef {
  isBoss: true;
  zoneId: string;
  canFlee: false;
  specialAttack?: { name: string; damage: number; aoe: boolean; frequency: number; log: string };
}

export interface GameData {
  meta: GameMeta;
  classes: Record<string, ClassDef>;
  levels: LevelEntry[];
  zones: ZoneDef[];
  enemies: Record<string, EnemyDef>;
  encounters: Record<string, ZoneEncounterDef>;
  items: Record<string, ItemDef>;
  equipment: Record<string, EquipmentDef>;
  shops: Record<string, ShopDef>;
  quests: Record<string, QuestDef>;
  bosses: Record<string, BossDef>;
}

// ── ローダー ──

export function loadGameData(gameDir: string): GameData {
  const read = (file: string) => {
    const filepath = path.join(gameDir, file);
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  };

  return {
    meta: read("game.json"),
    classes: read("classes.json"),
    levels: read("levels.json"),
    zones: read("zones.json"),
    enemies: read("enemies.json"),
    encounters: read("encounters.json"),
    items: read("items.json"),
    equipment: read("equipment.json"),
    shops: read("shops.json"),
    quests: read("quests.json"),
    bosses: read("bosses.json"),
  };
}

// ── バリデーション ──

export function validateGameData(data: GameData): string[] {
  const errors: string[] = [];
  const zoneIds = new Set(data.zones.map(z => z.id));

  // startZone exists
  if (!zoneIds.has(data.meta.startZone)) {
    errors.push(`startZone "${data.meta.startZone}" not found in zones`);
  }
  if (!zoneIds.has(data.meta.respawnZone)) {
    errors.push(`respawnZone "${data.meta.respawnZone}" not found in zones`);
  }

  // encounters reference valid enemies
  for (const [zoneId, enc] of Object.entries(data.encounters)) {
    if (!zoneIds.has(zoneId)) errors.push(`encounter zone "${zoneId}" not found`);
    for (const e of enc.enemies) {
      if (!data.enemies[e.enemyId]) errors.push(`encounter ${zoneId}: enemy "${e.enemyId}" not found`);
    }
    for (const item of enc.findableItems) {
      if (!data.items[item.itemId]) errors.push(`encounter ${zoneId}: findable item "${item.itemId}" not found`);
    }
  }

  // shops reference valid items/equipment
  for (const [npcId, shop] of Object.entries(data.shops)) {
    for (const itemId of shop.items) {
      if (!data.items[itemId] && !data.equipment[itemId]) {
        errors.push(`shop ${npcId}: item "${itemId}" not found`);
      }
    }
  }

  // quests reference valid targets
  for (const [qId, quest] of Object.entries(data.quests)) {
    for (const obj of quest.objectives) {
      if (obj.type === "defeat" && !data.enemies[obj.targetId]) errors.push(`quest ${qId}: enemy "${obj.targetId}" not found`);
      if (obj.type === "collect" && !data.items[obj.targetId] && !data.equipment[obj.targetId]) errors.push(`quest ${qId}: item "${obj.targetId}" not found`);
      if (obj.type === "visit" && !zoneIds.has(obj.targetId)) errors.push(`quest ${qId}: zone "${obj.targetId}" not found`);
    }
  }

  // zone adjacency bidirectional
  const opposites: Record<string, string> = { north: "south", south: "north", east: "west", west: "east" };
  for (const zone of data.zones) {
    for (const adj of zone.adjacentZones) {
      if (!zoneIds.has(adj.zoneId)) { errors.push(`zone ${zone.id}: adjacent "${adj.zoneId}" not found`); continue; }
      const target = data.zones.find(z => z.id === adj.zoneId)!;
      const back = target.adjacentZones.find(a => a.zoneId === zone.id && a.direction === opposites[adj.direction]);
      if (!back) errors.push(`zone ${zone.id} → ${adj.direction} → ${adj.zoneId}: no reverse link`);
    }
  }

  // enemy drops reference valid items
  for (const [eId, enemy] of Object.entries(data.enemies)) {
    for (const drop of enemy.drops) {
      if (!data.items[drop.itemId] && !data.equipment[drop.itemId]) {
        // Allow unknown drop items (materials not in shop)
      }
    }
  }

  return errors;
}

// ── ヘルパー ──

export function getExpForLevel(levels: LevelEntry[], level: number): number {
  if (level <= 1) return 0;
  const entry = levels.find(l => l.level === level);
  return entry ? entry.totalExp : Infinity;
}

export function calculateLevelUpsFromTable(levels: LevelEntry[], currentLevel: number, totalExp: number): number {
  let gained = 0;
  let lv = currentLevel;
  const maxLevel = Math.max(...levels.map(l => l.level));
  while (lv < maxLevel && totalExp >= getExpForLevel(levels, lv + 1)) {
    lv++;
    gained++;
  }
  return gained;
}

export function getQuestsByNpc(quests: Record<string, QuestDef>, npcId: string): QuestDef[] {
  return Object.values(quests).filter(q => q.giver === npcId);
}
