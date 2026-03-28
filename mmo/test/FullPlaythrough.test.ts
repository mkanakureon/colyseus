/**
 * A-8: 全機能フルプレイスルーテスト
 *
 * アキラ（戦士）とミサキ（魔法使い）が全システムを使って冒険する。
 * プレイヤーログは test/logs/{timestamp}_{testname}/ に保存。
 */
import assert from "assert";
import { CharacterCreator } from "../src/systems/CharacterCreator.ts";
import { LevelSystem } from "../src/systems/LevelSystem.ts";
import { EncounterManager } from "../src/systems/EncounterManager.ts";
import { ItemManager } from "../src/systems/ItemManager.ts";
import { DeathManager } from "../src/systems/DeathManager.ts";
import { ShopManager } from "../src/systems/ShopManager.ts";
import { EquipmentManager } from "../src/systems/EquipmentManager.ts";
import { QuestManager } from "../src/systems/QuestManager.ts";
import { PartyManager } from "../src/systems/PartyManager.ts";
import { InMemoryPlayerDB, type PlayerData } from "../src/persistence/PlayerPersistence.ts";
import { TestLogger } from "./helpers/TestLogger.ts";
import { parseInlineText, stripTags, extractDirectives } from "./mocks/inline-tags.ts";
import { loadGameData } from "../src/GameData.ts";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));
const gameData = loadGameData(path.join(__dirname, "..", "games", "fantasy-rpg"));
const { zones: FULL_ZONES, bosses: BOSSES, enemies: ENEMIES } = gameData;

function getFullZone(id: string) {
  return FULL_ZONES.find((z: any) => z.id === id) ?? undefined;
}

function validateZoneGraph(): string[] {
  const errors: string[] = [];
  const opposites: Record<string, string> = { north: "south", south: "north", east: "west", west: "east" };
  for (const zone of FULL_ZONES) {
    for (const adj of zone.adjacentZones) {
      const target = FULL_ZONES.find((z: any) => z.id === adj.zoneId);
      if (!target) {
        errors.push(`${zone.id}: adjacent ${adj.zoneId} does not exist`);
        continue;
      }
      const back = target.adjacentZones.find((a: any) => a.zoneId === zone.id && a.direction === opposites[adj.direction]);
      if (!back) {
        errors.push(`${zone.id} → ${adj.direction} → ${adj.zoneId}: no reverse link`);
      }
    }
  }
  return errors;
}

