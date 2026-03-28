/**
 * ゲーム全体マップ + クエストグラフ + NPC 相関図
 *
 * Usage: npx tsx mmo/scripts/game-graph.ts [--game mmo/games/fantasy-rpg]
 */
import path from "path";
import { fileURLToPath } from "url";
import { loadGameData, type GameData } from "../src/GameData.ts";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const gameIdx = args.indexOf("--game");
const gameDir = gameIdx >= 0 && args[gameIdx + 1]
  ? path.resolve(args[gameIdx + 1])
  : path.join(__dirname, "..", "games", "fantasy-rpg");

const data = loadGameData(gameDir);
const D: Record<string, string> = { north: "↑", south: "↓", east: "→", west: "←" };

console.log(`
╔══════════════════════════════════════════════════════════╗
║  ${data.meta.name.padEnd(54)}║
║  ${data.meta.description.slice(0, 54).padEnd(54)}║
╚══════════════════════════════════════════════════════════╝
`);

// ── 1. World Map ──
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  WORLD MAP");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

for (const zone of data.zones) {
  const type = zone.isSafe ? "🏘" : "⚔";
  const npcs = zone.npcs.map(n => n.name).join(", ");
  const dirs = zone.adjacentZones.map(a => {
    const target = data.zones.find(z => z.id === a.zoneId);
    return `${D[a.direction]}${target?.name || a.zoneId}`;
  }).join("  ");
  const enc = data.encounters[zone.id];
  const enemies = enc ? enc.enemies.map(e => data.enemies[e.enemyId]?.name || e.enemyId).join("/") : "";

  console.log(`  ${type} ${zone.name} (${zone.id})`);
  console.log(`     ${zone.description.slice(0, 60)}`);
  if (dirs) console.log(`     接続: ${dirs}`);
  if (npcs) console.log(`     NPC: ${npcs}`);
  if (enemies) console.log(`     敵: ${enemies}`);
  console.log("");
}

// ── 2. Zone Connection Graph ──
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  ZONE CONNECTIONS");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Adjacency list
const printed = new Set<string>();
for (const zone of data.zones) {
  for (const adj of zone.adjacentZones) {
    const key = [zone.id, adj.zoneId].sort().join("--");
    if (printed.has(key)) continue;
    printed.add(key);
    const target = data.zones.find(z => z.id === adj.zoneId);
    const zName = zone.name.padEnd(14);
    const tName = (target?.name || adj.zoneId).padEnd(14);
    console.log(`  ${zName} ──── ${tName}`);
  }
}

// ── 3. Quest Graph ──
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  QUEST GRAPH");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

for (const quest of Object.values(data.quests)) {
  const giverNpc = findNpc(data, quest.giver);
  const giverZone = findNpcZone(data, quest.giver);
  const objectives = quest.objectives.map(o => {
    let location = "";
    if (o.type === "defeat") {
      // Find which zones have this enemy in encounters
      const zones = Object.entries(data.encounters)
        .filter(([, enc]) => enc.enemies.some(e => e.enemyId === o.targetId))
        .map(([zId]) => data.zones.find(z => z.id === zId)?.name || zId);
      location = zones.length ? ` @ ${zones.join("/")}` : "";
    }
    if (o.type === "visit") {
      const z = data.zones.find(z => z.id === o.targetId);
      location = z ? ` @ ${z.name}` : "";
    }
    return `${o.type}: ${o.targetName} x${o.required}${location}`;
  });

  const rewardItems = quest.rewards.items?.map(i => `${i.name}x${i.quantity}`).join(", ") || "";
  const rewards = `${quest.rewards.exp}EXP ${quest.rewards.gold}G${rewardItems ? " " + rewardItems : ""}`;

  // Available at NPCs
  const availableAt: string[] = [];
  for (const zone of data.zones) {
    for (const npc of zone.npcs) {
      if ((npc.quests || []).includes(quest.id)) {
        availableAt.push(`${npc.name}(${zone.name})`);
      }
    }
  }

  console.log(`  ┌─ ${quest.id}: ${quest.name}`);
  console.log(`  │  依頼者: ${giverNpc?.name || quest.giver} (${giverZone?.name || "?"})`);
  if (availableAt.length > 1) {
    console.log(`  │  受注先: ${availableAt.join(", ")}`);
  }
  objectives.forEach(o => console.log(`  │  目標: ${o}`));
  console.log(`  │  報酬: ${rewards}`);
  console.log(`  └────────────────────────────`);
  console.log("");
}

// ── 4. NPC Role Map ──
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NPC ROLES");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

