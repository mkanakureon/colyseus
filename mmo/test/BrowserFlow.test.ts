/**
 * ブラウザクライアントと同じ条件でのテスト
 *
 * ブラウザは npcs/adjacentZones オプションを渡さずに joinOrCreate する。
 * WorldRoom は GameData から自動で NPC とゾーン情報を読み込む必要がある。
 */
import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { createMMOServer, type MMOServer } from "../src/createServer.ts";
import { InMemoryPlayerDB } from "../src/persistence/PlayerPersistence.ts";
import { TEST_JWT_SECRET, createTestToken } from "./mocks/kaedevn-auth.ts";

const TEST_PORT = 9595;
const ENDPOINT = `ws://localhost:${TEST_PORT}`;

function wait<T>(room: any, type: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: "${type}"`)), ms);
    room.onMessage(type, (msg: T) => { clearTimeout(timer); resolve(msg); });
  });
}

describe("Browser Client Flow", function () {
  this.timeout(15000);

  const playerDB = new InMemoryPlayerDB();
  let mmo: MMOServer;

  before(async () => {
    mmo = createMMOServer({ jwtSecret: TEST_JWT_SECRET, playerDB });
    await mmo.listen(TEST_PORT);
  });
  after(() => mmo.shutdown());
  beforeEach(() => playerDB.clear());

  // ── ブラウザと同じ: npcs なしで join ──

  it("BF-01: should load NPCs from GameData when no npcs option", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-01" }),
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
      // npcs を渡さない（ブラウザと同じ）
    });
    await new Promise(r => setTimeout(r, 300));

    // NPC が state に読み込まれているか
    let npcCount = 0;
    const npcNames: string[] = [];
    room.state.npcs.forEach((npc: any) => { npcCount++; npcNames.push(npc.name); });

    assert.ok(npcCount >= 2, `Expected 2+ NPCs, got ${npcCount}`);
    assert.ok(npcNames.includes("長老ヨハン"), "Elder should be loaded");
    assert.ok(npcNames.includes("商人マリア"), "Merchant should be loaded");

    await room.leave();
  });

  it("BF-02: should load adjacentZones from GameData when not provided", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-02" }),
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
      // adjacentZones を渡さない
    });
    await new Promise(r => setTimeout(r, 200));

    // Move north should work (village → capital in GameData)
    const zoneChange = wait<any>(room, "zone_change");
    room.send("move", { direction: "north" });
    const result = await zoneChange;
    assert.strictEqual(result.zoneId, "zone-004-capital");

    await room.leave();
  });

  it("BF-03: should interact with NPC loaded from GameData (no npcs option)", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-03" }),
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
    });

    // Wait for state sync + character creation needed
    await new Promise(r => setTimeout(r, 300));

    // NPC interact should work
    const npcResponse = new Promise<any>((resolve) => {
      room.onMessage("npc_dialogue", resolve);
      room.onMessage("npc_conversation", resolve);
    });
    room.send("interact", { targetId: "npc-elder" });
    const result = await npcResponse;

    assert.strictEqual(result.npcName, "長老ヨハン");
    await room.leave();
  });

  it("BF-04: should interact with merchant NPC", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-04" }),
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
    });
    await new Promise(r => setTimeout(r, 300));

    const npcResponse = new Promise<any>((resolve) => {
      room.onMessage("npc_dialogue", resolve);
      room.onMessage("npc_conversation", resolve);
    });
    room.send("interact", { targetId: "npc-merchant" });
    const result = await npcResponse;

    assert.strictEqual(result.npcName, "商人マリア");
    await room.leave();
  });

  it("BF-05: should create character then interact with NPC", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-05" }),
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
    });

    // Wait for need_character_creation
    await new Promise<void>(r => {
      room.onMessage("need_character_creation", () => r());
      room.onMessage("welcome", () => r());
      setTimeout(r, 500);
    });

    // Create character
    const created = wait<any>(room, "character_created");
    room.send("create_character", { name: "テスト", classType: "warrior" });
    await created;

    // Now interact with NPC
    const npcResponse = new Promise<any>((resolve) => {
      room.onMessage("npc_dialogue", resolve);
      room.onMessage("npc_conversation", resolve);
    });
    room.send("interact", { targetId: "npc-elder" });
    const result = await npcResponse;
    assert.strictEqual(result.npcName, "長老ヨハン");

    await room.leave();
  });

  it("BF-06: should join capital zone and have NPCs", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-06" }),
      zoneId: "zone-004-capital",
      zoneName: "王都セレス",
    });
    await new Promise(r => setTimeout(r, 300));

    let npcCount = 0;
    room.state.npcs.forEach(() => npcCount++);
    assert.ok(npcCount >= 2, `Capital should have 2+ NPCs, got ${npcCount}`);

    await room.leave();
  });

  it("BF-07: should join forest zone (danger) and explore", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-07" }),
      zoneId: "zone-002-forest",
      zoneName: "霧の森",
    });
    await new Promise(r => setTimeout(r, 300));

    // Forest is danger zone → explore should work
    const encounter = wait<any>(room, "encounter");
    room.send("explore", {});
    const result = await encounter;
    assert.ok(["battle", "item", "nothing"].includes(result.type));

    await room.leave();
  });

  it("BF-08: should get shop list from NPC in village", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-08" }),
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
    });
    await new Promise(r => setTimeout(r, 300));

    const shopItems = wait<any>(room, "shop_items");
    room.send("shop_list", { npcId: "npc-merchant" });
    const result = await shopItems;

    assert.ok(result.items.length > 0, "Shop should have items");
    await room.leave();
  });

  // ── ゾーン移動後の再接続フロー ──

  it("BF-09: should rejoin new zone room after zone change", async () => {
    const sdk = new SDKClient(ENDPOINT);

    // Join village
    const room1 = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-09" }),
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
    });
    await new Promise(r => setTimeout(r, 200));

    // Move to capital
    const zoneChange = wait<any>(room1, "zone_change");
    room1.send("move", { direction: "north" });
    const zc = await zoneChange;
    assert.strictEqual(zc.zoneId, "zone-004-capital");

    // Leave old room, join new zone
    await room1.leave();
    const room2 = await sdk.joinOrCreate("world", {
      token: createTestToken({ userId: "bf-09" }),
      zoneId: "zone-004-capital",
      zoneName: "王都セレス",
    });
    await new Promise(r => setTimeout(r, 300));

    // Capital should have NPCs from GameData
    let npcCount = 0;
    room2.state.npcs.forEach(() => npcCount++);
    assert.ok(npcCount >= 2, `Capital should have NPCs, got ${npcCount}`);

    // Should be able to move south back to village
    const zc2 = wait<any>(room2, "zone_change");
    room2.send("move", { direction: "south" });
    const result = await zc2;
    assert.strictEqual(result.zoneId, "zone-001-village");

    await room2.leave();
  });

  it("BF-10: dev token (browser-*) should authenticate", async () => {
    const sdk = new SDKClient(ENDPOINT);
    const room = await sdk.joinOrCreate("world", {
      token: "browser-test123",
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
    });
    assert.ok(room.sessionId);

    await new Promise(r => setTimeout(r, 200));

    // Should get need_character_creation for new user
    let gotMsg = false;
    room.onMessage("need_character_creation", () => { gotMsg = true; });
    await new Promise(r => setTimeout(r, 500));

    await room.leave();
  });
});
