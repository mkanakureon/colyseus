import type { GameData } from "../GameData.ts";
import type { PlayerData } from "../persistence/PlayerPersistence.ts";

export interface ReconstructionProject {
  id: string;
  name: string;
  zone: string;
  required: Record<string, number>; // itemId → count needed
  reward: { type: string; description: string };
}

export interface ProjectProgress {
  id: string;
  name: string;
  items: { itemId: string; current: number; required: number }[];
  complete: boolean;
}

export class ReconstructionManager {
  constructor(private gameData: GameData) {}

  private progress: Map<string, Record<string, number>> = new Map(); // projectId → itemId → contributed

  getProjects(): ReconstructionProject[] {
    return this.gameData.meta.reconstruction?.projects || [];
  }

  contribute(projectId: string, playerData: PlayerData, itemId: string, quantity: number): { success: boolean; error?: string } {
    const project = this.getProjects().find(p => p.id === projectId);
    if (!project) return { success: false, error: "PROJECT_NOT_FOUND" };
    if (this.isComplete(projectId)) return { success: false, error: "ALREADY_COMPLETE" };

    const required = project.required[itemId];
    if (required === undefined) return { success: false, error: "ITEM_NOT_NEEDED" };

    // Check player has items
    const inv = playerData.inventory.find(i => i.itemId === itemId);
    if (!inv || inv.quantity < quantity) return { success: false, error: "ITEM_NOT_OWNED" };

    // Consume items
    inv.quantity -= quantity;
    if (inv.quantity <= 0) playerData.inventory = playerData.inventory.filter(i => i.itemId !== itemId);

    // Add to progress
    const prog = this.progress.get(projectId) || {};
    prog[itemId] = (prog[itemId] || 0) + quantity;
    this.progress.set(projectId, prog);

    return { success: true };
  }

  getProgress(projectId: string): ProjectProgress | null {
    const project = this.getProjects().find(p => p.id === projectId);
    if (!project) return null;

    const prog = this.progress.get(projectId) || {};
    return {
      id: project.id,
      name: project.name,
      items: Object.entries(project.required).map(([itemId, required]) => ({
        itemId,
        current: Math.min(prog[itemId] || 0, required),
        required,
      })),
      complete: this.isComplete(projectId),
    };
  }

  isComplete(projectId: string): boolean {
    const project = this.getProjects().find(p => p.id === projectId);
    if (!project) return false;

    const prog = this.progress.get(projectId) || {};
    return Object.entries(project.required).every(([itemId, required]) => (prog[itemId] || 0) >= required);
  }
}
