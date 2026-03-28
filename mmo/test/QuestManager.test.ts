import assert from "assert";
import { QuestManager } from "../src/systems/QuestManager.ts";
import { defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";

describe("QuestManager", () => {
  let mgr: QuestManager;

  beforeEach(() => {
    mgr = new QuestManager();
  });

  it("QUEST-01: should accept quest and add to log", () => {
    const player = defaultPlayerData("quest-01", "test");
    const result = mgr.accept(player, "Q-001"); // forest goblin quest
    assert.strictEqual(result.success, true);
    assert.ok(player.questProgress["Q-001"]);
    assert.strictEqual(player.questProgress["Q-001"].status, "active");
  });

  it("QUEST-02: should track defeat objective", () => {
    const player = defaultPlayerData("quest-02", "test");
    mgr.accept(player, "Q-001"); // defeat 3 goblins

    const events1 = mgr.onEnemyDefeated(player, "goblin");
    assert.strictEqual(events1.length, 1);
    assert.strictEqual(events1[0].current, 1);
    assert.strictEqual(events1[0].completed, false);

    mgr.onEnemyDefeated(player, "goblin");
    const events3 = mgr.onEnemyDefeated(player, "goblin");
    assert.strictEqual(events3[0].current, 3);
    assert.strictEqual(events3[0].completed, true);
  });

  it("QUEST-03: should track collect objective via item count", () => {
    const player = defaultPlayerData("quest-03", "test");
    mgr.accept(player, "Q-002"); // collect 5 herbs

    for (let i = 0; i < 4; i++) {
      mgr.onItemCollected(player, "herb-001");
    }
    assert.strictEqual(player.questProgress["Q-002"].progress["obj_0"], 4);

    const events = mgr.onItemCollected(player, "herb-001");
    assert.strictEqual(events[0].current, 5);
    assert.strictEqual(events[0].completed, true);
  });

  it("QUEST-04: should grant rewards on report", () => {
    const player = defaultPlayerData("quest-04", "test");
    player.exp = 0;
    player.gold = 100;
    mgr.accept(player, "Q-001");

    // Complete the objective
    for (let i = 0; i < 3; i++) {
      mgr.onEnemyDefeated(player, "goblin");
    }

    const result = mgr.report(player, "Q-001");
    assert.strictEqual(result.success, true);
    assert.strictEqual(player.exp, 30);    // reward: 30 EXP
    assert.strictEqual(player.gold, 150);  // reward: 50G
    // reward: 2x potion
    const potion = player.inventory.find(i => i.itemId === "potion-001");
    assert.ok(potion);
    assert.strictEqual(potion!.quantity, 5); // default 3 + reward 2
    assert.strictEqual(player.questProgress["Q-001"].status, "completed");
  });

  it("QUEST-05: should reject duplicate acceptance", () => {
    const player = defaultPlayerData("quest-05", "test");
    mgr.accept(player, "Q-001");

    const result = mgr.accept(player, "Q-001");
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "QUEST_ALREADY_ACCEPTED");
  });
});
