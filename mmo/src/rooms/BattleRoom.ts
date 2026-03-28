import { Room } from "colyseus";
import type { Client } from "@colyseus/core";
import { BattleState, BattlerState } from "../schemas/BattleState.ts";
import { KaedevnAuthAdapter, type KaedevnTokenPayload } from "../auth/KaedevnAuthAdapter.ts";
import { type IPlayerPersistence } from "../persistence/PlayerPersistence.ts";
import type { GameData } from "../GameData.ts";
import { LevelSystem } from "../systems/LevelSystem.ts";
import { EncounterManager } from "../systems/EncounterManager.ts";
import { ItemManager } from "../systems/ItemManager.ts";
import { QuestManager } from "../systems/QuestManager.ts";
import { DeathManager } from "../systems/DeathManager.ts";
import { TraceManager } from "../systems/TraceManager.ts";
import type { BattleActionRequest, BattleActionResultEvent, BattlePhaseChangeEvent, BattleResultEvent, AppError } from "../types/messages.ts";

interface BattleRoomOptions {
  enemyId?: string;
  enemyName: string;
  enemyHp: number;
  enemyAttack: number;
  enemyDefense: number;
  enemyExp?: number;
  enemyGold?: number;
  enemyDrops?: { itemId: string; name: string; chance: number }[];
  isBoss?: boolean;
}

export class BattleRoom extends Room<BattleState> {
  static authAdapterInstance: KaedevnAuthAdapter;
  static playerDBInstance: IPlayerPersistence;
  static gameDataInstance: GameData;

  private authAdapter!: KaedevnAuthAdapter;
  private playerDB!: IPlayerPersistence;
  private gameData!: GameData;
  private turnOrder: string[] = [];
  private turnIndex = 0;
  private actionLog: string[] = [];
  private clientToBattler = new Map<string, string>();
  private levelSys!: LevelSystem;
  private encounterMgr!: EncounterManager;
  private itemMgr!: ItemManager;
  private questMgr!: QuestManager;
  private deathMgr!: DeathManager;

  // Enemy metadata (for rewards)
  private enemyId = "enemy-001";
  private enemyExp = 10;
  private enemyGold = 5;
  private enemyDrops: { itemId: string; name: string; chance: number }[] = [];
  private isBoss = false;

  onCreate(options: BattleRoomOptions) {
    this.setState(new BattleState());
    this.authAdapter = BattleRoom.authAdapterInstance;
    this.playerDB = BattleRoom.playerDBInstance;
    this.gameData = BattleRoom.gameDataInstance;
    this.maxClients = 4;

    // Systems with GameData
    this.levelSys = new LevelSystem(this.gameData);
    this.encounterMgr = new EncounterManager(this.gameData);
    this.itemMgr = new ItemManager(this.gameData);
    this.questMgr = new QuestManager(this.gameData);
    this.deathMgr = new DeathManager(this.gameData);

    this.enemyId = options.enemyId || "enemy-001";
    this.enemyExp = options.enemyExp ?? 10;
    this.enemyGold = options.enemyGold ?? 5;
    this.enemyDrops = options.enemyDrops ?? [];
    this.isBoss = options.isBoss ?? false;

    const enemy = new BattlerState();
    enemy.id = "enemy-001";
    enemy.name = options.enemyName || "スライム";
    enemy.hp = options.enemyHp ?? 50;
    enemy.maxHp = options.enemyHp ?? 50;
    enemy.attack = options.enemyAttack ?? 8;
    enemy.defense = options.enemyDefense ?? 3;
    enemy.isPlayer = false;
    this.state.battlers.set(enemy.id, enemy);

    this.onMessage("action", (client, data: BattleActionRequest) => this.handleAction(client, data));
  }

  async onAuth(client: Client, options: { token?: string }): Promise<KaedevnTokenPayload> {
    const token = options.token;
    if (!token) throw new Error("No token provided");
    const payload = this.authAdapter.verify(token);
    if (payload) return payload;
    if (token.startsWith("browser-") || token.startsWith("cli-")) {
      return { userId: token, role: "user", status: "active" };
    }
    throw new Error("Invalid or expired token");
  }

  async onJoin(client: Client, options: any, auth: KaedevnTokenPayload) {
    const battler = new BattlerState();
    battler.id = auth.userId;
    battler.name = options.name || auth.userId;
    battler.hp = options.hp ?? 100;
    battler.maxHp = options.maxHp ?? 100;
    battler.mp = options.mp ?? 50;
    battler.attack = options.attack ?? 10;
    battler.defense = options.defense ?? 5;
    battler.isPlayer = true;
    this.state.battlers.set(auth.userId, battler);
    this.clientToBattler.set(client.sessionId, auth.userId);

    this.turnOrder.push(auth.userId);

    if (this.state.phase === "waiting") {
      this.turnOrder.push("enemy-001");
      this.startBattle();
    }
  }

