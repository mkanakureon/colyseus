import path from "path";
import { fileURLToPath } from "url";
import { Server, LocalPresence, LocalDriver, matchMaker } from "colyseus";
import type { Presence, MatchMakerDriver } from "colyseus";
import { WorldRoom } from "./rooms/WorldRoom.ts";
import { ChatRoom } from "./rooms/ChatRoom.ts";
import { BattleRoom } from "./rooms/BattleRoom.ts";
import { TradeRoom } from "./rooms/TradeRoom.ts";
import { KaedevnAuthAdapter } from "./auth/KaedevnAuthAdapter.ts";
import { type IPlayerPersistence, InMemoryPlayerDB } from "./persistence/PlayerPersistence.ts";
import { type GameData, loadGameData } from "./GameData.ts";

const __dirname_resolved = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  jwtSecret?: string;
  playerDB?: IPlayerPersistence;
  dbPath?: string;  // SQLite file path (creates SqlitePlayerDB)
  presence?: Presence;
  driver?: MatchMakerDriver;
  gameData?: GameData;
  gameDir?: string;
}

export interface MMOServer {
  server: Server;
  authAdapter: KaedevnAuthAdapter;
  playerDB: IPlayerPersistence;
  gameData: GameData;
  listen(port: number): Promise<void>;
  shutdown(): void;
}

export function createMMOServer(opts: ServerOptions = {}): MMOServer {
  const jwtSecret = opts.jwtSecret ?? "mmo-dev-secret";
  const playerDB: IPlayerPersistence = opts.playerDB ?? new InMemoryPlayerDB();
  const presence = opts.presence ?? new LocalPresence();
  const driver = opts.driver ?? new LocalDriver();
  const authAdapter = new KaedevnAuthAdapter(jwtSecret);

  // Load game data
  let gameData: GameData;
  if (opts.gameData) {
    gameData = opts.gameData;
  } else if (opts.gameDir) {
    gameData = loadGameData(opts.gameDir);
  } else {
    const defaultDir = path.join(__dirname_resolved, "..", "games", "fantasy-rpg");
    gameData = loadGameData(defaultDir);
  }

  // DI
  WorldRoom.authAdapterInstance = authAdapter;
  WorldRoom.playerDBInstance = playerDB;
  WorldRoom.gameDataInstance = gameData;
  ChatRoom.authAdapterInstance = authAdapter;
  ChatRoom.gameDataInstance = gameData;
  BattleRoom.authAdapterInstance = authAdapter;
  BattleRoom.playerDBInstance = playerDB;
  BattleRoom.gameDataInstance = gameData;
  TradeRoom.authAdapterInstance = authAdapter;
  TradeRoom.playerDBInstance = playerDB;

  const server = new Server({ greet: false, presence, driver });
  matchMaker.setup(presence, driver);

  server.define("world", WorldRoom);
  server.define("world_forest", WorldRoom);
  server.define("chat", ChatRoom);
  server.define("battle", BattleRoom);
  server.define("trade", TradeRoom);

  return {
    server, authAdapter, playerDB, gameData,
    async listen(port: number) { await server.listen(port); },
    shutdown() { server.transport.shutdown(); },
  };
}
