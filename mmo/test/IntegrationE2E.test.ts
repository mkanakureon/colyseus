/**
 * 結合テスト: SDKClient → Colyseus Room 経由の実ゲームフロー
 *
 * 直接関数を呼ばず、すべて room.send() / room.onMessage() で通信。
 * 実際のプレイと同じメッセージフローを再現する。
 */
import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { LocalDriver, matchMaker, Server, LocalPresence } from "@colyseus/core";
import { WorldRoom } from "../src/rooms/WorldRoom.ts";
import { ChatRoom } from "../src/rooms/ChatRoom.ts";
import { BattleRoom } from "../src/rooms/BattleRoom.ts";
import { KaedevnAuthAdapter } from "../src/auth/KaedevnAuthAdapter.ts";
import { InMemoryPlayerDB } from "../src/persistence/PlayerPersistence.ts";
import { LevelSystem } from "../src/systems/LevelSystem.ts";
import { createTestToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";
import { TEST_ZONES } from "./mocks/zone-map.ts";
import { TestLogger } from "./helpers/TestLogger.ts";

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
    // 1. LOGIN → キャラ未作成通知
    // ═══════════════════════════
    log.section("1. Login");

    const sdk = new SDKClient(ENDPOINT);
    const needCreate = waitMsg<any>(undefined as any, "need_character_creation"); // will be set after join

    const world = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "player-e2e" }),
      zoneId: village.id,
      zoneName: village.name,
      npcs: village.npcs,
      adjacentZones: village.adjacentZones,
    });

    // Wait for need_character_creation
    const createNeeded = await new Promise<boolean>((resolve) => {
      world.onMessage("need_character_creation", () => resolve(true));
      world.onMessage("welcome", () => resolve(false));
      setTimeout(() => resolve(true), 1000); // default: needs creation
    });

    assert.strictEqual(createNeeded, true);
    log.player("プレイヤー", "ログイン → キャラ作成が必要");

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
    log.player("アキラ", `キャラ作成完了: 戦士 HP:${charData.hp} ATK:${charData.atk} DEF:${charData.def}`);

    // ═══════════════════════════
    // 3. NPC に話しかける
    // ═══════════════════════════
    log.section("3. NPC Dialogue");

    const dialogue = waitMsg<any>(world, "npc_dialogue");
    world.send("interact", { targetId: "npc-elder" });
    const elderMsg = await dialogue;

    assert.strictEqual(elderMsg.npcName, "長老ヨハン");
    assert.ok(elderMsg.text.includes("[e:"));
    log.player("アキラ", `長老ヨハンに話しかけた: 「${elderMsg.text.slice(0, 50)}...」`);

    // ═══════════════════════════
    // 4. ショップ
    // ═══════════════════════════
    log.section("4. Shop");

    // 商品一覧
    const shopList = waitMsg<any>(world, "shop_items");
    world.send("shop_list", { npcId: "npc-merchant" });
    const shopData = await shopList;

    assert.ok(shopData.items.length > 0);
    log.player("アキラ", `商人マリアの店: ${shopData.items.map((i: any) => `${i.name}(${i.price}G)`).join(", ")}`);

    // 木の剣を購入
    const bought = waitMsg<any>(world, "shop_bought");
    world.send("shop_buy", { npcId: "npc-merchant", itemId: "sword-wood" });
    const buyResult = await bought;

    assert.ok(buyResult.gold < 100);
    log.player("アキラ", `木の剣を購入 → 残Gold: ${buyResult.gold}G`);

    // ═══════════════════════════
    // 5. 装備
    // ═══════════════════════════
    log.section("5. Equipment");

    const equipped = waitMsg<any>(world, "equipped");
    world.send("equip", { itemId: "sword-wood" });
    const equipResult = await equipped;

    assert.strictEqual(equipResult.effectiveStats.atk, 15 + 3); // warrior base + sword bonus
    log.player("アキラ", `木の剣を装備 → 実効ATK: ${equipResult.effectiveStats.atk}`);

    // 装備解除
    const unequipped = waitMsg<any>(world, "unequipped");
    world.send("unequip", { slot: "weapon" });
    const unequipResult = await unequipped;

    assert.strictEqual(unequipResult.itemId, "sword-wood");
    assert.strictEqual(unequipResult.effectiveStats.atk, 15); // back to base
    log.player("アキラ", `木の剣を外した → 実効ATK: ${unequipResult.effectiveStats.atk}`);

    // 再装備
    const reequipped = waitMsg<any>(world, "equipped");
    world.send("equip", { itemId: "sword-wood" });
    await reequipped;
    log.player("アキラ", `木の剣を再装備`);

    // ═══════════════════════════
    // 6. クエスト受注
    // ═══════════════════════════
    log.section("6. Quest");

    const questAccepted = waitMsg<any>(world, "quest_accepted");
    world.send("quest_accept", { questId: "Q-001" }); // ゴブリン3体
    await questAccepted;
    log.player("アキラ", `クエスト「森の脅威」受注`);

    // 二重受注テスト
    const questError = waitMsg<any>(world, "error");
    world.send("quest_accept", { questId: "Q-001" });
    const dupErr = await questError;
    assert.strictEqual(dupErr.code, "QUEST_ALREADY_ACCEPTED");
    log.player("アキラ", `二重受注拒否: ${dupErr.code}`);

    // ═══════════════════════════
    // 7. ステータス確認
    // ═══════════════════════════
    log.section("7. Status Check");

    const status = waitMsg<any>(world, "player_status");
    world.send("status", {});
    const statusData = await status;

    assert.strictEqual(statusData.name, "アキラ");
    assert.strictEqual(statusData.classType, "warrior");
    log.player("アキラ", `Lv.${statusData.level} HP:${statusData.hp}/${statusData.maxHp} ATK:${statusData.atk} Gold:${statusData.gold}G`);

    // ═══════════════════════════
    // 8. インベントリ確認
    // ═══════════════════════════
    log.section("8. Inventory");

    const inv = waitMsg<any>(world, "player_inventory");
    world.send("inventory", {});
    const invData = await inv;

    assert.ok(invData.inventory.length > 0);
    log.player("アキラ", `所持品: ${invData.inventory.map((i: any) => `${i.name}x${i.quantity}`).join(", ")}`);

    // ═══════════════════════════
    // 9. 探索（安全地帯 → エラー）
    // ═══════════════════════════
    log.section("9. Explore (safe zone)");

    const exploreError = waitMsg<any>(world, "error");
    world.send("explore", {});
    const safeErr = await exploreError;
    assert.strictEqual(safeErr.code, "ZONE_SAFE");
    log.player("アキラ", `村で探索 → ${safeErr.code}（安全地帯）`);

    // ═══════════════════════════
    // 10. ゾーン移動
    // ═══════════════════════════
    log.section("10. Zone Movement");

    const zoneChange = waitMsg<any>(world, "zone_change");
    world.send("move", { direction: "north" });
    const newZone = await zoneChange;

    // village は test mock なので north → forest
    log.player("アキラ", `北へ移動 → ${newZone.zoneId}`);

    // 行けない方向
    const moveErr = waitMsg<any>(world, "error");
    world.send("move", { direction: "west" });
    const noWay = await moveErr;
    assert.strictEqual(noWay.code, "ZONE_NO_ADJACENT");
    log.player("アキラ", `西へ移動 → ${noWay.code}`);

    // ═══════════════════════════
    // 11. アイテム使用
    // ═══════════════════════════
    log.section("11. Item Usage");

    const itemUsed = waitMsg<any>(world, "item_used");
    world.send("use_item", { itemId: "potion-001" });
    const healResult = await itemUsed;

    assert.ok(healResult.log);
    log.player("アキラ", healResult.log);

    // 持ってないアイテム
    const noItem = waitMsg<any>(world, "error");
    world.send("use_item", { itemId: "ether-001" });
    const noItemErr = await noItem;
    assert.strictEqual(noItemErr.code, "ITEM_NOT_OWNED");
    log.player("アキラ", `魔力の水を使おうとした → ${noItemErr.code}`);

    // ═══════════════════════════
    // 12. チャット（別 Room）
    // ═══════════════════════════
    log.section("12. Chat");

    const sdk2 = new SDKClient(ENDPOINT);
    const chatRoom1 = await sdk.joinOrCreate("chat", {
      token: createTestToken({ userId: "player-e2e" }),
      name: "アキラ",
      zoneId: "zone-001-village",
    });
    const chatRoom2 = await sdk2.joinOrCreate("chat", {
      token: createTestToken({ userId: "player-e2e-2" }),
      name: "ミサキ",
      zoneId: "zone-001-village",
    });
    await new Promise(r => setTimeout(r, 200));

    const chatReceived = waitMsg<any>(chatRoom2, "chat_message");
    chatRoom1.send("chat", { text: "Hello!", channel: "global" });
    const chatMsg = await chatReceived;

    assert.strictEqual(chatMsg.sender, "アキラ");
    log.player("アキラ", `チャット送信: "Hello!"`);
    log.player("ミサキ", `チャット受信: ${chatMsg.sender}: ${chatMsg.text}`);

    await chatRoom1.leave();
    await chatRoom2.leave();

    // ═══════════════════════════
    // 13. 売却
    // ═══════════════════════════
    log.section("13. Sell");

    const sold = waitMsg<any>(world, "shop_sold");
    world.send("shop_sell", { itemId: "potion-001", quantity: 1 });
    const sellResult = await sold;

    log.player("アキラ", `回復薬を売却 → Gold: ${sellResult.gold}G`);

    // ═══════════════════════════
    // DONE
    // ═══════════════════════════
    log.section("Done");
    log.system("全メッセージフロー正常完了");

    await world.leave();

    const logDir = log.flush();
    console.log(`\n  Integration logs: ${logDir}\n`);
  });
});
