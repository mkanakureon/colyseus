/**
 * MMO サーバー起動スクリプト
 * Usage: npx tsx mmo/server.ts
 */
import { Server, LocalPresence, LocalDriver, matchMaker } from "colyseus";

import { WorldRoom } from "./src/rooms/WorldRoom.ts";
import { ChatRoom } from "./src/rooms/ChatRoom.ts";
import { BattleRoom } from "./src/rooms/BattleRoom.ts";
import { TradeRoom } from "./src/rooms/TradeRoom.ts";
import { KaedevnAuthAdapter } from "./src/auth/KaedevnAuthAdapter.ts";
import { InMemoryPlayerDB } from "./src/persistence/PlayerPersistence.ts";
import { FULL_ZONES } from "./src/data/zones-full.ts";

const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "mmo-dev-secret";

const presence = new LocalPresence();
const driver = new LocalDriver();

const authAdapter = new KaedevnAuthAdapter(JWT_SECRET);
const playerDB = new InMemoryPlayerDB();

// DI
WorldRoom.authAdapterInstance = authAdapter;
WorldRoom.playerDBInstance = playerDB;
ChatRoom.authAdapterInstance = authAdapter;
BattleRoom.authAdapterInstance = authAdapter;
TradeRoom.authAdapterInstance = authAdapter;
TradeRoom.playerDBInstance = playerDB;

const server = new Server({
  greet: false,
  presence,
  driver,
});

matchMaker.setup(presence, driver);

// Define rooms
server.define("world", WorldRoom);
server.define("chat", ChatRoom);
server.define("battle", BattleRoom);
server.define("trade", TradeRoom);

server.listen(PORT).then(() => {
  console.log(`\n  ⚔  MMO Server listening on ws://localhost:${PORT}`);
  console.log(`  Zones: ${FULL_ZONES.length}`);
  console.log(`  JWT Secret: ${JWT_SECRET.slice(0, 8)}...`);
  console.log(`\n  Start CLI client: npx tsx mmo/client-cli.ts\n`);
});
