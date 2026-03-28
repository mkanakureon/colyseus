/**
 * テキスト型 MMO CLI クライアント
 *
 * Usage: npx tsx mmo/client-cli.ts [--name NAME] [--class warrior|mage|thief] [--port 3001]
 */
import readline from "readline";
import { Client as SDKClient } from "../packages/sdk/build/index.mjs";
import { KaedevnAuthAdapter } from "./src/auth/KaedevnAuthAdapter.ts";
import { FULL_ZONES } from "./src/data/zones-full.ts";
import { stripTags, extractDirectives } from "./test/mocks/inline-tags.ts";

// ── Args ──
const args = process.argv.slice(2);
function getArg(name: string, def: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
}
const PORT = getArg("port", "3001");
const ENDPOINT = `ws://localhost:${PORT}`;
const JWT_SECRET = "mmo-dev-secret";

// ── State ──
let world: any = null;
let chatRoom: any = null;
let playerName = "";
let currentZoneId = "zone-001-village";
let screen: "main" | "chat" | "npc_dialogue" | "battle_result" | "shop" | "equip" | "quest" | "inventory" | "status" | "create" = "create";
let npcDialoguePages: string[] = [];
let npcDialogueIndex = 0;
let npcName = "";
let shopItems: any[] = [];
let shopNpcId = "";
let inventoryCache: any[] = [];
let pendingMessages: string[] = [];

// ── Expression map ──
const EXPR: Record<string, string> = {
  smile: "笑顔", serious: "真剣", sad: "悲しみ", angry: "怒り",
  normal: "", grin: "ニヤリ", wink: "ウィンク", surprised: "驚き",
};

// ── Readline ──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function prompt(text: string): Promise<string> {
  return new Promise(resolve => rl.question(text, resolve));
}

// ── Display helpers ──
function clear() { console.clear(); }

function header(title: string) {
  const bar = "━".repeat(40);
  console.log(`\n${bar}`);
  console.log(`  ${title}`);
  console.log(bar);
}

function divider() {
  console.log("┄".repeat(40));
}

function renderDialogue(speaker: string, rawText: string): string[] {
  // Split by [click]
  const parts = rawText.split("[click]");
  return parts.map(part => {
    const dirs = extractDirectives(part);
    const plain = stripTags(part);
    const expr = dirs.find(d => d.type === "expr");
    const pose = dirs.find(d => d.type === "pose");
    let prefix = speaker;
    if (expr && EXPR[expr.value]) prefix += ` [${EXPR[expr.value]}]`;
    if (pose) prefix += ` (${pose.value})`;
    return `${prefix}:\n  「${plain.trim()}」`;
  }).filter(p => p.trim().length > 0);
}

// ── Zone info ──
function getZone(id: string) { return FULL_ZONES.find(z => z.id === id); }

// ── Screen renderers ──

async function showCreateScreen() {
  clear();
  header("キャラクター作成");
  console.log("\n  名前を入力してください。");
  const name = await prompt("\n  名前 > ");
  if (!name.trim()) { console.log("  名前が空です。"); return showCreateScreen(); }

  console.log("\n  職業を選んでください:");
  console.log("  [1] 戦士（HP↑ ATK↑ DEF↑）");
  console.log("  [2] 魔法使い（MP↑ MAG↑）");
  console.log("  [3] 盗賊（SPD↑ LUK↑）");
  const classChoice = await prompt("\n  > ");
  const classMap: Record<string, string> = { "1": "warrior", "2": "mage", "3": "thief" };
  const classType = classMap[classChoice.trim()];
  if (!classType) { console.log("  1〜3で選んでください。"); return showCreateScreen(); }

  console.log("\n  性別:");
  console.log("  [1] 女性  [2] 男性");
  const genderChoice = await prompt("  > ");
  const gender = genderChoice.trim() === "2" ? "male" : "female";

  playerName = name.trim();

  return new Promise<void>((resolve) => {
    world.onMessage("character_created", (data: any) => {
      console.log(`\n  ✨ ${data.name}（${classType === "warrior" ? "戦士" : classType === "mage" ? "魔法使い" : "盗賊"}）が誕生しました！`);
      console.log(`  HP:${data.hp} MP:${data.mp} ATK:${data.atk} DEF:${data.def} MAG:${data.mag} SPD:${data.spd}`);
      console.log(`  Gold:${data.gold}G`);
      screen = "main";
      resolve();
    });
    world.onMessage("error", (err: any) => {
      console.log(`  エラー: ${err.message}`);
      resolve();
    });
    world.send("create_character", { name: playerName, classType, gender });
  });
}

