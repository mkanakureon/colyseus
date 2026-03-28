import { Room, Client } from "colyseus";
import { WorldState, NPCState } from "../schemas/WorldState.ts";
import { PlayerState } from "../schemas/PlayerState.ts";
import { KaedevnAuthAdapter, type KaedevnTokenPayload } from "../auth/KaedevnAuthAdapter.ts";
import { type IPlayerPersistence, defaultPlayerData } from "../persistence/PlayerPersistence.ts";
import type { WorldMoveRequest, WorldInteractRequest, WorldExpressionRequest, WorldPoseRequest, AppError } from "../types/messages.ts";

interface WorldRoomOptions {
  zoneId: string;
  zoneName: string;
  maxPlayers?: number;
  npcs?: { id: string; name: string; expression: string; pose: string; x: number; y: number; dialogue: string[] }[];
  adjacentZones?: { direction: string; zoneId: string }[];
  authAdapter: KaedevnAuthAdapter;
  playerDB: IPlayerPersistence;
}

export class WorldRoom extends Room<WorldState> {
  // Static DI — set before server.define()
  static authAdapterInstance: KaedevnAuthAdapter;
  static playerDBInstance: IPlayerPersistence;

  private authAdapter!: KaedevnAuthAdapter;
  private playerDB!: IPlayerPersistence;
  private adjacentZones: { direction: string; zoneId: string }[] = [];
  private npcDialogues = new Map<string, string[]>();

  onCreate(options: WorldRoomOptions) {
    this.setState(new WorldState());
    this.state.zoneId = options.zoneId || "zone-001-village";
    this.state.zoneName = options.zoneName || "";
    this.maxClients = options.maxPlayers ?? 50;
    // Static DI takes priority (client options can't contain class instances)
    this.authAdapter = WorldRoom.authAdapterInstance;
    this.playerDB = WorldRoom.playerDBInstance;
    this.adjacentZones = options.adjacentZones ?? [];

    // Load NPCs
    if (options.npcs) {
      for (const npc of options.npcs) {
        const npcState = new NPCState();
        npcState.id = npc.id;
        npcState.name = npc.name;
        npcState.expression = npc.expression;
        npcState.pose = npc.pose;
        npcState.x = npc.x;
        npcState.y = npc.y;
        this.state.npcs.set(npc.id, npcState);
        this.npcDialogues.set(npc.id, npc.dialogue);
      }
    }

    // Message handlers
    this.onMessage("move", (client, data: WorldMoveRequest) => this.handleMove(client, data));
    this.onMessage("interact", (client, data: WorldInteractRequest) => this.handleInteract(client, data));
    this.onMessage("expression", (client, data: WorldExpressionRequest) => this.handleExpression(client, data));
    this.onMessage("pose", (client, data: WorldPoseRequest) => this.handlePose(client, data));
  }

  async onAuth(client: Client, options: { token?: string }): Promise<KaedevnTokenPayload> {
    const token = options.token;
    if (!token) throw new Error("No token provided");

    const payload = this.authAdapter.verify(token);
    if (!payload) throw new Error("Invalid or expired token");

    return payload;
  }

  async onJoin(client: Client, options: any, auth: KaedevnTokenPayload) {
    // Load or create player data
    let playerData = await this.playerDB.findByUserId(auth.userId);
    if (!playerData) {
      playerData = defaultPlayerData(auth.userId, auth.userId);
    }

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = auth.userId;
    player.name = playerData.name;
    player.gender = playerData.gender;
    player.preset = playerData.preset;
    player.x = playerData.x;
    player.y = playerData.y;
    player.hp = playerData.hp;
    player.maxHp = playerData.maxHp;
    player.mp = playerData.mp;
    player.level = playerData.level;

    this.state.players.set(client.sessionId, player);
  }

  async onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      // Save to DB
      const existing = await this.playerDB.findByUserId(player.userId);
      if (existing) {
        existing.x = player.x;
        existing.y = player.y;
        existing.hp = player.hp;
        existing.mp = player.mp;
        existing.lastLogin = Date.now();
        await this.playerDB.save(existing);
      }
      this.state.players.delete(client.sessionId);
    }
  }

  async onDispose() {
    // Save zone state if needed
  }

  private handleMove(client: Client, data: WorldMoveRequest) {
    const adjacent = this.adjacentZones.find(a => a.direction === data.direction);
    if (!adjacent) {
      client.send("error", { code: "ZONE_NO_ADJACENT", message: `${data.direction} 方向には移動できません` } satisfies AppError);
      return;
    }
    client.send("zone_change", { zoneId: adjacent.zoneId, zoneName: "" });
  }

  private handleInteract(client: Client, data: WorldInteractRequest) {
    const dialogues = this.npcDialogues.get(data.targetId);
    const npc = this.state.npcs.get(data.targetId);
    if (!dialogues || !npc) {
      client.send("error", { code: "NPC_NOT_FOUND", message: "NPC が見つかりません" } satisfies AppError);
      return;
    }
    // Send a random dialogue line (with inline tags)
    const text = dialogues[Math.floor(Math.random() * dialogues.length)];
    client.send("npc_dialogue", { npcId: npc.id, npcName: npc.name, text });
  }

  private handleExpression(client: Client, data: WorldExpressionRequest) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.expression = data.expression;
    }
  }

  private handlePose(client: Client, data: WorldPoseRequest) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.pose = data.pose;
    }
  }
}
