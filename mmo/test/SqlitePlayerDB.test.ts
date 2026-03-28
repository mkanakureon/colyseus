import assert from "assert";
import fs from "fs";
import { SqlitePlayerDB } from "../src/persistence/SqlitePlayerDB.ts";
import { defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";

const TEST_DB = "/tmp/mmo-test.db";

describe("SqlitePlayerDB", () => {
  let db: SqlitePlayerDB;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = new SqlitePlayerDB(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("SQLITE-01: save and find player", async () => {
    const player = defaultPlayerData("user-01", "アキラ");
    player.isCreated = true;
    player.level = 5;
    player.hp = 80;

    await db.save(player);
    const loaded = await db.findByUserId("user-01");

    assert.ok(loaded);
    assert.strictEqual(loaded!.name, "アキラ");
    assert.strictEqual(loaded!.level, 5);
    assert.strictEqual(loaded!.hp, 80);
    assert.strictEqual(loaded!.isCreated, true);
  });

  it("SQLITE-02: update existing player", async () => {
    const player = defaultPlayerData("user-02", "ミサキ");
    await db.save(player);

    player.level = 10;
    player.gold = 999;
    await db.save(player);

    const loaded = await db.findByUserId("user-02");
    assert.strictEqual(loaded!.level, 10);
    assert.strictEqual(loaded!.gold, 999);
  });

  it("SQLITE-03: delete player", async () => {
    const player = defaultPlayerData("user-03", "test");
    await db.save(player);
    await db.delete("user-03");

    const loaded = await db.findByUserId("user-03");
    assert.strictEqual(loaded, null);
  });

  it("SQLITE-04: findByUserId returns null for unknown", async () => {
    const loaded = await db.findByUserId("nonexistent");
    assert.strictEqual(loaded, null);
  });

  it("SQLITE-05: seed multiple players", () => {
    const players = [
      defaultPlayerData("a", "A"),
      defaultPlayerData("b", "B"),
      defaultPlayerData("c", "C"),
    ];
    db.seed(players);
    assert.strictEqual(db.count(), 3);
  });

  it("SQLITE-06: clear removes all", () => {
    db.seed([defaultPlayerData("x", "X")]);
    db.clear();
    assert.strictEqual(db.count(), 0);
  });

  it("SQLITE-07: listAll returns all players", () => {
    db.seed([
      defaultPlayerData("a", "A"),
      defaultPlayerData("b", "B"),
    ]);
    const all = db.listAll();
    assert.strictEqual(all.length, 2);
  });

  it("SQLITE-08: preserves complex data (inventory, equipment, quests, npcMemories)", async () => {
    const player = defaultPlayerData("user-08", "complex");
    player.inventory = [
      { itemId: "sword-iron", name: "鉄の剣", quantity: 1, type: "equipment" },
      { itemId: "potion-001", name: "回復薬", quantity: 5, type: "consumable" },
    ];
    player.equipment = { weapon: "sword-iron", armor: null, accessory: null };
    player.questProgress = {
      "Q-001": { questId: "Q-001", status: "active", progress: { obj_0: 2 } },
    };
    player.npcMemories = {
      "npc-elder": { npcId: "npc-elder", relationScore: 15, playedConversationIds: ["elder_daily_1"], lastPlayedAt: 123, interactionCount: 3 },
    };

    await db.save(player);
    const loaded = await db.findByUserId("user-08");

    assert.strictEqual(loaded!.inventory.length, 2);
    assert.strictEqual(loaded!.inventory[0].itemId, "sword-iron");
    assert.strictEqual(loaded!.equipment.weapon, "sword-iron");
    assert.strictEqual(loaded!.questProgress["Q-001"].status, "active");
    assert.strictEqual(loaded!.questProgress["Q-001"].progress.obj_0, 2);
    assert.strictEqual(loaded!.npcMemories["npc-elder"].relationScore, 15);
    assert.strictEqual(loaded!.npcMemories["npc-elder"].interactionCount, 3);
  });

  it("SQLITE-09: data persists after close and reopen", async () => {
    const player = defaultPlayerData("persist", "永続");
    player.level = 7;
    await db.save(player);
    db.close();

    // Reopen
    const db2 = new SqlitePlayerDB(TEST_DB);
    const loaded = await db2.findByUserId("persist");
    assert.ok(loaded);
    assert.strictEqual(loaded!.name, "永続");
    assert.strictEqual(loaded!.level, 7);
    db2.close();
  });
});
