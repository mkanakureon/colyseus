/**
 * ゲームデータ CLI エディタ
 *
 * Usage:
 *   npx tsx mmo/scripts/game-editor.ts --game mmo/games/fantasy-rpg
 *
 * Commands:
 *   list zones / npcs / quests / items / equipment / shops / enemies / bosses
 *   add npc / quest / item / equipment / enemy / shop
 *   edit npc / quest / item
 *   validate
 *   save
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { loadGameData, validateGameData, type GameData } from "../src/GameData.ts";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const gameIdx = args.indexOf("--game");
const gameDir = gameIdx >= 0 && args[gameIdx + 1]
  ? path.resolve(args[gameIdx + 1])
  : path.join(__dirname, "..", "games", "fantasy-rpg");

let data: GameData;
let dirty = false;

function load() {
  data = loadGameData(gameDir);
}

function save(file: string, content: any) {
  fs.writeFileSync(path.join(gameDir, file), JSON.stringify(content, null, 2) + "\n", "utf-8");
}

function saveAll() {
  save("zones.json", data.zones);
  save("quests.json", data.quests);
  save("items.json", data.items);
  save("equipment.json", data.equipment);
  save("enemies.json", data.enemies);
  save("encounters.json", data.encounters);
  save("shops.json", data.shops);
  save("bosses.json", data.bosses);
  save("npc-conversations.json", data.npcConversations);
  dirty = false;
  console.log("  ✓ Saved all JSON files.");
}

// ── Readline ──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q: string): Promise<string> {
  return new Promise(r => rl.question(q, r));
}

async function askChoice(prompt: string, options: string[]): Promise<string> {
  console.log(`\n  ${prompt}`);
  options.forEach((o, i) => console.log(`  [${i + 1}] ${o}`));
  const n = await ask("  > ");
  const idx = parseInt(n) - 1;
  return options[idx] || options[0];
}

// ── List ──

function listZones() {
  console.log("\n  ── Zones ──");
  data.zones.forEach(z => {
    const npcs = z.npcs.map(n => n.name).join(", ") || "none";
    console.log(`  ${z.id} | ${z.name} | safe:${z.isSafe} | npcs: ${npcs}`);
  });
}

function listNpcs() {
  console.log("\n  ── NPCs ──");
  for (const zone of data.zones) {
    for (const npc of zone.npcs) {
      const pool = data.npcConversations[npc.id];
      const poolCount = pool ? (pool.daily?.length || 0) + (pool.contextual?.length || 0) + (pool.special?.length || 0) : 0;
      console.log(`  ${npc.id} | ${npc.name} | zone:${zone.id} | shop:${npc.shop || "-"} | quests:${(npc.quests || []).length} | pool:${poolCount} | dialogue:${npc.dialogue.length}lines`);
    }
  }
}

function listQuests() {
  console.log("\n  ── Quests ──");
  Object.values(data.quests).forEach(q => {
    const objs = q.objectives.map(o => `${o.type}:${o.targetName}(${o.required})`).join(", ");
    console.log(`  ${q.id} | ${q.name} | giver:${q.giver} | ${objs} | reward: ${q.rewards.exp}EXP ${q.rewards.gold}G`);
  });
}

function listItems() {
  console.log("\n  ── Items ──");
  Object.values(data.items).forEach(i => {
    console.log(`  ${i.id} | ${i.name} | ${i.type} | buy:${i.buyPrice}G sell:${i.sellPrice}G${i.effect ? ` | ${i.effect.type}:${i.effect.value}` : ""}`);
  });
}

function listEquipment() {
  console.log("\n  ── Equipment ──");
  Object.values(data.equipment).forEach(e => {
    const stats = [`ATK+${e.atk}`, `DEF+${e.def}`, `MAG+${e.mag}`, `SPD+${e.spd}`].filter(s => !s.endsWith("+0")).join(" ");
    console.log(`  ${e.id} | ${e.name} | ${e.slot} | ${stats} | buy:${e.buyPrice}G`);
  });
}

function listEnemies() {
  console.log("\n  ── Enemies ──");
  Object.values(data.enemies).forEach(e => {
    console.log(`  ${e.id} | ${e.name} | HP:${e.hp} ATK:${e.atk} DEF:${e.def} | EXP:${e.exp} Gold:${e.gold} | drops:${e.drops.length}`);
  });
}

function listShops() {
  console.log("\n  ── Shops ──");
  Object.values(data.shops).forEach(s => {
    console.log(`  ${s.npcId} | ${s.npcName} | items: ${s.items.join(", ")}`);
  });
}

// ── Add ──

async function addNpc() {
  console.log("\n  ── NPC 追加 ──");
  listZones();
  const zoneId = await ask("\n  ゾーンID: ");
  const zone = data.zones.find(z => z.id === zoneId);
  if (!zone) { console.log("  ゾーンが見つかりません"); return; }

  const id = await ask("  NPC ID (例: npc-xxx): ");
  if (zone.npcs.find(n => n.id === id)) { console.log("  既に存在します"); return; }

  const name = await ask("  名前: ");
  const dialogue = await ask("  台詞 (インラインタグ付き): ");
  const hasShop = (await ask("  ショップあり? (y/n): ")).toLowerCase() === "y";
  const hasQuests = (await ask("  クエスト参照あり? (y/n): ")).toLowerCase() === "y";

  let shop: string | null = null;
  let quests: string[] = [];

  if (hasShop) {
    shop = id;
    const items = await ask("  ショップ商品ID (カンマ区切り): ");
    data.shops[id] = { npcId: id, npcName: name, items: items.split(",").map(s => s.trim()) };
    save("shops.json", data.shops);
    console.log(`  ✓ ショップ追加: ${items}`);
  }

  if (hasQuests) {
    const qIds = await ask("  クエストID (カンマ区切り): ");
    quests = qIds.split(",").map(s => s.trim());
  }

  zone.npcs.push({
    id, name,
    expression: "normal", pose: "standing",
    x: 0, y: 0,
    dialogue: [dialogue],
    shop, quests,
  });

  save("zones.json", data.zones);
  dirty = true;
  console.log(`  ✓ NPC追加: ${name} → ${zone.name}`);
  validate();
}

async function addQuest() {
  console.log("\n  ── クエスト追加 ──");
  const id = await ask("  クエストID (例: Q-006): ");
  if (data.quests[id]) { console.log("  既に存在します"); return; }

  const name = await ask("  クエスト名: ");
  const giver = await ask("  依頼者NPC ID: ");
  const description = await ask("  説明: ");

  const objType = await askChoice("目標タイプ:", ["defeat", "collect", "visit"]);
  const targetId = await ask("  目標ID (敵/アイテム/ゾーン): ");
  const targetName = await ask("  目標表示名: ");
  const required = parseInt(await ask("  必要数: ")) || 1;

  const exp = parseInt(await ask("  報酬EXP: ")) || 10;
  const gold = parseInt(await ask("  報酬Gold: ")) || 10;

  data.quests[id] = {
    id, name, giver, description,
    objectives: [{ type: objType as any, targetId, targetName, required }],
    rewards: { exp, gold },
  };

  save("quests.json", data.quests);
  dirty = true;
  console.log(`  ✓ クエスト追加: ${name}`);
  validate();
}

async function addItem() {
  console.log("\n  ── アイテム追加 ──");
  const id = await ask("  アイテムID (例: potion-003): ");
  if (data.items[id]) { console.log("  既に存在します"); return; }

  const name = await ask("  名前: ");
  const description = await ask("  説明: ");
  const type = await askChoice("タイプ:", ["consumable", "material", "key"]);
  const buyPrice = parseInt(await ask("  買値: ")) || 0;
  const sellPrice = parseInt(await ask("  売値: ")) || 0;

  let effect: any = undefined;
  if (type === "consumable") {
    const effectType = await askChoice("効果:", ["heal_hp", "heal_mp"]);
    const value = parseInt(await ask("  効果値: ")) || 50;
    effect = { type: effectType, value };
  }

  data.items[id] = {
    id, name, description,
    type: type as any,
    usableInBattle: type === "consumable",
    effect,
    buyPrice, sellPrice,
  };

  save("items.json", data.items);
  dirty = true;
  console.log(`  ✓ アイテム追加: ${name}`);
  validate();
}

async function addEquipment() {
  console.log("\n  ── 装備追加 ──");
  const id = await ask("  装備ID (例: sword-xxx): ");
  if (data.equipment[id]) { console.log("  既に存在します"); return; }

  const name = await ask("  名前: ");
  const slot = await askChoice("スロット:", ["weapon", "armor", "accessory"]);
  const atk = parseInt(await ask("  ATK+: ")) || 0;
  const def = parseInt(await ask("  DEF+: ")) || 0;
  const mag = parseInt(await ask("  MAG+: ")) || 0;
  const spd = parseInt(await ask("  SPD+: ")) || 0;
  const buyPrice = parseInt(await ask("  買値: ")) || 0;
  const sellPrice = parseInt(await ask("  売値: ")) || Math.floor(buyPrice / 2);

  data.equipment[id] = {
    id, name, slot: slot as any,
    atk, def, mag, spd,
    buyPrice, sellPrice,
  };

  save("equipment.json", data.equipment);
  dirty = true;
  console.log(`  ✓ 装備追加: ${name} (${slot})`);
  validate();
}

async function addEnemy() {
  console.log("\n  ── 敵追加 ──");
  const id = await ask("  敵ID (例: wolf): ");
  if (data.enemies[id]) { console.log("  既に存在します"); return; }

  const name = await ask("  名前: ");
  const hp = parseInt(await ask("  HP: ")) || 50;
  const atk = parseInt(await ask("  ATK: ")) || 10;
  const def = parseInt(await ask("  DEF: ")) || 5;
  const exp = parseInt(await ask("  EXP: ")) || 10;
  const gold = parseInt(await ask("  Gold: ")) || 5;

  const drops: { itemId: string; chance: number }[] = [];
  while (true) {
    const dropId = await ask("  ドロップアイテムID (空行で終了): ");
    if (!dropId.trim()) break;
    const chance = parseFloat(await ask("  ドロップ率 (0.0-1.0): ")) || 0.5;
    drops.push({ itemId: dropId, chance });
  }

  data.enemies[id] = { id, name, hp, atk, def, exp, gold, drops };

  save("enemies.json", data.enemies);
  dirty = true;
  console.log(`  ✓ 敵追加: ${name}`);
  validate();
}

// ── Validate ──

function validate() {
  const errors = validateGameData(data);
  if (errors.length === 0) {
    console.log("  ✓ バリデーション OK");
  } else {
    console.log(`\n  ✗ ${errors.length} 件のエラー:`);
    errors.forEach(e => console.log(`    - ${e}`));
  }
  return errors.length === 0;
}

// ── Main loop ──

async function main() {
  load();
  console.log(`\n  ⚔ Game Editor: ${data.meta.name}`);
  console.log(`  Game dir: ${gameDir}\n`);

  while (true) {
    console.log("");
    const cmd = await ask("  command > ");
    const parts = cmd.trim().split(/\s+/);
    const action = parts[0];
    const target = parts[1];

    try {
      switch (action) {
        case "list": case "ls":
          switch (target) {
            case "zones": case "z": listZones(); break;
            case "npcs": case "n": listNpcs(); break;
            case "quests": case "q": listQuests(); break;
            case "items": case "i": listItems(); break;
            case "equipment": case "e": listEquipment(); break;
            case "enemies": case "en": listEnemies(); break;
            case "shops": case "s": listShops(); break;
            default:
              console.log("  list [zones|npcs|quests|items|equipment|enemies|shops]");
          }
          break;

        case "add": case "a":
          switch (target) {
            case "npc": case "n": await addNpc(); break;
            case "quest": case "q": await addQuest(); break;
            case "item": case "i": await addItem(); break;
            case "equipment": case "e": await addEquipment(); break;
            case "enemy": case "en": await addEnemy(); break;
            default:
              console.log("  add [npc|quest|item|equipment|enemy]");
          }
          break;

        case "validate": case "v":
          validate();
          break;

        case "save": case "s":
          saveAll();
          validate();
          break;

        case "reload": case "r":
          load();
          console.log("  ✓ Reloaded from disk.");
          break;

        case "help": case "h": case "?":
          console.log(`
  Commands:
    list zones|npcs|quests|items|equipment|enemies|shops
    add npc|quest|item|equipment|enemy
    validate
    save
    reload
    quit
          `);
          break;

        case "quit": case "q": case "exit":
          if (dirty) {
            const confirm = await ask("  未保存の変更があります。保存しますか? (y/n): ");
            if (confirm.toLowerCase() === "y") saveAll();
          }
          rl.close();
          process.exit(0);

        default:
          if (action) console.log(`  Unknown command: ${action}. Type 'help' for commands.`);
      }
    } catch (e: any) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

main();
