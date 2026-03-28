export interface PlayerData {
  userId: string;
  name: string;
  gender: "female" | "male";
  preset: string;
  classType: "warrior" | "mage" | "thief";
  isCreated: boolean;
  zoneId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  mag: number;
  spd: number;
  level: number;
  exp: number;
  gold: number;
  equipment: { weapon: string | null; armor: string | null; accessory: string | null };
  inventory: InventoryItem[];
  questProgress: Record<string, QuestState>;
  npcMemories: Record<string, any>;  // NPCMemory per NPC
  lastLogin: number;
}

export interface InventoryItem {
  itemId: string;
  name: string;
  quantity: number;
  type: "consumable" | "equipment" | "key";
}

export interface QuestState {
  questId: string;
  status: "active" | "completed" | "failed";
  progress: Record<string, number>;
}

export interface IPlayerPersistence {
  findByUserId(userId: string): Promise<PlayerData | null>;
  save(data: PlayerData): Promise<void>;
  delete(userId: string): Promise<void>;
}

export function defaultPlayerData(userId: string, name: string): PlayerData {
  return {
    userId,
    name,
    gender: "female",
    preset: "hanako",
    classType: "warrior",
    isCreated: false,
    zoneId: "zone-001-village",
    x: 480,
    y: 360,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    atk: 10,
    def: 5,
    mag: 3,
    spd: 8,
    level: 1,
    exp: 0,
    gold: 100,
    equipment: { weapon: null, armor: null, accessory: null },
    inventory: [
      { itemId: "potion-001", name: "回復薬", quantity: 3, type: "consumable" },
    ],
    questProgress: {},
    npcMemories: {},
    lastLogin: Date.now(),
  };
}

// InMemory implementation for testing
export class InMemoryPlayerDB implements IPlayerPersistence {
  private store = new Map<string, PlayerData>();

  async findByUserId(userId: string): Promise<PlayerData | null> {
    return this.store.get(userId) || null;
  }

  async save(data: PlayerData): Promise<void> {
    this.store.set(data.userId, { ...data });
  }

  async delete(userId: string): Promise<void> {
    this.store.delete(userId);
  }

  seed(players: PlayerData[]): void {
    players.forEach(p => this.store.set(p.userId, p));
  }

  clear(): void {
    this.store.clear();
  }
}
