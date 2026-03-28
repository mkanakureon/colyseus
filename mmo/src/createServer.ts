/**
 * MMO サーバーファクトリ
 *
 * サーバー構築・DI・Room 定義を一箇所に集約。
 * server.ts（本番起動）とテストの両方から使う。
 */
import { Server, LocalPresence, LocalDriver, matchMaker } from "@colyseus/core";
import type { Presence, MatchMakerDriver } from "@colyseus/core";
import { WorldRoom } from "./rooms/WorldRoom.ts";
import { ChatRoom } from "./rooms/ChatRoom.ts";
import { BattleRoom } from "./rooms/BattleRoom.ts";
import { TradeRoom } from "./rooms/TradeRoom.ts";
import { KaedevnAuthAdapter } from "./auth/KaedevnAuthAdapter.ts";
import { type IPlayerPersistence, InMemoryPlayerDB } from "./persistence/PlayerPersistence.ts";

export interface ServerOptions {
  jwtSecret?: string;
  playerDB?: IPlayerPersistence;
  presence?: Presence;
  driver?: MatchMakerDriver;
}

export interface MMOServer {
  server: Server;
  authAdapter: KaedevnAuthAdapter;
  playerDB: IPlayerPersistence;
  listen(port: number): Promise<void>;
  shutdown(): void;
}

export function createMMOServer(opts: ServerOptions = {}): MMOServer {
  const jwtSecret = opts.jwtSecret ?? "mmo-dev-secret";
  const playerDB = opts.playerDB ?? new InMemoryPlayerDB();
  const presence = opts.presence ?? new LocalPresence();
  const driver = opts.driver ?? new LocalDriver();
  const authAdapter = new KaedevnAuthAdapter(jwtSecret);

  // DI
  WorldRoom.authAdapterInstance = authAdapter;
  WorldRoom.playerDBInstance = playerDB;
  ChatRoom.authAdapterInstance = authAdapter;
  BattleRoom.authAdapterInstance = authAdapter;
  BattleRoom.playerDBInstance = playerDB;
  TradeRoom.authAdapterInstance = authAdapter;
  TradeRoom.playerDBInstance = playerDB;

  const server = new Server({ greet: false, presence, driver });
  matchMaker.setup(presence, driver);

  // Define rooms
  server.define("world", WorldRoom);
  server.define("world_forest", WorldRoom);  // alias for forest zone tests
  server.define("chat", ChatRoom);
  server.define("battle", BattleRoom);
  server.define("trade", TradeRoom);

  return {
    server,
    authAdapter,
    playerDB,
    async listen(port: number) {
      await server.listen(port);
    },
    shutdown() {
      server.transport.shutdown();
    },
  };
}