describe("Full Playthrough (A-8)", function () {
  this.timeout(10000);

  it("FULL-01: all 12 zones with bidirectional adjacency", () => {
    assert.strictEqual(FULL_ZONES.length, 12);
    const errors = validateZoneGraph();
    assert.deepStrictEqual(errors, [], `Zone graph errors: ${errors.join(", ")}`);

    // BFS reachability
    const visited = new Set<string>();
    const queue = ["zone-001-village"];
    while (queue.length > 0) {
      const zoneId = queue.shift()!;
      if (visited.has(zoneId)) continue;
      visited.add(zoneId);
      const zone = getFullZone(zoneId);
      if (zone) for (const adj of zone.adjacentZones) if (!visited.has(adj.zoneId)) queue.push(adj.zoneId);
    }
    assert.strictEqual(visited.size, 12, `Only ${visited.size}/12 zones reachable`);
  });

  it("FULL-02: all NPCs have inline-tagged dialogue", () => {
    for (const zone of FULL_ZONES) {
      for (const npc of zone.npcs) {
        assert.ok(npc.dialogue.length > 0, `${npc.name} in ${zone.name} has no dialogue`);
        for (const line of npc.dialogue) {
          assert.ok(line.includes("["), `${npc.name} dialogue missing inline tags`);
        }
      }
    }
  });

  it("FULL-03: complete adventure — two players, all systems, 12 zones", async () => {
    const log = new TestLogger("full-adventure");
    const db = new InMemoryPlayerDB();
    const creator = new CharacterCreator(db, gameData);
    const levelSys = new LevelSystem(gameData);
    const encounter = new EncounterManager(gameData);
    const itemMgr = new ItemManager(gameData);
    const deathMgr = new DeathManager(gameData);
    const shopMgr = new ShopManager(gameData);
    const equipMgr = new EquipmentManager(gameData);
    const questMgr = new QuestManager(gameData);
    const partyMgr = new PartyManager();

    // ════════════════════════════════════
    // CHAPTER 1: キャラクター作成
    // ════════════════════════════════════
    log.section("Chapter 1: Character Creation");

    const akiraRes = await creator.create("akira", { name: "アキラ", classType: "warrior", gender: "male" });
    assert.strictEqual(akiraRes.success, true);
    const akira = akiraRes.playerData!;
    log.player("アキラ", `戦士として目覚めた！ HP:${akira.hp}/${akira.maxHp} MP:${akira.mp}/${akira.maxMp} ATK:${akira.atk} DEF:${akira.def} SPD:${akira.spd}`);

    const misakiRes = await creator.create("misaki", { name: "ミサキ", classType: "mage", gender: "female" });
    assert.strictEqual(misakiRes.success, true);
    const misaki = misakiRes.playerData!;
    log.player("ミサキ", `魔法使いとして目覚めた！ HP:${misaki.hp}/${misaki.maxHp} MP:${misaki.mp}/${misaki.maxMp} MAG:${misaki.mag} SPD:${misaki.spd}`);

    // 重複作成テスト
    const dupRes = await creator.create("akira", { name: "ニセモノ", classType: "thief" });
    assert.strictEqual(dupRes.success, false);
    log.system("アキラの二重作成を拒否（ALREADY_CREATED）");

    // ════════════════════════════════════
    // CHAPTER 2: はじまりの村 — NPC会話 + ショップ
    // ════════════════════════════════════
    log.section("Chapter 2: Starting Village");

    const village = getFullZone("zone-001-village")!;
    akira.zoneId = village.id;
    misaki.zoneId = village.id;
    log.player("アキラ", `${village.name}にいる。${village.description}`);
    log.player("ミサキ", `${village.name}にいる。`);

    // NPC 会話 — 長老ヨハン（インラインタグ解析）
    const elder = village.npcs.find(n => n.id === "npc-elder")!;
    const elderLine = elder.dialogue[0];
    const segments = parseInlineText(elderLine);
    const directives = extractDirectives(elderLine);
    const plainText = stripTags(elderLine);
    log.player("アキラ", `長老ヨハンに話しかけた`);
    const exprTag = directives.find(d => d.type === "expr");
    log.player("アキラ", `  長老ヨハン [${exprTag?.value ?? ""}]: 「${plainText}」`);
    log.system(`インラインタグ解析: ${directives.length}個のディレクティブ検出 (${directives.map(d => `${d.type}:${d.value}`).join(", ")})`);
    assert.ok(segments.length > 1);
    assert.ok(directives.length >= 2);

    // NPC 会話 — 商人マリア
    const merchant = village.npcs.find(n => n.id === "npc-merchant")!;
    const merchantText = stripTags(merchant.dialogue[0]);
    log.player("アキラ", `商人マリアに話しかけた`);
    log.player("アキラ", `  商人マリア [笑顔]: 「${merchantText}」`);

    // ショップ — 商品一覧
    const shopItems = shopMgr.getShopItems("npc-merchant")!;
    assert.ok(shopItems.length > 0);
    log.player("アキラ", `商人マリアの店:`);
    for (const item of shopItems) {
      log.player("アキラ", `  ${item.name} — ${item.price}G`);
    }

    // 購入（装備を先に買う）
    const buySword = shopMgr.buy(akira, "npc-merchant", "sword-wood");
    assert.strictEqual(buySword.success, true);
    log.player("アキラ", `木の剣を購入 (50G) → 残Gold: ${akira.gold}G`);

    const buyCloth = shopMgr.buy(akira, "npc-merchant", "armor-cloth");
    assert.strictEqual(buyCloth.success, true);
    log.player("アキラ", `布の服を購入 (40G) → 残Gold: ${akira.gold}G`);

    // ゴールド不足テスト
    const buyFail = shopMgr.buy(akira, "npc-merchant", "sword-wood", 100);
    assert.strictEqual(buyFail.success, false);
    log.system("ゴールド不足の購入を拒否（INSUFFICIENT_GOLD）");

    // 残りで回復薬を買えるだけ買う
    const potionBudget = Math.floor(akira.gold / 20);
    if (potionBudget > 0) {
      shopMgr.buy(akira, "npc-merchant", "potion-001", potionBudget);
      log.player("アキラ", `回復薬 x${potionBudget} を購入 → 残Gold: ${akira.gold}G`);
    }

    // ミサキも購入
    shopMgr.buy(misaki, "npc-merchant", "potion-001", 3);
    log.player("ミサキ", `回復薬 x3 を購入 → 残Gold: ${misaki.gold}G`);

    // 売却（デフォルトの回復薬から売る）
    const sellRes = shopMgr.sell(akira, "potion-001", 1);
    assert.strictEqual(sellRes.success, true);
    log.player("アキラ", `回復薬 x1 を売却 (+10G) → Gold: ${akira.gold}G`);

    // ════════════════════════════════════
    // CHAPTER 3: 装備
    // ════════════════════════════════════
    log.section("Chapter 3: Equipment");

    // 装備（木の剣）
    const equipSword = equipMgr.equip(akira, "sword-wood");
    assert.strictEqual(equipSword.success, true);
    let effStats = equipMgr.getEffectiveStats(akira);
    log.player("アキラ", `木の剣を装備 → 実効ATK: ${effStats.atk} (base:${akira.atk} + equip:${effStats.atk - akira.atk})`);
    assert.strictEqual(effStats.atk, akira.atk + 3); // sword-wood: atk+3

    // 装備（布の服）
    const equipArmor = equipMgr.equip(akira, "armor-cloth");
    assert.strictEqual(equipArmor.success, true);
    effStats = equipMgr.getEffectiveStats(akira);
    log.player("アキラ", `布の服を装備 → 実効DEF: ${effStats.def} (base:${akira.def} + equip:${effStats.def - akira.def})`);
    assert.strictEqual(effStats.def, akira.def + 3); // armor-cloth: def+3

    // 装備スワップ — 交易広場でアップグレード購入を想定
    // まず装備解除テスト
    const unequipRes = equipMgr.unequip(akira, "weapon");
    assert.strictEqual(unequipRes.success, true);
    assert.strictEqual(unequipRes.unequipped, "sword-wood");
    effStats = equipMgr.getEffectiveStats(akira);
    log.player("アキラ", `木の剣を外した → 実効ATK: ${effStats.atk} (装備ボーナスなし)`);
    assert.strictEqual(effStats.atk, akira.atk); // back to base

    // 再装備
    equipMgr.equip(akira, "sword-wood");
    log.player("アキラ", `木の剣を再装備`);

    // 全装備ステータス確認
    const fullBonus = equipMgr.getBonus(akira);
    log.player("アキラ", `装備ボーナス: ATK+${fullBonus.atk} DEF+${fullBonus.def} MAG+${fullBonus.mag} SPD+${fullBonus.spd}`);

    // ════════════════════════════════════
    // CHAPTER 4: クエスト受注
    // ════════════════════════════════════
    log.section("Chapter 4: Quest Accept");

    // 討伐クエスト
    const q1 = questMgr.accept(akira, "Q-001"); // ゴブリン3体
    assert.strictEqual(q1.success, true);
    log.player("アキラ", `クエスト「森の脅威」受注 — ゴブリンを3体倒す`);

    // 収集クエスト
    const q2 = questMgr.accept(akira, "Q-002"); // 薬草5個
    assert.strictEqual(q2.success, true);
    log.player("アキラ", `クエスト「薬草集め」受注 — 薬草を5個集める`);

    // 訪問クエスト
    const q3 = questMgr.accept(akira, "Q-003"); // 古代遺跡訪問
    assert.strictEqual(q3.success, true);
    log.player("アキラ", `クエスト「遺跡調査」受注 — 古代遺跡に行く`);

    // 二重受注テスト
    const dupQuest = questMgr.accept(akira, "Q-001");
    assert.strictEqual(dupQuest.success, false);
    log.system("クエスト二重受注を拒否（QUEST_ALREADY_ACCEPTED）");

    // ════════════════════════════════════
    // CHAPTER 5: パーティ結成
    // ════════════════════════════════════
    log.section("Chapter 5: Party");

    const invite = partyMgr.invite("akira", "アキラ", "misaki");
    assert.strictEqual(invite.success, true);
    log.player("アキラ", `ミサキをパーティに招待した`);

    const accept = partyMgr.respond("misaki", true);
    assert.strictEqual(accept.success, true);
    log.player("ミサキ", `アキラのパーティに参加！`);

    const party = partyMgr.getParty("akira")!;
    assert.strictEqual(party.members.length, 2);
    log.system(`パーティ結成: ${party.members.join(", ")} (リーダー: ${party.leaderId})`);

    // ════════════════════════════════════
    // CHAPTER 6: 霧の森で探索・戦闘
    // ════════════════════════════════════
    log.section("Chapter 6: Forest Exploration");

    akira.zoneId = "zone-002-forest";
    misaki.zoneId = "zone-002-forest";
    const forest = getFullZone("zone-002-forest")!;
    log.player("アキラ", `北へ移動 → ${forest.name}。${forest.description}`);
    log.player("ミサキ", `アキラについて${forest.name}に入った`);

    // 安全地帯で探索テスト
    const safeExplore = encounter.explore("zone-001-village");
    assert.strictEqual(safeExplore.type, "error");
    log.system("安全地帯での探索を拒否（ZONE_SAFE）");

    // 探索 — エンカウント x3 (クエスト: ゴブリン3体)
    let goblinCount = 0;
    for (let i = 0; i < 5; i++) {
      // 確率コントロール: 最初3回は戦闘、4回目はアイテム発見、5回目は何もなし
      let rngVal: number;
      if (i < 3) rngVal = 0.1;      // battle
      else if (i === 3) rngVal = 0.55; // item find
      else rngVal = 0.9;             // nothing

      let rngCall = 0;
      const rng = () => { rngCall++; return rngCall === 1 ? rngVal : 0.1; };
      const result = encounter.explore("zone-002-forest", rng);

      if (result.type === "battle") {
        log.player("アキラ", `--- 戦闘 ${i + 1} ---`);
        log.player("アキラ", `${result.enemy.name}が現れた！ HP:${result.enemy.hp} ATK:${result.enemy.atk} DEF:${result.enemy.def}`);

        // パーティ全員が攻撃（シミュレーション）
        effStats = equipMgr.getEffectiveStats(akira);
        const akiraAtk = effStats.atk;
        const misakiMag = misaki.mag;
        log.player("アキラ", `攻撃！ (ATK:${akiraAtk})`);
        log.player("ミサキ", `魔法攻撃！ (MAG:${misakiMag})`);

        // 勝利
        const drops = encounter.rollDrops(result.enemy, () => 0.3);
        // 両方に EXP
        const aLv = levelSys.addExp(akira, result.enemy.exp);
        const mLv = levelSys.addExp(misaki, result.enemy.exp);
        akira.gold += result.enemy.gold;
        misaki.gold += result.enemy.gold;

        log.player("アキラ", `${result.enemy.name}を倒した！ +${result.enemy.exp}EXP +${result.enemy.gold}G (累計EXP:${akira.exp})`);
        log.player("ミサキ", `${result.enemy.name}を倒した！ +${result.enemy.exp}EXP +${result.enemy.gold}G (累計EXP:${misaki.exp})`);

        if (drops.length > 0) {
          itemMgr.addToInventory(akira, drops);
          log.player("アキラ", `ドロップ: ${drops.map(d => d.name).join(", ")}`);
        }

        if (aLv) log.player("アキラ", `★ Lv UP! Lv.${aLv.newLevel} (HP+${aLv.statChanges.hp} ATK+${aLv.statChanges.atk} DEF+${aLv.statChanges.def})`);
        if (mLv) log.player("ミサキ", `★ Lv UP! Lv.${mLv.newLevel} (HP+${mLv.statChanges.hp} MAG+${mLv.statChanges.mag} MP+${mLv.statChanges.mp})`);

        // クエスト進捗
        if (result.enemy.id === "goblin") goblinCount++;
        const qProgress = questMgr.onEnemyDefeated(akira, result.enemy.id);
        for (const p of qProgress) {
          log.player("アキラ", `  クエスト「森の脅威」: ${p.targetName} (${p.current}/${p.required})${p.completed ? " ★達成" : ""}`);
        }

        // 薬草ドロップでクエスト進捗
        for (const drop of drops) {
          const herbProgress = questMgr.onItemCollected(akira, drop.itemId);
          for (const p of herbProgress) {
            log.player("アキラ", `  クエスト「薬草集め」: ${p.targetName} (${p.current}/${p.required})${p.completed ? " ★達成" : ""}`);
          }
        }

      } else if (result.type === "item") {
        log.player("アキラ", `探索中にアイテム発見: ${result.itemName} x${result.quantity}`);
        itemMgr.addToInventory(akira, [{ itemId: result.itemId, name: result.itemName, quantity: result.quantity, type: "material" }]);
        const herbProgress = questMgr.onItemCollected(akira, result.itemId);
        for (const p of herbProgress) {
          log.player("アキラ", `  クエスト「薬草集め」: ${p.targetName} (${p.current}/${p.required})${p.completed ? " ★達成" : ""}`);
        }

      } else if (result.type === "nothing") {
        log.player("アキラ", `周囲を探索したが、特に何も見つからなかった。`);
      }
    }

    // ════════════════════════════════════
    // CHAPTER 7: アイテム使用 + MP回復
    // ════════════════════════════════════
    log.section("Chapter 7: Item Usage");

    // HP 回復
    akira.hp = 60;
    log.player("アキラ", `HP が減っている (HP:${akira.hp}/${akira.maxHp})`);
    const heal1 = itemMgr.useItem(akira, "potion-001");
    assert.strictEqual(heal1.success, true);
    log.player("アキラ", heal1.log!);
    log.player("アキラ", `HP: ${akira.hp}/${akira.maxHp}`);

    // MP 回復（ミサキ）— ether がなければスキップ
    misaki.mp = 10;
    log.player("ミサキ", `MP が減っている (MP:${misaki.mp}/${misaki.maxMp})`);
    const etherInMisaki = misaki.inventory.find(i => i.itemId === "ether-001");
    if (etherInMisaki) {
      const healMp = itemMgr.useItem(misaki, "ether-001");
      if (healMp.success) log.player("ミサキ", healMp.log!);
    } else {
      log.player("ミサキ", `魔力の水を持っていない… MP はそのまま`);
    }

    // 所持していないアイテム使用
    const noItem = itemMgr.useItem(akira, "potion-002");
    assert.strictEqual(noItem.success, false);
    log.system("所持していないアイテム使用を拒否（ITEM_NOT_OWNED）");

    // maxHp 上限テスト
    akira.hp = akira.maxHp - 10;
    const overHeal = itemMgr.useItem(akira, "potion-001");
    if (overHeal.success) {
      assert.strictEqual(akira.hp, akira.maxHp);
      log.player("アキラ", `回復薬を使った → HP: ${akira.hp}/${akira.maxHp}（上限でキャップ）`);
    }

    // ════════════════════════════════════
    // CHAPTER 8: クエスト完了報告
    // ════════════════════════════════════
    log.section("Chapter 8: Quest Reports");

    // Q-001 ゴブリン討伐
    if (goblinCount >= 3) {
      const report1 = questMgr.report(akira, "Q-001");
      assert.strictEqual(report1.success, true);
      log.player("アキラ", `クエスト「森の脅威」完了報告！ +${report1.rewards!.exp}EXP +${report1.rewards!.gold}G`);
      if (report1.rewards!.items) {
        log.player("アキラ", `  報酬アイテム: ${report1.rewards!.items.map(i => `${i.name}x${i.quantity}`).join(", ")}`);
      }
      assert.strictEqual(akira.questProgress["Q-001"].status, "completed");
    }

    // Q-003 訪問クエスト — 古代遺跡に移動
    log.section("Chapter 9: Ruins Visit");

    akira.zoneId = "zone-005-ruins";
    const ruins = getFullZone("zone-005-ruins")!;
    log.player("アキラ", `南へ移動 → ${ruins.name}。${ruins.description}`);

    const visitProgress = questMgr.onZoneVisited(akira, "zone-005-ruins");
    for (const p of visitProgress) {
      log.player("アキラ", `  クエスト「遺跡調査」: ${p.targetName} 訪問${p.completed ? " ★達成" : ""}`);
    }

    const report3 = questMgr.report(akira, "Q-003");
    assert.strictEqual(report3.success, true);
    log.player("アキラ", `クエスト「遺跡調査」完了報告！ +${report3.rewards!.exp}EXP +${report3.rewards!.gold}G`);
    assert.strictEqual(akira.questProgress["Q-003"].status, "completed");

    // 未完了クエスト報告テスト
    const earlyReport = questMgr.report(akira, "Q-002");
    assert.strictEqual(earlyReport.success, false);
    log.system("未完了クエストの報告を拒否（QUEST_NOT_COMPLETE）");

    // ════════════════════════════════════
    // CHAPTER 10: 死亡・リスポーン
    // ════════════════════════════════════
    log.section("Chapter 10: Death & Respawn");

    akira.hp = 0;
    akira.zoneId = "zone-005-ruins";
    const goldBefore = akira.gold;
    log.player("アキラ", `遺跡のゴーレムにやられた… HP:0 Gold:${akira.gold}G`);

    const penalty = deathMgr.applyPenalty(akira);
    assert.strictEqual(akira.zoneId, "zone-001-village");
    assert.strictEqual(akira.hp, akira.maxHp);
    assert.strictEqual(akira.mp, akira.maxMp);
    assert.ok(penalty.goldLost > 0);
    log.player("アキラ", `全滅… ${penalty.respawnZone}にリスポーン`);
    log.player("アキラ", `  ペナルティ: -${penalty.goldLost}G (${goldBefore}G → ${akira.gold}G)`);
    log.player("アキラ", `  HP/MP全回復: HP:${akira.hp}/${akira.maxHp} MP:${akira.mp}/${akira.maxMp}`);

    // ════════════════════════════════════
    // CHAPTER 11: 12ゾーン周遊
    // ════════════════════════════════════
    log.section("Chapter 11: World Tour (12 zones)");

    // BFS で全ゾーンを訪問
    const visitedZones = new Set<string>();
    const tourQueue = ["zone-001-village"];
    const route: string[] = [];
    while (tourQueue.length > 0) {
      const zoneId = tourQueue.shift()!;
      if (visitedZones.has(zoneId)) continue;
      visitedZones.add(zoneId);
      const zone = getFullZone(zoneId)!;
      route.push(zone.name);
      log.player("アキラ", `→ ${zone.name} (${zone.id}) — ${zone.description.slice(0, 30)}...`);

      // NPC がいたら全員に話しかける
      for (const npc of zone.npcs) {
        const text = stripTags(npc.dialogue[0]);
        log.player("アキラ", `  [NPC] ${npc.name}: 「${text.slice(0, 40)}${text.length > 40 ? "…" : ""}」`);
      }

      for (const adj of zone.adjacentZones) {
        if (!visitedZones.has(adj.zoneId)) tourQueue.push(adj.zoneId);
      }
    }
    assert.strictEqual(visitedZones.size, 12);
    log.system(`全12ゾーン踏破！ ルート: ${route.join(" → ")}`);

    // ════════════════════════════════════
    // CHAPTER 12: 交易広場でプレイヤー取引
    // ════════════════════════════════════
    log.section("Chapter 12: Player Trading");

    akira.zoneId = "zone-003-market";
    misaki.zoneId = "zone-003-market";
    log.player("アキラ", `交易広場に移動`);
    log.player("ミサキ", `交易広場に移動`);

    // 交易広場のNPCに話す
    const market = getFullZone("zone-003-market")!;
    const trader = market.npcs.find(n => n.id === "npc-trader")!;
    log.player("アキラ", `旅商人ロイドに話しかけた`);
    log.player("アキラ", `  ロイド: 「${stripTags(trader.dialogue[0])}」`);

    // ロイドのショップで上位装備購入
    const traderShop = shopMgr.getShopItems("npc-trader")!;
    log.player("アキラ", `旅商人ロイドの店:`);
    for (const item of traderShop) {
      log.player("アキラ", `  ${item.name} — ${item.price}G`);
    }

    // アキラの薬草をミサキに渡す（インベントリ操作でシミュレーション）
    const akiraHerbs = akira.inventory.find(i => i.itemId === "herb-001");
    if (akiraHerbs && akiraHerbs.quantity > 0) {
      const tradeQty = Math.min(akiraHerbs.quantity, 3);
      akiraHerbs.quantity -= tradeQty;
      if (akiraHerbs.quantity <= 0) akira.inventory = akira.inventory.filter(i => i.itemId !== "herb-001");
      itemMgr.addToInventory(misaki, [{ itemId: "herb-001", name: "薬草", quantity: tradeQty, type: "material" }]);
      log.player("アキラ", `ミサキに薬草 x${tradeQty} を渡した`);
      log.player("ミサキ", `アキラから薬草 x${tradeQty} を受け取った`);
    }

    // ════════════════════════════════════
    // CHAPTER 13: パーティ解散 + 再結成
    // ════════════════════════════════════
    log.section("Chapter 13: Party Disband & Reform");

    const leaveRes = partyMgr.leave("misaki");
    assert.strictEqual(leaveRes.success, true);
    log.player("ミサキ", `パーティを離脱`);

    const leaveRes2 = partyMgr.leave("akira");
    assert.strictEqual(leaveRes2.disbanded, true);
    log.system("パーティ解散");

    assert.strictEqual(partyMgr.getParty("akira"), null);
    assert.strictEqual(partyMgr.getParty("misaki"), null);

    // 再結成
    partyMgr.invite("akira", "アキラ", "misaki");
    partyMgr.respond("misaki", true);
    const newParty = partyMgr.getParty("akira")!;
    assert.strictEqual(newParty.members.length, 2);
    log.system("パーティ再結成");

    // 招待拒否テスト
    partyMgr.invite("akira", "アキラ", "takuya");
    const reject = partyMgr.respond("takuya", false);
    assert.strictEqual(reject.success, true);
    assert.strictEqual(reject.party, undefined);
    log.system("タクヤはパーティ招待を拒否した");

    // ════════════════════════════════════
    // CHAPTER 14: ボス戦（データ検証 + シミュレーション）
    // ════════════════════════════════════
    log.section("Chapter 14: Boss Battle");

    const boss = BOSSES["boss-orc-king"];
    log.system(`ボス出現: ${boss.name}`);
    log.system(`  HP:${boss.hp} ATK:${boss.atk} DEF:${boss.def} EXP:${boss.exp} Gold:${boss.gold}`);
    log.system(`  逃走: ${boss.canFlee ? "可能" : "不可"}`);
    log.system(`  特殊攻撃: ${boss.specialAttack!.name} (${boss.specialAttack!.damage}ダメージ, ${boss.specialAttack!.aoe ? "全体" : "単体"}, ${boss.specialAttack!.frequency}ターンに1回)`);

    assert.strictEqual(boss.canFlee, false);
    assert.strictEqual(boss.isBoss, true);
    assert.ok(boss.drops[0].chance === 1.0); // guaranteed drop

    // ボス戦シミュレーション
    let bossHp = boss.hp;
    let turn = 0;
    effStats = equipMgr.getEffectiveStats(akira);
    while (bossHp > 0 && turn < 20) {
      turn++;
      // プレイヤーターン
      const akiraD = Math.max(1, effStats.atk - boss.def + Math.floor(Math.random() * 3));
      bossHp -= akiraD;
      log.player("アキラ", `ターン${turn}: 攻撃！ ${boss.name}に${akiraD}ダメージ (残HP:${Math.max(0, bossHp)})`);

      const misakiD = Math.max(1, misaki.mag - boss.def + Math.floor(Math.random() * 3));
      bossHp -= misakiD;
      log.player("ミサキ", `ターン${turn}: 魔法攻撃！ ${boss.name}に${misakiD}ダメージ (残HP:${Math.max(0, bossHp)})`);

      if (bossHp <= 0) break;

      // ボスターン
      if (turn % boss.specialAttack!.frequency === 0) {
        log.system(`  ${stripTags(boss.specialAttack!.log)} → 全体${boss.specialAttack!.damage}ダメージ！`);
        akira.hp = Math.max(0, akira.hp - boss.specialAttack!.damage);
        misaki.hp = Math.max(0, misaki.hp - boss.specialAttack!.damage);
      } else {
        const bossDmg = Math.max(1, boss.atk - effStats.def + Math.floor(Math.random() * 3));
        akira.hp = Math.max(0, akira.hp - bossDmg);
        log.system(`  ${boss.name}の攻撃！ アキラに${bossDmg}ダメージ (HP:${akira.hp})`);
      }

      // アイテム使用（HPが低い時）
      if (akira.hp < 40) {
        const potionHeal = itemMgr.useItem(akira, "potion-001");
        if (potionHeal.success) {
          log.player("アキラ", `回復薬を使った！ HP:${akira.hp}/${akira.maxHp}`);
        }
      }
    }

    if (bossHp <= 0) {
      const bossDrops = encounter.rollDrops(boss, () => 0.0); // guaranteed
      const aLv = levelSys.addExp(akira, boss.exp);
      const mLv = levelSys.addExp(misaki, boss.exp);
      akira.gold += boss.gold;
      misaki.gold += boss.gold;

      log.system(`★ ${boss.name}を撃破！ ${turn}ターンで勝利`);
      log.player("アキラ", `+${boss.exp}EXP +${boss.gold}G`);
      log.player("ミサキ", `+${boss.exp}EXP +${boss.gold}G`);
      if (aLv) log.player("アキラ", `★ Lv UP! Lv.${aLv.newLevel}`);
      if (mLv) log.player("ミサキ", `★ Lv UP! Lv.${mLv.newLevel}`);
      if (bossDrops.length > 0) {
        itemMgr.addToInventory(akira, bossDrops);
        log.player("アキラ", `ボスドロップ: ${bossDrops.map(d => d.name).join(", ")}`);
      }
    }

    // ════════════════════════════════════
    // CHAPTER 15: 最終ステータス
    // ════════════════════════════════════
    log.section("Chapter 15: Final Status");

    const aFinal = equipMgr.getEffectiveStats(akira);
    log.player("アキラ", `Lv.${akira.level} (EXP:${akira.exp})`);
    log.player("アキラ", `HP:${akira.hp}/${akira.maxHp} MP:${akira.mp}/${akira.maxMp}`);
    log.player("アキラ", `ATK:${aFinal.atk} DEF:${aFinal.def} MAG:${aFinal.mag} SPD:${aFinal.spd}`);
    log.player("アキラ", `Gold:${akira.gold}G`);
    log.player("アキラ", `装備: 武器=${akira.equipment.weapon ?? "なし"} 防具=${akira.equipment.armor ?? "なし"} アクセ=${akira.equipment.accessory ?? "なし"}`);
    log.player("アキラ", `インベントリ: ${akira.inventory.map(i => `${i.name}x${i.quantity}`).join(", ") || "空"}`);
    log.player("アキラ", `クエスト: ${Object.entries(akira.questProgress).map(([id, q]) => `${id}(${q.status})`).join(", ")}`);

    const mFinal = equipMgr.getEffectiveStats(misaki);
    log.player("ミサキ", `Lv.${misaki.level} (EXP:${misaki.exp})`);
    log.player("ミサキ", `HP:${misaki.hp}/${misaki.maxHp} MP:${misaki.mp}/${misaki.maxMp}`);
    log.player("ミサキ", `ATK:${mFinal.atk} DEF:${mFinal.def} MAG:${mFinal.mag} SPD:${mFinal.spd}`);
    log.player("ミサキ", `Gold:${misaki.gold}G`);
    log.player("ミサキ", `インベントリ: ${misaki.inventory.map(i => `${i.name}x${i.quantity}`).join(", ") || "空"}`);

    // Save
    const logDir = log.flush();
    console.log(`\n  Logs saved to: ${logDir}\n`);

    // ── Final assertions ──
    assert.ok(akira.level >= 2, "Akira should have leveled up");
    assert.ok(misaki.level >= 1, "Misaki should exist");
    assert.strictEqual(akira.questProgress["Q-001"].status, "completed");
    assert.strictEqual(akira.questProgress["Q-003"].status, "completed");
    assert.ok(akira.gold > 0, "Should have gold");
    assert.ok(akira.equipment.weapon, "Should have weapon equipped");
    assert.ok(akira.equipment.armor, "Should have armor equipped");
  });
});