async function showMainScreen() {
  clear();
  const zone = getZone(currentZoneId);
  header(zone?.name ?? currentZoneId);

  if (zone) {
    console.log(`\n  ${zone.description}`);

    // Other players
    if (world.state?.players) {
      const others: string[] = [];
      world.state.players.forEach((p: any) => {
        if (p.name !== playerName) others.push(`${p.name}(Lv.${p.level})`);
      });
      if (others.length > 0) console.log(`\n  ここにいる人: ${others.join(", ")}`);
    }

    // NPCs
    if (zone.npcs.length > 0) {
      console.log(`  NPC: ${zone.npcs.map(n => n.name).join(", ")}`);
    }
  }

  // Choices
  console.log("");
  divider();
  let choices: { key: number; label: string; action: () => Promise<void> }[] = [];
  let n = 1;

  // Movement
  if (zone) {
    for (const adj of zone.adjacentZones) {
      const target = getZone(adj.zoneId);
      const dir = adj.direction === "north" ? "北" : adj.direction === "south" ? "南" : adj.direction === "east" ? "東" : "西";
      choices.push({ key: n, label: `${dir}へ移動（${target?.name ?? adj.zoneId}）`, action: () => handleMove(adj.direction) });
      n++;
    }
  }

  // NPCs
  if (zone) {
    for (const npc of zone.npcs) {
      choices.push({ key: n, label: `${npc.name}に話しかける`, action: () => handleInteract(npc.id) });
      n++;
    }
  }

  // Explore (danger zones only)
  const isSafe = !zone || zone.id.includes("village") || zone.id.includes("market") || zone.id.includes("capital") || zone.id.includes("port");
  if (!isSafe) {
    choices.push({ key: n, label: "周囲を探索する", action: handleExplore });
    n++;
  }

  // Fixed menu
  choices.push({ key: n++, label: "チャットを開く", action: handleChat });
  choices.push({ key: n++, label: "ステータス", action: handleStatus });
  choices.push({ key: n++, label: "インベントリ", action: handleInventory });
  choices.push({ key: n++, label: "装備", action: handleEquipScreen });
  choices.push({ key: n++, label: "クエスト", action: handleQuestScreen });

  for (const c of choices) console.log(`  [${c.key}] ${c.label}`);
  divider();

  // Pending messages
  if (pendingMessages.length > 0) {
    console.log("");
    for (const msg of pendingMessages) console.log(`  💬 ${msg}`);
    pendingMessages = [];
  }

  const input = await prompt("\n  > ");
  const choice = choices.find(c => c.key === parseInt(input.trim()));
  if (choice) await choice.action();
}

// ── Actions ──

async function handleMove(direction: string): Promise<void> {
  return new Promise(resolve => {
    world.onMessage("zone_change", (data: any) => {
      currentZoneId = data.zoneId;
      resolve();
    });
    world.onMessage("error", (err: any) => {
      console.log(`  ${err.message}`);
      resolve();
    });
    world.send("move", { direction });
  });
}

async function handleInteract(npcId: string): Promise<void> {
  return new Promise(resolve => {
    world.onMessage("npc_dialogue", (data: any) => {
      npcName = data.npcName;
      npcDialoguePages = renderDialogue(data.npcName, data.text);
      npcDialogueIndex = 0;
      screen = "npc_dialogue";
      resolve();
    });
    world.send("interact", { targetId: npcId });
  });
}

