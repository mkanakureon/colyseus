import assert from "assert";
import { CharacterCreator } from "../src/systems/CharacterCreator.ts";
import { InMemoryPlayerDB, defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";

describe("CharacterCreator", () => {
  let db: InMemoryPlayerDB;
  let creator: CharacterCreator;

  beforeEach(() => {
    db = new InMemoryPlayerDB();
    creator = new CharacterCreator(db);
  });

  it("CC-01: should create warrior with correct stats", async () => {
    const result = await creator.create("user-01", { name: "アキラ", classType: "warrior" });
    assert.strictEqual(result.success, true);
    assert.ok(result.playerData);
    assert.strictEqual(result.playerData!.name, "アキラ");
    assert.strictEqual(result.playerData!.classType, "warrior");
    assert.strictEqual(result.playerData!.hp, 120);
    assert.strictEqual(result.playerData!.maxHp, 120);
    assert.strictEqual(result.playerData!.atk, 15);
    assert.strictEqual(result.playerData!.def, 12);
    assert.strictEqual(result.playerData!.isCreated, true);

    // Verify saved to DB
    const saved = await db.findByUserId("user-01");
    assert.ok(saved);
    assert.strictEqual(saved!.name, "アキラ");
  });

  it("CC-02: should create mage with high MP", async () => {
    const result = await creator.create("user-02", { name: "ミサキ", classType: "mage" });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.playerData!.mp, 60);
    assert.strictEqual(result.playerData!.maxMp, 60);
    assert.strictEqual(result.playerData!.mag, 15);
    assert.strictEqual(result.playerData!.hp, 80);
  });

  it("CC-03: should skip creation for already created user", async () => {
    const existing = defaultPlayerData("user-03", "既存キャラ");
    existing.isCreated = true;
    db.seed([existing]);

    const result = await creator.create("user-03", { name: "新キャラ", classType: "thief" });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "ALREADY_CREATED");
  });

  it("CC-04: should reject empty name", async () => {
    const result = await creator.create("user-04", { name: "", classType: "warrior" });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "NAME_EMPTY");
  });
});
