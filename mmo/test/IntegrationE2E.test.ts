/**
 * 結合テスト: SDKClient → Colyseus Room 経由の実ゲームフロー
 *
 * すべて room.send() / room.onMessage() で通信。
 * ログは JSON で保存。テスト最後にログ内容を assert で検証。
 */
import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { LocalDriver, matchMaker, Server, LocalPresence } from "@colyseus/core";
import { WorldRoom } from "../src/rooms/WorldRoom.ts";
import { ChatRoom } from "../src/rooms/ChatRoom.ts";
import { BattleRoom } from "../src/rooms/BattleRoom.ts";
import { KaedevnAuthAdapter } from "../src/auth/KaedevnAuthAdapter.ts";
import { InMemoryPlayerDB } from "../src/persistence/PlayerPersistence.ts";
import { createTestToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";
import { TEST_ZONES } from "./mocks/zone-map.ts";
import { TestLogger, type LogEntry } from "./helpers/TestLogger.ts";

const TEST_PORT = 9590;
const ENDPOINT = `ws://localhost:${TEST_PORT}`;

function waitMsg<T>(room: any, type: string, timeout = 3000, filter?: (m: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: "${type}"`)), timeout);
    room.onMessage(type, (msg: T) => {
      if (filter && !filter(msg)) return;
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

describe("Integration E2E — Room Message Flow", function () {
  this.timeout(30000);

  const presence = new LocalPresence();
  const driver = new LocalDriver();
  const server = new Server({ greet: false, presence, driver });
  const authAdapter = new KaedevnAuthAdapter(TEST_JWT_SECRET);
  const playerDB = new InMemoryPlayerDB();
  const village = TEST_ZONES[0];

  before(async () => {
    matchMaker.setup(presence, driver);
    WorldRoom.authAdapterInstance = authAdapter;
    WorldRoom.playerDBInstance = playerDB;
    ChatRoom.authAdapterInstance = authAdapter;
    BattleRoom.authAdapterInstance = authAdapter;
    server.define("world", WorldRoom);
    server.define("chat", ChatRoom);
    server.define("battle", BattleRoom);
    await server.listen(TEST_PORT);
  });

  after(() => server.transport.shutdown());
  beforeEach(() => playerDB.clear());

  it("full game session via Room messages", async () => {
    const log = new TestLogger("integration-e2e");

    // ═══════════════════════════
    // 1. LOGIN
    // ═══════════════════════════
    log.section("1. Login");

    const sdk = new SDKClient(ENDPOINT);
    const world = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "player-e2e" }),
      zoneId: village.id,
      zoneName: village.name,
      npcs: village.npcs,
      adjacentZones: village.adjacentZones,
    });

    const createNeeded = await new Promise<boolean>((resolve) => {
      world.onMessage("need_character_creation", () => resolve(true));
      world.onMessage("welcome", () => resolve(false));
      setTimeout(() => resolve(true), 1000);
    });

    assert.strictEqual(createNeeded, true);
    log.player("アキラ", "ログイン → キャラ作成が必要", "login", { needsCreate: true });

    // ═══════════════════════════
    // 2. キャラ作成
    // ═══════════════════════════
    log.section("2. Character Creation");

    const charCreated = waitMsg<any>(world, "character_created");
    world.send("create_character", { name: "アキラ", classType: "warrior", gender: "male" });
    const charData = await charCreated;

    assert.strictEqual(charData.name, "アキラ");
    assert.strictEqual(charData.classType, "warrior");
    assert.strictEqual(charData.hp, 120);
    assert.strictEqual(charData.atk, 15);
    log.player("アキラ", `キャラ作成: 戦士 HP:${charData.hp} ATK:${charData.atk} DEF:${charData.def}`, "create_character", charData);

    // ═══════════════════════════
    // 3. NPC 会話
    // ═══════════════════════════
    log.section("3. NPC Dialogue");

    const dialogue = waitMsg<any>(world, "npc_dialogue");
    world.send("interact", { targetId: "npc-elder" });
    const elderMsg = await dialogue;

    assert.strictEqual(elderMsg.npcName, "長老ヨハン");
    assert.ok(elderMsg.text.includes("[e:"));
    log.player("アキラ", `長老ヨハンに話しかけた`, "interact", { npcId: "npc-elder", npcName: elderMsg.npcName, text: elderMsg.text });

    // ═══════════════════════════
    // 4. ショップ
    // ═══════════════════════════
    log.section("4. Shop");

    const shopList = waitMsg<any>(world, "shop_items");
    world.send("shop_list", { npcId: "npc-merchant" });
    const shopData = await shopList;

    assert.ok(shopData.items.length > 0);
    log.player("アキラ", `商人マリアの店を開いた`, "shop_list", { npcId: "npc-merchant", itemCount: shopData.items.length, items: shopData.items });

    // 木の剣を購入
    const bought = waitMsg<any>(world, "shop_bought");
    world.send("shop_buy", { npcId: "npc-merchant", itemId: "sword-wood" });
    const buyResult = await bought;

    assert.ok(buyResult.gold < 100);
    log.player("アキラ", `木の剣を購入 → Gold: ${buyResult.gold}G`, "shop_buy", { itemId: "sword-wood", gold: buyResult.gold });

    // ═══════════════════════════
    // 5. 装備
    // ═══════════════════════════
    log.section("5. Equipment");

    const equipped = waitMsg<any>(world, "equipped");
    world.send("equip", { itemId: "sword-wood" });
    const equipResult = await equipped;

    assert.strictEqual(equipResult.effectiveStats.atk, 15 + 3);
    log.player("アキラ", `木の剣を装備 → ATK:${equipResult.effectiveStats.atk}`, "equip", { itemId: "sword-wood", stats: equipResult.effectiveStats });

    // 装備解除
    const unequipped = waitMsg<any>(world, "unequipped");
    world.send("unequip", { slot: "weapon" });
    const unequipResult = await unequipped;

    assert.strictEqual(unequipResult.itemId, "sword-wood");
    assert.strictEqual(unequipResult.effectiveStats.atk, 15);
    log.player("アキラ", `木の剣を外した → ATK:${unequipResult.effectiveStats.atk}`, "unequip", { slot: "weapon", stats: unequipResult.effectiveStats });

    // 再装備
    const reequipped = waitMsg<any>(world, "equipped");
    world.send("equip", { itemId: "sword-wood" });
    await reequipped;
    log.player("アキラ", `木の剣を再装備`, "equip", { itemId: "sword-wood" });

    // ═══════════════════════════
    // 6. クエスト
    // ═══════════════════════════
    log.section("6. Quest");

    const questAccepted = waitMsg<any>(world, "quest_accepted");
    world.send("quest_accept", { questId: "Q-001" });
    await questAccepted;
    log.player("アキラ", `クエスト「森の脅威」受注`, "quest_accept", { questId: "Q-001" });

    // 二重受注
    const questError = waitMsg<any>(world, "error");
    world.send("quest_accept", { questId: "Q-001" });
    const dupErr = await questError;
    assert.strictEqual(dupErr.code, "QUEST_ALREADY_ACCEPTED");
    log.system(`二重受注拒否: ${dupErr.code}`, "quest_accept_error", { code: dupErr.code });

    // ═══════════════════════════
    // 7. ステータス
    // ═══════════════════════════
    log.section("7. Status");

    const status = waitMsg<any>(world, "player_status");
    world.send("status", {});
    const statusData = await status;

    assert.strictEqual(statusData.name, "アキラ");
    assert.strictEqual(statusData.classType, "warrior");
    log.player("アキラ", `Lv.${statusData.level} HP:${statusData.hp}/${statusData.maxHp} ATK:${statusData.atk} Gold:${statusData.gold}G`, "status", statusData);

    // ═══════════════════════════
    // 8. インベントリ
    // ═══════════════════════════
    log.section("8. Inventory");

    const inv = waitMsg<any>(world, "player_inventory");
    world.send("inventory", {});
    const invData = await inv;

    assert.ok(invData.inventory.length > 0);
    log.player("アキラ", `所持品: ${invData.inventory.map((i: any) => `${i.name}x${i.quantity}`).join(", ")}`, "inventory", { items: invData.inventory, gold: invData.gold });

    // ═══════════════════════════
    // 9. 探索（安全地帯）
    // ═══════════════════════════
    log.section("9. Explore");

    const exploreError = waitMsg<any>(world, "error");
    world.send("explore", {});
    const safeErr = await exploreError;
    assert.strictEqual(safeErr.code, "ZONE_SAFE");
    log.player("アキラ", `村で探索 → 安全地帯`, "explore_error", { code: safeErr.code });

    // ═══════════════════════════
    // 10. 移動
    // ═══════════════════════════
    log.section("10. Movement");

    const zoneChange = waitMsg<any>(world, "zone_change");
    world.send("move", { direction: "north" });
    const newZone = await zoneChange;

    log.player("アキラ", `北へ移動 → ${newZone.zoneId}`, "move", { direction: "north", zoneId: newZone.zoneId });

    const moveErr = waitMsg<any>(world, "error");
    world.send("move", { direction: "west" });
    const noWay = await moveErr;
    assert.strictEqual(noWay.code, "ZONE_NO_ADJACENT");
    log.player("アキラ", `西は行き止まり`, "move_error", { direction: "west", code: noWay.code });

    // ═══════════════════════════
    // 11. アイテム使用
    // ═══════════════════════════
    log.section("11. Item Usage");

    const itemUsed = waitMsg<any>(world, "item_used");
    world.send("use_item", { itemId: "potion-001" });
    const healResult = await itemUsed;

    assert.ok(healResult.log);
    log.player("アキラ", healResult.log, "use_item", { itemId: "potion-001", hp: healResult.hp, mp: healResult.mp });

    const noItem = waitMsg<any>(world, "error");
    world.send("use_item", { itemId: "ether-001" });
    const noItemErr = await noItem;
    assert.strictEqual(noItemErr.code, "ITEM_NOT_OWNED");
    log.player("アキラ", `魔力の水 → 未所持`, "use_item_error", { itemId: "ether-001", code: noItemErr.code });

    // ═══════════════════════════
    // 12. チャット
    // ═══════════════════════════
    log.section("12. Chat");

    const sdk2 = new SDKClient(ENDPOINT);
    const chatRoom1 = await sdk.joinOrCreate("chat", {
      token: createTestToken({ userId: "player-e2e" }),
      name: "アキラ", zoneId: "zone-001-village",
    });
    const chatRoom2 = await sdk2.joinOrCreate("chat", {
      token: createTestToken({ userId: "player-e2e-2" }),
      name: "ミサキ", zoneId: "zone-001-village",
    });
    await new Promise(r => setTimeout(r, 200));

    const chatReceived = waitMsg<any>(chatRoom2, "chat_message");
    chatRoom1.send("chat", { text: "Hello!", channel: "global" });
    const chatMsg = await chatReceived;

    assert.strictEqual(chatMsg.sender, "アキラ");
    log.player("アキラ", `チャット送信: "Hello!"`, "chat_send", { text: "Hello!", channel: "global" });
    log.player("ミサキ", `チャット受信: ${chatMsg.sender}: ${chatMsg.text}`, "chat_receive", { sender: chatMsg.sender, text: chatMsg.text, channel: chatMsg.channel });

    await chatRoom1.leave();
    await chatRoom2.leave();

    // ═══════════════════════════
    // 13. 売却
    // ═══════════════════════════
    log.section("13. Sell");

    const sold = waitMsg<any>(world, "shop_sold");
    world.send("shop_sell", { itemId: "potion-001", quantity: 1 });
    const sellResult = await sold;

    log.player("アキラ", `回復薬を売却 → Gold: ${sellResult.gold}G`, "shop_sell", { itemId: "potion-001", quantity: 1, gold: sellResult.gold });

    // ═══════════════════════════
    // DONE — ログ保存 + 検証
    // ═══════════════════════════
    log.section("Done");
    log.system("全フロー完了", "test_complete");

    await world.leave();
    const logDir = log.flush();
    console.log(`\n  Logs: ${logDir}\n`);

    // ────────────────────────────
    // ログ内容の検証
    // ────────────────────────────
    const entries = log.getEntries();
    const akiraEntries = log.getPlayerEntries("アキラ");
    const misakiEntries = log.getPlayerEntries("ミサキ");

    // 全体: エントリが十分にある
    assert.ok(entries.length >= 20, `Expected 20+ log entries, got ${entries.length}`);

    // プレイヤー別ログが存在
    assert.ok(akiraEntries.length >= 12, `Akira should have 12+ entries, got ${akiraEntries.length}`);
    assert.ok(misakiEntries.length >= 1, `Misaki should have 1+ entries, got ${misakiEntries.length}`);

    // action ベースの検索
    const logins = log.getByAction("login");
    assert.strictEqual(logins.length, 1);
    assert.strictEqual(logins[0].detail?.needsCreate, true);

    const creates = log.getByAction("create_character");
    assert.strictEqual(creates.length, 1);
    assert.strictEqual(creates[0].detail?.classType, "warrior");
    assert.strictEqual(creates[0].detail?.hp, 120);

    const interacts = log.getByAction("interact");
    assert.strictEqual(interacts.length, 1);
    assert.strictEqual(interacts[0].detail?.npcName, "長老ヨハン");

    const shopLists = log.getByAction("shop_list");
    assert.strictEqual(shopLists.length, 1);
    assert.ok(shopLists[0].detail?.itemCount > 0);

    const buys = log.getByAction("shop_buy");
    assert.strictEqual(buys.length, 1);
    assert.strictEqual(buys[0].detail?.itemId, "sword-wood");

    const equips = log.getByAction("equip");
    assert.strictEqual(equips.length, 2); // equip + re-equip
    assert.strictEqual(equips[0].detail?.stats?.atk, 18);

    const unequips = log.getByAction("unequip");
    assert.strictEqual(unequips.length, 1);
    assert.strictEqual(unequips[0].detail?.stats?.atk, 15);

    const questAccepts = log.getByAction("quest_accept");
    assert.strictEqual(questAccepts.length, 1);
    assert.strictEqual(questAccepts[0].detail?.questId, "Q-001");

    const statuses = log.getByAction("status");
    assert.strictEqual(statuses.length, 1);
    assert.strictEqual(statuses[0].detail?.name, "アキラ");
    assert.strictEqual(statuses[0].detail?.classType, "warrior");

    const inventories = log.getByAction("inventory");
    assert.strictEqual(inventories.length, 1);
    assert.ok(inventories[0].detail?.items?.length > 0);

    const moves = log.getByAction("move");
    assert.strictEqual(moves.length, 1);
    assert.strictEqual(moves[0].detail?.direction, "north");

    const itemUses = log.getByAction("use_item");
    assert.strictEqual(itemUses.length, 1);
    assert.strictEqual(itemUses[0].detail?.itemId, "potion-001");

    const chatSends = log.getByAction("chat_send");
    assert.strictEqual(chatSends.length, 1);
    assert.strictEqual(chatSends[0].detail?.text, "Hello!");

    const chatReceives = log.getByAction("chat_receive");
    assert.strictEqual(chatReceives.length, 1);
    assert.strictEqual(chatReceives[0].player, "ミサキ");
    assert.strictEqual(chatReceives[0].detail?.sender, "アキラ");

    const sells = log.getByAction("shop_sell");
    assert.strictEqual(sells.length, 1);

    const completes = log.getByAction("test_complete");
    assert.strictEqual(completes.length, 1);

    // セクション数
    const sections = entries.filter(e => e.type === "section");
    assert.strictEqual(sections.length, 14); // 13 sections + Done

    // 時系列が昇順
    for (let i = 1; i < entries.length; i++) {
      assert.ok(entries[i].t >= entries[i - 1].t, `Entry ${i} has earlier timestamp than ${i - 1}`);
    }
  });
});
