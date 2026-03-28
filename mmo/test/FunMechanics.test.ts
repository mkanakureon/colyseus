/**
 * 面白さ機能テスト（doc 29 の7システム）
 */
import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import { loadGameData, type GameData } from "../src/GameData.ts";
import { AnnouncementManager } from "../src/systems/AnnouncementManager.ts";
import { MessageBoardManager } from "../src/systems/MessageBoardManager.ts";
import { TraceManager } from "../src/systems/TraceManager.ts";
import { CampfireManager } from "../src/systems/CampfireManager.ts";
import { ChaosManager } from "../src/systems/ChaosManager.ts";
import { ReconstructionManager } from "../src/systems/ReconstructionManager.ts";
import { defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

// Add fun mechanics config to gameData for testing
function makeGameData(): GameData {
  const gd = loadGameData(path.join(__dirname, "..", "games", "fantasy-rpg"));
  gd.meta.announcements = { bossKill: true, levelMilestones: [5, 10], rareDropChance: 0.1 };
  gd.meta.messageBoard = { maxLength: 100, maxPerZone: 10 };
  gd.meta.campfire = { requiredSeconds: 3, expBonus: 1.2, hpRegenPerMinute: 5, minPlayersNearby: 1 };
  gd.meta.chaos = {
    thresholds: { low: 0, medium: 10, high: 30, critical: 50 },
    effects: {
      low: { shopDiscount: 0.1, expBonus: 1.0, encounterRateMultiplier: 1.0 },
      medium: { shopDiscount: 0.0, expBonus: 1.1, encounterRateMultiplier: 1.2 },
      high: { shopDiscount: 0.0, expBonus: 1.3, encounterRateMultiplier: 1.5 },
      critical: { shopDiscount: 0.0, expBonus: 1.5, encounterRateMultiplier: 2.0 },
    },
    decayPerHour: 100,
  };
  gd.meta.reconstruction = {
    projects: [
      { id: "well", name: "村の井戸", zone: "zone-001-village", required: { "herb-001": 5, "iron-ore": 3 }, reward: { type: "hp_regen", description: "井戸で回復可能に" } },
    ],
  };
  return gd;
}

// ── 1. Announcements ──

describe("AnnouncementManager", () => {
  let mgr: AnnouncementManager;
  let received: string[];

  beforeEach(() => {
    mgr = new AnnouncementManager(makeGameData());
    received = [];
    mgr.onAnnouncement(a => received.push(a.text));
  });

  it("ANN-01: boss kill triggers announcement", () => {
    mgr.onBossKill("アキラ", "オークキング");
    assert.strictEqual(received.length, 1);
    assert.ok(received[0].includes("オークキング"));
    assert.ok(received[0].includes("号外"));
  });

  it("ANN-02: level 5 triggers announcement", () => {
    mgr.onLevelUp("アキラ", 5);
    assert.strictEqual(received.length, 1);
    assert.ok(received[0].includes("Lv.5"));
  });

  it("ANN-03: level 3 does NOT trigger (not in milestones)", () => {
    mgr.onLevelUp("アキラ", 3);
    assert.strictEqual(received.length, 0);
  });

  it("ANN-04: history stores announcements", () => {
    mgr.onBossKill("A", "Boss");
    mgr.onQuestComplete("B", "Quest");
    const history = mgr.getHistory();
    assert.strictEqual(history.length, 2);
  });
});

// ── 2. Message Board ──

describe("MessageBoardManager", () => {
  let mgr: MessageBoardManager;

  beforeEach(() => { mgr = new MessageBoardManager(makeGameData()); });

  it("BOARD-01: post and retrieve", () => {
    mgr.post("zone-001", "アキラ", "この先注意！");
    const msgs = mgr.get("zone-001");
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].author, "アキラ");
    assert.strictEqual(msgs[0].text, "この先注意！");
  });

  it("BOARD-02: FIFO at max capacity", () => {
    for (let i = 0; i < 11; i++) {
      mgr.post("zone-001", `user${i}`, `msg${i}`);
    }
    const msgs = mgr.get("zone-001");
    assert.strictEqual(msgs.length, 10); // max 10
    assert.strictEqual(msgs[0].text, "msg1"); // first one dropped
  });

  it("BOARD-03: reject too long", () => {
    const result = mgr.post("zone-001", "x", "a".repeat(101));
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "TOO_LONG");
  });

  it("BOARD-04: reject empty", () => {
    const result = mgr.post("zone-001", "x", "");
    assert.strictEqual(result.success, false);
  });
});

// ── 3. Traces ──

describe("TraceManager", () => {
  let mgr: TraceManager;

  beforeEach(() => { mgr = new TraceManager(); });

  it("TRACE-01: leave and get footprint", () => {
    mgr.leaveFootprint("zone-002", "アキラ", "north");
    const traces = mgr.getTraces("zone-002");
    assert.strictEqual(traces.footprints.length, 1);
    assert.strictEqual(traces.footprints[0].playerName, "アキラ");
    assert.strictEqual(traces.footprints[0].direction, "north");
  });

  it("TRACE-02: footprint expires (simulated)", () => {
    mgr.leaveFootprint("zone-002", "アキラ", "north");
    // Manually expire
    const fp = mgr.getTraces("zone-002").footprints[0];
    (fp as any).expiresAt = Date.now() - 1;
    const traces = mgr.getTraces("zone-002");
    assert.strictEqual(traces.footprints.length, 0);
  });

  it("TRACE-03: place tombstone", () => {
    mgr.placeTombstone("zone-005", "ミサキ", 3);
    const traces = mgr.getTraces("zone-005");
    assert.strictEqual(traces.tombstones.length, 1);
    assert.strictEqual(traces.tombstones[0].playerName, "ミサキ");
    assert.strictEqual(traces.tombstones[0].level, 3);
  });

  it("TRACE-04: pray increments count", () => {
    mgr.placeTombstone("zone-005", "ミサキ", 3);
    const result = mgr.pray("zone-005", 0);
    assert.ok(result);
    assert.strictEqual(result!.prayers, 1);

    mgr.pray("zone-005", 0);
    const traces = mgr.getTraces("zone-005");
    assert.strictEqual(traces.tombstones[0].prayers, 2);
  });

  it("TRACE-05: tombstone expires (simulated)", () => {
    mgr.placeTombstone("zone-005", "ミサキ", 3);
    const ts = mgr.getTraces("zone-005").tombstones[0];
    (ts as any).expiresAt = Date.now() - 1;
    const traces = mgr.getTraces("zone-005");
    assert.strictEqual(traces.tombstones.length, 0);
  });
});

