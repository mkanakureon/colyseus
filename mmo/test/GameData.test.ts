import assert from "assert";
import path from "path";
import { loadGameData, validateGameData, calculateLevelUpsFromTable, getQuestsByNpc } from "../src/GameData.ts";
import { fileURLToPath } from "url";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

const GAME_DIR = path.join(__dirname, "..", "games", "fantasy-rpg");

describe("GameData", () => {
  it("GD-01: should load all 11 JSON files", () => {
    const data = loadGameData(GAME_DIR);
    assert.ok(data.meta);
    assert.ok(data.classes);
    assert.ok(data.levels);
    assert.ok(data.zones);
    assert.ok(data.enemies);
    assert.ok(data.encounters);
    assert.ok(data.items);
    assert.ok(data.equipment);
    assert.ok(data.shops);
    assert.ok(data.quests);
    assert.ok(data.bosses);
  });

  it("GD-02: should have correct game metadata", () => {
    const data = loadGameData(GAME_DIR);
    assert.strictEqual(data.meta.id, "fantasy-rpg");
    assert.strictEqual(data.meta.startZone, "zone-001-village");
    assert.strictEqual(data.meta.startGold, 100);
    assert.strictEqual(data.meta.deathPenaltyRate, 0.1);
  });

  it("GD-03: should have 3 classes with growth rates", () => {
    const data = loadGameData(GAME_DIR);
    assert.strictEqual(Object.keys(data.classes).length, 3);
    assert.ok(data.classes.warrior);
    assert.ok(data.classes.mage);
    assert.ok(data.classes.thief);
    assert.strictEqual(data.classes.warrior.hp, 120);
    assert.ok(data.classes.warrior.growth.hp > 0);
  });

  it("GD-04: should have 12 zones", () => {
    const data = loadGameData(GAME_DIR);
    assert.strictEqual(data.zones.length, 12);
  });

  it("GD-05: should have level table up to Lv 10", () => {
    const data = loadGameData(GAME_DIR);
    assert.strictEqual(data.levels.length, 10);
    assert.strictEqual(data.levels[0].totalExp, 0);
    assert.strictEqual(data.levels[9].totalExp, 3850);
  });

  it("GD-06: should pass validation with no errors", () => {
    const data = loadGameData(GAME_DIR);
    const errors = validateGameData(data);
    assert.deepStrictEqual(errors, [], `Validation errors: ${errors.join(", ")}`);
  });

  it("GD-07: should detect invalid startZone", () => {
    const data = loadGameData(GAME_DIR);
    data.meta.startZone = "zone-999-nonexistent";
    const errors = validateGameData(data);
    assert.ok(errors.some(e => e.includes("startZone")));
  });

  it("GD-08: should detect missing enemy in encounters", () => {
    const data = loadGameData(GAME_DIR);
    // Add bad encounter reference
    data.encounters["zone-002-forest"].enemies.push({ enemyId: "dragon-fake", weight: 1 });
    const errors = validateGameData(data);
    assert.ok(errors.some(e => e.includes("dragon-fake")));
  });

  it("GD-09: calculateLevelUpsFromTable works", () => {
    const data = loadGameData(GAME_DIR);
    // Lv1 + 25 EXP → should reach Lv2 (needs 20)
    const gained = calculateLevelUpsFromTable(data.levels, 1, 25);
    assert.strictEqual(gained, 1);

    // Lv1 + 200 EXP → should reach Lv4 (needs 170)
    const gained2 = calculateLevelUpsFromTable(data.levels, 1, 200);
    assert.strictEqual(gained2, 3);

    // Lv1 + 10 EXP → no level up
    const gained3 = calculateLevelUpsFromTable(data.levels, 1, 10);
    assert.strictEqual(gained3, 0);
  });

  it("GD-10: getQuestsByNpc works", () => {
    const data = loadGameData(GAME_DIR);
    const elderQuests = getQuestsByNpc(data.quests, "npc-elder");
    assert.ok(elderQuests.length >= 2); // Q-001, Q-003
    const traderQuests = getQuestsByNpc(data.quests, "npc-trader");
    assert.ok(traderQuests.length >= 1);
  });

  it("GD-11: zones have isSafe flag matching encounters", () => {
    const data = loadGameData(GAME_DIR);
    // Village should be safe
    const village = data.zones.find(z => z.id === "zone-001-village")!;
    assert.strictEqual(village.isSafe, true);
    // Forest should be dangerous
    const forest = data.zones.find(z => z.id === "zone-002-forest")!;
    assert.strictEqual(forest.isSafe, false);
  });

  it("GD-12: NPCs have shop and quest references", () => {
    const data = loadGameData(GAME_DIR);
    const village = data.zones.find(z => z.id === "zone-001-village")!;
    const merchant = village.npcs.find(n => n.id === "npc-merchant")!;
    assert.strictEqual(merchant.shop, "npc-merchant"); // has shop
    const elder = village.npcs.find(n => n.id === "npc-elder")!;
    assert.ok(elder.quests!.length >= 2); // has quests
  });
});
