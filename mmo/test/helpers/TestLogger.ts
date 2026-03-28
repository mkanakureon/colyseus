import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

const LOGS_DIR = path.join(__dirname, "..", "logs");

export class TestLogger {
  private dir: string;
  private playerLogs = new Map<string, string[]>();
  private summaryLines: string[] = [];
  private startTime: number;

  constructor(testName: string) {
    this.startTime = Date.now();
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this.dir = path.join(LOGS_DIR, `${ts}_${testName}`);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Log a player action/event */
  player(playerName: string, line: string) {
    const elapsed = this.elapsed();
    const entry = `[${elapsed}] ${line}`;
    if (!this.playerLogs.has(playerName)) {
      this.playerLogs.set(playerName, []);
    }
    this.playerLogs.get(playerName)!.push(entry);
    this.summaryLines.push(`[${elapsed}] ${playerName}: ${line}`);
  }

  /** Log a system event */
  system(line: string) {
    const elapsed = this.elapsed();
    const entry = `[${elapsed}] [SYSTEM] ${line}`;
    this.summaryLines.push(entry);
  }

  /** Log a section header */
  section(title: string) {
    const divider = `\n${"=".repeat(50)}\n  ${title}\n${"=".repeat(50)}`;
    this.summaryLines.push(divider);
    for (const [, lines] of this.playerLogs) {
      lines.push(divider);
    }
  }

  /** Flush all logs to disk */
  flush() {
    // Write per-player logs
    for (const [name, lines] of this.playerLogs) {
      const filename = `${name}.log`;
      fs.writeFileSync(path.join(this.dir, filename), lines.join("\n") + "\n", "utf-8");
    }

    // Write summary
    const header = [
      `Test Run: ${new Date(this.startTime).toISOString()}`,
      `Duration: ${this.elapsed()}`,
      `Players: ${[...this.playerLogs.keys()].join(", ")}`,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(this.dir, "summary.log"), header + this.summaryLines.join("\n") + "\n", "utf-8");

    return this.dir;
  }

  private elapsed(): string {
    const ms = Date.now() - this.startTime;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = (ms % 1000).toString().padStart(3, "0");
    return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}.${rem}`;
  }
}
