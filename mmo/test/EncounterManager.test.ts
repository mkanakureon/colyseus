import assert from "assert";
import { EncounterManager } from "../src/systems/EncounterManager.ts";
import { ENEMIES } from "../src/data/encounters.ts";

describe("EncounterManager", () => {
  let mgr: EncounterManager;

  beforeEach(() => {
    mgr = new EncounterManager();
  });

  // === ENC: Explore ===

  it("ENC-01: should return battle encounter", () => {
    // rng returns 0.1 → below encounterRate 0.5 → battle
    const result = mgr.explore("zone-002-forest", () => 0.1);
    assert.strictEqual(result.type, "battle");
    if (result.type === "battle") {
      assert.ok(result.enemy.name);
      assert.ok(result.enemy.hp > 0);
    }
  });

  it("ENC-02: should return item found", () => {
    // rng returns 0.55 → above encounterRate 0.5, below 0.5+0.2=0.7 → item
    // Need second rng call for item selection → always 0
    let call = 0;
    const rng = () => { call++; return call === 1 ? 0.55 : 0; };
    const result = mgr.explore("zone-002-forest", rng);
    assert.strictEqual(result.type, "item");
    if (result.type === "item") {
      assert.strictEqual(result.itemId, "herb-001");
      assert.strictEqual(result.itemName, "薬草");
    }
  });

  it("ENC-03: should return nothing", () => {
    // rng returns 0.9 → above encounterRate+itemFindRate → nothing
    const result = mgr.explore("zone-002-forest", () => 0.9);
    assert.strictEqual(result.type, "nothing");
  });

  it("ENC-04: should reject explore in safe zone", () => {
    const result = mgr.explore("zone-001-village");
    assert.strictEqual(result.type, "error");
    if (result.type === "error") {
      assert.strictEqual(result.code, "ZONE_SAFE");
    }
  });

  it("ENC-05: should return different enemies per zone", () => {
    // Forest: goblin/bat/orc
    const forest = mgr.explore("zone-002-forest", () => 0.1);
    assert.strictEqual(forest.type, "battle");

    // Ruins: skeleton/mummy/golem
    const ruins = mgr.explore("zone-005-ruins", () => 0.1);
    assert.strictEqual(ruins.type, "battle");

    if (forest.type === "battle" && ruins.type === "battle") {
      // With rng=0.1, forest should pick goblin (weight 60), ruins should pick skeleton (weight 50)
      assert.strictEqual(forest.enemy.id, "goblin");
      assert.strictEqual(ruins.enemy.id, "skeleton");
    }
  });

  // === DROP: Drop items ===

  it("DROP-01: should roll drops on victory", () => {
    const drops = mgr.rollDrops(ENEMIES.goblin, () => 0.1); // All drops succeed (0.1 < 0.5 and 0.1 < 0.2)
    assert.ok(drops.length > 0);
    assert.strictEqual(drops[0].itemId, "herb-001");
  });

  it("DROP-02: should add drops to inventory format", () => {
    const drops = mgr.rollDrops(ENEMIES.goblin, () => 0.1);
    for (const drop of drops) {
      assert.ok(drop.itemId);
      assert.ok(drop.name);
      assert.strictEqual(drop.quantity, 1);
    }
  });

  it("DROP-03: should return no drops when unlucky", () => {
    const drops = mgr.rollDrops(ENEMIES.goblin, () => 0.99); // All misses
    assert.strictEqual(drops.length, 0);
  });
});