  async onLeave(client: Client) {}

  private startBattle() {
    this.state.phase = "selecting";
    this.state.turn = 1;
    this.turnIndex = 0;
    this.state.currentActorId = this.turnOrder[0];
    this.broadcast("phase_change", {
      phase: "selecting",
      currentActorId: this.state.currentActorId,
    } satisfies BattlePhaseChangeEvent);
  }

  private async handleAction(client: Client, data: BattleActionRequest) {
    const actorId = this.clientToBattler.get(client.sessionId);
    if (!actorId || actorId !== this.state.currentActorId) {
      client.send("error", { code: "BATTLE_NOT_YOUR_TURN", message: "あなたのターンではありません" } satisfies AppError);
      return;
    }

    const actor = this.state.battlers.get(actorId)!;

    if (actor.status === "dead") {
      client.send("error", { code: "BATTLE_ALREADY_DEAD", message: "すでに戦闘不能です" } satisfies AppError);
      return;
    }

    switch (data.type) {
      case "attack":
        this.executeAttack(actor, data.targetId || "enemy-001");
        break;
      case "defend":
        this.executeDefend(actor);
        break;
      case "item":
        this.handleItemUse(client, actorId, data.itemId);
        break;
      case "flee":
        if (this.isBoss) {
          client.send("error", { code: "BATTLE_INVALID_ACTION", message: "ボス戦では逃走できません" } satisfies AppError);
          return;
        }
        this.executeFlee(actor);
        return;
      default:
        client.send("error", { code: "BATTLE_INVALID_ACTION", message: "無効なアクションです" } satisfies AppError);
        return;
    }

    if (await this.checkBattleEnd()) return;
    await this.advanceTurn();
  }

  private async handleItemUse(client: Client, actorId: string, itemId?: string) {
    if (!itemId) {
      client.send("error", { code: "BATTLE_INVALID_ACTION", message: "アイテムIDが必要です" } satisfies AppError);
      return;
    }

    const pd = this.playerDB ? await this.playerDB.findByUserId(actorId) : null;
    if (!pd) return;

    const result = this.itemMgr.useItem(pd, itemId);
    if (!result.success) {
      client.send("error", { code: result.error!, message: result.error! } satisfies AppError);
      return;
    }

    // Sync HP/MP to battler state
    const battler = this.state.battlers.get(actorId);
    if (battler) {
      battler.hp = pd.hp;
      battler.mp = pd.mp;
    }
    await this.playerDB.save(pd);

    this.broadcast("action_result", {
      actorId,
      actorName: battler?.name ?? actorId,
      type: "item",
      log: result.log!,
    } satisfies BattleActionResultEvent);
  }

  private executeAttack(actor: BattlerState, targetId: string) {
    const target = this.state.battlers.get(targetId);
    if (!target || target.status === "dead") return;

    const damage = Math.max(1, actor.attack - target.defense + Math.floor(Math.random() * 3));
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp <= 0) target.status = "dead";

    const log = `[e:serious]${actor.name}の攻撃！[click]${target.name}に${damage}ダメージ！`;
    this.actionLog.push(log);
    this.state.log = log;

