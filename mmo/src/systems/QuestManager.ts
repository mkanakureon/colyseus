import type { GameData, QuestDef } from "../GameData.ts";
import type { PlayerData, QuestState } from "../persistence/PlayerPersistence.ts";
import { ItemManager } from "./ItemManager.ts";

export interface QuestAcceptResult { success: boolean; error?: string }
export interface QuestReportResult { success: boolean; error?: string; rewards?: QuestDef["rewards"] }
export interface QuestProgressEvent {
  questId: string; objectiveIndex: number;
  current: number; required: number; targetName: string; completed: boolean;
}

export class QuestManager {
  private itemManager: ItemManager;

  constructor(private gameData: GameData) {
    this.itemManager = new ItemManager(gameData);
  }

  accept(playerData: PlayerData, questId: string): QuestAcceptResult {
    const quest = this.gameData.quests[questId];
    if (!quest) return { success: false, error: "QUEST_NOT_FOUND" };
    if (playerData.questProgress[questId]) return { success: false, error: "QUEST_ALREADY_ACCEPTED" };

    const progress: Record<string, number> = {};
    for (let i = 0; i < quest.objectives.length; i++) progress[`obj_${i}`] = 0;

    playerData.questProgress[questId] = { questId, status: "active", progress };
    return { success: true };
  }

  report(playerData: PlayerData, questId: string): QuestReportResult {
    const quest = this.gameData.quests[questId];
    if (!quest) return { success: false, error: "QUEST_NOT_FOUND" };

    const state = playerData.questProgress[questId];
    if (!state || state.status !== "active") return { success: false, error: "QUEST_NOT_ACTIVE" };

    for (let i = 0; i < quest.objectives.length; i++) {
      if ((state.progress[`obj_${i}`] || 0) < quest.objectives[i].required) return { success: false, error: "QUEST_NOT_COMPLETE" };
    }

    playerData.exp += quest.rewards.exp;
    playerData.gold += quest.rewards.gold;
    if (quest.rewards.items) {
      this.itemManager.addToInventory(playerData, quest.rewards.items.map(i => ({ ...i, type: "consumable" as const })));
    }

    state.status = "completed";
    return { success: true, rewards: quest.rewards };
  }

  onEnemyDefeated(playerData: PlayerData, enemyId: string): QuestProgressEvent[] {
    return this.updateProgress(playerData, "defeat", enemyId);
  }

  onItemCollected(playerData: PlayerData, itemId: string): QuestProgressEvent[] {
    return this.updateProgress(playerData, "collect", itemId);
  }

  onZoneVisited(playerData: PlayerData, zoneId: string): QuestProgressEvent[] {
    return this.updateProgress(playerData, "visit", zoneId);
  }

  private updateProgress(playerData: PlayerData, type: string, targetId: string): QuestProgressEvent[] {
    const events: QuestProgressEvent[] = [];
    for (const [questId, state] of Object.entries(playerData.questProgress)) {
      if (state.status !== "active") continue;
      const quest = this.gameData.quests[questId];
      if (!quest) continue;
      for (let i = 0; i < quest.objectives.length; i++) {
        const obj = quest.objectives[i];
        if (obj.type !== type || obj.targetId !== targetId) continue;
        const key = `obj_${i}`;
        state.progress[key] = Math.min((state.progress[key] || 0) + 1, obj.required);
        events.push({ questId, objectiveIndex: i, current: state.progress[key], required: obj.required, targetName: obj.targetName, completed: state.progress[key] >= obj.required });
      }
    }
    return events;
  }
}
