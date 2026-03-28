import assert from "assert";
import { ItemManager } from "../src/systems/ItemManager.ts";
import { DeathManager } from "../src/systems/DeathManager.ts";
import { defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";
import { loadGameData } from "../src/GameData.ts";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));
const gameData = loadGameData(path.join(__dirname, "..", "games", "fantasy-rpg"));

describe("ItemManager", () => {
  let mgr: ItemManager;

  beforeEach(() => {
    mgr = new ItemManager(gameData);
  });

  it("ITEM-01: should heal HP with potion", () => {
    const player = defaultPlayerData("item-01", "test");
    player.hp = 50; player.maxHp = 120; player.maxMp = 20;
    player.inventory = [{ itemId: "potion-001", name: "回復薬", quantity: 3, type: "consumable" }];

    const result = mgr.useItem(player, "potion-001");
    assert.strictEqual(result.success, true);
    assert.strictEqual(player.hp, 100); // 50 + 50
    assert.strictEqual(player.inventory[0].quantity, 2);
    assert.ok(result.log!.includes("回復"));
  });

  it("ITEM-02: should consume item (turn cost verified by caller)", () => {
    const player = defaultPlayerData("item-02", "test");
    player.hp = 50; player.maxHp = 120; player.maxMp = 20;
    player.inventory = [{ itemId: "potion-001", name: "回復薬", quantity: 1, type: "consumable" }];

    const result = mgr.useItem(player, "potion-001");
    assert.strictEqual(result.success, true);
    // Item removed from inventory when quantity reaches 0
    assert.strictEqual(player.inventory.length, 0);
  });

  it("ITEM-03: should reject when item not owned", () => {
    const player = defaultPlayerData("item-03", "test");
    player.inventory = [];
    player.maxMp = 20;

    const result = mgr.useItem(player, "potion-001");
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "ITEM_NOT_OWNED");
  });

  it("ITEM-04: should cap HP at maxHp", () => {
    const player = defaultPlayerData("item-04", "test");
    player.hp = 100; player.maxHp = 120; player.maxMp = 20;
    player.inventory = [{ itemId: "potion-001", name: "回復薬", quantity: 1, type: "consumable" }];

    mgr.useItem(player, "potion-001");
    assert.strictEqual(player.hp, 120); // Capped at maxHp, not 150
  });
});

describe("DeathManager", () => {
  let mgr: DeathManager;

  beforeEach(() => {
    mgr = new DeathManager(gameData);
  });

  it("DEATH-01: should lose 10% gold on death", () => {
    const player = defaultPlayerData("death-01", "test");
    player.gold = 200; player.maxHp = 100; player.maxMp = 50;

    const penalty = mgr.applyPenalty(player);
    assert.strictEqual(penalty.goldLost, 20); // 200 * 0.1
    assert.strictEqual(player.gold, 180);
  });

  it("DEATH-02: should respawn at village", () => {
    const player = defaultPlayerData("death-02", "test");
    player.zoneId = "zone-002-forest";
    player.maxHp = 100; player.maxMp = 50;

    const penalty = mgr.applyPenalty(player);
    assert.strictEqual(player.zoneId, "zone-001-village");
    assert.strictEqual(penalty.respawnZone, "zone-001-village");
  });

  it("DEATH-03: should fully restore HP/MP on death", () => {
    const player = defaultPlayerData("death-03", "test");
    player.hp = 0; player.mp = 0;
    player.maxHp = 120; player.maxMp = 60;

    mgr.applyPenalty(player);
    assert.strictEqual(player.hp, 120);
    assert.strictEqual(player.mp, 60);
  });
});
