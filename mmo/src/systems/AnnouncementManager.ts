import type { GameData } from "../GameData.ts";

export interface Announcement {
  type: "boss_kill" | "level_up" | "rare_drop" | "quest_complete";
  text: string;
  timestamp: number;
}

export class AnnouncementManager {
  constructor(private gameData: GameData) {}

  private listeners: ((ann: Announcement) => void)[] = [];
  private history: Announcement[] = [];

  onAnnouncement(fn: (ann: Announcement) => void) { this.listeners.push(fn); }

  getHistory(limit = 10): Announcement[] { return this.history.slice(-limit); }

  onBossKill(playerName: string, bossName: string) {
    if (!this.gameData.meta.announcements?.bossKill) return;
    this.emit({ type: "boss_kill", text: `[号外] ${playerName}たちが${bossName}を討伐した！`, timestamp: Date.now() });
  }

  onLevelUp(playerName: string, newLevel: number) {
    const milestones = this.gameData.meta.announcements?.levelMilestones || [];
    if (!milestones.includes(newLevel)) return;
    this.emit({ type: "level_up", text: `[祝] ${playerName}がLv.${newLevel}に到達！`, timestamp: Date.now() });
  }

  onRareDrop(playerName: string, itemName: string) {
    this.emit({ type: "rare_drop", text: `[発見] ${playerName}が${itemName}を手に入れた！`, timestamp: Date.now() });
  }

  onQuestComplete(playerName: string, questName: string) {
    this.emit({ type: "quest_complete", text: `[達成] ${playerName}が「${questName}」を達成した`, timestamp: Date.now() });
  }

  private emit(ann: Announcement) {
    this.history.push(ann);
    if (this.history.length > 50) this.history.shift();
    this.listeners.forEach(fn => fn(ann));
  }
}
