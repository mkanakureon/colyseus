/**
 * テキ��ト型MMO プレイスルー E2E テスト
 *
 * 実際のプレイに近い流れで全 Room を横断的にテ���トする。
 * 2人のプレイヤー（アキラ・ミサキ）が村で出会い、
 * NPCに話しかけ、チ���ットし、森で戦闘し、広場で取引する。
 */
import assert from "assert";
import { Client as SDKClient } from "@colyseus/sdk";
import { createMMOServer } from "../src/createServer.ts";
import { InMemoryPlayerDB, defaultPlayerData } from "../src/persistence/PlayerPersistence.ts";
import { createTestToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";
import { TEST_ZONES } from "./mocks/zone-map.ts";
import { stripTags, extractDirectives } from "./mocks/inline-tags.ts";

const TEST_PORT = 9580;
const ENDPOINT = `ws://localhost:${TEST_PORT}`;

// ── ヘルパー ──

/** メッセージを待つ（タイムアウト付き、フィルタ対応） */
function waitFor<T>(room: any, type: string, timeoutMs = 3000, filter?: (msg: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${type}"`)), timeoutMs);
    room.onMessage(type, (msg: T) => {
      if (filter && !filter(msg)) return; // skip non-matching
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

/** テキストログを蓄積するロガー */
class GameLog {
  lines: string[] = [];
  log(speaker: string, text: string) {
    const plain = stripTags(text);
    const directives = extractDirectives(text);
    const exprTag = directives.find(d => d.type === "expr");
    const expr = exprTag ? `(${exprTag.value})` : "";
    const line = `  ${speaker} ${expr}: ${plain}`;
    this.lines.push(line);
  }
  system(text: string) {
    this.lines.push(`  [SYSTEM] ${text}`);
  }
  section(title: string) {
    this.lines.push(`\n── ${title} ──`);
  }
  dump() {
    return this.lines.join("\n");
  }
}

// ── テスト本体 ──

describe("Playthrough E2E — テキスト型MMOプレイスルー", function () {
  this.timeout(30000);

  const playerDB = new InMemoryPlayerDB();
  let mmo: ReturnType<typeof createMMOServer>;
  const log = new GameLog();

  const village = TEST_ZONES[0]; // はじまりの村
  const forest = TEST_ZONES[1]; // 霧の森
  const market = TEST_ZONES[2]; // 交易広場

  before(async () => {
    mmo = createMMOServer({ jwtSecret: TEST_JWT_SECRET, playerDB });
    await mmo.listen(TEST_PORT);
  });

  after(function () {
    // プレイログを表示
    console.log("\n╔══════════════════════════════════════╗");
    console.log("║   MMO ���レイスルーログ                ║");
    console.log("╚══════════════════════════════════════╝");
    console.log(log.dump());
    console.log("\n══════════════════════════════════════\n");
    mmo.shutdown();
  });

  beforeEach(() => playerDB.clear());

  // ── ���ナリオ 1: 村で出会い、NPC��話しかけ、チャットする ──

  it("���ナリオ1: 村で出会い → NPC対話 → チャット", async () => {
    log.section("シナリオ1: はじまりの村");

    // アキラが村にログイン
    const akiraDB = defaultPlayerData("akira", "アキラ");
    akiraDB.hp = 100; akiraDB.level = 3;
    playerDB.seed([akiraDB]);

    const akiraSDK = new SDKClient(ENDPOINT);
    const akiraWorld = await akiraSDK.joinOrCreate("world", {
      token: createTestToken({ userId: "akira" }),
      zoneId: village.id, zoneName: village.name,
      npcs: village.npcs, adjacentZones: village.adjacentZones,
    });
    await new Promise(r => setTimeout(r, 200));
    log.system("アキラが「はじまりの村」にログインした");

    // ミサキが村にログイン
    const misakiDB = defaultPlayerData("misaki", "ミサキ");
    misakiDB.hp = 90; misakiDB.level = 2;
    playerDB.seed([misakiDB]);

    const misakiSDK = new SDKClient(ENDPOINT);
    const misakiWorld = await misakiSDK.join("world", {
      token: createTestToken({ userId: "misaki" }),
      zoneId: village.id, zoneName: village.name,
      npcs: village.npcs, adjacentZones: village.adjacentZones,
    });
    await new Promise(r => setTimeout(r, 300));
    log.system("ミサキが「はじまりの村」にログインした");

    // 2人が同じ部屋にいることを確認
    let playerCount = 0;
    misakiWorld.state.players.forEach(() => playerCount++);
    assert.strictEqual(playerCount, 2, "村に2人いるはず");
    log.system(`村のプレイヤー数: ${playerCount}人`);

    // アキラが長老に話しかける
    const npcDialogue = waitFor<any>(akiraWorld, "npc_dialogue");
    akiraWorld.send("interact", { targetId: "npc-elder" });
    const elder = await npcDialogue;
    log.log("長老ヨハン", elder.text);
    assert.strictEqual(elder.npcName, "長老ヨハン");
    assert.ok(elder.text.includes("[e:"));

    // アキラが商人にも話しかける
    const merchantDialogue = waitFor<any>(akiraWorld, "npc_dialogue");
    akiraWorld.send("interact", { targetId: "npc-merchant" });
    const merchant = await merchantDialogue;
    log.log("商人マリア", merchant.text);
    assert.strictEqual(merchant.npcName, "商人マリア");

    // チャットルームに入る
    const akiraChat = await akiraSDK.joinOrCreate("chat", {
      token: createTestToken({ userId: "akira" }),
      name: "アキラ", zoneId: village.id,
    });
    const misakiChat = await misakiSDK.join("chat", {
      token: createTestToken({ userId: "misaki" }),
      name: "ミサキ", zoneId: village.id,
    });
    await new Promise(r => setTimeout(r, 200));

    // アキラがグローバルチャット
    const chatReceived = waitFor<any>(misakiChat, "chat_message");
    akiraChat.send("chat", { text: "Hello Misaki!", channel: "global" });
    const chatMsg = await chatReceived;
    log.log("アキラ", chatMsg.text);
    assert.strictEqual(chatMsg.sender, "アキラ");
    assert.strictEqual(chatMsg.text, "Hello Misaki!");
    assert.strictEqual(chatMsg.channel, "global");

    // ミサキが返事（sender フィルタで自分のメッセージを除外）
    const replyReceived = waitFor<any>(akiraChat, "chat_message", 3000, (m: any) => m.sender === "ミサキ");
    await new Promise(r => setTimeout(r, 600)); // rate limit 回避
    misakiChat.send("chat", { text: "OK, let's go!", channel: "global" });
    const reply = await replyReceived;
    log.log("ミサキ", reply.text);
    assert.strictEqual(reply.sender, "ミサキ");
    assert.strictEqual(reply.text, "OK, let's go!");

    // アキラがミサキにウィスパー
    const whisper = waitFor<any>(misakiChat, "chat_message");
    await new Promise(r => setTimeout(r, 600));
    akiraChat.send("chat", { text: "実は回復薬たくさん持ってるから大丈夫", channel: "whisper", targetId: "misaki" });
    const whisperMsg = await whisper;
    log.log("アキラ→ミサキ(ひそひそ)", whisperMsg.text);
    assert.strictEqual(whisperMsg.whisper, true);

    // 表情を変える（同期テスト）
    akiraWorld.send("expression", { expression: "smile" });
    await new Promise(r => setTimeout(r, 300));
    const akiraInMisaki = misakiWorld.state.players.get(akiraWorld.sessionId);
    assert.ok(akiraInMisaki);
    assert.strictEqual(akiraInMisaki.expression, "smile");
    log.system("アキラが笑顔になった（ミサキの画面にも反映）");

    await akiraChat.leave();
    await misakiChat.leave();
    await akiraWorld.leave();
    await misakiWorld.leave();
  });

  // ── シナリオ 2: 森でゾーン移動し、モンスターと戦う ──

  it("シナリオ2: ゾーン移動 → 戦闘 → 勝利", async () => {
    log.section("シナリオ2: 霧の森で戦闘");

    // アキラが村にいる
    const akiraSDK = new SDKClient(ENDPOINT);
    const akiraVillage = await akiraSDK.joinOrCreate("world", {
      token: createTestToken({ userId: "akira-battle" }),
      zoneId: village.id, zoneName: village.name,
      adjacentZones: village.adjacentZones,
    });
    await new Promise(r => setTimeout(r, 200));
    log.system("アキラは「はじまりの村」にいる");

    // 北に移動 → ���へ
    const zoneChange = waitFor<any>(akiraVillage, "zone_change");
    akiraVillage.send("move", { direction: "north" });
    const newZone = await zoneChange;
    assert.strictEqual(newZone.zoneId, "zone-002-forest");
    log.system(`アキラは北へ移動した → ${forest.name}`);

    // 西に移動しようとす���（行き止まり）
    const moveError = waitFor<any>(akiraVillage, "error");
    akiraVillage.send("move", { direction: "west" });
    const err = await moveError;
    assert.strictEqual(err.code, "ZONE_NO_ADJACENT");
    log.system("西には道がない…（ZONE_NO_ADJACENT）");

    await akiraVillage.leave();

    // 戦闘開始！
    log.system("モンスターに遭遇！戦闘開始");
    const akiraSDK2 = new SDKClient(ENDPOINT);
    const battle = await akiraSDK2.joinOrCreate("battle", {
      token: createTestToken({ userId: "akira-fighter" }),
      name: "アキラ",
      attack: 20, defense: 8, hp: 100, maxHp: 100,
      enemyName: "森のゴブリン", enemyHp: 40, enemyAttack: 7, enemyDefense: 3,
    });
    await new Promise(r => setTimeout(r, 200));

    assert.strictEqual(battle.state.phase, "selecting");
    assert.strictEqual(battle.state.turn, 1);
    log.system(`��ーン${battle.state.turn}: アキラのターン`);

    // ターン1: 攻撃
    const attack1 = waitFor<any>(battle, "action_result");
    battle.send("action", { type: "attack", targetId: "enemy-001" });
    const result1 = await attack1;
    log.log("アキラ", result1.log);
    assert.ok(result1.damage > 0);

    // 敵のターン（自動）
    await new Promise(r => setTimeout(r, 500));

    // 敵が生��てたら��う1回攻撃
    const enemy = battle.state.battlers.get("enemy-001");
    if (enemy && enemy.status === "alive") {
      log.system(`ゴブリン残りHP: ${enemy.hp}/${enemy.maxHp}`);

      // ターン2: 攻撃して倒す
      const attack2Result = new Promise<any>((resolve) => {
        battle.onMessage("action_result", (msg: any) => {
          if (msg.actorId === "akira-fighter") resolve(msg);
        });
      });
      const battleEnd = new Promise<any>((resolve) => {
        battle.onMessage("battle_result", resolve);
      });

      await new Promise(r => setTimeout(r, 200));
      battle.send("action", { type: "attack", targetId: "enemy-001" });

      const result2 = await attack2Result;
      log.log("アキラ", result2.log);

      // 勝利判定
      const enemy2 = battle.state.battlers.get("enemy-001");
      if (enemy2 && enemy2.hp <= 0) {
        const victory = await battleEnd;
        log.system(`戦闘結果: ${victory.result}`);
        log.log("ナレーション", victory.log);
        assert.strictEqual(victory.result, "win");
        assert.ok(victory.expGained > 0);
      }
    } else {
      // 1撃で倒した
      const victory = await waitFor<any>(battle, "battle_result");
      log.system(`一撃で倒した！結果: ${victory.result}`);
      assert.strictEqual(victory.result, "win");
    }

    await battle.leave();
  });

  // ── シナリオ 3: 交易広場で取引する ──

  it("シナリオ3: 交易広場でアイテム取引", async () => {
    log.section("シナリオ3: 交易広場");

    const akiraSDK = new SDKClient(ENDPOINT);
    const misakiSDK = new SDKClient(ENDPOINT);

    // アキラ: 回復薬5個��ゴールド200
    const akiraRoom = await akiraSDK.joinOrCreate("trade", {
      token: createTestToken({ userId: "akira-trader" }),
      name: "アキラ", gold: 200,
      inventory: [
        { itemId: "potion-001", name: "回復薬", quantity: 5 },
        { itemId: "sword-002", name: "鋼の剣", quantity: 1 },
      ],
    });

    // ミサキ: 魔法の杖1本、ゴールド150
    const misakiRoom = await misakiSDK.join("trade", {
      token: createTestToken({ userId: "misaki-trader" }),
      name: "ミサキ", gold: 150,
      inventory: [
        { itemId: "staff-001", name: "魔法の杖", quantity: 1 },
        { itemId: "herb-001", name: "薬草", quantity: 10 },
      ],
    });
    await new Promise(r => setTimeout(r, 200));

    log.system("アキラとミサキが交易広場に入った");

    // アキラが回復薬3個を30ゴールドで出品
    const offerReceived = waitFor<any>(misakiRoom, "trade_offer");
    akiraRoom.send("offer", { itemId: "potion-001", quantity: 3, priceGold: 30 });
    const offer = await offerReceived;
    log.system(`アキラが出品: ${offer.itemName} ×${offer.quantity} → ${offer.priceGold}G`);
    assert.strictEqual(offer.itemName, "回復薬");
    assert.strictEqual(offer.quantity, 3);
    assert.strictEqual(offer.priceGold, 30);

    // ミサキが購入
    const tradeComplete = waitFor<any>(akiraRoom, "trade_complete");
    misakiRoom.send("accept", { offerId: offer.offerId });
    const result = await tradeComplete;
    log.system(`取引成立！ ${result.buyerName} が ${result.itemName} ×${result.quantity} を ${result.priceGold}G で購入`);
    assert.strictEqual(result.buyerName, "ミサキ");
    assert.strictEqual(result.sellerName, "アキラ");

    // ゴールド確認
    await new Promise(r => setTimeout(r, 200));
    const akiraState = akiraRoom.state.players.get(akiraRoom.sessionId);
    const misakiState = misakiRoom.state.players.get(misakiRoom.sessionId);
    assert.strictEqual(akiraState!.gold, 230); // 200 + 30
    assert.strictEqual(misakiState!.gold, 120); // 150 - 30
    log.system(`アキラのゴールド: ${akiraState!.gold}G / ミサキのゴールド: ${misakiState!.gold}G`);

    // ミサキが持っ��ないアイテムを出品しようとする
    const tradeError = waitFor<any>(misakiRoom, "error");
    misakiRoom.send("offer", { itemId: "sword-999", quantity: 1, priceGold: 100 });
    const errResult = await tradeError;
    assert.strictEqual(errResult.code, "TRADE_ITEM_NOT_OWNED");
    log.system("ミサキが存在しないアイテムを出品 → 拒否（TRADE_ITEM_NOT_OWNED）");

    // アキラが鋼の剣を出品 → キャンセル
    const offer2Received = waitFor<any>(misakiRoom, "trade_offer");
    akiraRoom.send("offer", { itemId: "sword-002", quantity: 1, priceGold: 100 });
    const offer2 = await offer2Received;
    log.system(`アキラが出品: ${offer2.itemName} → ${offer2.priceGold}G`);

    const cancelled = waitFor<any>(akiraRoom, "trade_cancelled");
    akiraRoom.send("cancel", { offerId: offer2.offerId });
    await cancelled;
    log.system("アキラが出品をキャンセルした");

    await akiraRoom.leave();
    await misakiRoom.leave();
  });

  // ── シナリオ 4: 戦闘で逃走 + ���正��為の拒否 ──

  it("シナリオ4: 逃走と不正行為", async () => {
    log.section("シナリオ4: 逃走と不正行為");

    const akiraSDK = new SDKClient(ENDPOINT);
    const misakiSDK = new SDKClient(ENDPOINT);

    // 2人���ーテ��で戦闘
    const akiraRoom = await akiraSDK.joinOrCreate("battle", {
      token: createTestToken({ userId: "akira-flee" }),
      name: "アキラ", attack: 10, defense: 5,
      enemyName: "ドラゴン", enemyHp: 999, enemyAttack: 50, enemyDefense: 30,
    });
    const misakiRoom = await misakiSDK.join("battle", {
      token: createTestToken({ userId: "misaki-flee" }),
      name: "ミサキ", attack: 8, defense: 4,
    });
    await new Promise(r => setTimeout(r, 200));
    log.system("ドラゴンに遭遇！HP999… これは勝てない");

    // ミサキが自分のターンでないのに���動しようとする
    const cheatError = waitFor<any>(misakiRoom, "error");
    misakiRoom.send("action", { type: "attack", targetId: "enemy-001" });
    const cheatResult = await cheatError;
    assert.strictEqual(cheatResult.code, "BATTLE_NOT_YOUR_TURN");
    log.system("ミサキが割り込み攻撃 → 拒否（BATTLE_NOT_YOUR_TURN）");

    // アキラが不正なアク���ョン
    const hackError = waitFor<any>(akiraRoom, "error");
    akiraRoom.send("action", { type: "oneshot_kill" as any });
    const hackResult = await hackError;
    assert.strictEqual(hackResult.code, "BATTLE_INVALID_ACTION");
    log.system("アキラが「即死攻撃」を試みる → 拒否（BATTLE_INVALID_ACTION）");

    // アキラが逃走
    const fleeResult = waitFor<any>(akiraRoom, "battle_result");
    akiraRoom.send("action", { type: "flee" });
    const flee = await fleeResult;
    assert.strictEqual(flee.result, "flee");
    log.log("ナレーション", flee.log);
    log.system("アキラたちは逃げ出した！");

    await akiraRoom.leave();
    await misakiRoom.leave();
  });

  // ── シナリオ 5: チャットのバリデーション ──

  it("シナリオ5: チャット制限と異常系", async () => {
    log.section("シナリオ5: チャット制限");

    const akiraSDK = new SDKClient(ENDPOINT);
    const akiraChat = await akiraSDK.joinOrCreate("chat", {
      token: createTestToken({ userId: "akira-chat-test" }),
      name: "アキラ", zoneId: village.id,
    });
    await new Promise(r => setTimeout(r, 200));

    // 空メッセージ
    const emptyErr = waitFor<any>(akiraChat, "error");
    akiraChat.send("chat", { text: "", channel: "global" });
    const e1 = await emptyErr;
    assert.strictEqual(e1.code, "CHAT_EMPTY");
    log.system("空メッセージ送信 → 拒否（CHAT_EMPTY）");

    // 長すぎるメッセージ
    const longErr = waitFor<any>(akiraChat, "error");
    akiraChat.send("chat", { text: "あ".repeat(201), channel: "global" });
    const e2 = await longErr;
    assert.strictEqual(e2.code, "CHAT_TOO_LONG");
    log.system("201文字メッセージ → 拒否（CHAT_TOO_LONG）");

    // 連��送信（レート制限）
    akiraChat.send("chat", { text: "1回目", channel: "global" });
    const rateErr = waitFor<any>(akiraChat, "error");
    akiraChat.send("chat", { text: "2回目", channel: "global" });
    const e3 = await rateErr;
    assert.strictEqual(e3.code, "CHAT_RATE_LIMITED");
    log.system("連続送信 → 拒否（CHAT_RATE_LIMITED）");

    // 存在しないユーザーへのウィスパー
    await new Promise(r => setTimeout(r, 600));
    const whisperErr = waitFor<any>(akiraChat, "error");
    akiraChat.send("chat", { text: "おーい", channel: "whisper", targetId: "nobody" });
    const e4 = await whisperErr;
    assert.strictEqual(e4.code, "CHAT_TARGET_NOT_FOUND");
    log.system("存在しないユーザーにウィスパー → 拒否（CHAT_TARGET_NOT_FOUND）");

    await akiraChat.leave();
  });
});
