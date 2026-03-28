import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { matchMaker, Server } from "@colyseus/core";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { WorldRoom } from "../src/rooms/WorldRoom.ts";
import { ChatRoom } from "../src/rooms/ChatRoom.ts";
import { KaedevnAuthAdapter } from "../src/auth/KaedevnAuthAdapter.ts";
import { InMemoryPlayerDB } from "../src/persistence/PlayerPersistence.ts";
import { createTestToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";
import { TEST_ZONES } from "./mocks/zone-map.ts";

const TEST_PORT_1 = 9571;
const TEST_PORT_2 = 9572;
const TEST_ENDPOINT_1 = `ws://localhost:${TEST_PORT_1}`;
const TEST_ENDPOINT_2 = `ws://localhost:${TEST_PORT_2}`;

describe("Scaling (Redis)", () => {
  const authAdapter = new KaedevnAuthAdapter(TEST_JWT_SECRET);
  const playerDB = new InMemoryPlayerDB();
  const village = TEST_ZONES[0];

  let presence1: RedisPresence;
  let presence2: RedisPresence;
  let driver1: RedisDriver;
  let driver2: RedisDriver;
  let server1: Server;
  let server2: Server;

  before(async function () {
    this.timeout(10000);

    presence1 = new RedisPresence();
    presence2 = new RedisPresence();
    driver1 = new RedisDriver();
    driver2 = new RedisDriver();

    server1 = new Server({ greet: false, presence: presence1, driver: driver1 });
    server2 = new Server({ greet: false, presence: presence2, driver: driver2 });

    WorldRoom.authAdapterInstance = authAdapter;
    WorldRoom.playerDBInstance = playerDB;
    ChatRoom.authAdapterInstance = authAdapter;

    server1.define("world", WorldRoom);
    server1.define("chat", ChatRoom);
    server2.define("world", WorldRoom);
    server2.define("chat", ChatRoom);

    await server1.listen(TEST_PORT_1);
    await server2.listen(TEST_PORT_2);
  });

  after(async function () {
    this.timeout(5000);
    server1.transport.shutdown();
    server2.transport.shutdown();
    presence1.shutdown();
    presence2.shutdown();
    await driver1.shutdown();
    await driver2.shutdown();
  });

  beforeEach(() => playerDB.clear());

  // === S-DISCOVER: Room discovery across servers ===

  it("S-DISCOVER-01: should discover rooms via matchMaker.query across servers", async function () {
    this.timeout(10000);
    const client1 = new SDKClient(TEST_ENDPOINT_1);
    const token1 = createTestToken({ userId: "scale-01a" });

    const room1 = await client1.joinOrCreate("world", {
      token: token1,
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    });

    await new Promise(r => setTimeout(r, 300));

    // Query rooms via matchMaker (shared Redis driver)
    const rooms = await matchMaker.query({ name: "world" });
    assert.ok(rooms.length > 0, "Should discover rooms via shared Redis");

    await room1.leave();
  });

  it("S-DISCOVER-02: should join room created on another server", async function () {
    this.timeout(10000);
    const client1 = new SDKClient(TEST_ENDPOINT_1);
    const token1 = createTestToken({ userId: "scale-02a" });

    const room1 = await client1.joinOrCreate("world", {
      token: token1,
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    });

    const roomId = room1.roomId;

    // Client on server 2 joins the same room
    const client2 = new SDKClient(TEST_ENDPOINT_2);
    const token2 = createTestToken({ userId: "scale-02b" });
    const room2 = await client2.joinById(roomId, {
      token: token2,
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    });

    await new Promise(r => setTimeout(r, 300));
    assert.strictEqual(room1.roomId, room2.roomId, "Both clients should be in the same room");

    await room1.leave();
    await room2.leave();
  });

  // === S-CHAT: Cross-server chat ===

  it("S-CHAT-01: should broadcast global chat across servers", async function () {
    this.timeout(10000);
    const client1 = new SDKClient(TEST_ENDPOINT_1);
    const client2 = new SDKClient(TEST_ENDPOINT_2);

    const room1 = await client1.joinOrCreate("chat", {
      token: createTestToken({ userId: "chat-scale-01a" }),
      name: "プレイヤーA",
      zoneId: "zone-001-village",
    });

    const room2 = await client2.join("chat", {
      token: createTestToken({ userId: "chat-scale-01b" }),
      name: "プレイヤーB",
      zoneId: "zone-001-village",
    });

    await new Promise(r => setTimeout(r, 300));

    const received = new Promise<any>((resolve) => {
      room2.onMessage("chat_message", resolve);
    });

    room1.send("chat", { text: "サーバー跨ぎテスト", channel: "global" });
    const msg = await received;
    assert.strictEqual(msg.text, "サーバー跨ぎテスト");
    assert.strictEqual(msg.sender, "プレイヤーA");

    await room1.leave();
    await room2.leave();
  });

  // === S-PRESENCE: Presence across servers ===

  it("S-PRESENCE-01: should track player count across servers via matchMaker", async function () {
    this.timeout(10000);
    const client1 = new SDKClient(TEST_ENDPOINT_1);
    const token1 = createTestToken({ userId: "presence-01a" });

    const room1 = await client1.joinOrCreate("world", {
      token: token1,
      zoneId: village.id,
      zoneName: village.name,
      authAdapter,
      playerDB,
    });

    await new Promise(r => setTimeout(r, 300));

    // Query from matchMaker (uses shared Redis)
    const rooms = await matchMaker.query({ name: "world" });
    const targetRoom = rooms.find((r: any) => r.roomId === room1.roomId);
    assert.ok(targetRoom, "Room should be discoverable via matchMaker");
    assert.strictEqual(targetRoom.clients, 1, "Should show 1 client");

    await room1.leave();
  });
});
