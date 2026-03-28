import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { LocalDriver, matchMaker, Server, LocalPresence } from "@colyseus/core";
import { TradeRoom } from "../src/rooms/TradeRoom.ts";
import { KaedevnAuthAdapter } from "../src/auth/KaedevnAuthAdapter.ts";
import { InMemoryPlayerDB } from "../src/persistence/PlayerPersistence.ts";
import { createTestToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";

const TEST_PORT = 9570;
const TEST_ENDPOINT = `ws://localhost:${TEST_PORT}`;

describe("TradeRoom", () => {
  const presence = new LocalPresence();
  const driver = new LocalDriver();
  const server = new Server({ greet: false, presence, driver });
  const authAdapter = new KaedevnAuthAdapter(TEST_JWT_SECRET);
  const playerDB = new InMemoryPlayerDB();

  before(async () => {
    matchMaker.setup(presence, driver);
    TradeRoom.authAdapterInstance = authAdapter;
    TradeRoom.playerDBInstance = playerDB;
    server.define("trade", TradeRoom);
    await server.listen(TEST_PORT);
  });

  after(() => server.transport.shutdown());

  const testInventory = [
    { itemId: "potion-001", name: "回復薬", quantity: 5 },
    { itemId: "sword-001", name: "鉄の剣", quantity: 1 },
  ];

  function joinOpts(userId: string, overrides: Record<string, any> = {}) {
    return {
      token: createTestToken({ userId }),
      name: userId,
      gold: 100,
      inventory: [...testInventory.map(i => ({ ...i }))],
      ...overrides,
    };
  }

  // === T-OFFER ===

  it("T-OFFER-01: should create item offer", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);

    const room1 = await client1.joinOrCreate("trade", joinOpts("seller-01"));
    const room2 = await client2.join("trade", joinOpts("buyer-01"));
    await new Promise(r => setTimeout(r, 200));

    const offerReceived = new Promise<any>((resolve) => {
      room2.onMessage("trade_offer", resolve);
    });

    room1.send("offer", { itemId: "potion-001", quantity: 2, priceGold: 10 });
    const offer = await offerReceived;

    assert.strictEqual(offer.sellerId, "seller-01");
    assert.strictEqual(offer.itemName, "回復薬");
    assert.strictEqual(offer.quantity, 2);
    assert.strictEqual(offer.priceGold, 10);

    await room1.leave();
    await room2.leave();
  });

  // === T-ACCEPT ===

  it("T-ACCEPT-01: should complete trade on accept", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);

    const room1 = await client1.joinOrCreate("trade", joinOpts("seller-02"));
    const room2 = await client2.join("trade", joinOpts("buyer-02"));
    await new Promise(r => setTimeout(r, 200));

    const offerReceived = new Promise<any>((resolve) => {
      room2.onMessage("trade_offer", resolve);
    });

    room1.send("offer", { itemId: "potion-001", quantity: 1, priceGold: 10 });
    const offer = await offerReceived;

    const tradeComplete = new Promise<any>((resolve) => {
      room1.onMessage("trade_complete", resolve);
    });

    room2.send("accept", { offerId: offer.offerId });
    const result = await tradeComplete;

    assert.strictEqual(result.buyerId, "buyer-02");
    assert.strictEqual(result.sellerId, "seller-02");
    assert.strictEqual(result.itemName, "回復薬");
    assert.strictEqual(result.priceGold, 10);

    await room1.leave();
    await room2.leave();
  });

  // === T-CANCEL ===

  it("T-CANCEL-01: should cancel own offer", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);

    const room1 = await client1.joinOrCreate("trade", joinOpts("seller-03"));
    const room2 = await client2.join("trade", joinOpts("buyer-03"));
    await new Promise(r => setTimeout(r, 200));

    const offerReceived = new Promise<any>((resolve) => {
      room2.onMessage("trade_offer", resolve);
    });

    room1.send("offer", { itemId: "sword-001", quantity: 1, priceGold: 50 });
    const offer = await offerReceived;

    const cancelled = new Promise<any>((resolve) => {
      room1.onMessage("trade_cancelled", resolve);
    });

    room1.send("cancel", { offerId: offer.offerId });
    const result = await cancelled;
    assert.strictEqual(result.offerId, offer.offerId);

    await room1.leave();
    await room2.leave();
  });

  // === T-INVALID ===

  it("T-INVALID-01: should reject offer for unowned item", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const room1 = await client1.joinOrCreate("trade", joinOpts("seller-04", {
      inventory: [], // empty inventory
    }));
    await new Promise(r => setTimeout(r, 200));

    const error = new Promise<any>((resolve) => {
      room1.onMessage("error", resolve);
    });

    room1.send("offer", { itemId: "potion-001", quantity: 1, priceGold: 10 });
    const result = await error;
    assert.strictEqual(result.code, "TRADE_ITEM_NOT_OWNED");

    await room1.leave();
  });

  it("T-INVALID-02: should remove offers on disconnect", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);

    const room1 = await client1.joinOrCreate("trade", joinOpts("seller-05"));
    const room2 = await client2.join("trade", joinOpts("buyer-05"));
    await new Promise(r => setTimeout(r, 200));

    const offerReceived = new Promise<any>((resolve) => {
      room2.onMessage("trade_offer", resolve);
    });

    room1.send("offer", { itemId: "potion-001", quantity: 1, priceGold: 10 });
    const offer = await offerReceived;

    // Seller disconnects
    await room1.leave();
    await new Promise(r => setTimeout(r, 200));

    // Buyer tries to accept the now-removed offer
    const error = new Promise<any>((resolve) => {
      room2.onMessage("error", resolve);
    });

    room2.send("accept", { offerId: offer.offerId });
    const result = await error;
    assert.strictEqual(result.code, "TRADE_OFFER_NOT_FOUND");

    await room2.leave();
  });
});
