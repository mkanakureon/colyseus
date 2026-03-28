import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import { NPCConversationManager, type NPCConversationPool, type NPCMemory } from "../src/systems/NPCConversationManager.ts";
import { loadGameData } from "../src/GameData.ts";
import { defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));
const gameData = loadGameData(path.join(__dirname, "..", "games", "fantasy-rpg"));

describe("NPCConversationManager", () => {
  let mgr: NPCConversationManager;
  const elderPool: NPCConversationPool = gameData.npcConversations["npc-elder"];

  beforeEach(() => {
    mgr = new NPCConversationManager(gameData);
  });

  // ── 選択ロジック ──

  it("NPC-01: should select special conversation on first meeting", () => {
    const player = defaultPlayerData("npc-01", "test");
    const memory = mgr.getMemory(player, "npc-elder");

    const result = mgr.selectConversation(elderPool, memory, player);
    assert.ok(result);
    assert.strictEqual(result!.source, "special");
    assert.strictEqual(result!.conversation.id, "elder_special_first_meet");
    assert.ok(result!.conversation.nodes.length > 0);
  });

  it("NPC-02: should not repeat special conversation (once=true)", () => {
    const player = defaultPlayerData("npc-02", "test");
    const memory = mgr.getMemory(player, "npc-elder");

    // First: gets special
    const r1 = mgr.selectConversation(elderPool, memory, player);
    assert.strictEqual(r1!.source, "special");
    mgr.updateMemory(memory, r1!.conversation.id);

    // Second: special already played → falls to contextual or daily
    const r2 = mgr.selectConversation(elderPool, memory, player);
    assert.ok(r2);
    assert.notStrictEqual(r2!.conversation.id, "elder_special_first_meet");
  });

  it("NPC-03: should select contextual when quest is active", () => {
    const player = defaultPlayerData("npc-03", "test");
    player.questProgress["Q-001"] = { questId: "Q-001", status: "active", progress: { obj_0: 1 } };
    const memory = mgr.getMemory(player, "npc-elder");
    memory.playedConversationIds = ["elder_special_first_meet"]; // skip special

    const result = mgr.selectConversation(elderPool, memory, player);
    assert.ok(result);
    assert.strictEqual(result!.source, "contextual");
    assert.strictEqual(result!.conversation.id, "elder_ctx_quest_active");
  });

  it("NPC-04: should select contextual when quest is completed", () => {
    const player = defaultPlayerData("npc-04", "test");
    player.questProgress["Q-001"] = { questId: "Q-001", status: "completed", progress: { obj_0: 3 } };
    const memory = mgr.getMemory(player, "npc-elder");
    memory.playedConversationIds = ["elder_special_first_meet"];
    memory.relationScore = 10;

    const result = mgr.selectConversation(elderPool, memory, player);
    assert.ok(result);
    assert.strictEqual(result!.source, "contextual");
    assert.strictEqual(result!.conversation.id, "elder_ctx_quest_done");
  });

  it("NPC-05: should select high-relation contextual", () => {
    const player = defaultPlayerData("npc-05", "test");
    const memory = mgr.getMemory(player, "npc-elder");
    memory.playedConversationIds = ["elder_special_first_meet"];
    memory.relationScore = 50; // high

    const result = mgr.selectConversation(elderPool, memory, player);
    assert.ok(result);
    assert.strictEqual(result!.source, "contextual");
    assert.strictEqual(result!.conversation.id, "elder_ctx_high_relation");
  });

  it("NPC-06: should fall to daily when no contextual matches", () => {
    const player = defaultPlayerData("npc-06", "test");
    const memory = mgr.getMemory(player, "npc-elder");
    memory.playedConversationIds = ["elder_special_first_meet"];
    memory.relationScore = 0; // no quest, low relation → no contextual

    const result = mgr.selectConversation(elderPool, memory, player);
    assert.ok(result);
    assert.strictEqual(result!.source, "daily");
    assert.ok(result!.conversation.id.startsWith("elder_daily_"));
  });

  it("NPC-07: should prefer unplayed daily conversations", () => {
    const player = defaultPlayerData("npc-07", "test");
    const memory = mgr.getMemory(player, "npc-elder");
    memory.playedConversationIds = ["elder_special_first_meet", "elder_daily_1", "elder_daily_2"];

    const result = mgr.selectConversation(elderPool, memory, player);
    assert.ok(result);
    assert.strictEqual(result!.source, "daily");
    // Only elder_daily_3 is unplayed
    assert.strictEqual(result!.conversation.id, "elder_daily_3");
  });

  it("NPC-08: should still select from daily when all played", () => {
    const player = defaultPlayerData("npc-08", "test");
    const memory = mgr.getMemory(player, "npc-elder");
    memory.playedConversationIds = [
      "elder_special_first_meet",
      "elder_daily_1", "elder_daily_2", "elder_daily_3",
    ];

    const result = mgr.selectConversation(elderPool, memory, player);
    assert.ok(result);
    assert.strictEqual(result!.source, "daily");
  });

  // ── 記憶管理 ──

  it("NPC-09: should update memory after conversation", () => {
    const player = defaultPlayerData("npc-09", "test");
    const memory = mgr.getMemory(player, "npc-elder");

    assert.strictEqual(memory.relationScore, 0);
    assert.strictEqual(memory.interactionCount, 0);

    mgr.updateMemory(memory, "elder_daily_1", 5);

    assert.strictEqual(memory.relationScore, 5);
    assert.strictEqual(memory.interactionCount, 1);
    assert.ok(memory.playedConversationIds.includes("elder_daily_1"));
  });

  it("NPC-10: should clamp relation score to -100~100", () => {
    const player = defaultPlayerData("npc-10", "test");
    const memory = mgr.getMemory(player, "npc-elder");
    memory.relationScore = 95;

    mgr.updateMemory(memory, "test", 10);
    assert.strictEqual(memory.relationScore, 100); // clamped

    memory.relationScore = -95;
    mgr.updateMemory(memory, "test2", -10);
    assert.strictEqual(memory.relationScore, -100); // clamped
  });

  // ── ノード構造 ──

  it("NPC-11: conversation nodes have choices (branching)", () => {
    const conv = elderPool.daily.find(c => c.id === "elder_daily_2")!;
    const choiceNode = conv.nodes.find(n => n.choices && n.choices.length > 0);
    assert.ok(choiceNode, "Should have a node with choices");
    assert.strictEqual(choiceNode!.choices!.length, 2);
    assert.ok(choiceNode!.choices![0].label);
    assert.ok(choiceNode!.choices![0].next);
  });

  it("NPC-12: special first_meet has choices", () => {
    const conv = elderPool.special[0];
    assert.strictEqual(conv.id, "elder_special_first_meet");
    const choiceNode = conv.nodes.find(n => n.choices && n.choices.length > 0);
    assert.ok(choiceNode);
    assert.strictEqual(choiceNode!.choices!.length, 2);
  });

  // ── Legacy 互換 ──

  it("NPC-13: should convert legacy dialogue to pool", () => {
    const npcDef = gameData.zones[0].npcs[0]; // elder from zone data
    const pool = mgr.legacyToPool(npcDef);

    assert.strictEqual(pool.npcId, npcDef.id);
    assert.ok(pool.daily.length > 0);
    assert.strictEqual(pool.contextual.length, 0);
    assert.strictEqual(pool.special.length, 0);
    assert.ok(pool.daily[0].nodes[0].text.includes("[e:"));
  });

  // ── Merchant NPC ──

  it("NPC-14: merchant has special first conversation", () => {
    const merchantPool: NPCConversationPool = gameData.npcConversations["npc-merchant"];
    assert.ok(merchantPool);
    assert.ok(merchantPool.special.length > 0);
    assert.strictEqual(merchantPool.special[0].id, "merchant_special_first");
  });
});
