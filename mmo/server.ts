/**
 * MMO サーバー起動
 * Usage: npx tsx mmo/server.ts
 */
import { createMMOServer } from "./src/createServer.ts";
import { FULL_ZONES } from "./src/data/zones-full.ts";

const PORT = Number(process.env.PORT) || 3001;

const mmo = createMMOServer({
  jwtSecret: process.env.JWT_SECRET || "mmo-dev-secret",
});

mmo.listen(PORT).then(() => {
  console.log(`\n  ⚔  MMO Server listening on ws://localhost:${PORT}`);
  console.log(`  Zones: ${FULL_ZONES.length}`);
  console.log(`\n  Start CLI client: npx tsx mmo/client-cli.ts\n`);
});
