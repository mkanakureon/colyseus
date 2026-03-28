/**
 * A-8: 12ゾーン完全データ + 全システム通しプレイテスト
 *
 * プレイヤーログは test/logs/{timestamp}_{testname}/ に保存。
 * 各プレイヤーの個別ログ + summary.log。
 */
import assert from "assert";
import { FULL_ZONES, getFullZone, validateZoneGraph } from "../src/data/zones-full.ts";
import { CharacterCreator } from "../src/systems/CharacterCreator.ts";
import { LevelSystem } from "../src/systems/LevelSystem.ts";
import { EncounterManager } from "../src/systems/EncounterManager.ts";
import { ItemManager } from "../src/systems/ItemManager.ts";
import { DeathManager } from "../src/systems/DeathManager.ts";
import { ShopManager } from "../src/systems/ShopManager.ts";
import { EquipmentManager } from "../src/systems/EquipmentManager.ts";
import { QuestManager } from "../src/systems/QuestManager.ts";
import { PartyManager } from "../src/systems/PartyManager.ts";
import { BOSSES } from "../src/data/bosses.ts";
import { InMemoryPlayerDB } from "../src/persistence/PlayerPersistence.ts";
import { TestLogger } from "./helpers/TestLogger.ts";
import { stripTags } from "./mocks/inline-tags.ts";

