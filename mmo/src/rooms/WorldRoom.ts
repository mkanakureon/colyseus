import { Room } from "colyseus";
import type { Client } from "@colyseus/core";
import { WorldState, NPCState } from "../schemas/WorldState.ts";
import { PlayerState } from "../schemas/PlayerState.ts";
import { KaedevnAuthAdapter, type KaedevnTokenPayload } from "../auth/KaedevnAuthAdapter.ts";
import { type IPlayerPersistence, defaultPlayerData } from "../persistence/PlayerPersistence.ts";
import type { GameData } from "../GameData.ts";
import { getQuestsByNpc } from "../GameData.ts";
import { CharacterCreator } from "../systems/CharacterCreator.ts";
import { EncounterManager } from "../systems/EncounterManager.ts";
import { ItemManager } from "../systems/ItemManager.ts";
import { ShopManager } from "../systems/ShopManager.ts";
import { EquipmentManager } from "../systems/EquipmentManager.ts";
import { QuestManager } from "../systems/QuestManager.ts";
import { DeathManager } from "../systems/DeathManager.ts";
import { NPCConversationManager } from "../systems/NPCConversationManager.ts";
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
  static authAdapterInstance: KaedevnAuthAdapter;
  static playerDBInstance: IPlayerPersistence;
  static gameDataInstance: GameData;

  private authAdapter!: KaedevnAuthAdapter;
  private playerDB!: IPlayerPersistence;
  private gameData!: GameData;
  private adjacentZones: { direction: string; zoneId: string }[] = [];
  private npcDialogues = new Map<string, string[]>();

  // Game systems (initialized in onCreate with gameData)
  private charCreator!: CharacterCreator;
  private encounterMgr!: EncounterManager;
  private itemMgr!: ItemManager;
  private shopMgr!: ShopManager;
  private equipMgr!: EquipmentManager;
  private questMgr!: QuestManager;
  private deathMgr!: DeathManager;
  private npcConvMgr!: NPCConversationManager;

  // userId → sessionId mapping
  private userToSession = new Map<string, string>();

  onCreate(options: WorldRoomOptions) {
    this.setState(new WorldState());
    this.state.zoneId = options.zoneId || "zone-001-village";
    this.state.zoneName = options.zoneName || "";
    this.maxClients = options.maxPlayers ?? 50;
    this.authAdapter = WorldRoom.authAdapterInstance;
    this.playerDB = WorldRoom.playerDBInstance;
    this.gameData = WorldRoom.gameDataInstance;
    // Systems with GameData injection
    this.charCreator = new CharacterCreator(this.playerDB, this.gameData);
    this.encounterMgr = new EncounterManager(this.gameData);
    this.itemMgr = new ItemManager(this.gameData);
    this.shopMgr = new ShopManager(this.gameData);
    this.equipMgr = new EquipmentManager(this.gameData);
    this.questMgr = new QuestManager(this.gameData);
    this.deathMgr = new DeathManager(this.gameData);
    this.npcConvMgr = new NPCConversationManager(this.gameData);

    // Load zone data from GameData (fallback to options for backward compatibility)
    const zoneDef = this.gameData?.zones?.find((z: any) => z.id === this.state.zoneId);
    const npcs = options.npcs ?? zoneDef?.npcs ?? [];
    this.adjacentZones = options.adjacentZones ?? zoneDef?.adjacentZones ?? [];

    // Load NPCs
    for (const npc of npcs) {
      const npcState = new NPCState();
      npcState.id = npc.id;
      npcState.name = npc.name;
      npcState.expression = npc.expression || "normal";
      npcState.pose = npc.pose || "standing";
      npcState.x = npc.x || 0;
      npcState.y = npc.y || 0;
      this.state.npcs.set(npc.id, npcState);
      if (npc.dialogue) this.npcDialogues.set(npc.id, npc.dialogue);
    }

    // Existing handlers
    this.onMessage("move", (client, data: WorldMoveRequest) => this.handleMove(client, data));
    this.onMessage("interact", (client, data: WorldInteractRequest) => this.handleInteract(client, data));
    this.onMessage("expression", (client, data: WorldExpressionRequest) => this.handleExpression(client, data));
    this.onMessage("pose", (client, data: WorldPoseRequest) => this.handlePose(client, data));

    // New game system handlers
    this.onMessage("create_character", (client, data) => this.handleCreateCharacter(client, data));
    this.onMessage("explore", (client) => this.handleExplore(client));
    this.onMessage("use_item", (client, data) => this.handleUseItem(client, data));
    this.onMessage("shop_list", (client, data) => this.handleShopList(client, data));
    this.onMessage("shop_buy", (client, data) => this.handleShopBuy(client, data));
    this.onMessage("shop_sell", (client, data) => this.handleShopSell(client, data));
    this.onMessage("equip", (client, data) => this.handleEquip(client, data));
    this.onMessage("unequip", (client, data) => this.handleUnequip(client, data));
    this.onMessage("quest_list", (client, data) => this.handleQuestList(client, data));
    this.onMessage("quest_accept", (client, data) => this.handleQuestAccept(client, data));
    this.onMessage("quest_report", (client, data) => this.handleQuestReport(client, data));
    this.onMessage("quest_log", (client) => this.handleQuestLog(client));
    this.onMessage("status", (client) => this.handleStatus(client));
    this.onMessage("inventory", (client) => this.handleInventory(client));
  }

  async onAuth(client: Client, options: { token?: string }): Promise<KaedevnTokenPayload> {
    const token = options.token;
    if (!token) throw new Error("No token provided");

    // Try JWT verification first
    const payload = this.authAdapter.verify(token);
    if (payload) return payload;

    // Dev fallback: use token string as userId (for browser client)
    if (token.startsWith("browser-") || token.startsWith("cli-")) {
      return { userId: token, role: "user", status: "active" };
    }

    throw new Error("Invalid or expired token");
  }

  async onJoin(client: Client, options: any, auth: KaedevnTokenPayload) {
    for (const [, existing] of this.state.players) {
      if (existing.userId === auth.userId) throw new Error("Already joined");
    }

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
    this.userToSession.set(auth.userId, client.sessionId);

    // Send zone info (NPCs, directions, description)
    const zoneDef = this.gameData?.zones?.find((z: any) => z.id === this.state.zoneId);
    client.send("zone_info", {
      zoneId: this.state.zoneId,
      zoneName: this.state.zoneName || zoneDef?.name || "",
      description: zoneDef?.description || "",
      isSafe: zoneDef?.isSafe ?? true,
      adjacentZones: this.adjacentZones.map(a => {
        const target = this.gameData?.zones?.find((z: any) => z.id === a.zoneId);
        return { direction: a.direction, zoneId: a.zoneId, zoneName: target?.name || a.zoneId };
      }),
      npcs: Array.from(this.state.npcs.values()).map(n => ({
        id: n.id, name: n.name,
        shop: this.gameData?.shops?.[n.id] ? n.id : null,
        quests: Object.values(this.gameData?.quests || {}).filter((q: any) => q.giver === n.id).map((q: any) => q.id),
      })),
    });

    // Tell client if character creation is needed
    if (!playerData.isCreated) {
      client.send("need_character_creation", {});
    } else {
      client.send("welcome", {
        name: playerData.name,
        classType: playerData.classType,
        level: playerData.level,
        zoneId: this.state.zoneId,
        zoneName: this.state.zoneName,
      });
    }
  }

  async onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      const existing = await this.playerDB.findByUserId(player.userId);
      if (existing) {
        existing.x = player.x;
        existing.y = player.y;
        existing.hp = player.hp;
        existing.mp = player.mp;
        existing.lastLogin = Date.now();
        await this.playerDB.save(existing);
      }
      this.userToSession.delete(player.userId);
      this.state.players.delete(client.sessionId);
    }
  }

  async onDispose() {}

  // ── Existing handlers ──

  private handleMove(client: Client, data: WorldMoveRequest) {
    const adjacent = this.adjacentZones.find(a => a.direction === data.direction);
    if (!adjacent) {
      client.send("error", { code: "ZONE_NO_ADJACENT", message: `${data.direction} 方向には移動できません` } satisfies AppError);
      return;
    }
    client.send("zone_change", { zoneId: adjacent.zoneId, zoneName: "" });
  }

  private async handleInteract(client: Client, data: WorldInteractRequest) {
    const npc = this.state.npcs.get(data.targetId);
    if (!npc) {
      client.send("error", { code: "NPC_NOT_FOUND", message: "NPC が見つかりません" } satisfies AppError);
      return;
    }

    // Try conversation pool system first
    const pool = this.gameData?.npcConversations?.[data.targetId];
    const player = this.state.players.get(client.sessionId);
    const pd = player ? await this.playerDB.findByUserId(player.userId) : null;

    if (pool && pd && (pool.daily?.length > 0 || pool.contextual?.length > 0 || pool.special?.length > 0)) {

      const memory = this.npcConvMgr.getMemory(pd, data.targetId);
      const selection = this.npcConvMgr.selectConversation(pool, memory, pd);

      if (selection) {
        this.npcConvMgr.updateMemory(memory, selection.conversation.id, 5); // +5 relation per talk
        await this.playerDB.save(pd);

        client.send("npc_conversation", {
          npcId: npc.id,
          npcName: npc.name,
          conversationId: selection.conversation.id,
          source: selection.source,
          label: selection.conversation.label,
          nodes: selection.conversation.nodes,
          memory: {
            relationScore: memory.relationScore,
            interactionCount: memory.interactionCount,
          },
        });
        return;
      }
    }

    // Fallback: legacy dialogue array
    const dialogues = this.npcDialogues.get(data.targetId);
    if (!dialogues || dialogues.length === 0) {
      client.send("error", { code: "NPC_NOT_FOUND", message: "NPC が見つかりません" } satisfies AppError);
      return;
    }
    const text = dialogues[Math.floor(Math.random() * dialogues.length)];
    client.send("npc_dialogue", { npcId: npc.id, npcName: npc.name, text });
  }

  private handleExpression(client: Client, data: WorldExpressionRequest) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.expression = data.expression;
  }

  private handlePose(client: Client, data: WorldPoseRequest) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.pose = data.pose;
  }

  // ── New game system handlers ──

  private async handleCreateCharacter(client: Client, data: { name: string; classType: string; gender?: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = await this.charCreator.create(player.userId, {
      name: data.name,
      classType: data.classType as any,
      gender: data.gender as any,
    });

    if (!result.success) {
      client.send("error", { code: result.error!, message: result.error! } satisfies AppError);
      return;
    }

    const pd = result.playerData!;
    player.name = pd.name;
    player.hp = pd.hp;
    player.maxHp = pd.maxHp;
    player.mp = pd.mp;
    player.level = pd.level;

    client.send("character_created", {
      name: pd.name,
      classType: pd.classType,
      hp: pd.hp, maxHp: pd.maxHp,
      mp: pd.mp, maxMp: pd.maxMp,
      atk: pd.atk, def: pd.def, mag: pd.mag, spd: pd.spd,
      gold: pd.gold,
    });
  }

  private async handleExplore(client: Client) {
    const result = this.encounterMgr.explore(this.state.zoneId);

    if (result.type === "error") {
      client.send("error", { code: result.code, message: result.message } satisfies AppError);
      return;
    }

    if (result.type === "battle") {
      client.send("encounter", {
        type: "battle",
        enemy: {
          id: result.enemy.id,
          name: result.enemy.name,
          hp: result.enemy.hp,
          atk: result.enemy.atk,
          def: result.enemy.def,
          exp: result.enemy.exp,
          gold: result.enemy.gold,
        },
      });
      return;
    }

    if (result.type === "item") {
      // Add to player inventory
      const player = this.state.players.get(client.sessionId);
      if (player) {
        const pd = await this.playerDB.findByUserId(player.userId);
        if (pd) {
          this.itemMgr.addToInventory(pd, [{ itemId: result.itemId, name: result.itemName, quantity: result.quantity, type: "material" }]);
          await this.playerDB.save(pd);

          // Quest progress
          const qProgress = this.questMgr.onItemCollected(pd, result.itemId);
          if (qProgress.length > 0) {
            client.send("quest_progress", qProgress);
          }
        }
      }
      client.send("encounter", { type: "item", itemId: result.itemId, itemName: result.itemName, quantity: result.quantity });
      return;
    }

    client.send("encounter", { type: "nothing" });
  }

  private async handleUseItem(client: Client, data: { itemId: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    const result = this.itemMgr.useItem(pd, data.itemId);
    if (!result.success) {
      client.send("error", { code: result.error!, message: result.error! } satisfies AppError);
      return;
    }

    // Sync state
    player.hp = pd.hp;
    player.mp = pd.mp;
    await this.playerDB.save(pd);

    client.send("item_used", { itemId: data.itemId, log: result.log, hp: pd.hp, mp: pd.mp });
  }

  private handleShopList(client: Client, data: { npcId: string }) {
    const items = this.shopMgr.getShopItems(data.npcId);
    if (!items) {
      client.send("error", { code: "SHOP_NOT_FOUND", message: "Shop not found" } satisfies AppError);
      return;
    }
    client.send("shop_items", { npcId: data.npcId, items });
  }

  private async handleShopBuy(client: Client, data: { npcId: string; itemId: string; quantity?: number }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    const result = this.shopMgr.buy(pd, data.npcId, data.itemId, data.quantity ?? 1);
    if (!result.success) {
      client.send("error", { code: result.error!, message: result.error! } satisfies AppError);
      return;
    }

    await this.playerDB.save(pd);
    client.send("shop_bought", { itemId: data.itemId, quantity: data.quantity ?? 1, gold: pd.gold });
  }

  private async handleShopSell(client: Client, data: { itemId: string; quantity?: number }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    const result = this.shopMgr.sell(pd, data.itemId, data.quantity ?? 1);
    if (!result.success) {
      client.send("error", { code: result.error!, message: result.error! } satisfies AppError);
      return;
    }

    await this.playerDB.save(pd);
    client.send("shop_sold", { itemId: data.itemId, quantity: data.quantity ?? 1, gold: pd.gold });
  }

  private async handleEquip(client: Client, data: { itemId: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    const result = this.equipMgr.equip(pd, data.itemId);
    if (!result.success) {
      client.send("error", { code: result.error!, message: result.error! } satisfies AppError);
      return;
    }

    await this.playerDB.save(pd);
    const stats = this.equipMgr.getEffectiveStats(pd);
    client.send("equipped", { itemId: data.itemId, unequipped: result.unequipped, effectiveStats: stats });
  }

  private async handleUnequip(client: Client, data: { slot: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    const result = this.equipMgr.unequip(pd, data.slot as any);
    if (!result.success) {
      client.send("error", { code: result.error!, message: result.error! } satisfies AppError);
      return;
    }

    await this.playerDB.save(pd);
    const stats = this.equipMgr.getEffectiveStats(pd);
    client.send("unequipped", { slot: data.slot, itemId: result.unequipped, effectiveStats: stats });
  }

  private async handleQuestList(client: Client, data: { npcId: string }) {
    const quests = getQuestsByNpc(this.gameData.quests, data.npcId);
    client.send("quest_list", { npcId: data.npcId, quests: quests.map(q => ({ id: q.id, name: q.name, description: q.description })) });
  }

  private async handleQuestAccept(client: Client, data: { questId: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    const result = this.questMgr.accept(pd, data.questId);
    if (!result.success) {
      client.send("error", { code: result.error!, message: result.error! } satisfies AppError);
      return;
    }

    await this.playerDB.save(pd);
    client.send("quest_accepted", { questId: data.questId });
  }

  private async handleQuestReport(client: Client, data: { questId: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    const result = this.questMgr.report(pd, data.questId);
    if (!result.success) {
      client.send("error", { code: result.error!, message: result.error! } satisfies AppError);
      return;
    }

    // Sync level/hp/mp after rewards
    player.level = pd.level;
    player.hp = pd.hp;
    player.mp = pd.mp;
    await this.playerDB.save(pd);

    client.send("quest_completed", { questId: data.questId, rewards: result.rewards });
  }

  private async handleQuestLog(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    client.send("quest_log", { quests: pd.questProgress });
  }

  private async handleStatus(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    const stats = this.equipMgr.getEffectiveStats(pd);
    client.send("player_status", {
      name: pd.name, classType: pd.classType, level: pd.level, exp: pd.exp,
      hp: pd.hp, maxHp: pd.maxHp, mp: pd.mp, maxMp: pd.maxMp,
      atk: stats.atk, def: stats.def, mag: stats.mag, spd: stats.spd,
      gold: pd.gold,
      equipment: pd.equipment,
      zoneId: pd.zoneId,
    });
  }

  private async handleInventory(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const pd = await this.playerDB.findByUserId(player.userId);
    if (!pd) return;

    client.send("player_inventory", { inventory: pd.inventory, gold: pd.gold });
  }
}
