/**
 * ゲームデータ整合性テスト — JSON から全パターンを自動生成
 *
 * zones.json の全 NPC に対して:
 * - dialogue がある
 * - shop 参照が shops.json に存在する
 * - quest 参照が quests.json に存在する
 * - セリフとshop/quest参照の整合性
 * - 会話プールが空でない
 * - 会話ノードが空でない
 */
import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import { loadGameData, validateGameData, type GameData } from "../src/GameData.ts";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));
const gameData = loadGameData(path.join(__dirname, "..", "games", "fantasy-rpg"));

describe("Game Data Integrity (auto-generated from JSON)", () => {

  it("GDI-00: validateGameData returns no errors", () => {
    const errors = validateGameData(gameData);
    assert.deepStrictEqual(errors, [], `Errors:\n${errors.join("\n")}`);
  });

  // ── 全ゾーンテスト ──
  for (const zone of gameData.zones) {
    describe(`Zone: ${zone.name} (${zone.id})`, () => {

      it(`has description`, () => {
        assert.ok(zone.description.length > 0, "Zone should have description");
      });

      it(`adjacentZones reference existing zones`, () => {
        for (const adj of zone.adjacentZones) {
          const target = gameData.zones.find(z => z.id === adj.zoneId);
          assert.ok(target, `Adjacent zone "${adj.zoneId}" not found`);
        }
      });

      if (!zone.isSafe) {
        it(`danger zone has encounters defined`, () => {
          const enc = gameData.encounters[zone.id];
          assert.ok(enc, `Danger zone should have encounters`);
          assert.ok(enc.enemies.length > 0, "Should have enemies");
        });
      }

      // ── 全 NPC テスト ──
      for (const npc of zone.npcs) {
        describe(`NPC: ${npc.name} (${npc.id})`, () => {

          it(`has dialogue`, () => {
            assert.ok(npc.dialogue && npc.dialogue.length > 0, "NPC should have dialogue");
          });

          it(`dialogue contains inline tags`, () => {
            const allText = npc.dialogue.join(" ");
            assert.ok(allText.includes("["), `Dialogue should have inline tags: "${allText.slice(0, 50)}..."`);
          });

          if (npc.shop) {
            it(`shop "${npc.shop}" exists in shops data`, () => {
              assert.ok(gameData.shops[npc.shop!], `Shop "${npc.shop}" not found`);
            });

            it(`shop has items`, () => {
              const shop = gameData.shops[npc.shop!];
              assert.ok(shop.items.length > 0, "Shop should have items");
            });

            it(`shop items exist in items/equipment`, () => {
              const shop = gameData.shops[npc.shop!];
              for (const itemId of shop.items) {
                const exists = gameData.items[itemId] || gameData.equipment[itemId];
                assert.ok(exists, `Shop item "${itemId}" not found in items or equipment`);
              }
            });
          }

          if ((npc.quests || []).length > 0) {
            it(`quest references exist in quests data`, () => {
              for (const qId of npc.quests!) {
                assert.ok(gameData.quests[qId], `Quest "${qId}" not found`);
              }
            });
          }

          // セリフと機能の整合性
          const allDialogue = (npc.dialogue || []).join(" ");
          const shopKeywords = ["店", "商", "買", "売", "品", "いらっしゃい", "お探し"];
          const questKeywords = ["クエスト", "依頼", "頼み", "退治", "倒して", "集めて", "ボード", "仕事"];

          const talksShop = shopKeywords.some(kw => allDialogue.includes(kw));
          const talksQuest = questKeywords.some(kw => allDialogue.includes(kw));

          if (talksShop) {
            it(`mentions shop in dialogue → has shop reference`, () => {
              assert.ok(npc.shop, `Dialogue mentions shop but NPC has no shop reference`);
            });
          }

          if (talksQuest) {
            it(`mentions quests in dialogue → has quest references`, () => {
              assert.ok((npc.quests || []).length > 0, `Dialogue mentions quests but NPC has no quest references`);
            });
          }

          // 会話プール
          const pool = gameData.npcConversations[npc.id];
          if (pool) {
            it(`conversation pool is not empty`, () => {
              const total = (pool.daily?.length || 0) + (pool.contextual?.length || 0) + (pool.special?.length || 0);
              assert.ok(total > 0, "Pool should have at least 1 conversation");
            });

            for (const conv of [...(pool.daily || []), ...(pool.contextual || []), ...(pool.special || [])]) {
              it(`conversation "${conv.id}" has nodes`, () => {
                assert.ok(conv.nodes && conv.nodes.length > 0, `Conversation should have nodes`);
              });
            }
          }
        });
      }
    });
  }

  // ── Graph 視点テスト（全体の健全性） ──

  describe("Graph Health", () => {

    it("every NPC has at least one role (shop, quest, or pool)", () => {
      for (const zone of gameData.zones) {
        for (const npc of zone.npcs) {
          const hasShop = !!npc.shop;
          const hasQuest = (npc.quests || []).length > 0;
          const hasPool = !!gameData.npcConversations[npc.id];
          assert.ok(hasShop || hasQuest || hasPool,
            `${npc.name} (${npc.id}) in ${zone.name} has no shop, quest, or conversation pool`);
        }
      }
    });

    it("every danger zone has encounters", () => {
      for (const zone of gameData.zones) {
        if (!zone.isSafe) {
          const enc = gameData.encounters[zone.id];
          assert.ok(enc, `Danger zone ${zone.name} (${zone.id}) has no encounters`);
          assert.ok(enc.enemies.length > 0, `Danger zone ${zone.name} has empty enemy list`);
        }
      }
    });

    it("every quest objective target exists", () => {
      for (const [qId, quest] of Object.entries(gameData.quests)) {
        for (const obj of quest.objectives) {
          if (obj.type === "defeat") {
            assert.ok(gameData.enemies[obj.targetId], `${qId}: enemy "${obj.targetId}" not found`);
            // Enemy must appear in at least one encounter
            const inEncounter = Object.values(gameData.encounters).some(
              enc => enc.enemies.some(e => e.enemyId === obj.targetId)
            );
            assert.ok(inEncounter, `${qId}: enemy "${obj.targetId}" not in any encounter table`);
          }
          if (obj.type === "visit") {
            assert.ok(gameData.zones.find(z => z.id === obj.targetId),
              `${qId}: zone "${obj.targetId}" not found`);
          }
        }
      }
    });

    it("every quest is available from at least one NPC", () => {
      for (const qId of Object.keys(gameData.quests)) {
        let available = false;
        for (const zone of gameData.zones) {
          for (const npc of zone.npcs) {
            if ((npc.quests || []).includes(qId)) available = true;
          }
        }
        assert.ok(available, `Quest ${qId} is not available from any NPC`);
      }
    });

    it("every shop item exists in items or equipment", () => {
      for (const [shopId, shop] of Object.entries(gameData.shops)) {
        for (const itemId of shop.items) {
          const exists = gameData.items[itemId] || gameData.equipment[itemId];
          assert.ok(exists, `Shop ${shopId}: item "${itemId}" not found`);
        }
      }
    });

    it("no orphan zones (all reachable from start)", () => {
      const visited = new Set<string>();
      const queue = [gameData.meta.startZone];
      while (queue.length > 0) {
        const zId = queue.shift()!;
        if (visited.has(zId)) continue;
        visited.add(zId);
        const zone = gameData.zones.find(z => z.id === zId);
        if (zone) zone.adjacentZones.forEach(a => { if (!visited.has(a.zoneId)) queue.push(a.zoneId); });
      }
      assert.strictEqual(visited.size, gameData.zones.length,
        `Only ${visited.size}/${gameData.zones.length} zones reachable from ${gameData.meta.startZone}`);
    });

    it("boss zones are danger zones", () => {
      for (const boss of Object.values(gameData.bosses)) {
        const zone = gameData.zones.find(z => z.id === boss.zoneId);
        assert.ok(zone, `Boss ${boss.name}: zone ${boss.zoneId} not found`);
        assert.strictEqual(zone!.isSafe, false,
          `Boss ${boss.name} is in safe zone ${zone!.name}`);
      }
    });

    it("economy balance: cheapest shop item <= first quest reward", () => {
      let minShopPrice = Infinity;
      for (const shop of Object.values(gameData.shops)) {
        for (const itemId of shop.items) {
          const item = gameData.items[itemId] || gameData.equipment[itemId];
          if (item && item.buyPrice < minShopPrice) minShopPrice = item.buyPrice;
        }
      }
      const questRewards = Object.values(gameData.quests).map(q => q.rewards.gold).sort((a, b) => a - b);
      const firstQuestGold = questRewards[0] || 0;
      assert.ok(minShopPrice <= firstQuestGold + gameData.meta.startGold,
        `Cheapest item (${minShopPrice}G) costs more than start gold (${gameData.meta.startGold}G) + first quest (${firstQuestGold}G)`);
    });
  });
});