for (const zone of data.zones) {
  if (zone.npcs.length === 0) continue;
  console.log(`  [${zone.name}]`);
  for (const npc of zone.npcs) {
    const roles: string[] = [];
    if (npc.shop) roles.push("SHOP");
    const questCount = (npc.quests || []).length;
    if (questCount > 0) roles.push(`QUEST(${questCount})`);
    const pool = data.npcConversations[npc.id];
    if (pool) {
      const d = pool.daily?.length || 0;
      const c = pool.contextual?.length || 0;
      const s = pool.special?.length || 0;
      roles.push(`POOL(${d}d/${c}c/${s}s)`);
    } else {
      roles.push("LEGACY");
    }
    // Is this NPC a quest giver?
    const givesQuests = Object.values(data.quests).filter(q => q.giver === npc.id);
    if (givesQuests.length > 0) {
      roles.push(`GIVER(${givesQuests.map(q => q.id).join(",")})`);
    }
    console.log(`    ${npc.name.padEnd(16)} ${roles.join(" | ")}`);
  }
  console.log("");
}

// ── 5. Economy Overview ──
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  ECONOMY");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log("  Gold Sources:");
for (const enemy of Object.values(data.enemies)) {
  console.log(`    ${enemy.name.padEnd(14)} ${enemy.gold}G / kill`);
}
for (const quest of Object.values(data.quests)) {
  console.log(`    ${quest.name.padEnd(14)} ${quest.rewards.gold}G (quest reward)`);
}

console.log("\n  Gold Sinks:");
for (const [shopId, shop] of Object.entries(data.shops)) {
  console.log(`    ${shop.npcName}:`);
  for (const itemId of shop.items) {
    const item = data.items[itemId] || data.equipment[itemId];
    if (item) console.log(`      ${item.name.padEnd(14)} ${item.buyPrice}G`);
  }
}

console.log(`\n  Start Gold: ${data.meta.startGold}G`);
console.log(`  Death Penalty: ${data.meta.deathPenaltyRate * 100}%`);

// ── 6. Progression Path ──
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  PROGRESSION PATH (suggested)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Sort enemies by EXP
const sortedEnemies = Object.values(data.enemies).sort((a, b) => a.exp - b.exp);
const sortedBosses = Object.values(data.bosses).sort((a, b) => a.exp - b.exp);

console.log("  Level Path (enemies by difficulty):");
sortedEnemies.forEach(e => {
  const zones = Object.entries(data.encounters)
    .filter(([, enc]) => enc.enemies.some(en => en.enemyId === e.id))
    .map(([zId]) => data.zones.find(z => z.id === zId)?.name || zId);
  console.log(`    Lv? │ ${e.name.padEnd(14)} HP:${String(e.hp).padEnd(4)} EXP:${String(e.exp).padEnd(4)} @ ${zones.join(", ")}`);
});

console.log("\n  Boss Path:");
sortedBosses.forEach(b => {
  const z = data.zones.find(z => z.id === b.zoneId);
  console.log(`    ${b.name.padEnd(20)} HP:${String(b.hp).padEnd(4)} EXP:${String(b.exp).padEnd(4)} @ ${z?.name || b.zoneId}`);
  if (b.specialAttack) {
    console.log(`      特殊: ${b.specialAttack.name} (${b.specialAttack.damage}dmg ${b.specialAttack.aoe ? "AOE" : "単体"} every ${b.specialAttack.frequency}turns)`);
  }
});

// ── 7. Level Table ──
console.log("\n  Level Table:");
for (const lv of data.levels) {
  const bar = "#".repeat(Math.min(Math.floor(lv.totalExp / 100), 40));
  console.log(`    Lv${String(lv.level).padStart(2)} │ ${String(lv.totalExp).padStart(5)} EXP │ ${bar}`);
}

console.log("\n  Classes:");
for (const [id, cls] of Object.entries(data.classes)) {
  console.log(`    ${cls.name.padEnd(8)} HP:${cls.hp} MP:${cls.mp} ATK:${cls.atk} DEF:${cls.def} MAG:${cls.mag} SPD:${cls.spd}`);
  const g = cls.growth;
  console.log(`      growth  HP+${g.hp} MP+${g.mp} ATK+${g.atk} DEF+${g.def} MAG+${g.mag} SPD+${g.spd}`);
}

console.log("");

// ── Helpers ──
function findNpc(data: GameData, npcId: string) {
  for (const zone of data.zones) {
    const npc = zone.npcs.find(n => n.id === npcId);
    if (npc) return npc;
  }
  return null;
}

function findNpcZone(data: GameData, npcId: string) {
  for (const zone of data.zones) {
    if (zone.npcs.find(n => n.id === npcId)) return zone;
  }
  return null;
}
