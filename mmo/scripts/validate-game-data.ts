/**
 * ゲームデータ整合性チェック CLI
 *
 * Usage: npx tsx mmo/scripts/validate-game-data.ts [--game games/fantasy-rpg]
 */
import path from "path";
import { fileURLToPath } from "url";
import { loadGameData, validateGameData } from "../src/GameData.ts";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const gameIdx = args.indexOf("--game");
const gameDir = gameIdx >= 0 && args[gameIdx + 1]
  ? path.resolve(args[gameIdx + 1])
  : path.join(__dirname, "..", "games", "fantasy-rpg");

console.log(`\nValidating: ${gameDir}\n`);

const data = loadGameData(gameDir);

// Summary
console.log(`  Game:    ${data.meta.name} (${data.meta.id})`);
console.log(`  Zones:   ${data.zones.length}`);
console.log(`  Classes: ${Object.keys(data.classes).length}`);
console.log(`  Enemies: ${Object.keys(data.enemies).length}`);
console.log(`  Items:   ${Object.keys(data.items).length}`);
console.log(`  Equip:   ${Object.keys(data.equipment).length}`);
console.log(`  Shops:   ${Object.keys(data.shops).length}`);
console.log(`  Quests:  ${Object.keys(data.quests).length}`);
console.log(`  Bosses:  ${Object.keys(data.bosses).length}`);
console.log(`  NPC Conv: ${Object.keys(data.npcConversations).length}`);

// NPC summary
let totalNpcs = 0;
let npcsWithShop = 0;
let npcsWithQuests = 0;
let npcsWithPool = 0;
for (const zone of data.zones) {
  for (const npc of zone.npcs) {
    totalNpcs++;
    if (npc.shop) npcsWithShop++;
    if ((npc.quests || []).length > 0) npcsWithQuests++;
    if (data.npcConversations[npc.id]) npcsWithPool++;
  }
}
console.log(`\n  NPCs: ${totalNpcs} total`);
console.log(`    with shop:    ${npcsWithShop}`);
console.log(`    with quests:  ${npcsWithQuests}`);
console.log(`    with pool:    ${npcsWithPool}`);
console.log(`    legacy only:  ${totalNpcs - npcsWithPool}`);

// Validate
const errors = validateGameData(data);
if (errors.length === 0) {
  console.log("\n  ✓ All checks passed.\n");
  process.exit(0);
} else {
  console.log(`\n  ✗ ${errors.length} error(s) found:\n`);
  errors.forEach(e => console.log(`    - ${e}`));
  console.log("");
  process.exit(1);
}
