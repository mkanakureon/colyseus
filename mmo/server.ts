/**
 * MMO サーバー起動 + ブラウザクライアント配信
 * Usage: npx tsx mmo/server.ts
 *
 * WebSocket: ws://localhost:3001
 * Browser:   http://localhost:3000
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createMMOServer } from "./src/createServer.ts";

const WS_PORT = Number(process.env.PORT) || 3001;
const HTTP_PORT = Number(process.env.HTTP_PORT) || 3000;

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, "client");

const mmo = createMMOServer({
  jwtSecret: process.env.JWT_SECRET || "mmo-dev-secret",
});

// Static file server for browser client
const contentTypes: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
};

const httpServer = http.createServer((req, res) => {
  let filePath = req.url === "/" ? "/index.html" : req.url || "/index.html";
  const fullPath = path.join(CLIENT_DIR, filePath);
  const ext = path.extname(fullPath);

  if (fs.existsSync(fullPath) && contentTypes[ext]) {
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] + "; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(fs.readFileSync(fullPath));
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

httpServer.listen(HTTP_PORT);

mmo.listen(WS_PORT).then(() => {
  console.log(`\n  ⚔  MMO Server`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`  Browser:   http://localhost:${HTTP_PORT}`);
  console.log(`  CLI:       npx tsx mmo/client-cli.ts\n`);
});
