/**
 * SQLite 永続化
 *
 * IPlayerPersistence インターフェース準拠。
 * InMemoryPlayerDB と差し替え可能。
 *
 * テーブル: players (userId TEXT PK, data JSON)
 * シンプルにJSONカラム1つ。PostgreSQL 移行時は JSONB に。
 */
import Database from "better-sqlite3";
import type { PlayerData, IPlayerPersistence } from "./PlayerPersistence.ts";

export class SqlitePlayerDB implements IPlayerPersistence {
  private db: Database.Database;

  constructor(dbPath: string = "mmo-data.db") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL"); // faster concurrent reads
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        userId TEXT PRIMARY KEY,
        name TEXT,
        level INTEGER DEFAULT 1,
        data TEXT NOT NULL,
        updatedAt INTEGER DEFAULT 0
      )
    `);
  }

  async findByUserId(userId: string): Promise<PlayerData | null> {
    const row = this.db.prepare("SELECT data FROM players WHERE userId = ?").get(userId) as any;
    if (!row) return null;
    return JSON.parse(row.data);
  }

  async save(data: PlayerData): Promise<void> {
    this.db.prepare(`
      INSERT INTO players (userId, name, level, data, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET
        name = excluded.name,
        level = excluded.level,
        data = excluded.data,
        updatedAt = excluded.updatedAt
    `).run(data.userId, data.name, data.level, JSON.stringify(data), Date.now());
  }

  async delete(userId: string): Promise<void> {
    this.db.prepare("DELETE FROM players WHERE userId = ?").run(userId);
  }

  // ── テスト/開発用 ──

  seed(players: PlayerData[]): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO players (userId, name, level, data, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    const tx = this.db.transaction((players: PlayerData[]) => {
      for (const p of players) {
        insert.run(p.userId, p.name, p.level, JSON.stringify(p), Date.now());
      }
    });
    tx(players);
  }

  clear(): void {
    this.db.exec("DELETE FROM players");
  }

  close(): void {
    this.db.close();
  }

  // ── デバッグ用 ──

  listAll(): PlayerData[] {
    const rows = this.db.prepare("SELECT data FROM players ORDER BY updatedAt DESC").all() as any[];
    return rows.map(r => JSON.parse(r.data));
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM players").get() as any;
    return row.cnt;
  }
}