async function showNpcDialogue() {
  clear();
  header(`${npcName} との会話`);
  console.log(`\n  ${npcDialoguePages[npcDialogueIndex]}`);
  divider();

  if (npcDialogueIndex < npcDialoguePages.length - 1) {
    console.log("  [1] 次へ");
  }
  console.log("  [0] 会話を終える");

  // Shop NPC?
  const zone = getZone(currentZoneId);
  const npc = zone?.npcs.find(n => n.name === npcName);
  if (npc && (npc.id === "npc-merchant" || npc.id === "npc-trader")) {
    console.log("  [9] ショップを開く");
  }
  // Quest NPC?
  if (npc && (npc.id === "npc-elder" || npc.id === "npc-trader")) {
    console.log("  [8] クエストを見る");
  }

  divider();
  const input = await prompt("  > ");
  if (input.trim() === "1" && npcDialogueIndex < npcDialoguePages.length - 1) {
    npcDialogueIndex++;
    return; // stay in dialogue
  }
  if (input.trim() === "9" && npc) {
    shopNpcId = npc.id;
    screen = "shop";
    return handleShopScreen();
  }
  if (input.trim() === "8" && npc) {
    return handleQuestNpc(npc.id);
  }
  screen = "main";
}

async function handleExplore(): Promise<void> {
  return new Promise(resolve => {
    world.onMessage("encounter", (data: any) => {
      if (data.type === "battle") {
        clear();
        header("⚔ エンカウント！");
        console.log(`\n  ${data.enemy.name}が現れた！`);
        console.log(`  HP:${data.enemy.hp} ATK:${data.enemy.atk} DEF:${data.enemy.def}`);
        console.log(`\n  ※ 戦闘はBattleRoom経由で実装予定`);
        console.log(`  EXP:${data.enemy.exp} Gold:${data.enemy.gold}`);
      } else if (data.type === "item") {
        clear();
        header("✨ アイテム発見！");
        console.log(`\n  ${data.itemName} x${data.quantity} を見つけた！`);
      } else {
        clear();
        header("探索");
        console.log(`\n  周囲を探索したが、特に何も見つからなかった。`);
      }
      resolve();
    });
    world.onMessage("error", (err: any) => {
      console.log(`  ${err.message}`);
      resolve();
    });
    world.send("explore", {});
  });
}

async function handleStatus(): Promise<void> {
  return new Promise(resolve => {
    world.onMessage("player_status", (data: any) => {
      clear();
      header("ステータス");
      const className = data.classType === "warrior" ? "戦士" : data.classType === "mage" ? "魔法使い" : "盗賊";
      console.log(`\n  名前: ${data.name}`);
      console.log(`  職業: ${className}`);
      console.log(`  レベル: ${data.level}  EXP: ${data.exp}`);
      console.log(`\n  HP: ${data.hp} / ${data.maxHp}`);
      console.log(`  MP: ${data.mp} / ${data.maxMp}`);
      console.log(`\n  攻撃力: ${data.atk}`);
      console.log(`  防御力: ${data.def}`);
      console.log(`  魔力:   ${data.mag}`);
      console.log(`  素早さ: ${data.spd}`);
      console.log(`\n  所持金: ${data.gold}G`);
      console.log(`  現在地: ${getZone(data.zoneId)?.name ?? data.zoneId}`);
      if (data.equipment) {
        console.log(`\n  [武器] ${data.equipment.weapon ?? "なし"}`);
        console.log(`  [防具] ${data.equipment.armor ?? "なし"}`);
        console.log(`  [アクセ] ${data.equipment.accessory ?? "なし"}`);
      }
      resolve();
    });
    world.send("status", {});
  });
}

async function handleInventory(): Promise<void> {
  return new Promise(resolve => {
    world.onMessage("player_inventory", (data: any) => {
      clear();
      header("インベントリ");
      inventoryCache = data.inventory;
      console.log(`\n  所持金: ${data.gold}G\n`);
      if (data.inventory.length === 0) {
        console.log("  何も持っていない。");
      } else {
        data.inventory.forEach((item: any, i: number) => {
          console.log(`  [${i + 1}] ${item.name} x${item.quantity} (${item.type})`);
        });
      }
      resolve();
    });
    world.send("inventory", {});
  });
}

