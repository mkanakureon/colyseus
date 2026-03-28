import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { LocalDriver, matchMaker, Server, LocalPresence } from "@colyseus/core";
import { ChatRoom } from "../src/rooms/ChatRoom.ts";
import { KaedevnAuthAdapter } from "../src/auth/KaedevnAuthAdapter.ts";
import { createTestToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";

const TEST_PORT = 9568;
const TEST_ENDPOINT = `ws://localhost:${TEST_PORT}`;

describe("ChatRoom", () => {
  const presence = new LocalPresence();
  const driver = new LocalDriver();
  const server = new Server({ greet: false, presence, driver });
  const authAdapter = new KaedevnAuthAdapter(TEST_JWT_SECRET);

  before(async () => {
    matchMaker.setup(presence, driver);
    ChatRoom.authAdapterInstance = authAdapter;
    server.define("chat", ChatRoom);
    await server.listen(TEST_PORT);
  });

  after(() => server.transport.shutdown());

  function joinOpts(userId: string, overrides: Record<string, any> = {}) {
    return {
      token: createTestToken({ userId }),
      name: userId,
      zoneId: "zone-001-village",
      ...overrides,
    };
  }

  // === C-GLOBAL ===

  it("C-GLOBAL-01: should broadcast global chat to all clients", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);

    const room1 = await client1.joinOrCreate("chat", joinOpts("chat-01a"));
    const room2 = await client2.join("chat", joinOpts("chat-01b"));
    await new Promise(r => setTimeout(r, 200));

    const received = new Promise<any>((resolve) => {
      room2.onMessage("chat_message", resolve);
    });

    room1.send("chat", { text: "こんにちは！", channel: "global" });
    const msg = await received;
    assert.strictEqual(msg.sender, "chat-01a");
    assert.strictEqual(msg.text, "こんにちは！");
    assert.strictEqual(msg.channel, "global");

    await room1.leave();
    await room2.leave();
  });

  it("C-GLOBAL-02: should preserve inline tags in chat", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);

    const room1 = await client1.joinOrCreate("chat", joinOpts("chat-02a"));
    const room2 = await client2.join("chat", joinOpts("chat-02b"));
    await new Promise(r => setTimeout(r, 200));

    const received = new Promise<any>((resolve) => {
      room2.onMessage("chat_message", resolve);
    });

    room1.send("chat", { text: "[e:smile]やあ！[click]元気？", channel: "global" });
    const msg = await received;
    assert.ok(msg.text.includes("[e:smile]"));
    assert.ok(msg.text.includes("[click]"));

    await room1.leave();
    await room2.leave();
  });

  // === C-ZONE ===

  it("C-ZONE-01: should send zone chat only to same zone", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);
    const client3 = new SDKClient(TEST_ENDPOINT);

    const room1 = await client1.joinOrCreate("chat", joinOpts("zone-01a", { zoneId: "zone-001-village" }));
    const room2 = await client2.join("chat", joinOpts("zone-01b", { zoneId: "zone-001-village" }));
    const room3 = await client3.join("chat", joinOpts("zone-01c", { zoneId: "zone-002-forest" }));
    await new Promise(r => setTimeout(r, 200));

    let room3Received = false;
    room3.onMessage("chat_message", () => { room3Received = true; });

    const received2 = new Promise<any>((resolve) => {
      room2.onMessage("chat_message", resolve);
    });

    room1.send("chat", { text: "村チャット", channel: "zone" });
    const msg = await received2;
    assert.strictEqual(msg.text, "村チャット");

    // Give room3 time to potentially receive
    await new Promise(r => setTimeout(r, 300));
    assert.strictEqual(room3Received, false, "Forest player should not receive village zone chat");

    await room1.leave();
    await room2.leave();
    await room3.leave();
  });

  // === C-WHISPER ===

  it("C-WHISPER-01: should send whisper only to target", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);
    const client3 = new SDKClient(TEST_ENDPOINT);

    const room1 = await client1.joinOrCreate("chat", joinOpts("whisp-01a"));
    const room2 = await client2.join("chat", joinOpts("whisp-01b"));
    const room3 = await client3.join("chat", joinOpts("whisp-01c"));
    await new Promise(r => setTimeout(r, 200));

    let room3Received = false;
    room3.onMessage("chat_message", () => { room3Received = true; });

    const received2 = new Promise<any>((resolve) => {
      room2.onMessage("chat_message", resolve);
    });

    room1.send("chat", { text: "ひみつ", channel: "whisper", targetId: "whisp-01b" });
    const msg = await received2;
    assert.strictEqual(msg.text, "ひみつ");
    assert.strictEqual(msg.whisper, true);

    await new Promise(r => setTimeout(r, 300));
    assert.strictEqual(room3Received, false, "Non-target should not receive whisper");

    await room1.leave();
    await room2.leave();
    await room3.leave();
  });

  it("C-WHISPER-02: should error for nonexistent target", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const room1 = await client1.joinOrCreate("chat", joinOpts("whisp-02a"));
    await new Promise(r => setTimeout(r, 200));

    const error = new Promise<any>((resolve) => {
      room1.onMessage("error", resolve);
    });

    room1.send("chat", { text: "誰？", channel: "whisper", targetId: "nonexistent-user" });
    const result = await error;
    assert.strictEqual(result.code, "CHAT_TARGET_NOT_FOUND");

    await room1.leave();
  });

  // === C-RATE ===

  it("C-RATE-01: should rate limit rapid messages", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const room1 = await client1.joinOrCreate("chat", joinOpts("rate-01a"));
    await new Promise(r => setTimeout(r, 200));

    const error = new Promise<any>((resolve) => {
      room1.onMessage("error", resolve);
    });

    // Send two messages in rapid succession
    room1.send("chat", { text: "1", channel: "global" });
    room1.send("chat", { text: "2", channel: "global" });

    const result = await error;
    assert.strictEqual(result.code, "CHAT_RATE_LIMITED");

    await room1.leave();
  });

  // === C-FORMAT ===

  it("C-FORMAT-01: should reject empty message", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const room1 = await client1.joinOrCreate("chat", joinOpts("fmt-01a"));
    await new Promise(r => setTimeout(r, 200));

    const error = new Promise<any>((resolve) => {
      room1.onMessage("error", resolve);
    });

    room1.send("chat", { text: "", channel: "global" });
    const result = await error;
    assert.strictEqual(result.code, "CHAT_EMPTY");

    await room1.leave();
  });

  it("C-FORMAT-02: should reject too long message", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const room1 = await client1.joinOrCreate("chat", joinOpts("fmt-02a"));
    await new Promise(r => setTimeout(r, 200));

    const error = new Promise<any>((resolve) => {
      room1.onMessage("error", resolve);
    });

    const longText = "あ".repeat(201);
    room1.send("chat", { text: longText, channel: "global" });
    const result = await error;
    assert.strictEqual(result.code, "CHAT_TOO_LONG");

    await room1.leave();
  });
});
