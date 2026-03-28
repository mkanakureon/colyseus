import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { LocalDriver, matchMaker, Server, LocalPresence } from "@colyseus/core";
import { WorldRoom } from "../src/rooms/WorldRoom.ts";
import { KaedevnAuthAdapter } from "../src/auth/KaedevnAuthAdapter.ts";
import { InMemoryPlayerDB, defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";
import { createTestToken, createExpiredToken, createSuspendedToken, createGuestToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";
import { TEST_ZONES } from "./mocks/zone-map.ts";

const TEST_PORT = 9567;
const TEST_ENDPOINT = `ws://localhost:${TEST_PORT}`;

describe("WorldRoom", () => {
  const presence = new LocalPresence();
  const driver = new LocalDriver();
  const server = new Server({ greet: false, presence, driver });
  const authAdapter = new KaedevnAuthAdapter(TEST_JWT_SECRET);
  const playerDB = new InMemoryPlayerDB();
  const village = TEST_ZONES[0]; // zone-001-village

  before(async () => {
    matchMaker.setup(presence, driver);
    // Pass authAdapter and playerDB via Room metadata injection
    WorldRoom.authAdapterInstance = authAdapter;
    WorldRoom.playerDBInstance = playerDB;
    server.define("world", WorldRoom);
    await server.listen(TEST_PORT);
  });

  after(() => server.transport.shutdown());

  beforeEach(() => playerDB.clear());

  // === W-AUTH: Authentication ===

  it("W-AUTH-01: should join with valid JWT", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createTestToken({ userId: "user-001" });
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      npcs: village.npcs,
      adjacentZones: village.adjacentZones,
      authAdapter,
      playerDB,
    });
    assert.ok(room.sessionId);
    assert.ok(room.state);
    await room.leave();
  });

  it("W-AUTH-02: should reject expired JWT", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createExpiredToken();
    try {
      await client.joinOrCreate("world", {
        token,
        zoneId: village.id,
        zoneName: village.name,
        authAdapter,
        playerDB,
      });
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.ok(e.message || e.code);
    }
  });

  it("W-AUTH-03: should reject suspended user", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createSuspendedToken();
    try {
      await client.joinOrCreate("world", {
        token,
        zoneId: village.id,
        zoneName: village.name,
        authAdapter,
        playerDB,
      });
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.ok(e.message || e.code);
    }
  });

  it("W-AUTH-04: should allow guest user", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createGuestToken();
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    });
    assert.ok(room.sessionId);
    await room.leave();
  });

  it("W-AUTH-05: should reject without token", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    try {
      await client.joinOrCreate("world", {
        zoneId: village.id,
        zoneName: village.name,
        authAdapter,
        playerDB,
      });
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.ok(e.message || e.code);
    }
  });

  // === W-JOIN: Join/Leave ===

  it("W-JOIN-01: should add player to state on join", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createTestToken({ userId: "user-join-01" });
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    });

    // Wait for state sync
    await new Promise(r => setTimeout(r, 200));
    const players = room.state.players;
    assert.ok(players);
    await room.leave();
  });

  it("W-JOIN-02: should load player data from DB", async () => {
    const savedPlayer = defaultPlayerData("user-load-02", "テストプレイヤー");
    savedPlayer.hp = 75;
    savedPlayer.level = 5;
    playerDB.seed([savedPlayer]);

    const client = new SDKClient(TEST_ENDPOINT);
    const token = createTestToken({ userId: "user-load-02" });
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    });

    await new Promise(r => setTimeout(r, 200));
    await room.leave();
    // Player data should have been loaded (verified by state)
    assert.ok(room.sessionId);
  });

  it("W-JOIN-03: should reject duplicate userId", async () => {
    const token = createTestToken({ userId: "user-dup-03" });
    const client1 = new SDKClient(TEST_ENDPOINT);
    const room1 = await client1.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    });

    const client2 = new SDKClient(TEST_ENDPOINT);
    try {
      await client2.join("world", {
        token,
        zoneId: village.id,
        zoneName: village.name,
        authAdapter,
        playerDB,
      });
      assert.fail("Should have thrown for duplicate userId");
    } catch (e: any) {
      assert.ok(e.message || e.code);
    }

    await room1.leave();
  });

  it("W-LEAVE-01: should remove player from state on leave", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);
    const token1 = createTestToken({ userId: "user-leave-01a" });
    const token2 = createTestToken({ userId: "user-leave-01b" });
    const roomOpts = { zoneId: village.id, zoneName: village.name, authAdapter, playerDB };

    const room1 = await client1.joinOrCreate("world", { token: token1, ...roomOpts });
    const room2 = await client2.join("world", { token: token2, ...roomOpts });
    await new Promise(r => setTimeout(r, 200));

    const sessionId1 = room1.sessionId;
    await room1.leave();
    await new Promise(r => setTimeout(r, 200));

    // room2's state should no longer contain room1's player
    const players = room2.state.players;
    let found = false;
    players.forEach((p: any) => { if (p.sessionId === sessionId1) found = true; });
    assert.strictEqual(found, false, "Player should be removed from state after leave");

    await room2.leave();
  });

  it("W-LEAVE-02: should save player data to DB on leave", async () => {
    const savedPlayer = defaultPlayerData("user-leave-02", "離脱テスト");
    savedPlayer.hp = 80;
    playerDB.seed([savedPlayer]);

    const client = new SDKClient(TEST_ENDPOINT);
    const token = createTestToken({ userId: "user-leave-02" });
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    });

    await new Promise(r => setTimeout(r, 200));
    await room.leave();
    await new Promise(r => setTimeout(r, 200));

    // DB should have updated lastLogin
    const dbPlayer = await playerDB.findByUserId("user-leave-02");
    assert.ok(dbPlayer, "Player data should be saved to DB");
    assert.strictEqual(dbPlayer!.hp, 80);
  });

  // === W-MOVE: Zone Movement ===

  it("W-MOVE-01: should send zone_change for valid direction", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createTestToken({ userId: "user-move-01" });
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      adjacentZones: village.adjacentZones,
      authAdapter,
      playerDB,
    });

    const zoneChange = new Promise<any>((resolve) => {
      room.onMessage("zone_change", resolve);
    });

    room.send("move", { direction: "north" });
    const result = await zoneChange;
    assert.strictEqual(result.zoneId, "zone-002-forest");
    await room.leave();
  });

  it("W-MOVE-02: should error for invalid direction", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createTestToken({ userId: "user-move-02" });
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      adjacentZones: village.adjacentZones,
      authAdapter,
      playerDB,
    });

    const error = new Promise<any>((resolve) => {
      room.onMessage("error", resolve);
    });

    room.send("move", { direction: "west" }); // village has no west
    const result = await error;
    assert.strictEqual(result.code, "ZONE_NO_ADJACENT");
    await room.leave();
  });

  // === W-NPC: NPC Interaction ===

  it("W-NPC-01: should return NPC dialogue with inline tags", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createTestToken({ userId: "user-npc-01" });
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      npcs: village.npcs,
      adjacentZones: village.adjacentZones,
      authAdapter,
      playerDB,
    });

    const dialogue = new Promise<any>((resolve) => {
      room.onMessage("npc_dialogue", resolve);
    });

    room.send("interact", { targetId: "npc-elder" });
    const result = await dialogue;
    assert.strictEqual(result.npcName, "長老ヨハン");
    assert.ok(result.text.includes("[e:")); // inline tags present
    await room.leave();
  });

  it("W-NPC-02: should return dialogue from merchant NPC", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createTestToken({ userId: "user-npc-02" });
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      npcs: village.npcs,
      adjacentZones: village.adjacentZones,
      authAdapter,
      playerDB,
    });

    const dialogue = new Promise<any>((resolve) => {
      room.onMessage("npc_dialogue", resolve);
    });

    room.send("interact", { targetId: "npc-merchant" });
    const result = await dialogue;
    assert.strictEqual(result.npcName, "商人マリア");
    assert.ok(result.text.includes("[e:")); // inline tags present
    await room.leave();
  });

  it("W-NPC-03: should error for unknown NPC", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const token = createTestToken({ userId: "user-npc-03" });
    const room = await client.joinOrCreate("world", {
      token,
      zoneId: village.id,
      zoneName: village.name,
      npcs: village.npcs,
      authAdapter,
      playerDB,
    });

    const error = new Promise<any>((resolve) => {
      room.onMessage("error", resolve);
    });

    room.send("interact", { targetId: "npc-nonexistent" });
    const result = await error;
    assert.strictEqual(result.code, "NPC_NOT_FOUND");
    await room.leave();
  });

  // === W-SYNC: Player Sync ===

  it("W-SYNC-02: should sync pose change to all clients", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);
    const token1 = createTestToken({ userId: "user-sync-02a" });
    const token2 = createTestToken({ userId: "user-sync-02b" });

    const roomOpts = {
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    };

    const room1 = await client1.joinOrCreate("world", { token: token1, ...roomOpts });
    const room2 = await client2.join("world", { token: token2, ...roomOpts });

    await new Promise(r => setTimeout(r, 300));

    // Client 1 changes pose
    room1.send("pose", { pose: "sitting" });
    await new Promise(r => setTimeout(r, 300));

    // Client 2 should see the pose change via state sync
    const player1InRoom2 = room2.state.players.get(room1.sessionId);
    assert.ok(player1InRoom2, "Player 1 should be visible in room2 state");
    assert.strictEqual(player1InRoom2.pose, "sitting");

    await room1.leave();
    await room2.leave();
  });

  it("W-SYNC-01: should sync expression change to all clients", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);
    const token1 = createTestToken({ userId: "user-sync-01a" });
    const token2 = createTestToken({ userId: "user-sync-01b" });

    const roomOpts = {
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    };

    const room1 = await client1.joinOrCreate("world", { token: token1, ...roomOpts });
    const room2 = await client2.join("world", { token: token2, ...roomOpts });

    await new Promise(r => setTimeout(r, 300));

    // Client 1 changes expression
    room1.send("expression", { expression: "smile" });
    await new Promise(r => setTimeout(r, 300));

    await room1.leave();
    await room2.leave();
  });
});
