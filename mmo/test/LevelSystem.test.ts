import assert from "assert";
import { LevelSystem } from "../src/systems/LevelSystem.ts";
import { defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";

describe("LevelSystem", () => {
  let levelSystem: LevelSystem;

  beforeEach(() => {
    levelSystem = new LevelSystem();
  });

  it("LV-01: should level up when EXP exceeds threshold", () => {
    const player = defaultPlayerData("lv-01", "test");
    player.isCreated = true;
    player.classType = "warrior";
    player.level = 1;
    player.exp = 0;
    player.hp = 120; player.maxHp = 120;
    player.mp = 20; player.maxMp = 20;
    player.atk = 15; player.def = 12; player.mag = 3; player.spd = 8;

    const result = levelSystem.addExp(player, 25); // Need 20 for Lv 2
    assert.ok(result);
    assert.strictEqual(result!.levelsGained, 1);
    assert.strictEqual(result!.newLevel, 2);
    assert.strictEqual(player.level, 2);
    assert.strictEqual(player.exp, 25);
  });

  it("LV-02: should apply warrior growth on level up", () => {
    const player = defaultPlayerData("lv-02", "test");
    player.isCreated = true;
    player.classType = "warrior";
    player.level = 1;
    player.exp = 0;
    player.maxHp = 120; player.hp = 120;
    player.maxMp = 20; player.mp = 20;
    player.atk = 15; player.def = 12; player.mag = 3; player.spd = 8;

    const result = levelSystem.addExp(player, 20);
    assert.ok(result);
    // Warrior growth: hp+12, mp+2, atk+3, def+2, mag+0, spd+1
    assert.strictEqual(result!.statChanges.hp, 12);
    assert.strictEqual(result!.statChanges.atk, 3);
    assert.strictEqual(player.maxHp, 132); // 120 + 12
    assert.strictEqual(player.hp, 132);     // Full heal
    assert.strictEqual(player.atk, 18);    // 15 + 3
    assert.strictEqual(player.def, 14);    // 12 + 2
  });

  it("LV-03: should not level up when EXP is below threshold", () => {
    const player = defaultPlayerData("lv-03", "test");
    player.isCreated = true;
    player.classType = "warrior";
    player.level = 1;
    player.exp = 0;

    const result = levelSystem.addExp(player, 10); // Need 20 for Lv 2
    assert.strictEqual(result, null);
    assert.strictEqual(player.level, 1);
    assert.strictEqual(player.exp, 10);
  });

  it("LV-04: should handle multi-level up with large EXP", () => {
    const player = defaultPlayerData("lv-04", "test");
    player.isCreated = true;
    player.classType = "mage";
    player.level = 1;
    player.exp = 0;
    player.maxHp = 80; player.hp = 80;
    player.maxMp = 60; player.mp = 60;
    player.atk = 5; player.def = 5; player.mag = 15; player.spd = 10;

    const result = levelSystem.addExp(player, 200); // Lv1→Lv4 (need 170)
    assert.ok(result);
    assert.strictEqual(result!.levelsGained, 3); // 1→2→3→4
    assert.strictEqual(result!.newLevel, 4);
    assert.strictEqual(player.level, 4);
    // Mage growth x3: hp+15, mp+24, atk+3, def+3, mag+9, spd+3
    assert.strictEqual(player.maxHp, 95);  // 80 + 15
    assert.strictEqual(player.maxMp, 84);  // 60 + 24
    assert.strictEqual(player.mag, 24);    // 15 + 9
  });
});
