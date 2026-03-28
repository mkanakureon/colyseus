import assert from "assert";
import { PartyManager } from "../src/systems/PartyManager.ts";
import { BOSSES } from "../src/data/bosses.ts";

describe("PartyManager", () => {
  let mgr: PartyManager;

  beforeEach(() => {
    mgr = new PartyManager();
  });

  it("PARTY-01: should create party on invite and join on accept", () => {
    const invite = mgr.invite("akira", "アキラ", "misaki");
    assert.strictEqual(invite.success, true);
    assert.ok(invite.partyId);

    const response = mgr.respond("misaki", true);
    assert.strictEqual(response.success, true);
    assert.ok(response.party);
    assert.strictEqual(response.party!.members.length, 2);
    assert.ok(response.party!.members.includes("akira"));
    assert.ok(response.party!.members.includes("misaki"));
  });

  it("PARTY-02: should handle invite rejection", () => {
    mgr.invite("akira", "アキラ", "misaki");
    const response = mgr.respond("misaki", false);
    assert.strictEqual(response.success, true);
    assert.strictEqual(response.party, undefined);

    // Misaki should not be in any party
    const party = mgr.getParty("misaki");
    assert.strictEqual(party, null);
  });

  it("PARTY-03: should return all members for battle", () => {
    mgr.invite("akira", "アキラ", "misaki");
    mgr.respond("misaki", true);
    mgr.invite("akira", "アキラ", "takuya");
    mgr.respond("takuya", true);

    const members = mgr.getMembers("akira");
    assert.strictEqual(members.length, 3);
    assert.ok(members.includes("akira"));
    assert.ok(members.includes("misaki"));
    assert.ok(members.includes("takuya"));
  });

  it("PARTY-04: should disband when all leave", () => {
    mgr.invite("akira", "アキラ", "misaki");
    mgr.respond("misaki", true);

    mgr.leave("misaki");
    const result = mgr.leave("akira");
    assert.strictEqual(result.disbanded, true);

    assert.strictEqual(mgr.getParty("akira"), null);
    assert.strictEqual(mgr.getParty("misaki"), null);
  });
});

describe("BossBattle", () => {
  it("BOSS-01: should have canFlee=false", () => {
    const boss = BOSSES["boss-orc-king"];
    assert.strictEqual(boss.canFlee, false);
    assert.strictEqual(boss.isBoss, true);
  });

  it("BOSS-02: should have guaranteed drops", () => {
    const boss = BOSSES["boss-orc-king"];
    assert.ok(boss.drops.length > 0);
    assert.strictEqual(boss.drops[0].chance, 1.0); // guaranteed
  });

  it("BOSS-03: should have AOE special attack", () => {
    const golem = BOSSES["boss-golem-guardian"];
    assert.ok(golem.specialAttack);
    assert.strictEqual(golem.specialAttack!.aoe, true);
    assert.strictEqual(golem.specialAttack!.frequency, 2); // every 2 turns
    assert.ok(golem.specialAttack!.log.includes("[e:"));
  });
});