async function handleEquipScreen(): Promise<void> {
  // First get status to see current equipment
  return new Promise(resolve => {
    world.onMessage("player_status", async (data: any) => {
      clear();
      header("装備変更");
      console.log(`\n  現在の装備:`);
      console.log(`  [武器] ${data.equipment?.weapon ?? "なし"}`);
      console.log(`  [防具] ${data.equipment?.armor ?? "なし"}`);
      console.log(`  [アクセ] ${data.equipment?.accessory ?? "なし"}`);

      // Show equippable items
      world.onMessage("player_inventory", async (invData: any) => {
        const equipItems = invData.inventory.filter((i: any) => i.type === "equipment");
        if (equipItems.length > 0) {
          console.log(`\n  装備可能アイテム:`);
          equipItems.forEach((item: any, i: number) => {
            console.log(`  [${i + 1}] ${item.name}`);
          });
        }
        divider();
        console.log("  [0] 戻る");
        divider();
        const input = await prompt("  > ");
        const idx = parseInt(input.trim()) - 1;
        if (idx >= 0 && idx < equipItems.length) {
          await new Promise<void>(r => {
            world.onMessage("equipped", (eq: any) => {
              console.log(`\n  ${equipItems[idx].name} を装備した！`);
              console.log(`  ATK:${eq.effectiveStats.atk} DEF:${eq.effectiveStats.def}`);
              r();
            });
            world.send("equip", { itemId: equipItems[idx].itemId });
          });
        }
        resolve();
      });
      world.send("inventory", {});
    });
    world.send("status", {});
  });
}

async function handleShopScreen(): Promise<void> {
  return new Promise(resolve => {
    world.onMessage("shop_items", async (data: any) => {
      clear();
      header("ショップ");
      shopItems = data.items;
      console.log(`\n  ${shopNpcId === "npc-merchant" ? "商人マリア" : "旅商人ロイド"}の店\n`);
      data.items.forEach((item: any, i: number) => {
        console.log(`  [${i + 1}] ${item.name}  ${item.price}G`);
      });
      divider();
      console.log("  [0] 戻る");
      divider();
      const input = await prompt("  > ");
      const idx = parseInt(input.trim()) - 1;
      if (idx >= 0 && idx < shopItems.length) {
        await new Promise<void>(r => {
          world.onMessage("shop_bought", (res: any) => {
            console.log(`\n  購入完了！ 残Gold: ${res.gold}G`);
            r();
          });
          world.onMessage("error", (err: any) => {
            console.log(`\n  ${err.message}`);
            r();
          });
          world.send("shop_buy", { npcId: shopNpcId, itemId: shopItems[idx].id });
        });
      }
      screen = "main";
      resolve();
    });
    world.send("shop_list", { npcId: shopNpcId });
  });
}

async function handleQuestScreen(): Promise<void> {
  return new Promise(resolve => {
    world.onMessage("quest_log", async (data: any) => {
      clear();
      header("クエストログ");
      const quests = Object.entries(data.quests || {});
      if (quests.length === 0) {
        console.log("\n  受注中のクエストなし");
      } else {
        for (const [id, q] of quests) {
          const quest = q as any;
          const status = quest.status === "active" ? "進行中" : quest.status === "completed" ? "完了" : "失敗";
          console.log(`\n  ${id}: [${status}]`);
          for (const [key, val] of Object.entries(quest.progress || {})) {
            console.log(`    ${key}: ${val}`);
          }
        }
      }
      divider();
      console.log("  [0] 戻る");
      divider();
      await prompt("  > ");
      resolve();
    });
    world.send("quest_log", {});
  });
}

