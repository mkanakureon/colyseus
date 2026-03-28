/**
 * 既存の data/*.ts から games/{name}/ に JSON をエクスポート
 *
 * Usage: npx tsx mmo/scripts/export-game-data.ts [--out games/fantasy-rpg]
 */
import fs from "fs";
import path from "path";
import { CLASS_DEFS } from "../src/data/classes.ts";
import { ENEMIES, ZONE_ENCOUNTERS } from "../src/data/encounters.ts";
import { ITEMS } from "../src/data/items.ts";
import { EQUIPMENT } from "../src/data/equipment.ts";
import { SHOPS } from "../src/data/shops.ts";
import { QUESTS } from "../src/data/quests.ts";
import { BOSSES } from "../src/data/bosses.ts";
import { FULL_ZONES } from "../src/data/zones-full.ts";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 && args[outIdx + 1]
  ? path.resolve(args[outIdx + 1])
  : path.resolve("mmo/games/fantasy-rpg");

fs.mkdirSync(outDir, { recursive: true });

function write(file: string, data: any) {
  const filepath = path.join(outDir, file);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  console.log(`  ✓ ${file} (${JSON.stringify(data).length} bytes)`);
}

console.log(`\nExporting game data to: ${outDir}\n`);

// game.json
write("game.json", {
  id: "fantasy-rpg",
  name: "アルカディア大陸",
  description: "古代魔法文明が栄えた大陸を舞台にしたテキスト型MMO",
  version: "1.0.0",
  startZone: "zone-001-village",
  startGold: 100,
  deathPenaltyRate: 0.1,
  respawnZone: "zone-001-village",
  chatRateLimit: 500,
  maxMessageLength: 200,
  startInventory: [
    { itemId: "potion-001", name: "回復薬", quantity: 3, type: "consumable" },
  ],
});

// classes.json
write("classes.json", CLASS_DEFS);

// levels.json
write("levels.json", [
  { level: 1, totalExp: 0 },
  { level: 2, totalExp: 20 },
  { level: 3, totalExp: 70 },
  { level: 4, totalExp: 170 },
  { level: 5, totalExp: 350 },
  { level: 6, totalExp: 650 },
  { level: 7, totalExp: 1100 },
  { level: 8, totalExp: 1750 },
  { level: 9, totalExp: 2650 },
  { level: 10, totalExp: 3850 },
]);

// zones.json — merge isSafe from encounters
const zones = FULL_ZONES.map(z => {
  const enc = ZONE_ENCOUNTERS[z.id];
  const isSafe = !enc || enc.isSafe;
  // Attach quest/shop references to NPCs
  const npcs = z.npcs.map(npc => {
    const shop = Object.values(SHOPS).find(s => s.npcId === npc.id);
    const quests = Object.values(QUESTS).filter(q => q.giver === npc.id).map(q => q.id);
    return {
      id: npc.id,
      name: npc.name,
      expression: npc.expression,
      pose: npc.pose,
      x: npc.x,
      y: npc.y,
      dialogue: npc.dialogue,
      shop: shop ? npc.id : null,
      quests: quests.length > 0 ? quests : [],
    };
  });
  return {
    id: z.id,
    name: z.name,
    description: z.description,
    maxPlayers: z.maxPlayers,
    isSafe,
    adjacentZones: z.adjacentZones,
    npcs,
  };
});
write("zones.json", zones);

// enemies.json
const enemies: Record<string, any> = {};
for (const [id, e] of Object.entries(ENEMIES)) {
  enemies[id] = {
    id: e.id,
    name: e.name,
    hp: e.hp, atk: e.atk, def: e.def,
    exp: e.exp, gold: e.gold,
    drops: e.drops.map(d => ({ itemId: d.itemId, chance: d.chance })),
  };
}
write("enemies.json", enemies);

// encounters.json — only danger zones
const encounters: Record<string, any> = {};
for (const [zoneId, enc] of Object.entries(ZONE_ENCOUNTERS)) {
  if (enc.isSafe) continue;
  encounters[zoneId] = {
    encounterRate: enc.encounterRate,
    itemFindRate: enc.itemFindRate,
    findableItems: enc.findableItems.map(i => ({ itemId: i.itemId, quantity: i.quantity })),
    enemies: enc.enemies.map(e => ({ enemyId: e.enemy.id, weight: e.weight })),
  };
}
write("encounters.json", encounters);

// items.json
write("items.json", ITEMS);

// equipment.json
write("equipment.json", EQUIPMENT);

// shops.json
const shops: Record<string, any> = {};
for (const [id, s] of Object.entries(SHOPS)) {
  shops[id] = { npcId: s.npcId, npcName: s.npcName, items: s.items };
}
write("shops.json", shops);

// quests.json
write("quests.json", QUESTS);

// bosses.json
const bosses: Record<string, any> = {};
for (const [id, b] of Object.entries(BOSSES)) {
  bosses[id] = {
    id: b.id, name: b.name,
    hp: b.hp, atk: b.atk, def: b.def,
    exp: b.exp, gold: b.gold,
    drops: b.drops.map(d => ({ itemId: d.itemId, chance: d.chance })),
    isBoss: true,
    zoneId: b.zoneId,
    canFlee: false,
    specialAttack: b.specialAttack ?? null,
  };
}
write("bosses.json", bosses);

console.log(`\nDone! ${fs.readdirSync(outDir).length} files exported.\n`);
