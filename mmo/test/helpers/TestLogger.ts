import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

const LOGS_DIR = path.join(__dirname, "..", "logs");

export interface LogEntry {
  t: number;       // elapsed ms
  type: "player" | "system" | "section";
  player?: string;
  action?: string; // what happened (structured)
  detail?: Record<string, any>;
  text: string;    // human-readable line
}

export interface GameLog {
  testName: string;
  startedAt: string;
  durationMs: number;
  players: string[];
  entries: LogEntry[];
}

export class TestLogger {
  private dir: string;
  private startTime: number;
  private entries: LogEntry[] = [];
  private playerSet = new Set<string>();
  readonly testName: string;

  constructor(testName: string) {
    this.testName = testName;
    this.startTime = Date.now();
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this.dir = path.join(LOGS_DIR, `${ts}_${testName}`);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Log a player action */
  player(playerName: string, text: string, action?: string, detail?: Record<string, any>) {
    this.playerSet.add(playerName);
    this.entries.push({
      t: Date.now() - this.startTime,
      type: "player",
      player: playerName,
      action,
      detail,
      text,
    });
  }

  /** Log a system event */
  system(text: string, action?: string, detail?: Record<string, any>) {
    this.entries.push({
      t: Date.now() - this.startTime,
      type: "system",
      action,
      detail,
      text,
    });
  }

  /** Section header */
  section(title: string) {
    this.entries.push({
      t: Date.now() - this.startTime,
      type: "section",
      text: title,
    });
  }

  /** Get all entries */
  getEntries(): LogEntry[] {
    return this.entries;
  }

  /** Get entries for a specific player */
  getPlayerEntries(playerName: string): LogEntry[] {
    return this.entries.filter(e => e.player === playerName);
  }

  /** Get entries by action name */
  getByAction(action: string): LogEntry[] {
    return this.entries.filter(e => e.action === action);
  }

  /** Flush to disk as JSON + human-readable summary */
  flush(): string {
    const durationMs = Date.now() - this.startTime;
    const players = [...this.playerSet];

    // JSON log (machine-readable, testable)
    const gameLog: GameLog = {
      testName: this.testName,
      startedAt: new Date(this.startTime).toISOString(),
      durationMs,
      players,
      entries: this.entries,
    };
    fs.writeFileSync(path.join(this.dir, "log.json"), JSON.stringify(gameLog, null, 2), "utf-8");

    // Per-player JSON
    for (const player of players) {
      const playerEntries = this.entries.filter(e => e.player === player || e.type === "section");
      fs.writeFileSync(
        path.join(this.dir, `${player}.json`),
        JSON.stringify(playerEntries, null, 2),
        "utf-8",
      );
    }

    // Human-readable summary
    const lines: string[] = [
      `Test: ${this.testName}`,
      `Date: ${new Date(this.startTime).toISOString()}`,
      `Duration: ${durationMs}ms`,
      `Players: ${players.join(", ")}`,
      "",
    ];
    for (const entry of this.entries) {
      if (entry.type === "section") {
        lines.push(`\n${"=".repeat(50)}`);
        lines.push(`  ${entry.text}`);
        lines.push("=".repeat(50));
      } else if (entry.type === "system") {
        lines.push(`[${this.fmtMs(entry.t)}] [SYSTEM] ${entry.text}`);
      } else {
        lines.push(`[${this.fmtMs(entry.t)}] ${entry.player}: ${entry.text}`);
      }
    }
    fs.writeFileSync(path.join(this.dir, "summary.log"), lines.join("\n") + "\n", "utf-8");

    return this.dir;
  }

  private fmtMs(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = (ms % 1000).toString().padStart(3, "0");
    return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}.${rem}`;
  }
}