async function handleQuestNpc(npcId: string): Promise<void> {
  return new Promise(resolve => {
    world.onMessage("quest_list", async (data: any) => {
      clear();
      header("クエスト");
      if (data.quests.length === 0) {
        console.log("\n  このNPCにクエストはない");
      } else {
        data.quests.forEach((q: any, i: number) => {
          console.log(`\n  [${i + 1}] ${q.name}`);
          console.log(`      ${q.description}`);
        });
      }
      divider();
      console.log("  [0] 戻る");
      divider();
      const input = await prompt("  > ");
      const idx = parseInt(input.trim()) - 1;
      if (idx >= 0 && idx < data.quests.length) {
        await new Promise<void>(r => {
          world.onMessage("quest_accepted", () => {
            console.log(`\n  ✨ クエスト「${data.quests[idx].name}」を受注！`);
            r();
          });
          world.onMessage("error", (err: any) => {
            console.log(`\n  ${err.message}`);
            r();
          });
          world.send("quest_accept", { questId: data.quests[idx].id });
        });
      }
      screen = "main";
      resolve();
    });
    world.send("quest_list", { npcId });
  });
}

async function handleChat(): Promise<void> {
  clear();
  header("チャット");
  console.log("  メッセージを入力（空行で戻る）\n");

  while (true) {
    const text = await prompt("  チャット > ");
    if (!text.trim()) break;
    world.send("expression", { expression: "smile" }); // just to show activity
    // Chat through chatRoom if connected, otherwise skip
    if (chatRoom) {
      chatRoom.send("chat", { text, channel: "global" });
    } else {
      console.log("  （チャットサーバー未接続）");
    }
  }
}

// ── Chat listener ──
function setupChatListener() {
  if (!chatRoom) return;
  chatRoom.onMessage("chat_message", (msg: any) => {
    if (msg.sender !== playerName) {
      pendingMessages.push(`${msg.sender}: ${msg.text}`);
    }
  });
}

// ── Main loop ──
async function main() {
  clear();
  console.log("  ⚔  テキスト型MMO クライアント");
  console.log(`  サーバー: ${ENDPOINT}\n`);

  // Generate token
  const auth = new KaedevnAuthAdapter(JWT_SECRET);
  const userId = `cli-${Date.now()}`;
  const token = auth.generateToken({ userId });

  const zone = FULL_ZONES[0]; // Start in village

  // Connect to WorldRoom
  console.log("  接続中...");
  const sdk = new SDKClient(ENDPOINT);

  try {
    world = await sdk.joinOrCreate("world", {
      token,
      zoneId: zone.id,
      zoneName: zone.name,
      npcs: zone.npcs,
      adjacentZones: zone.adjacentZones,
    });
  } catch (e: any) {
    console.log(`  接続失敗: ${e.message}`);
    console.log(`  サーバーが起動していますか？ npx tsx mmo/server.ts`);
    process.exit(1);
  }

  currentZoneId = zone.id;
  console.log(`  接続成功！ (${zone.name})`);

  // Try connecting to ChatRoom
  try {
    chatRoom = await sdk.joinOrCreate("chat", { token, name: playerName || userId, zoneId: zone.id });
    setupChatListener();
  } catch { /* chat optional */ }

  // Wait for server message
  const needsCreate = await new Promise<boolean>((resolve) => {
    world.onMessage("need_character_creation", () => resolve(true));
    world.onMessage("welcome", (data: any) => {
      playerName = data.name;
      resolve(false);
    });
    setTimeout(() => resolve(true), 2000);
  });

  if (needsCreate) {
    await showCreateScreen();
  }

  // Pause after actions
  async function pauseAndReturn() {
    divider();
    console.log("  [0] 戻る");
    divider();
    await prompt("  > ");
  }

  // Game loop
  while (true) {
    try {
      switch (screen) {
        case "main":
          await showMainScreen();
          break;
        case "npc_dialogue":
          await showNpcDialogue();
          break;
        default:
          screen = "main";
          break;
      }

      // After non-main screens, wait for input then return
      if (screen !== "main" && screen !== "npc_dialogue" && screen !== "create") {
        await pauseAndReturn();
        screen = "main";
      }
    } catch (e: any) {
      if (e.message?.includes("readline was closed")) break;
      console.log(`  エラー: ${e.message}`);
      screen = "main";
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
