/**
 * NPC 対話パターン網羅テスト
 *
 * 全パターン:
 * A: 会話プールあり + playerData あり → npc_conversation (複数ノード)
 * B: 会話プールあり + playerData なし → npc_dialogue (legacy) + npcId付き
 * C: 会話プールなし + dialogue あり → npc_dialogue (legacy) + npcId付き
 * D: 会話プールなし + dialogue なし → error
 * E: legacy でも npcId がレスポンスに含まれる（ショップ/クエスト判定に必要）
 * F: zone_info の NPC に shop/quests 参照がある
 */
import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { createMMOServer, type MMOServer } from "../src/createServer.ts";
import { InMemoryPlayerDB } from "../src/persistence/PlayerPersistence.ts";
import { TEST_JWT_SECRET, createTestToken } from "./mocks/kaedevn-auth.ts";

const TEST_PORT = 9596;
const ENDPOINT = `ws://localhost:${TEST_PORT}`;

function wait<T>(room: any, type: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: "${type}"`)), ms);
    room.onMessage(type, (msg: T) => { clearTimeout(timer); resolve(msg); });
  });
}

describe("NPC Dialogue Patterns", function () {
  this.timeout(15000);

  const playerDB = new InMemoryPlayerDB();
  let mmo: MMOServer;

  before(async () => {
    mmo = createMMOServer({ jwtSecret: TEST_JWT_SECRET, playerDB });
    await mmo.listen(TEST_PORT);
  });
  after(() => mmo.shutdown());
  beforeEach(() => playerDB.clear());

  // ── パターン A: 会話プールあり + キャラ作成済み → npc_conversation ──

  it("NPCD-A: pool NPC with playerData → npc_conversation with multiple nodes", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-a" }),
      zoneId: "zone-001-village",
    });
    await new Promise(r => setTimeout(r, 200));

    // Create character first
    const created = wait<any>(room, "character_created");
    room.send("create_character", { name: "テストA", classType: "warrior" });
    await created;

    // Interact with elder (has conversation pool)
    const resp = new Promise<any>(resolve => {
      room.onMessage("npc_conversation", resolve);
    });
    room.send("interact", { targetId: "npc-elder" });
    const result = await resp;

    assert.strictEqual(result.npcName, "長老ヨハン");
    assert.ok(result.nodes.length >= 2, `Should have 2+ nodes, got ${result.nodes.length}`);
    assert.ok(result.npcId, "Should have npcId");
    assert.ok(result.conversationId, "Should have conversationId");
    assert.ok(result.source, "Should have source (special/contextual/daily)");
    assert.ok(result.memory, "Should have memory");

    await room.leave();
  });

  // ── パターン B: 会話プールあり + キャラ未作成 → npc_dialogue (legacy) ──

  it("NPCD-B: pool NPC without playerData → npc_dialogue with npcId", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-b" }),
      zoneId: "zone-001-village",
    });
    await new Promise(r => setTimeout(r, 200));
    // Do NOT create character

    const resp = new Promise<any>(resolve => {
      room.onMessage("npc_dialogue", resolve);
    });
    room.send("interact", { targetId: "npc-elder" });
    const result = await resp;

    assert.strictEqual(result.npcName, "長老ヨハン");
    assert.ok(result.text, "Should have text");
    assert.ok(result.npcId, "npc_dialogue MUST include npcId for shop/quest buttons");

    await room.leave();
  });

  // ── パターン C: 会話プールなし + dialogue あり → npc_dialogue (legacy) ──

  it("NPCD-C: non-pool NPC with dialogue → npc_dialogue with npcId", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-c" }),
      zoneId: "zone-004-capital",
    });
    await new Promise(r => setTimeout(r, 200));

    const resp = new Promise<any>(resolve => {
      room.onMessage("npc_dialogue", resolve);
    });
    room.send("interact", { targetId: "npc-guild" }); // エリカ: no pool, has dialogue
    const result = await resp;

    assert.strictEqual(result.npcName, "ギルド受付嬢エリカ");
    assert.ok(result.text, "Should have text");
    assert.ok(result.npcId, "npc_dialogue MUST include npcId");
    assert.strictEqual(result.npcId, "npc-guild");

    await room.leave();
  });

  // ── パターン D: 存在しない NPC → error ──

  it("NPCD-D: unknown NPC → error", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-d" }),
      zoneId: "zone-001-village",
    });
    await new Promise(r => setTimeout(r, 200));

    const err = wait<any>(room, "error");
    room.send("interact", { targetId: "npc-nonexistent" });
    const result = await err;

    assert.strictEqual(result.code, "NPC_NOT_FOUND");

    await room.leave();
  });

  // ── パターン E: zone_info に NPC のショップ/クエスト参照がある ──

  it("NPCD-E1: village zone_info has merchant with shop ref", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const zi = await new Promise<any>(resolve => {
      sdk.create("world", {
        token: "browser-npcd-e1",
        zoneId: "zone-001-village",
      }).then(room => { room.onMessage("zone_info", resolve); });
    });

    const merchant = zi.npcs.find((n: any) => n.id === "npc-merchant");
    assert.ok(merchant, "Merchant should be in zone_info");
    assert.strictEqual(merchant.shop, "npc-merchant", "Merchant should have shop reference");
  });

  it("NPCD-E2: village zone_info has elder with quest refs", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const zi = await new Promise<any>(resolve => {
      sdk.create("world", {
        token: "browser-npcd-e2",
        zoneId: "zone-001-village",
      }).then(room => { room.onMessage("zone_info", resolve); });
    });

    const elder = zi.npcs.find((n: any) => n.id === "npc-elder");
    assert.ok(elder, "Elder should be in zone_info");
    assert.ok(elder.quests.length >= 2, `Elder should have 2+ quests, got ${elder.quests.length}`);
  });

  it("NPCD-E3: guild receptionist has quests (she runs the quest board)", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const zi = await new Promise<any>(resolve => {
      sdk.create("world", {
        token: "browser-npcd-e3",
        zoneId: "zone-004-capital",
      }).then(room => { room.onMessage("zone_info", resolve); });
    });

    const erika = zi.npcs.find((n: any) => n.id === "npc-guild");
    assert.ok(erika, "Erika should be in zone_info");
    assert.strictEqual(erika.shop, null, "Erika has no shop");
    assert.ok(erika.quests.length >= 1, "Erika should have quests (guild quest board)");
  });

  it("NPCD-E4: blacksmith has shop", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const zi = await new Promise<any>(resolve => {
      sdk.create("world", {
        token: "browser-npcd-e4",
        zoneId: "zone-004-capital",
      }).then(room => { room.onMessage("zone_info", resolve); });
    });

    const blacksmith = zi.npcs.find((n: any) => n.id === "npc-blacksmith");
    assert.ok(blacksmith, "Blacksmith should be in zone_info");
    assert.ok(blacksmith.shop, "Blacksmith should have shop");
  });

  // ── パターン F: 交易広場のロイドはショップ+クエストあり ──

  it("NPCD-F: market trader has both shop and quest refs", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const zi = await new Promise<any>(resolve => {
      sdk.create("world", {
        token: "browser-npcd-f",
        zoneId: "zone-003-market",
      }).then(room => { room.onMessage("zone_info", resolve); });
    });

    const trader = zi.npcs.find((n: any) => n.id === "npc-trader");
    assert.ok(trader, "Trader should be in zone_info");
    assert.strictEqual(trader.shop, "npc-trader", "Trader should have shop");
    assert.ok(trader.quests.length >= 1, "Trader should have quests");
  });

  // ── パターン G: legacy対話 + ショップNPC → npcId が使える ──

  it("NPCD-G: merchant legacy dialogue includes npcId for shop button", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-g" }),
      zoneId: "zone-001-village",
    });
    await new Promise(r => setTimeout(r, 200));

    const resp = new Promise<any>(resolve => {
      room.onMessage("npc_dialogue", resolve);
    });
    room.send("interact", { targetId: "npc-merchant" });
    const result = await resp;

    assert.strictEqual(result.npcName, "商人マリア");
    assert.strictEqual(result.npcId, "npc-merchant", "npcId must be in legacy dialogue for shop button");

    await room.leave();
  });

  // ── パターン H: interact レスポンス + zone_info を組み合わせてボタン判定 ──
  // ブラウザと同じロジック: interact → npcId を取得 → zone_info の npcs から shop/quests を参照

  it("NPCD-H1: elder interact → zone_info lookup → quests button should appear", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-h1" }),
      zoneId: "zone-001-village",
    });

    // Get zone_info
    const zi = await wait<any>(room, "zone_info");

    // Create character for pool conversation
    const created = wait<any>(room, "character_created");
    room.send("create_character", { name: "H1テスト", classType: "warrior" });
    await created;

    // Interact
    const resp = new Promise<any>(resolve => {
      room.onMessage("npc_conversation", resolve);
      room.onMessage("npc_dialogue", resolve);
    });
    room.send("interact", { targetId: "npc-elder" });
    const dialogue = await resp;

    // Browser logic: find NPC in zone_info by npcId from response
    const npcId = dialogue.npcId;
    assert.ok(npcId, "Response must have npcId");
    const npcInfo = zi.npcs.find((n: any) => n.id === npcId);
    assert.ok(npcInfo, `NPC ${npcId} must be in zone_info`);
    assert.ok(npcInfo.quests.length > 0, "Elder should have quests → quest button appears");
    assert.strictEqual(npcInfo.shop, null, "Elder has no shop → no shop button");

    await room.leave();
  });

  it("NPCD-H2: merchant interact → zone_info lookup → shop button should appear", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-h2" }),
      zoneId: "zone-001-village",
    });

    const zi = await wait<any>(room, "zone_info");
    await new Promise(r => setTimeout(r, 200));

    const resp = new Promise<any>(resolve => {
      room.onMessage("npc_conversation", resolve);
      room.onMessage("npc_dialogue", resolve);
    });
    room.send("interact", { targetId: "npc-merchant" });
    const dialogue = await resp;

    const npcInfo = zi.npcs.find((n: any) => n.id === dialogue.npcId);
    assert.ok(npcInfo, "Merchant must be in zone_info");
    assert.ok(npcInfo.shop, "Merchant should have shop → shop button appears");

    await room.leave();
  });

  it("NPCD-H3: guild receptionist interact → zone_info lookup → quest button should appear", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-h3" }),
      zoneId: "zone-004-capital",
    });

    const zi = await wait<any>(room, "zone_info");
    await new Promise(r => setTimeout(r, 200));

    const resp = new Promise<any>(resolve => {
      room.onMessage("npc_conversation", resolve);
      room.onMessage("npc_dialogue", resolve);
    });
    room.send("interact", { targetId: "npc-guild" });
    const dialogue = await resp;

    assert.ok(dialogue.npcId, "Response must have npcId");
    const npcInfo = zi.npcs.find((n: any) => n.id === dialogue.npcId);
    assert.ok(npcInfo, "Erika must be in zone_info");
    assert.ok(npcInfo.quests.length > 0, "Erika should have quests → quest button appears");
    assert.strictEqual(npcInfo.shop, null, "Erika has no shop");

    await room.leave();
  });

  it("NPCD-H4: blacksmith interact → zone_info lookup → shop button should appear", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-h4" }),
      zoneId: "zone-004-capital",
    });

    const zi = await wait<any>(room, "zone_info");
    await new Promise(r => setTimeout(r, 200));

    const resp = new Promise<any>(resolve => {
      room.onMessage("npc_conversation", resolve);
      room.onMessage("npc_dialogue", resolve);
    });
    room.send("interact", { targetId: "npc-blacksmith" });
    const dialogue = await resp;

    const npcInfo = zi.npcs.find((n: any) => n.id === dialogue.npcId);
    assert.ok(npcInfo, "Blacksmith must be in zone_info");
    assert.ok(npcInfo.shop, "Blacksmith should have shop → shop button appears");

    await room.leave();
  });

  it("NPCD-H5: trader interact → zone_info lookup → shop + quest buttons", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.create("world", {
      token: createTestToken({ userId: "npcd-h5" }),
      zoneId: "zone-003-market",
    });

    const zi = await wait<any>(room, "zone_info");
    await new Promise(r => setTimeout(r, 200));

    const resp = new Promise<any>(resolve => {
      room.onMessage("npc_conversation", resolve);
      room.onMessage("npc_dialogue", resolve);
    });
    room.send("interact", { targetId: "npc-trader" });
    const dialogue = await resp;

    const npcInfo = zi.npcs.find((n: any) => n.id === dialogue.npcId);
    assert.ok(npcInfo, "Trader must be in zone_info");
    assert.ok(npcInfo.shop, "Trader should have shop");
    assert.ok(npcInfo.quests.length > 0, "Trader should have quests");

    await room.leave();
  });
});