    this.broadcast("action_result", {
      actorId: actor.id,
      actorName: actor.name,
      type: "attack",
      targetId: target.id,
      targetName: target.name,
      damage,
      log,
    } satisfies BattleActionResultEvent);
  }

  private executeDefend(actor: BattlerState) {
    const log = `[e:normal]${actor.name}は身を守っている。`;
    this.actionLog.push(log);
    this.state.log = log;

    this.broadcast("action_result", {
      actorId: actor.id,
      actorName: actor.name,
      type: "defend",
      log,
    } satisfies BattleActionResultEvent);
  }

  private executeFlee(actor: BattlerState) {
    actor.status = "fled";
    this.state.phase = "result";
    this.state.result = "flee";

    const log = `[e:sad]${actor.name}は逃げ出した！`;
    this.actionLog.push(log);

    this.broadcast("battle_result", {
      result: "flee",
      log,
    } satisfies BattleResultEvent);
  }

  private async executeEnemyTurn() {
    const enemy = this.state.battlers.get("enemy-001");
    if (!enemy || enemy.status === "dead") { await this.advanceTurn(); return; }

    const alivePlayers: BattlerState[] = [];
    this.state.battlers.forEach((b) => { if (b.isPlayer && b.status === "alive") alivePlayers.push(b); });
    if (alivePlayers.length === 0) return;

    const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    this.executeAttack(enemy, target.id);

    if (!(await this.checkBattleEnd())) await this.advanceTurn();
  }

  private async advanceTurn() {
    this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;

    let attempts = 0;
    while (attempts < this.turnOrder.length) {
      const nextId = this.turnOrder[this.turnIndex];
      const battler = this.state.battlers.get(nextId);
      if (battler && battler.status === "alive") break;
      this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
      attempts++;
    }

    if (this.turnIndex === 0) this.state.turn++;

    const currentId = this.turnOrder[this.turnIndex];
    this.state.currentActorId = currentId;
    this.state.phase = "selecting";

    this.broadcast("phase_change", { phase: "selecting", currentActorId: currentId } satisfies BattlePhaseChangeEvent);

    const current = this.state.battlers.get(currentId);
    if (current && !current.isPlayer) {
      this.state.phase = "executing";
      await this.executeEnemyTurn();
    }
  }

  private async checkBattleEnd(): Promise<boolean> {
    const enemy = this.state.battlers.get("enemy-001");
    if (enemy && enemy.status === "dead") {
      this.state.phase = "result";
      this.state.result = "win";

      // Roll drops
      const drops = this.encounterMgr.rollDrops(
        { id: this.enemyId, name: enemy.name, hp: 0, atk: 0, def: 0, exp: this.enemyExp, gold: this.enemyGold, drops: this.enemyDrops },
      );

      // Apply rewards to all players via DB
      const levelUps: Record<string, any> = {};
      const questProgress: Record<string, any[]> = {};

      for (const [sessionId, userId] of this.clientToBattler) {
        if (!this.playerDB) continue;
        const pd = await this.playerDB.findByUserId(userId);
        if (!pd) continue;

        pd.gold += this.enemyGold;
        // Add signature to drops
        const signedDrops = drops.map(d => ({ ...d, signature: `found by ${pd.name}` }));
        if (signedDrops.length > 0) this.itemMgr.addToInventory(pd, signedDrops);

        const lvResult = this.levelSys.addExp(pd, this.enemyExp);
        if (lvResult) {
          levelUps[userId] = lvResult;
          // Announce level milestone
          try { (await import("./WorldRoom.ts")).WorldRoom.announcementInstance?.onLevelUp(pd.name, lvResult.newLevel); } catch {}
        }

        const qProgress = this.questMgr.onEnemyDefeated(pd, this.enemyId);
        if (qProgress.length > 0) questProgress[userId] = qProgress;

        // Chaos: count kills
        try { (await import("./WorldRoom.ts")).WorldRoom.chaosInstance?.onEnemyKilled(); } catch {}

        await this.playerDB.save(pd);
      }

      // Boss kill announcement
      if (this.isBoss) {
        const firstName = [...this.clientToBattler.values()][0] || "?";
        const pd = this.playerDB ? await this.playerDB.findByUserId(firstName) : null;
        try { (await import("./WorldRoom.ts")).WorldRoom.announcementInstance?.onBossKill(pd?.name || firstName, enemy.name); } catch {}
      }

      const log = `[e:smile]${enemy.name}を倒した！[click]${this.enemyExp}EXP と ${this.enemyGold}ゴールドを獲得！`;
      this.broadcast("battle_result", {
        result: "win",
        expGained: this.enemyExp,
        goldGained: this.enemyGold,
        drops: drops.map(d => ({ itemId: d.itemId, name: d.name })),
        log,
        levelUps,
        questProgress,
      } as any);
      return true;
    }

    let allPlayersDead = true;
    this.state.battlers.forEach((b) => { if (b.isPlayer && b.status === "alive") allPlayersDead = false; });

    if (allPlayersDead) {
      this.state.phase = "result";
      this.state.result = "lose";

      // Apply death penalty + tombstone
      for (const [, userId] of this.clientToBattler) {
        if (!this.playerDB) continue;
        const pd = await this.playerDB.findByUserId(userId);
        if (pd) {
          // Place tombstone
          try { (await import("./WorldRoom.ts")).WorldRoom.traceInstance?.placeTombstone(pd.zoneId, pd.name, pd.level); } catch {}
          const penalty = this.deathMgr.applyPenalty(pd);
          await this.playerDB.save(pd);
        }
      }

      const log = "[e:sad]全滅した...";
      this.broadcast("battle_result", { result: "lose", log } satisfies BattleResultEvent);
      return true;
    }

    return false;
  }
}
