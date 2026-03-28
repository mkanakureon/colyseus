import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { LocalDriver, matchMaker, Server, LocalPresence } from "@colyseus/core";
import { BattleRoom } from "../src/rooms/BattleRoom.ts";
import { KaedevnAuthAdapter } from "../src/auth/KaedevnAuthAdapter.ts";
import { createTestToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";

const TEST_PORT = 9569;
const TEST_ENDPOINT = `ws://localhost:${TEST_PORT}`;

describe("BattleRoom", () => {
  const presence = new LocalPresence();
  const driver = new LocalDriver();
  const server = new Server({ greet: false, presence, driver });
  const authAdapter = new KaedevnAuthAdapter(TEST_JWT_SECRET);

  before(async () => {
    matchMaker.setup(presence, driver);
    BattleRoom.authAdapterInstance = authAdapter;
    server.define("battle", BattleRoom);
    await server.listen(TEST_PORT);
  });

  after(() => server.transport.shutdown());

  const enemyOpts = {
    enemyName: "スライム",
    enemyHp: 30,
    enemyAttack: 5,
    enemyDefense: 2,
  };

  function joinOpts(userId: string, overrides: Record<string, any> = {}) {
    return {
      token: createTestToken({ userId }),
      name: userId,
      attack: 15,
      defense: 5,
      ...enemyOpts,
      ...overrides,
    };
  }

  // === B-CREATE: Battle lifecycle ===

  it("B-CREATE-01: should create battle with enemy", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const room = await client.joinOrCreate("battle", joinOpts("battle-01"));
    await new Promise(r => setTimeout(r, 200));

    assert.ok(room.state);
    assert.strictEqual(room.state.phase, "selecting");
    assert.strictEqual(room.state.turn, 1);

    await room.leave();
  });

  it("B-CREATE-02: should have enemy in battlers", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const room = await client.joinOrCreate("battle", joinOpts("battle-02"));
    await new Promise(r => setTimeout(r, 200));

    const enemy = room.state.battlers.get("enemy-001");
    assert.ok(enemy, "Enemy should be in battlers");
    assert.strictEqual(enemy.name, "スライム");
    assert.strictEqual(enemy.hp, 30);
    assert.strictEqual(enemy.isPlayer, false);

    await room.leave();
  });

  it("B-JOIN-01: should add player to battlers", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const room = await client.joinOrCreate("battle", joinOpts("battle-join-01"));
    await new Promise(r => setTimeout(r, 200));

    const player = room.state.battlers.get("battle-join-01");
    assert.ok(player, "Player should be in battlers");
    assert.strictEqual(player.isPlayer, true);
    assert.strictEqual(player.attack, 15);

    await room.leave();
  });

  // === B-TURN: Turn-based combat ===

  it("B-TURN-01: should process attack action", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const room = await client.joinOrCreate("battle", joinOpts("battle-turn-01"));
    await new Promise(r => setTimeout(r, 200));

    const actionResult = new Promise<any>((resolve) => {
      room.onMessage("action_result", (msg) => {
        if (msg.actorId === "battle-turn-01") resolve(msg);
      });
    });

    room.send("action", { type: "attack", targetId: "enemy-001" });
    const result = await actionResult;

    assert.strictEqual(result.type, "attack");
    assert.strictEqual(result.targetId, "enemy-001");
    assert.ok(result.damage > 0);
    assert.ok(result.log.includes("[e:"));

    await room.leave();
  });

  it("B-TURN-02: should process defend action", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const room = await client.joinOrCreate("battle", joinOpts("battle-turn-02"));
    await new Promise(r => setTimeout(r, 200));

    const actionResult = new Promise<any>((resolve) => {
      room.onMessage("action_result", (msg) => {
        if (msg.actorId === "battle-turn-02") resolve(msg);
      });
    });

    room.send("action", { type: "defend" });
    const result = await actionResult;

    assert.strictEqual(result.type, "defend");
    assert.ok(result.log.includes("身を守っている"));

    await room.leave();
  });

  it("B-TURN-03: should process flee action", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const room = await client.joinOrCreate("battle", joinOpts("battle-turn-03"));
    await new Promise(r => setTimeout(r, 200));

    const battleResult = new Promise<any>((resolve) => {
      room.onMessage("battle_result", resolve);
    });

    room.send("action", { type: "flee" });
    const result = await battleResult;

    assert.strictEqual(result.result, "flee");
    assert.ok(result.log.includes("逃げ出した"));

    await room.leave();
  });

  it("B-TURN-04: should end battle when enemy dies", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    // Very weak enemy, strong player
    const room = await client.joinOrCreate("battle", joinOpts("battle-turn-04", {
      attack: 100,
      enemyHp: 5,
      enemyAttack: 1,
      enemyDefense: 0,
    }));
    await new Promise(r => setTimeout(r, 200));

    const battleResult = new Promise<any>((resolve) => {
      room.onMessage("battle_result", resolve);
    });

    room.send("action", { type: "attack", targetId: "enemy-001" });
    const result = await battleResult;

    assert.strictEqual(result.result, "win");
    assert.ok(result.expGained > 0);
    assert.ok(result.log.includes("[e:smile]"));

    await room.leave();
  });

  it("B-TURN-05: should trigger enemy turn after player", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    // Strong enemy that won't die in one hit
    const room = await client.joinOrCreate("battle", joinOpts("battle-turn-05", {
      attack: 5,
      defense: 5,
      enemyHp: 100,
      enemyAttack: 3,
      enemyDefense: 2,
    }));
    await new Promise(r => setTimeout(r, 200));

    // Collect action results
    const results: any[] = [];
    room.onMessage("action_result", (msg) => results.push(msg));

    room.send("action", { type: "attack", targetId: "enemy-001" });
    await new Promise(r => setTimeout(r, 500));

    // Should have player attack + enemy attack
    assert.ok(results.length >= 2, `Expected at least 2 action results, got ${results.length}`);
    const enemyAction = results.find(r => r.actorId === "enemy-001");
    assert.ok(enemyAction, "Enemy should have taken a turn");

    await room.leave();
  });

  // === B-CHEAT: Invalid actions ===

  it("B-CHEAT-01: should reject action when not your turn", async () => {
    const client1 = new SDKClient(TEST_ENDPOINT);
    const client2 = new SDKClient(TEST_ENDPOINT);

    const room1 = await client1.joinOrCreate("battle", joinOpts("battle-cheat-01a"));
    const room2 = await client2.join("battle", {
      token: createTestToken({ userId: "battle-cheat-01b" }),
      name: "battle-cheat-01b",
      attack: 10,
      defense: 5,
    });
    await new Promise(r => setTimeout(r, 200));

    // It's player1's turn. Player2 tries to act.
    const error = new Promise<any>((resolve) => {
      room2.onMessage("error", resolve);
    });

    room2.send("action", { type: "attack", targetId: "enemy-001" });
    const result = await error;
    assert.strictEqual(result.code, "BATTLE_NOT_YOUR_TURN");

    await room1.leave();
    await room2.leave();
  });

  it("B-CHEAT-02: should reject invalid action type", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const room = await client.joinOrCreate("battle", joinOpts("battle-cheat-02"));
    await new Promise(r => setTimeout(r, 200));

    const error = new Promise<any>((resolve) => {
      room.onMessage("error", resolve);
    });

    room.send("action", { type: "hack" as any });
    const result = await error;
    assert.strictEqual(result.code, "BATTLE_INVALID_ACTION");

    await room.leave();
  });

  // === B-LOG: Battle log ===

  it("B-LOG-01: should include inline tags in battle log", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const room = await client.joinOrCreate("battle", joinOpts("battle-log-01"));
    await new Promise(r => setTimeout(r, 200));

    const actionResult = new Promise<any>((resolve) => {
      room.onMessage("action_result", (msg) => {
        if (msg.actorId === "battle-log-01") resolve(msg);
      });
    });

    room.send("action", { type: "attack", targetId: "enemy-001" });
    const result = await actionResult;
    assert.ok(result.log.includes("[e:"), "Battle log should include inline tags");

    await room.leave();
  });

  it("B-LOG-02: should include inline tags in battle result", async () => {
    const client = new SDKClient(TEST_ENDPOINT);
    const room = await client.joinOrCreate("battle", joinOpts("battle-log-02", {
      attack: 100,
      enemyHp: 1,
      enemyDefense: 0,
    }));
    await new Promise(r => setTimeout(r, 200));

    const battleResult = new Promise<any>((resolve) => {
      room.onMessage("battle_result", resolve);
    });

    room.send("action", { type: "attack", targetId: "enemy-001" });
    const result = await battleResult;
    assert.ok(result.log.includes("[e:"), "Battle result log should include inline tags");

    await room.leave();
  });
});
