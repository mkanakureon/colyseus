import { CLASS_DEFS, type ClassType } from "../data/classes.ts";
import { type PlayerData, type IPlayerPersistence, defaultPlayerData } from "../persistence/PlayerPersistence.ts";

export interface CreateCharacterRequest {
  name: string;
  classType: ClassType;
  gender?: "female" | "male";
}

export interface CreateCharacterResult {
  success: boolean;
  error?: string;
  playerData?: PlayerData;
}

export class CharacterCreator {
  constructor(private playerDB: IPlayerPersistence) {}

  async create(userId: string, req: CreateCharacterRequest): Promise<CreateCharacterResult> {
    // Validate name
    const name = req.name?.trim();
    if (!name || name.length === 0) {
      return { success: false, error: "NAME_EMPTY" };
    }
    if (name.length > 20) {
      return { success: false, error: "NAME_TOO_LONG" };
    }

    // Validate class
    const classDef = CLASS_DEFS[req.classType];
    if (!classDef) {
      return { success: false, error: "INVALID_CLASS" };
    }

    // Check if already created
    const existing = await this.playerDB.findByUserId(userId);
    if (existing && existing.isCreated) {
      return { success: false, error: "ALREADY_CREATED" };
    }

    // Create player
    const player = defaultPlayerData(userId, name);
    player.classType = req.classType;
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

    await this.playerDB.save(player);
    return { success: true, playerData: player };
  }
}
