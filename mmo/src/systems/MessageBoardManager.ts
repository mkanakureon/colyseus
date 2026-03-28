import type { GameData } from "../GameData.ts";

export interface ZoneMessage {
  author: string;
  text: string;
  timestamp: number;
}

export class MessageBoardManager {
  constructor(private gameData: GameData) {}

  private boards: Map<string, ZoneMessage[]> = new Map();

  post(zoneId: string, author: string, text: string): { success: boolean; error?: string } {
    const maxLen = this.gameData.meta.messageBoard?.maxLength || 100;
    const maxPerZone = this.gameData.meta.messageBoard?.maxPerZone || 10;

    if (!text || text.trim().length === 0) return { success: false, error: "EMPTY" };
    if (text.length > maxLen) return { success: false, error: "TOO_LONG" };

    const board = this.boards.get(zoneId) || [];
    board.push({ author, text: text.trim(), timestamp: Date.now() });
    if (board.length > maxPerZone) board.shift();
    this.boards.set(zoneId, board);
    return { success: true };
  }

  get(zoneId: string): ZoneMessage[] {
    return this.boards.get(zoneId) || [];
  }
}
