import assert from "assert";
import { ShopManager } from "../src/systems/ShopManager.ts";
import { EquipmentManager } from "../src/systems/EquipmentManager.ts";
import { defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";
import { loadGameData } from "../src/GameData.ts";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));
const gameData = loadGameData(path.join(__dirname, "..", "games", "fantasy-rpg"));

describe("ShopManager", () => {
  let shop: ShopManager;

  beforeEach(() => {
    shop = new ShopManager(gameData);
  });

  it("SHOP-01: should return shop item list", () => {
    const items = shop.getShopItems("npc-merchant");
    assert.ok(items);
    assert.ok(items!.length > 0);
    const potion = items!.find(i => i.id === "potion-001");
    assert.ok(potion);
    assert.strictEqual(potion!.price, 20);
  });

  it("SHOP-02: should buy item and deduct gold", () => {
    const player = defaultPlayerData("shop-02", "test");
    player.gold = 200;

    const result = shop.buy(player, "npc-merchant", "potion-001", 2);
    assert.strictEqual(result.success, true);
    assert.strictEqual(player.gold, 160); // 200 - 20*2
    const potion = player.inventory.find(i => i.itemId === "potion-001");
    assert.ok(potion);
    assert.strictEqual(potion!.quantity, 5); // default 3 + bought 2
  });

  it("SHOP-03: should reject when gold insufficient", () => {
    const player = defaultPlayerData("shop-03", "test");
    player.gold = 10;

    const result = shop.buy(player, "npc-merchant", "sword-wood"); // 50G
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "INSUFFICIENT_GOLD");
  });

  it("SHOP-04: should sell item and gain gold", () => {
    const player = defaultPlayerData("shop-04", "test");
    player.gold = 100;
    player.inventory = [{ itemId: "herb-001", name: "薬草", quantity: 5, type: "material" }];

    const result = shop.sell(player, "herb-001", 3);
    assert.strictEqual(result.success, true);
    assert.strictEqual(player.gold, 106); // 100 + 2*3
    assert.strictEqual(player.inventory[0].quantity, 2);
  });

  it("SHOP-05: should reject buying item not in shop", () => {
    const player = defaultPlayerData("shop-05", "test");
    player.gold = 9999;

    const result = shop.buy(player, "npc-merchant", "sword-steel"); // not in village shop
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "ITEM_NOT_IN_SHOP");
  });
});

describe("EquipmentManager", () => {
  let equip: EquipmentManager;

  beforeEach(() => {
    equip = new EquipmentManager(gameData);
  });

  it("EQUIP-01: should equip weapon and add ATK bonus", () => {
    const player = defaultPlayerData("equip-01", "test");
    player.atk = 15; player.def = 12; player.mag = 3; player.spd = 8;
    player.inventory = [{ itemId: "sword-iron", name: "鉄の剣", quantity: 1, type: "equipment" }];

    const result = equip.equip(player, "sword-iron");
    assert.strictEqual(result.success, true);
    assert.strictEqual(player.equipment.weapon, "sword-iron");

    const stats = equip.getEffectiveStats(player);
    assert.strictEqual(stats.atk, 23); // 15 + 8
  });

  it("EQUIP-02: should unequip and remove bonus", () => {
    const player = defaultPlayerData("equip-02", "test");
    player.atk = 15; player.def = 12; player.mag = 3; player.spd = 8;
    player.equipment = { weapon: "sword-iron", armor: null, accessory: null };
    player.inventory = [];

    equip.unequip(player, "weapon");
    assert.strictEqual(player.equipment.weapon, null);
    // Item returned to inventory
    const inv = player.inventory.find(i => i.itemId === "sword-iron");
    assert.ok(inv);

    const stats = equip.getEffectiveStats(player);
    assert.strictEqual(stats.atk, 15); // base only
  });

  it("EQUIP-03: should swap equipment and return old to inventory", () => {
    const player = defaultPlayerData("equip-03", "test");
    player.atk = 15; player.def = 12; player.mag = 3; player.spd = 8;
    player.equipment = { weapon: "sword-wood", armor: null, accessory: null };
    player.inventory = [{ itemId: "sword-iron", name: "鉄の剣", quantity: 1, type: "equipment" }];

    const result = equip.equip(player, "sword-iron");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.unequipped, "sword-wood");
    assert.strictEqual(player.equipment.weapon, "sword-iron");

    // Old weapon returned to inventory
    const oldWeapon = player.inventory.find(i => i.itemId === "sword-wood");
    assert.ok(oldWeapon);
  });

  it("EQUIP-04: should reflect equipment in effective stats", () => {
    const player = defaultPlayerData("equip-04", "test");
    player.atk = 10; player.def = 5; player.mag = 3; player.spd = 8;
    player.equipment = { weapon: "sword-iron", armor: "armor-chain", accessory: "shield-silver" };

    const stats = equip.getEffectiveStats(player);
    // sword-iron: atk+8, armor-chain: def+8 spd-1, shield-silver: def+5 mag+2
    assert.strictEqual(stats.atk, 18);  // 10 + 8
    assert.strictEqual(stats.def, 18);  // 5 + 8 + 5
    assert.strictEqual(stats.mag, 5);   // 3 + 2
    assert.strictEqual(stats.spd, 7);   // 8 - 1
  });
});