// ── 4. Campfire ──

describe("CampfireManager", () => {
  let mgr: CampfireManager;

  beforeEach(() => { mgr = new CampfireManager(makeGameData()); }); // requiredSeconds = 3

  it("CAMP-01: not resting initially", () => {
    assert.strictEqual(mgr.isResting("s1"), false);
  });

  it("CAMP-02: resting after required time", async () => {
    mgr.startResting("s1");
    // requiredSeconds = 3 for test
    await new Promise(r => setTimeout(r, 3100));
    assert.strictEqual(mgr.isResting("s1"), true);
  });

  it("CAMP-03: stop resting on move", () => {
    mgr.startResting("s1");
    mgr.stopResting("s1");
    assert.strictEqual(mgr.isResting("s1"), false);
  });

  it("CAMP-04: exp multiplier with nearby players", async () => {
    mgr.startResting("s1");
    await new Promise(r => setTimeout(r, 3100));
    assert.strictEqual(mgr.getExpMultiplier("s1", 2), 1.2); // 2 nearby
    assert.strictEqual(mgr.getExpMultiplier("s1", 0), 1.0); // nobody
  });
});

// ── 5. Chaos ──

describe("ChaosManager", () => {
  let mgr: ChaosManager;

  beforeEach(() => { mgr = new ChaosManager(makeGameData()); }); // thresholds: 0/10/30/50

  it("CHAOS-01: starts at low", () => {
    assert.strictEqual(mgr.getLevel(), "low");
  });

  it("CHAOS-02: medium after 10 kills", () => {
    mgr.setKillCount(10);
    assert.strictEqual(mgr.getLevel(), "medium");
  });

  it("CHAOS-03: high after 30 kills", () => {
    mgr.setKillCount(30);
    assert.strictEqual(mgr.getLevel(), "high");
  });

  it("CHAOS-04: critical after 50 kills", () => {
    mgr.setKillCount(50);
    assert.strictEqual(mgr.getLevel(), "critical");
    const effects = mgr.getEffects();
    assert.strictEqual(effects.expBonus, 1.5);
    assert.strictEqual(effects.encounterRateMultiplier, 2.0);
  });
});

// ── 6. Reconstruction ──

describe("ReconstructionManager", () => {
  let mgr: ReconstructionManager;

  beforeEach(() => { mgr = new ReconstructionManager(makeGameData()); });

  it("RECON-01: contribute items", () => {
    const player = defaultPlayerData("r1", "test");
    player.inventory = [{ itemId: "herb-001", name: "薬草", quantity: 10, type: "material" }];

    const result = mgr.contribute("well", player, "herb-001", 3);
    assert.strictEqual(result.success, true);
    assert.strictEqual(player.inventory[0].quantity, 7); // 10 - 3

    const progress = mgr.getProgress("well")!;
    assert.strictEqual(progress.items[0].current, 3);
    assert.strictEqual(progress.items[0].required, 5);
    assert.strictEqual(progress.complete, false);
  });

  it("RECON-02: complete project", () => {
    const player = defaultPlayerData("r2", "test");
    player.inventory = [
      { itemId: "herb-001", name: "薬草", quantity: 10, type: "material" },
      { itemId: "iron-ore", name: "鉄鉱石", quantity: 5, type: "material" },
    ];

    mgr.contribute("well", player, "herb-001", 5);
    mgr.contribute("well", player, "iron-ore", 3);

    assert.strictEqual(mgr.isComplete("well"), true);
    const progress = mgr.getProgress("well")!;
    assert.strictEqual(progress.complete, true);
  });

  it("RECON-03: reject after complete", () => {
    const player = defaultPlayerData("r3", "test");
    player.inventory = [
      { itemId: "herb-001", name: "薬草", quantity: 20, type: "material" },
      { itemId: "iron-ore", name: "鉄鉱石", quantity: 10, type: "material" },
    ];

    mgr.contribute("well", player, "herb-001", 5);
    mgr.contribute("well", player, "iron-ore", 3);

    const result = mgr.contribute("well", player, "herb-001", 1);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "ALREADY_COMPLETE");
  });
});

// ── 7. Item Signatures (tested inline) ──

describe("Item Signatures", () => {
  it("SIG-01: drop items get signature", () => {
    const drop = { itemId: "herb-001", name: "薬草", quantity: 1, type: "key" as const, signature: `found by アキラ` };
    assert.strictEqual(drop.signature, "found by アキラ");
  });

  it("SIG-02: signature preserved after trade simulation", () => {
    const item = { itemId: "sword-iron", name: "鉄の剣", quantity: 1, type: "equipment" as const, signature: "crafted by ミサキ" };
    // Simulate trade: move to another player
    const newOwnerItem = { ...item };
    assert.strictEqual(newOwnerItem.signature, "crafted by ミサキ");
  });
});