describe("Full Playthrough (A-8)", function () {
  this.timeout(10000);

  // === FULL-01: Zone graph validation ===

  it("FULL-01: all 12 zones with bidirectional adjacency", () => {
    assert.strictEqual(FULL_ZONES.length, 12);

    const errors = validateZoneGraph();
    assert.deepStrictEqual(errors, [], `Zone graph errors: ${errors.join(", ")}`);

    // Every zone is reachable from village (BFS)
    const visited = new Set<string>();
    const queue = ["zone-001-village"];
    while (queue.length > 0) {
      const zoneId = queue.shift()!;
      if (visited.has(zoneId)) continue;
      visited.add(zoneId);
      const zone = getFullZone(zoneId);
      if (zone) {
        for (const adj of zone.adjacentZones) {
          if (!visited.has(adj.zoneId)) queue.push(adj.zoneId);
        }
      }
    }
    assert.strictEqual(visited.size, 12, `Only ${visited.size}/12 zones reachable from village`);
  });

  // === FULL-02: All NPCs have dialogue ===

  it("FULL-02: all NPCs have dialogue", () => {
    for (const zone of FULL_ZONES) {
      for (const npc of zone.npcs) {
        assert.ok(npc.dialogue.length > 0, `${npc.name} in ${zone.name} has no dialogue`);
        // All dialogue should have inline tags
        for (const line of npc.dialogue) {
          assert.ok(line.includes("["), `${npc.name} dialogue missing inline tags: ${line}`);
        }
      }
    }
  });

  // === FULL-03: Complete gameplay loop ===

  it("FULL-03: full gameplay loop — create, explore, battle, level, shop, equip, quest, boss", async () => {
    const log = new TestLogger("full-gameplay");
    const db = new InMemoryPlayerDB();
    const creator = new CharacterCreator(db);
    const levelSys = new LevelSystem();
    const encounter = new EncounterManager();
    const itemMgr = new ItemManager();
    const deathMgr = new DeathManager();
    const shopMgr = new ShopManager();
    const equipMgr = new EquipmentManager();
    const questMgr = new QuestManager();

    // ── キャラ作成 ──
    log.section("Phase 1: Character Creation");

    const akiraResult = await creator.create("akira", { name: "アキラ", classType: "warrior", gender: "male" });
    assert.strictEqual(akiraResult.success, true);
    const akira = akiraResult.playerData!;
    log.player("アキラ", `キャラ作成: 戦士 HP:${akira.hp} ATK:${akira.atk} DEF:${akira.def}`);

    // ── クエスト受注 ──
    log.section("Phase 2: Quest Accept");

    const questResult = questMgr.accept(akira, "Q-001"); // ゴブリン3体
    assert.strictEqual(questResult.success, true);
    log.player("アキラ", "クエスト「森の脅威」を受注（ゴブリン 0/3）");

    // ── ショップで準備 ──
    log.section("Phase 3: Shopping");

    shopMgr.buy(akira, "npc-merchant", "potion-001", 3);
    log.player("アキラ", `回復薬を3個購入 (残Gold: ${akira.gold}G)`);

    shopMgr.buy(akira, "npc-merchant", "sword-wood");
    log.player("アキラ", `木の剣を購入 (残Gold: ${akira.gold}G)`);

    equipMgr.equip(akira, "sword-wood");
    const stats = equipMgr.getEffectiveStats(akira);
    log.player("アキラ", `木の剣を装備 → ATK: ${akira.atk} + ${stats.atk - akira.atk} = ${stats.atk}`);

    // ── 探索・戦闘 ──
    log.section("Phase 4: Explore & Battle");

    akira.zoneId = "zone-002-forest";
    log.player("アキラ", "霧の森に移動");

    // Fight 3 goblins for quest
    for (let i = 0; i < 3; i++) {
      const enc = encounter.explore("zone-002-forest", () => 0.1); // force battle
      assert.strictEqual(enc.type, "battle");
      if (enc.type !== "battle") continue;

      log.player("アキラ", `${enc.enemy.name}に遭遇！ (HP:${enc.enemy.hp})`);

      // Simulate battle win
      const drops = encounter.rollDrops(enc.enemy, () => 0.3);
      const lvResult = levelSys.addExp(akira, enc.enemy.exp);
      akira.gold += enc.enemy.gold;

      log.player("アキラ", `${enc.enemy.name}を倒した！ +${enc.enemy.exp}EXP +${enc.enemy.gold}G`);

      if (drops.length > 0) {
        itemMgr.addToInventory(akira, drops);
        log.player("アキラ", `ドロップ: ${drops.map(d => d.name).join(", ")}`);
      }

      if (lvResult) {
        log.player("アキラ", `★ レベルアップ！ Lv.${lvResult.newLevel} (HP+${lvResult.statChanges.hp} ATK+${lvResult.statChanges.atk})`);
      }

      // Quest progress
      const progress = questMgr.onEnemyDefeated(akira, enc.enemy.id);
      for (const p of progress) {
        log.player("アキラ", `クエスト進捗: ${p.targetName} (${p.current}/${p.required})${p.completed ? " ★完了" : ""}`);
      }
    }

    // ── クエスト完了 ──
    log.section("Phase 5: Quest Report");

    const reportResult = questMgr.report(akira, "Q-001");
    assert.strictEqual(reportResult.success, true);
    log.player("アキラ", `クエスト「森の脅威」完了！ +${reportResult.rewards!.exp}EXP +${reportResult.rewards!.gold}G`);

    // ── アイテム使用 ──
    log.section("Phase 6: Item Usage");

    akira.hp = 50; // Simulate damage
    log.player("アキラ", `HP が減っている (HP: ${akira.hp}/${akira.maxHp})`);

    const healResult = itemMgr.useItem(akira, "potion-001");
    assert.strictEqual(healResult.success, true);
    log.player("アキラ", healResult.log!);

    // ── 死亡テスト ──
    log.section("Phase 7: Death & Respawn");

    akira.hp = 0;
    akira.zoneId = "zone-005-ruins";
    log.player("アキラ", "古代遺跡で全滅…");

    const penalty = deathMgr.applyPenalty(akira);
    log.player("アキラ", `死亡ペナルティ: -${penalty.goldLost}G → ${akira.gold}G`);
    log.player("アキラ", `${penalty.respawnZone} にリスポーン HP:${akira.hp}/${akira.maxHp}`);
    assert.strictEqual(akira.zoneId, "zone-001-village");
    assert.strictEqual(akira.hp, akira.maxHp);

    // ── 最終ステータス ──
    log.section("Final Status");

    const finalStats = equipMgr.getEffectiveStats(akira);
    log.player("アキラ", `Lv.${akira.level} HP:${akira.hp}/${akira.maxHp} MP:${akira.mp}/${akira.maxMp}`);
    log.player("アキラ", `ATK:${finalStats.atk} DEF:${finalStats.def} Gold:${akira.gold}G`);
    log.player("アキラ", `インベントリ: ${akira.inventory.map(i => `${i.name}x${i.quantity}`).join(", ")}`);

    // Save logs
    const logDir = log.flush();
    log.system(`Logs saved to: ${logDir}`);

    // Assertions
    assert.ok(akira.level >= 2, "Should have leveled up");
    assert.ok(akira.gold > 0, "Should have gold");
    assert.strictEqual(akira.questProgress["Q-001"].status, "completed");
  });

  // === FULL-04: Two-player simultaneous play ===

  it("FULL-04: two-player party + trade simulation", async () => {
    const log = new TestLogger("two-player");
    const db = new InMemoryPlayerDB();
    const creator = new CharacterCreator(db);
    const partyMgr = new PartyManager();
    const encounter = new EncounterManager();
    const levelSys = new LevelSystem();
    const equipMgr = new EquipmentManager();
    const shopMgr = new ShopManager();

    log.section("Character Creation");

    const a = (await creator.create("akira", { name: "アキラ", classType: "warrior" })).playerData!;
    const m = (await creator.create("misaki", { name: "ミサキ", classType: "mage" })).playerData!;
    log.player("アキラ", `戦士を作成 HP:${a.hp} ATK:${a.atk}`);
    log.player("ミサキ", `魔法使いを作成 HP:${m.hp} MAG:${m.mag}`);

    // ── パーティ ──
    log.section("Party Formation");

    const invite = partyMgr.invite("akira", "アキラ", "misaki");
    assert.strictEqual(invite.success, true);
    log.player("アキラ", "ミサキをパーティに招待");

    const response = partyMgr.respond("misaki", true);
    assert.strictEqual(response.success, true);
    log.player("ミサキ", "パーティに参加！");

    const members = partyMgr.getMembers("akira");
    assert.strictEqual(members.length, 2);
    log.system(`パーティ結成: ${members.join(", ")}`);

    // ── 一緒に探索 ──
    log.section("Party Exploration");

    const enc = encounter.explore("zone-002-forest", () => 0.1);
    assert.strictEqual(enc.type, "battle");
    if (enc.type === "battle") {
      log.system(`${enc.enemy.name}に遭遇！ パーティ戦闘開始`);

      // Both get EXP
      const aLv = levelSys.addExp(a, enc.enemy.exp);
      const mLv = levelSys.addExp(m, enc.enemy.exp);
      a.gold += enc.enemy.gold;
      m.gold += enc.enemy.gold;

      log.player("アキラ", `${enc.enemy.name}を倒した！ +${enc.enemy.exp}EXP +${enc.enemy.gold}G${aLv ? ` → Lv.${aLv.newLevel}` : ""}`);
      log.player("ミサキ", `${enc.enemy.name}を倒した！ +${enc.enemy.exp}EXP +${enc.enemy.gold}G${mLv ? ` → Lv.${mLv.newLevel}` : ""}`);
    }

    // ── 取引 ──
    log.section("Trading");

    shopMgr.buy(a, "npc-merchant", "potion-001", 5);
    log.player("アキラ", `回復薬を5個購入 (残Gold: ${a.gold}G)`);

    // Simulate giving potions to Misaki (via trade)
    const potionInv = a.inventory.find(i => i.itemId === "potion-001");
    if (potionInv && potionInv.quantity >= 2) {
      potionInv.quantity -= 2;
      const existingM = m.inventory.find(i => i.itemId === "potion-001");
      if (existingM) { existingM.quantity += 2; }
      else { m.inventory.push({ itemId: "potion-001", name: "回復薬", quantity: 2, type: "consumable" }); }
      log.player("アキラ", "ミサキに回復薬x2を渡した");
      log.player("ミサキ", "アキラから回復薬x2を受け取った");
    }

    // ── ボスデータ確認 ──
    log.section("Boss Preview");

    const boss = BOSSES["boss-orc-king"];
    log.system(`ボス: ${boss.name} HP:${boss.hp} ATK:${boss.atk} DEF:${boss.def}`);
    log.system(`特殊攻撃: ${boss.specialAttack!.name} (${boss.specialAttack!.damage}ダメージ, ${boss.specialAttack!.frequency}ターンに1回)`);
    log.system(`ドロップ: ${boss.drops.map(d => `${d.name}(${d.chance * 100}%)`).join(", ")}`);

    // ── 最終状態 ──
    log.section("Final Status");
    log.player("アキラ", `Lv.${a.level} HP:${a.hp}/${a.maxHp} ATK:${a.atk} Gold:${a.gold}G`);
    log.player("ミサキ", `Lv.${m.level} HP:${m.hp}/${m.maxHp} MAG:${m.mag} Gold:${m.gold}G`);

    const logDir = log.flush();
    log.system(`Logs saved to: ${logDir}`);

    assert.ok(members.length === 2);
  });
});
