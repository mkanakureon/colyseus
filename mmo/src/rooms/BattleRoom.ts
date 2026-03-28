import { Room } from "colyseus";
import type { Client } from "@colyseus/core";
import { BattleState, BattlerState } from "../schemas/BattleState.ts";
import { KaedevnAuthAdapter, type KaedevnTokenPayload } from "../auth/KaedevnAuthAdapter.ts";
import type { BattleActionRequest, BattleActionResultEvent, BattlePhaseChangeEvent, BattleResultEvent, AppError } from "../types/messages.ts";

interface BattleRoomOptions {
  enemyName: string;
  enemyHp: number;
  enemyAttack: number;
  enemyDefense: number;
}

export class BattleRoom extends Room<BattleState> {
  static authAdapterInstance: KaedevnAuthAdapter;

  private authAdapter!: KaedevnAuthAdapter;
  private turnOrder: string[] = [];
  private turnIndex = 0;
  private actionLog: string[] = [];
  private clientToBattler = new Map<string, string>(); // sessionId -> battlerId

  onCreate(options: BattleRoomOptions) {
    this.setState(new BattleState());
    this.authAdapter = BattleRoom.authAdapterInstance;
    this.maxClients = 4;

    // Create enemy battler
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
    if (!payload) throw new Error("Invalid or expired token");
    return payload;
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

    // Start battle when first player joins
    if (this.state.phase === "waiting") {
      this.turnOrder.push("enemy-001");
      this.startBattle();
    }
  }

  async onLeave(client: Client) {
    // Player fled on disconnect
  }

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

  private handleAction(client: Client, data: BattleActionRequest) {
    // Find the battler for this client
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
      case "flee":
        this.executeFlee(actor);
        return; // flee ends the battle
      default:
        client.send("error", { code: "BATTLE_INVALID_ACTION", message: "無効なアクションです" } satisfies AppError);
        return;
    }

    // Check win/lose
    if (this.checkBattleEnd()) return;

    // Next turn
    this.advanceTurn();
  }

  private executeAttack(actor: BattlerState, targetId: string) {
    const target = this.state.battlers.get(targetId);
    if (!target || target.status === "dead") {
      return;
    }

    const damage = Math.max(1, actor.attack - target.defense + Math.floor(Math.random() * 3));
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp <= 0) {
      target.status = "dead";
    }

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
    // Temporary defense boost (simplified: just log it)
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

  private executeEnemyTurn() {
    const enemy = this.state.battlers.get("enemy-001");
    if (!enemy || enemy.status === "dead") {
      this.advanceTurn();
      return;
    }

    // Enemy attacks a random alive player
    const alivePlayers: BattlerState[] = [];
    this.state.battlers.forEach((b) => {
      if (b.isPlayer && b.status === "alive") alivePlayers.push(b);
    });

    if (alivePlayers.length === 0) return;

    const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    this.executeAttack(enemy, target.id);

    if (!this.checkBattleEnd()) {
      this.advanceTurn();
    }
  }

  private advanceTurn() {
    this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;

    // Skip dead battlers
    let attempts = 0;
    while (attempts < this.turnOrder.length) {
      const nextId = this.turnOrder[this.turnIndex];
      const battler = this.state.battlers.get(nextId);
      if (battler && battler.status === "alive") break;
      this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
      attempts++;
    }

    if (this.turnIndex === 0) {
      this.state.turn++;
    }

    const currentId = this.turnOrder[this.turnIndex];
    this.state.currentActorId = currentId;
    this.state.phase = "selecting";

    this.broadcast("phase_change", {
      phase: "selecting",
      currentActorId: currentId,
    } satisfies BattlePhaseChangeEvent);

    // Auto-execute enemy turn
    const current = this.state.battlers.get(currentId);
    if (current && !current.isPlayer) {
      this.state.phase = "executing";
      this.executeEnemyTurn();
    }
  }

  private checkBattleEnd(): boolean {
    const enemy = this.state.battlers.get("enemy-001");
    if (enemy && enemy.status === "dead") {
      this.state.phase = "result";
      this.state.result = "win";
      const expGained = 10;
      const goldGained = 5;
      const log = `[e:smile]${enemy.name}を倒した！[click]${expGained}EXP と ${goldGained}ゴールドを獲得！`;
      this.broadcast("battle_result", {
        result: "win",
        expGained,
        goldGained,
        drops: [],
        log,
      } satisfies BattleResultEvent);
      return true;
    }

    let allPlayersDead = true;
    this.state.battlers.forEach((b) => {
      if (b.isPlayer && b.status === "alive") allPlayersDead = false;
    });

    if (allPlayersDead) {
      this.state.phase = "result";
      this.state.result = "lose";
      const log = "[e:sad]全滅した...";
      this.broadcast("battle_result", {
        result: "lose",
        log,
      } satisfies BattleResultEvent);
      return true;
    }

    return false;
  }
}
