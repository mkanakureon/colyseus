/**
 * NPC会話プールシステム
 *
 * 仕様書: docs/01_in_specs/npc-agent-spec.md
 * 設計: 事前生成型 × プレイヤー記憶ナビゲーション
 *
 * - daily: 日常会話（ランダム or 未再生優先）
 * - contextual: 条件付き会話（関係値・クエスト・世界状態）
 * - special: 一度きりの特別会話
 */
import type { GameData, NpcDef } from "../GameData.ts";
import type { PlayerData } from "../persistence/PlayerPersistence.ts";

// ── 会話データ型 ──

export interface ConversationNode {
  id: string;
  speaker: string;        // NPC名 or "player"
  text: string;           // インラインタグ付き
  emotion?: string;       // happy | sad | angry | neutral | surprised
  choices?: { label: string; next: string }[];  // next = nodeId or "end"
}

export interface Conversation {
  id: string;
  poolType: "daily" | "contextual" | "special";
  label: string;
  condition?: ConversationCondition;
  nodes: ConversationNode[];
}

export interface ConversationCondition {
  relationMin?: number;
  relationMax?: number;
  questFlags?: string[];     // quest IDs that must be completed
  questActive?: string[];    // quest IDs that must be active
  worldState?: string;
  once?: boolean;            // true = remove after first play
}

export interface NPCConversationPool {
  npcId: string;
  daily: Conversation[];
  contextual: Conversation[];
  special: Conversation[];
}

// ── プレイヤーごとの NPC 記憶 ──

export interface NPCMemory {
  npcId: string;
  relationScore: number;       // -100 ~ 100
  playedConversationIds: string[];
  lastPlayedAt: number;
  interactionCount: number;
}

// ── 選択結果 ──

export interface ConversationSelection {
  conversation: Conversation;
  source: "special" | "contextual" | "daily";
}

// ── マネージャー ──

export class NPCConversationManager {
  constructor(private gameData: GameData) {}

  /**
   * NPC との会話を選択する（special → contextual → daily の優先順）
   */
  selectConversation(
    pool: NPCConversationPool,
    memory: NPCMemory,
    playerData: PlayerData,
  ): ConversationSelection | null {
    // 1. Special pool: 条件一致 + 未再生
    for (const conv of pool.special) {
      if (this.matchesCondition(conv.condition, memory, playerData) &&
          !memory.playedConversationIds.includes(conv.id)) {
        return { conversation: conv, source: "special" };
      }
    }

    // 2. Contextual pool: 条件一致 → 関係値が最も近いものを選択
    const matchingContextual = pool.contextual
      .filter(conv => this.matchesCondition(conv.condition, memory, playerData))
      .filter(conv => !conv.condition?.once || !memory.playedConversationIds.includes(conv.id));

    if (matchingContextual.length > 0) {
      // Sort by how close the relation range is to current score
      const scored = matchingContextual.map(conv => {
        const min = conv.condition?.relationMin ?? -100;
        const max = conv.condition?.relationMax ?? 100;
        const mid = (min + max) / 2;
        const distance = Math.abs(memory.relationScore - mid);
        return { conv, distance };
      });
      scored.sort((a, b) => a.distance - b.distance);
      return { conversation: scored[0].conv, source: "contextual" };
    }

    // 3. Daily pool: 未再生を優先 → 全再生済みならランダム
    if (pool.daily.length === 0) return null;

    const unplayed = pool.daily.filter(c => !memory.playedConversationIds.includes(c.id));
    if (unplayed.length > 0) {
      const idx = Math.floor(Math.random() * unplayed.length);
      return { conversation: unplayed[idx], source: "daily" };
    }

    // All played → random
    const idx = Math.floor(Math.random() * pool.daily.length);
    return { conversation: pool.daily[idx], source: "daily" };
  }

  /**
   * 会話再生後に記憶を更新
   */
  updateMemory(memory: NPCMemory, conversationId: string, relationDelta = 0): void {
    if (!memory.playedConversationIds.includes(conversationId)) {
      memory.playedConversationIds.push(conversationId);
    }
    memory.relationScore = Math.max(-100, Math.min(100, memory.relationScore + relationDelta));
    memory.lastPlayedAt = Date.now();
    memory.interactionCount++;
  }

  /**
   * プレイヤーの NPC メモリを取得（なければ初期化）
   */
  getMemory(playerData: PlayerData, npcId: string): NPCMemory {
    if (!playerData.npcMemories) {
      playerData.npcMemories = {};
    }
    if (!playerData.npcMemories[npcId]) {
      playerData.npcMemories[npcId] = {
        npcId,
        relationScore: 0,
        playedConversationIds: [],
        lastPlayedAt: 0,
        interactionCount: 0,
      };
    }
    return playerData.npcMemories[npcId];
  }

  /**
   * 旧 dialogue 配列 → 会話プールに変換（後方互換）
   */
  legacyToPool(npc: NpcDef): NPCConversationPool {
    const daily: Conversation[] = npc.dialogue.map((text, i) => ({
      id: `${npc.id}_legacy_${i}`,
      poolType: "daily" as const,
      label: `会話${i + 1}`,
      nodes: [{ id: "node_0", speaker: npc.name, text, emotion: npc.expression }],
    }));
    return { npcId: npc.id, daily, contextual: [], special: [] };
  }

  // ── Private ──

  private matchesCondition(
    cond: ConversationCondition | undefined,
    memory: NPCMemory,
    playerData: PlayerData,
  ): boolean {
    if (!cond) return true;

    if (cond.relationMin !== undefined && memory.relationScore < cond.relationMin) return false;
    if (cond.relationMax !== undefined && memory.relationScore > cond.relationMax) return false;

    if (cond.questFlags) {
      for (const qId of cond.questFlags) {
        if (playerData.questProgress[qId]?.status !== "completed") return false;
      }
    }

    if (cond.questActive) {
      for (const qId of cond.questActive) {
        if (playerData.questProgress[qId]?.status !== "active") return false;
      }
    }

    return true;
  }
}
