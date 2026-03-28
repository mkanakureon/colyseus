import type { GameData } from "../GameData.ts";
import { type PlayerData, type IPlayerPersistence, defaultPlayerData } from "../persistence/PlayerPersistence.ts";

export interface CreateCharacterRequest {
  name: string;
  classType: string;
  gender?: "female" | "male";
}

export interface CreateCharacterResult {
  success: boolean;
  error?: string;
  playerData?: PlayerData;
}

export class CharacterCreator {
  constructor(private playerDB: IPlayerPersistence, private gameData: GameData) {}

  async create(userId: string, req: CreateCharacterRequest): Promise<CreateCharacterResult> {
    const name = req.name?.trim();
    if (!name || name.length === 0) return { success: false, error: "NAME_EMPTY" };
    if (name.length > 20) return { success: false, error: "NAME_TOO_LONG" };

    const classDef = this.gameData.classes[req.classType];
    if (!classDef) return { success: false, error: "INVALID_CLASS" };

    const existing = await this.playerDB.findByUserId(userId);
    if (existing && existing.isCreated) return { success: false, error: "ALREADY_CREATED" };

    const player = defaultPlayerData(userId, name);
    player.classType = req.classType as any;
    player.gender = req.gender || "female";
    player.isCreated = true;
    player.hp = classDef.hp;
    player.maxHp = classDef.hp;
    player.mp = classDef.mp;
    player.maxMp = classDef.mp;
    player.atk = classDef.atk;
    player.def = classDef.def;
    player.mag = classDef.mag;
    player.spd = classDef.spd;
    player.gold = this.gameData.meta.startGold;
    player.inventory = this.gameData.meta.startInventory.map(i => ({ ...i, type: i.type as any }));

    await this.playerDB.save(player);
    return { success: true, playerData: player };
  }
}
