/**
 * 結合テスト: 全ゲームフローを SDKClient → Room 経由で実行
 *
 * 探索→エンカウント→BattleRoom接続→戦闘→勝利→レベルアップ→ドロップ→クエスト進捗
 * 死亡→リスポーン、装備スワップ、複数ゾーン移動、2人プレイ、全部 Room メッセージ経由
 */
import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { createMMOServer, type MMOServer } from "../src/createServer.ts";
import { InMemoryPlayerDB } from "../src/persistence/PlayerPersistence.ts";
import { createTestToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";
import { TEST_ZONES } from "./mocks/zone-map.ts";
import { TestLogger } from "./helpers/TestLogger.ts";

const TEST_PORT = 9590;
const ENDPOINT = `ws://localhost:${TEST_PORT}`;

function wait<T>(room: any, type: string, ms = 3000, filter?: (m: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: "${type}"`)), ms);
    room.onMessage(type, (msg: T) => {
      if (filter && !filter(msg)) return;
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

describe("Integration E2E — Full Game Flow", function () {
  this.timeout(30000);

  const playerDB = new InMemoryPlayerDB();
  let mmo: MMOServer;
  const village = TEST_ZONES[0];
  const forest = TEST_ZONES[1];

  before(async () => {
    mmo = createMMOServer({ jwtSecret: TEST_JWT_SECRET, playerDB });
    await mmo.listen(TEST_PORT);
  });

  after(() => mmo.shutdown());
  beforeEach(() => playerDB.clear());

  it("full game: create → shop → equip → explore → battle → level up → drops → quest → death → respawn", async () => {
    const log = new TestLogger("integration-full");
    const sdk1 = new SDKClient(ENDPOINT);
    const token1 = createTestToken({ userId: "akira" });

    // ═══ 1. LOGIN + CHARACTER CREATION ═══
    log.section("1. Login & Create");

    const worldVillage = await sdk1.joinOrCreate("world", {
      token: token1, zoneId: village.id, zoneName: village.name,
      npcs: village.npcs, adjacentZones: village.adjacentZones,
    });

    await new Promise<void>(r => {
      worldVillage.onMessage("need_character_creation", () => r());
      worldVillage.onMessage("welcome", () => r());
      setTimeout(r, 500);
    });

    const charMsg = wait<any>(worldVillage, "character_created");
    worldVillage.send("create_character", { name: "アキラ", classType: "warrior", gender: "male" });
    const charData = await charMsg;
    assert.strictEqual(charData.classType, "warrior");
    assert.strictEqual(charData.hp, 120);
    log.player("アキラ", `戦士作成 HP:${charData.hp} ATK:${charData.atk}`, "create", charData);

    // ═══ 2. NPC DIALOGUE ═══
    log.section("2. NPC Dialogue");

    const npcMsg = wait<any>(worldVillage, "npc_dialogue");
    worldVillage.send("interact", { targetId: "npc-elder" });
    const elder = await npcMsg;
    assert.strictEqual(elder.npcName, "長老ヨハン");
    log.player("アキラ", `${elder.npcName}と会話`, "npc_dialogue", { npc: elder.npcName, text: elder.text });

    const npcMsg2 = wait<any>(worldVillage, "npc_dialogue");
    worldVillage.send("interact", { targetId: "npc-merchant" });
    const merchant = await npcMsg2;
    assert.strictEqual(merchant.npcName, "商人マリア");
    log.player("アキラ", `${merchant.npcName}と会話`, "npc_dialogue", { npc: merchant.npcName });

    // ═══ 3. SHOP: BUY WEAPON + ARMOR ═══
    log.section("3. Shop");

    const shopMsg = wait<any>(worldVillage, "shop_items");
    worldVillage.send("shop_list", { npcId: "npc-merchant" });
    const shopData = await shopMsg;
    assert.ok(shopData.items.length >= 4);
    log.player("アキラ", `ショップ: ${shopData.items.length}品`, "shop_list", { items: shopData.items.map((i: any) => i.name) });

    // Buy sword
    const buy1 = wait<any>(worldVillage, "shop_bought");
    worldVillage.send("shop_buy", { npcId: "npc-merchant", itemId: "sword-wood" });
    const bought1 = await buy1;
    log.player("アキラ", `木の剣を購入 Gold:${bought1.gold}`, "shop_buy", { item: "sword-wood", gold: bought1.gold });

    // Buy armor
    const buy2 = wait<any>(worldVillage, "shop_bought");
    worldVillage.send("shop_buy", { npcId: "npc-merchant", itemId: "armor-cloth" });
    const bought2 = await buy2;
    log.player("アキラ", `布の服を購入 Gold:${bought2.gold}`, "shop_buy", { item: "armor-cloth", gold: bought2.gold });

    // Insufficient gold
    const buyErr = wait<any>(worldVillage, "error");
    worldVillage.send("shop_buy", { npcId: "npc-merchant", itemId: "sword-wood", quantity: 99 });
    const errMsg = await buyErr;
    assert.strictEqual(errMsg.code, "INSUFFICIENT_GOLD");
    log.system(`ゴールド不足: ${errMsg.code}`, "shop_error", { code: errMsg.code });

    // Sell
    const sellMsg = wait<any>(worldVillage, "shop_sold");
    worldVillage.send("shop_sell", { itemId: "potion-001", quantity: 1 });
    const sold = await sellMsg;
    log.player("アキラ", `回復薬売却 Gold:${sold.gold}`, "shop_sell", { item: "potion-001", gold: sold.gold });

    // ═══ 4. EQUIP + UNEQUIP + SWAP ═══
    log.section("4. Equipment");

    const eq1 = wait<any>(worldVillage, "equipped");
    worldVillage.send("equip", { itemId: "sword-wood" });
    const eqRes1 = await eq1;
    assert.strictEqual(eqRes1.effectiveStats.atk, 18); // 15 + 3
    log.player("アキラ", `木の剣装備 ATK:${eqRes1.effectiveStats.atk}`, "equip", { item: "sword-wood", stats: eqRes1.effectiveStats });

    const eq2 = wait<any>(worldVillage, "equipped");
    worldVillage.send("equip", { itemId: "armor-cloth" });
    const eqRes2 = await eq2;
    assert.strictEqual(eqRes2.effectiveStats.def, 15); // 12 + 3
    log.player("アキラ", `布の服装備 DEF:${eqRes2.effectiveStats.def}`, "equip", { item: "armor-cloth", stats: eqRes2.effectiveStats });

    // Unequip weapon
    const uneq = wait<any>(worldVillage, "unequipped");
    worldVillage.send("unequip", { slot: "weapon" });
    const uneqRes = await uneq;
    assert.strictEqual(uneqRes.effectiveStats.atk, 15);
    log.player("アキラ", `武器外した ATK:${uneqRes.effectiveStats.atk}`, "unequip", { slot: "weapon" });

    // Re-equip
    const eq3 = wait<any>(worldVillage, "equipped");
    worldVillage.send("equip", { itemId: "sword-wood" });
    await eq3;
    log.player("アキラ", `再装備`, "equip", { item: "sword-wood" });

    // ═══ 5. QUEST ACCEPT ═══
    log.section("5. Quest");

    const qa = wait<any>(worldVillage, "quest_accepted");
    worldVillage.send("quest_accept", { questId: "Q-001" }); // defeat 3 goblins
    await qa;
    log.player("アキラ", `クエスト受注: 森の脅威`, "quest_accept", { questId: "Q-001" });

    // Duplicate
    const qaErr = wait<any>(worldVillage, "error");
    worldVillage.send("quest_accept", { questId: "Q-001" });
    const dupErr = await qaErr;
    assert.strictEqual(dupErr.code, "QUEST_ALREADY_ACCEPTED");
    log.system(`二重受注拒否`, "quest_error", { code: dupErr.code });

    // ═══ 6. ZONE MOVEMENT ═══
    log.section("6. Movement");

    // Move north → forest (error: no adjacent)
    // Village test zone has north=forest, east=market
    const moveMsg = wait<any>(worldVillage, "zone_change");
    worldVillage.send("move", { direction: "north" });
    const zm = await moveMsg;
    assert.strictEqual(zm.zoneId, "zone-002-forest");
    log.player("アキラ", `北→霧の森`, "move", { to: zm.zoneId });

    // Move east (from village)
    const moveMsg2 = wait<any>(worldVillage, "zone_change");
    worldVillage.send("move", { direction: "east" });
    const zm2 = await moveMsg2;
    assert.strictEqual(zm2.zoneId, "zone-003-market");
    log.player("アキラ", `東→交易広場`, "move", { to: zm2.zoneId });

    // Blocked
    const moveErr = wait<any>(worldVillage, "error");
    worldVillage.send("move", { direction: "west" });
    const noWay = await moveErr;
    assert.strictEqual(noWay.code, "ZONE_NO_ADJACENT");
    log.player("アキラ", `西→行き止まり`, "move_blocked", { code: noWay.code });

    // ═══ 7. EXPLORE IN DANGER ZONE ═══
    log.section("7. Explore (Forest)");

    // Safe zone error
    const safeErr = wait<any>(worldVillage, "error");
    worldVillage.send("explore", {});
    const se = await safeErr;
    assert.strictEqual(se.code, "ZONE_SAFE");
    log.system(`村で探索→安全地帯`, "explore_safe", { code: se.code });

    // Join forest WorldRoom for explore
    await worldVillage.leave();
    const worldForest = await sdk1.joinOrCreate("world_forest", {
      token: token1, zoneId: forest.id, zoneName: forest.name,
      npcs: forest.npcs, adjacentZones: forest.adjacentZones,
    });
    await new Promise(r => setTimeout(r, 200));

    // Already created, should get welcome or need_create
    await new Promise<void>(r => {
      worldForest.onMessage("welcome", () => r());
      worldForest.onMessage("need_character_creation", () => r());
      setTimeout(r, 500);
    });

    // Explore in forest (has encounters)
    const encMsg = wait<any>(worldForest, "encounter");
    worldForest.send("explore", {});
    const enc = await encMsg;
    log.player("アキラ", `探索結果: ${enc.type}`, "explore", enc);

    // ═══ 8. BATTLE (BattleRoom) ═══
    log.section("8. Battle");

    // Create battle with a weak goblin so we win in 1 hit
    const battleRoom = await sdk1.joinOrCreate("battle", {
      token: token1,
      name: "アキラ",
      attack: 50, defense: 10, hp: 120, maxHp: 120, mp: 20,
      enemyId: "goblin",
      enemyName: "ゴブリン",
      enemyHp: 10, enemyAttack: 3, enemyDefense: 1,
      enemyExp: 25, enemyGold: 10,
      enemyDrops: [{ itemId: "herb-001", name: "薬草", chance: 1.0 }], // guaranteed
    });
    await new Promise(r => setTimeout(r, 200));

    assert.strictEqual(battleRoom.state.phase, "selecting");
    log.player("アキラ", `戦闘開始 ゴブリン HP:10`, "battle_start", { enemy: "ゴブリン", enemyHp: 10 });

    // Attack → should kill in one hit
    const battleResult = wait<any>(battleRoom, "battle_result");
    battleRoom.send("action", { type: "attack", targetId: "enemy-001" });
    const br = await battleResult;

    assert.strictEqual(br.result, "win");
    assert.strictEqual(br.expGained, 25);
    assert.strictEqual(br.goldGained, 10);
    assert.ok(br.drops.length > 0); // guaranteed herb drop
    assert.strictEqual(br.drops[0].name, "薬草");
    log.player("アキラ", `勝利！ +${br.expGained}EXP +${br.goldGained}G ドロップ:${br.drops.map((d: any) => d.name).join(",")}`, "battle_win", {
      exp: br.expGained, gold: br.goldGained, drops: br.drops,
      levelUps: br.levelUps, questProgress: br.questProgress,
    });

    // Verify level up happened (25 EXP, need 20 for Lv2)
    if (br.levelUps?.akira) {
      log.player("アキラ", `★ Lv UP! Lv.${br.levelUps.akira.newLevel}`, "level_up", br.levelUps.akira);
    }

    // Verify quest progress (goblin defeat → Q-001 progress)
    if (br.questProgress?.akira) {
      for (const p of br.questProgress.akira) {
        log.player("アキラ", `クエスト進捗: ${p.targetName} (${p.current}/${p.required})`, "quest_progress", p);
      }
    }

    await battleRoom.leave();

    // Verify DB was updated
    const pd = await playerDB.findByUserId("akira");
    assert.ok(pd);
    assert.ok(pd!.level >= 2, `Expected level >= 2, got ${pd!.level}`);
    assert.ok(pd!.gold > 0);
    assert.ok(pd!.inventory.some(i => i.itemId === "herb-001"), "Should have herb drop in inventory");
    assert.strictEqual(pd!.questProgress["Q-001"]?.progress?.obj_0, 1); // 1/3 goblins
    log.system(`DB確認: Lv.${pd!.level} Gold:${pd!.gold} 薬草あり クエスト進捗:1/3`, "db_verify", {
      level: pd!.level, gold: pd!.gold, questProgress: pd!.questProgress["Q-001"],
    });

    // ═══ 9. ITEM USE ═══
    log.section("9. Item Usage");

    // Use potion (from forest world room)
    const itemMsg = wait<any>(worldForest, "item_used");
    worldForest.send("use_item", { itemId: "potion-001" });
    const itemRes = await itemMsg;
    assert.ok(itemRes.log);
    log.player("アキラ", itemRes.log, "use_item", { itemId: "potion-001", hp: itemRes.hp });

    // Not owned
    const itemErr = wait<any>(worldForest, "error");
    worldForest.send("use_item", { itemId: "ether-001" });
    const ie = await itemErr;
    assert.strictEqual(ie.code, "ITEM_NOT_OWNED");
    log.system(`未所持アイテム拒否`, "item_error", { code: ie.code });

    // ═══ 10. BATTLE ITEM USE ═══
    log.section("10. Battle Item Use");

    const battleRoom2 = await sdk1.joinOrCreate("battle", {
      token: token1, name: "アキラ",
      attack: 5, defense: 5, hp: 30, maxHp: 120, mp: 20,
      enemyName: "強い敵", enemyHp: 999, enemyAttack: 1, enemyDefense: 0,
      enemyExp: 0, enemyGold: 0,
    });
    await new Promise(r => setTimeout(r, 200));

    // Use potion in battle
    const itemUsedInBattle = wait<any>(battleRoom2, "action_result", 3000, (m: any) => m.type === "item");
    battleRoom2.send("action", { type: "item", itemId: "potion-001" });
    const itemBattleRes = await itemUsedInBattle;
    assert.ok(itemBattleRes.log.includes("回復"));
    log.player("アキラ", `戦闘中にアイテム使用: ${itemBattleRes.log}`, "battle_item", { log: itemBattleRes.log });

    // Flee
    const fleeResult = wait<any>(battleRoom2, "battle_result");
    // Need to wait for our turn again after enemy turn
    await new Promise(r => setTimeout(r, 500));
    battleRoom2.send("action", { type: "flee" });
    const fr = await fleeResult;
    assert.strictEqual(fr.result, "flee");
    log.player("アキラ", `逃走成功`, "battle_flee");
    await battleRoom2.leave();

    // ═══ 11. DEATH & RESPAWN ═══
    log.section("11. Death");

    // Battle with unwinnable enemy, 1 HP
    const deathBattle = await sdk1.joinOrCreate("battle", {
      token: token1, name: "アキラ",
      attack: 1, defense: 0, hp: 1, maxHp: 120, mp: 20,
      enemyName: "ドラゴン", enemyHp: 999, enemyAttack: 999, enemyDefense: 999,
      enemyExp: 0, enemyGold: 0,
    });
    await new Promise(r => setTimeout(r, 200));

    const pdBefore = await playerDB.findByUserId("akira");
    const goldBefore = pdBefore!.gold;

    // Defend → enemy will kill us
    const deathResult = wait<any>(deathBattle, "battle_result");
    deathBattle.send("action", { type: "defend" });
    const dr = await deathResult;
    assert.strictEqual(dr.result, "lose");
    log.player("アキラ", `全滅…`, "death", { result: dr.result });

    await deathBattle.leave();

    // Verify death penalty in DB
    const pdAfterDeath = await playerDB.findByUserId("akira");
    assert.strictEqual(pdAfterDeath!.zoneId, "zone-001-village");
    assert.strictEqual(pdAfterDeath!.hp, pdAfterDeath!.maxHp);
    assert.ok(pdAfterDeath!.gold < goldBefore);
    log.system(`死亡ペナルティ: Gold ${goldBefore}→${pdAfterDeath!.gold} ゾーン→村 HP全回復`, "death_penalty", {
      goldBefore, goldAfter: pdAfterDeath!.gold, zone: pdAfterDeath!.zoneId,
    });

    // ═══ 12. STATUS + INVENTORY CHECK ═══
    log.section("12. Status & Inventory");

    const statusMsg = wait<any>(worldForest, "player_status");
    worldForest.send("status", {});
    const st = await statusMsg;
    log.player("アキラ", `Lv.${st.level} HP:${st.hp}/${st.maxHp} ATK:${st.atk} Gold:${st.gold}`, "status", st);

    const invMsg = wait<any>(worldForest, "player_inventory");
    worldForest.send("inventory", {});
    const inv = await invMsg;
    log.player("アキラ", `所持品: ${inv.inventory.map((i: any) => `${i.name}x${i.quantity}`).join(", ")}`, "inventory", { items: inv.inventory });

    // ═══ 13. QUEST LOG + REPORT ═══
    log.section("13. Quest");

    const qlMsg = wait<any>(worldForest, "quest_log");
    worldForest.send("quest_log", {});
    const ql = await qlMsg;
    assert.ok(ql.quests["Q-001"]);
    log.player("アキラ", `クエストログ: Q-001 status=${ql.quests["Q-001"].status}`, "quest_log", ql.quests);

    // Quest not complete yet (1/3 goblins) → report should fail
    const qrErr = wait<any>(worldForest, "error");
    worldForest.send("quest_report", { questId: "Q-001" });
    const qe = await qrErr;
    assert.strictEqual(qe.code, "QUEST_NOT_COMPLETE");
    log.system(`未完了クエスト報告拒否`, "quest_report_error", { code: qe.code });

    // ═══ 14. CHAT (2 players) ═══
    log.section("14. Chat");

    const sdk2 = new SDKClient(ENDPOINT);
    const chat1 = await sdk1.joinOrCreate("chat", {
      token: token1, name: "アキラ", zoneId: "zone-001-village",
    });
    const chat2 = await sdk2.joinOrCreate("chat", {
      token: createTestToken({ userId: "misaki" }), name: "ミサキ", zoneId: "zone-001-village",
    });
    await new Promise(r => setTimeout(r, 200));

    const chatRcv = wait<any>(chat2, "chat_message");
    chat1.send("chat", { text: "Hello from battle!", channel: "global" });
    const cm = await chatRcv;
    assert.strictEqual(cm.sender, "アキラ");
    assert.strictEqual(cm.text, "Hello from battle!");
    log.player("アキラ", `チャット送信`, "chat_send", { text: cm.text });
    log.player("ミサキ", `チャット受信: ${cm.sender}: ${cm.text}`, "chat_receive", { sender: cm.sender, text: cm.text });

    await chat1.leave();
    await chat2.leave();

    // ═══ DONE ═══
    log.section("Done");
    log.system("全フロー��了", "complete");
    await worldForest.leave();

    const logDir = log.flush();
    console.log(`\n  Logs: ${logDir}\n`);

    // ─── Log content assertions ───
    const entries = log.getEntries();
    const akira = log.getPlayerEntries("アキラ");
    const misaki = log.getPlayerEntries("ミサキ");

    assert.ok(entries.length >= 30, `entries: ${entries.length}`);
    assert.ok(akira.length >= 18, `akira entries: ${akira.length}`);
    assert.ok(misaki.length >= 1, `misaki entries: ${misaki.length}`);

    // Every key action type exists
    for (const action of [
      "create", "npc_dialogue", "shop_list", "shop_buy", "shop_sell",
      "equip", "unequip", "quest_accept", "move", "explore",
      "battle_start", "battle_win", "use_item", "battle_item", "battle_flee",
      "death", "status", "inventory", "quest_log", "chat_send", "chat_receive", "complete",
    ]) {
      const found = log.getByAction(action);
      assert.ok(found.length > 0, `Missing action: ${action}`);
    }

    // Level up happened
    const lvUps = log.getByAction("level_up");
    assert.ok(lvUps.length >= 1, "Should have leveled up");

    // Quest progress tracked
    const qp = log.getByAction("quest_progress");
    assert.ok(qp.length >= 1, "Should have quest progress");

    // Death penalty applied
    const dp = log.getByAction("death_penalty");
    assert.strictEqual(dp.length, 1);
    assert.ok(dp[0].detail!.goldAfter < dp[0].detail!.goldBefore);

    // Timestamps ascending
    for (let i = 1; i < entries.length; i++) {
      assert.ok(entries[i].t >= entries[i - 1].t);
    }
  });
});
