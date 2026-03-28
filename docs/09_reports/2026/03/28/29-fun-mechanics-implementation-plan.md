---
title: テキスト型MMO 面白さ機能 実装設計書
type: spec
project: colyseus mmo
version: 1.0.0
date: 2026-03-28
author: Claude Opus 4.6
source: docs 09~12 by Gemini CLI
---

# テキスト型MMO 面白さ機能 実装設計書

> **元仕様:** docs/10_ai_docs/2026/03/28/09~12 (Gemini CLI)
> **本文書:** 現在の実装（259テスト、GameData 駆動）に合わせた具体的な実装設計
> **方針:** JSON で設定可能、System として分離、テスト先行

---

## 1. ワールドアナウンス

### 概要

世界で起きた出来事を全プレイヤーにリアルタイム通知。

### トリガーと表示

| トリガー | メッセージ | 実装箇所 |
|---------|----------|---------|
| ボス討伐 | `[号外] {player}たちが{boss}を討伐した！` | BattleRoom.checkBattleEnd |
| レベル10到達 | `[祝] {player}がLv.{level}に到達！` | BattleRoom (LevelSystem) |
| レアドロップ | `[発見] {player}が{item}を手に入れた！` | BattleRoom (EncounterManager) |
| クエスト完了 | `[達成] {player}が「{quest}」を達成した` | WorldRoom.handleQuestReport |

### データ（game.json に追加）

```json
{
  "announcements": {
    "bossKill": true,
    "levelMilestones": [5, 10],
    "rareDropChance": 0.1
  }
}
```

### System

```typescript
// src/systems/AnnouncementManager.ts
export class AnnouncementManager {
  constructor(private gameData: GameData) {}

  // 全 Room に通知するためのコールバック
  private broadcast: ((msg: string) => void) | null = null;

  setBroadcast(fn: (msg: string) => void) { this.broadcast = fn; }

  onBossKill(playerName: string, bossName: string) {
    if (!this.gameData.meta.announcements?.bossKill) return;
    this.broadcast?.(`[号外] ${playerName}たちが${bossName}を討伐した！`);
  }

  onLevelUp(playerName: string, newLevel: number) {
    const milestones = this.gameData.meta.announcements?.levelMilestones || [];
    if (!milestones.includes(newLevel)) return;
    this.broadcast?.(`[祝] ${playerName}がLv.${newLevel}に到達！`);
  }

  onRareDrop(playerName: string, itemName: string) {
    this.broadcast?.(`[発見] ${playerName}が${itemName}を手に入れた！`);
  }

  onQuestComplete(playerName: string, questName: string) {
    this.broadcast?.(`[達成] ${playerName}が「${questName}」を達成した`);
  }
}
```

### Room 接続

```typescript
// createServer.ts で Presence.publish 経由
// 全 WorldRoom が subscribe して broadcast
presence.subscribe("world:announcement", (msg) => {
  this.broadcast("announcement", { text: msg, timestamp: Date.now() });
});
```

### ブラウザ表示

```
┌──────────────────────────────────────┐
│ [号外] アキラたちがオークキングを討伐した！│ ← 画面上部に一時表示（5秒）
└──────────────────────────────────────┘
```

### テスト

| ID | 内容 |
|----|------|
| ANN-01 | ボス討伐 → announcement メッセージが broadcast される |
| ANN-02 | Lv.5 到達 → announcement が来る |
| ANN-03 | Lv.3 到達 → milestones にないので announcement 来ない |
| ANN-04 | announcements 設定が false → 通知なし |

---

## 2. ゾーン掲示板

### 概要

各ゾーンにプレイヤーがメッセージを残せる。後から来た人が読める。

### データ（PlayerPersistence に追加）

```typescript
// ゾーンごとのメッセージ（最大10件、FIFO）
interface ZoneMessage {
  author: string;
  text: string;
  timestamp: number;
}
```

### System

```typescript
// src/systems/MessageBoardManager.ts
export class MessageBoardManager {
  private boards: Map<string, ZoneMessage[]> = new Map();

  post(zoneId: string, author: string, text: string): ZoneMessage[] {
    if (text.length > 100) return this.get(zoneId); // max 100 chars
    const board = this.boards.get(zoneId) || [];
    board.push({ author, text, timestamp: Date.now() });
    if (board.length > 10) board.shift(); // FIFO
    this.boards.set(zoneId, board);
    return board;
  }

  get(zoneId: string): ZoneMessage[] {
    return this.boards.get(zoneId) || [];
  }
}
```

### WorldRoom メッセージ

```typescript
this.onMessage("board_post", (client, data) => ...);
// → "board_update" { messages: ZoneMessage[] }

this.onMessage("board_read", (client) => ...);
// → "board_messages" { messages: ZoneMessage[] }
```

### onJoin で自動送信

```typescript
// onJoin 時に掲示板メッセージを送る
client.send("board_messages", { messages: this.boardMgr.get(this.state.zoneId) });
```

### ブラウザ表示

```
┌────────────────────────────────┐
│ ── 掲示板 ──                    │
│ アキラ: この先のオーク強い！     │
│ ミサキ: 薬草3つ持ってけ         │
│                                │
│ [1] 書き込む  [0] 戻る          │
└────────────────────────────────┘
```

### テスト

| ID | 内容 |
|----|------|
| BOARD-01 | 投稿 → get で取得できる |
| BOARD-02 | 11件投稿 → 最古の1件が消える（FIFO） |
| BOARD-03 | 100文字超え → 拒否 |
| BOARD-04 | onJoin 時に掲示板メッセージが来る |

---

## 3. 足跡と墓標

### 概要

- **足跡:** プレイヤーが通ったゾーンに一定時間痕跡が残る
- **墓標:** 全滅した場所に24時間残る。他プレイヤーが祈れる

### System

```typescript
// src/systems/TraceManager.ts
export class TraceManager {
  private footprints: Map<string, Footprint[]> = new Map(); // zoneId → traces
  private tombstones: Map<string, Tombstone[]> = new Map();

  leaveFootprint(zoneId: string, playerName: string, direction: string) {
    const fp = this.footprints.get(zoneId) || [];
    fp.push({
      playerName, direction,
      timestamp: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10分
    });
    this.footprints.set(zoneId, fp.filter(f => f.expiresAt > Date.now()));
  }

  placeTombstone(zoneId: string, playerName: string, level: number) {
    const ts = this.tombstones.get(zoneId) || [];
    ts.push({
      playerName, level,
      timestamp: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24時間
      prayers: 0,
    });
    this.tombstones.set(zoneId, ts);
  }

  pray(zoneId: string, tombstoneIndex: number): Tombstone | null {
    const ts = this.tombstones.get(zoneId);
    if (!ts || !ts[tombstoneIndex]) return null;
    ts[tombstoneIndex].prayers++;
    return ts[tombstoneIndex];
  }

  getTraces(zoneId: string): { footprints: Footprint[]; tombstones: Tombstone[] } {
    const now = Date.now();
    return {
      footprints: (this.footprints.get(zoneId) || []).filter(f => f.expiresAt > now),
      tombstones: (this.tombstones.get(zoneId) || []).filter(t => t.expiresAt > now),
    };
  }
}
```

### ブラウザ表示

```
  アキラの足跡が北へ向かっている（3分前）
  ここで誰かがゴブリンと戦った跡がある

  † ミサキ (Lv.3) がここで倒れた（2時間前）
    [P] 祈る
```

### テスト

| ID | 内容 |
|----|------|
| TRACE-01 | 足跡を残す → 取得できる |
| TRACE-02 | 10分後 → 足跡が消える |
| TRACE-03 | 墓標を置く → 取得できる |
| TRACE-04 | 祈る → prayers がインクリメント |
| TRACE-05 | 24時間後 → 墓標が消える |

---

## 4. 焚き火バフ

### 概要

安全ゾーンに3分以上滞在 + 近くに他プレイヤー → EXP ボーナスと自然回復。

### データ（game.json）

```json
{
  "campfire": {
    "requiredSeconds": 180,
    "expBonus": 1.2,
    "hpRegenPerMinute": 5,
    "minPlayersNearby": 1
  }
}
```

### System

```typescript
// src/systems/CampfireManager.ts
export class CampfireManager {
  constructor(private gameData: GameData) {}

  private restingPlayers: Map<string, number> = new Map(); // sessionId → restingSince

  startResting(sessionId: string) {
    this.restingPlayers.set(sessionId, Date.now());
  }

  stopResting(sessionId: string) {
    this.restingPlayers.delete(sessionId);
  }

  isResting(sessionId: string): boolean {
    const since = this.restingPlayers.get(sessionId);
    if (!since) return false;
    const elapsed = (Date.now() - since) / 1000;
    return elapsed >= (this.gameData.meta.campfire?.requiredSeconds || 180);
  }

  getBuffMultiplier(sessionId: string, nearbyCount: number): number {
    if (!this.isResting(sessionId)) return 1.0;
    const minNearby = this.gameData.meta.campfire?.minPlayersNearby || 1;
    if (nearbyCount < minNearby) return 1.0;
    return this.gameData.meta.campfire?.expBonus || 1.2;
  }
}
```

### WorldRoom 統合

```typescript
// 移動メッセージを受け取ったら resting 解除
// 3分間メッセージなし → resting 開始
// onLeave → resting 解除
```

### ブラウザ表示

```
  アキラは焚き火を囲んでリラックスしている
  ミサキは焚き火を囲んでリラックスしている
  → EXP +20% ボーナス中
```

### テスト

| ID | 内容 |
|----|------|
| CAMP-01 | 3分滞在 → isResting = true |
| CAMP-02 | 移動 → isResting = false |
| CAMP-03 | 近くに他プレイヤーあり → buff multiplier = 1.2 |
| CAMP-04 | 近くに他プレイヤーなし → buff = 1.0 |

---

## 5. 混沌度

### 概要

サーバー全体のモンスター討伐数に応じて世界の状態が変わる。

### データ（game.json）

```json
{
  "chaos": {
    "thresholds": {
      "low": 0,
      "medium": 100,
      "high": 300,
      "critical": 500
    },
    "effects": {
      "low":      { "shopDiscount": 0.1, "expBonus": 1.0, "encounterRateMultiplier": 1.0 },
      "medium":   { "shopDiscount": 0.0, "expBonus": 1.1, "encounterRateMultiplier": 1.2 },
      "high":     { "shopDiscount": 0.0, "expBonus": 1.3, "encounterRateMultiplier": 1.5 },
      "critical": { "shopDiscount": 0.0, "expBonus": 1.5, "encounterRateMultiplier": 2.0 }
    },
    "decayPerHour": 10
  }
}
```

### System

```typescript
// src/systems/ChaosManager.ts
export class ChaosManager {
  constructor(private gameData: GameData) {}

  private killCount = 0;
  private lastDecay = Date.now();

  onEnemyKilled() { this.killCount++; }

  getLevel(): "low" | "medium" | "high" | "critical" {
    this.applyDecay();
    const t = this.gameData.meta.chaos?.thresholds;
    if (!t) return "low";
    if (this.killCount >= t.critical) return "critical";
    if (this.killCount >= t.high) return "high";
    if (this.killCount >= t.medium) return "medium";
    return "low";
  }

  getEffects() {
    const level = this.getLevel();
    return this.gameData.meta.chaos?.effects?.[level] || { shopDiscount: 0, expBonus: 1.0, encounterRateMultiplier: 1.0 };
  }

  private applyDecay() {
    const hours = (Date.now() - this.lastDecay) / 3600000;
    const decay = Math.floor(hours * (this.gameData.meta.chaos?.decayPerHour || 10));
    this.killCount = Math.max(0, this.killCount - decay);
    this.lastDecay = Date.now();
  }
}
```

### 他 System への影響

```
EncounterManager.explore() → encounterRate × chaos.encounterRateMultiplier
LevelSystem.addExp()       → exp × chaos.expBonus
ShopManager.buy()          → price × (1 - chaos.shopDiscount)
```

### ブラウザ表示

```
  [世界状況: 混沌度 HIGH]
  魔物の活動が活発化している。経験値+30%
```

### zone_info に追加

```typescript
client.send("zone_info", {
  ...existing,
  worldChaos: chaosManager.getLevel(),
  chaosEffects: chaosManager.getEffects(),
});
```

### テスト

| ID | 内容 |
|----|------|
| CHAOS-01 | 0 kills → level = low |
| CHAOS-02 | 100 kills → level = medium |
| CHAOS-03 | effects が正しい multiplier を返す |
| CHAOS-04 | 時間経過 → decay で killCount 減少 |

---

## 6. 刻印システム

### 概要

アイテムに「作成者」「最初の発見者」のタグを付ける。

### データ（InventoryItem に追加）

```typescript
interface InventoryItem {
  itemId: string;
  name: string;
  quantity: number;
  type: string;
  signature?: string;  // "crafted by アキラ" or "found by ミサキ"
}
```

### 実装

```typescript
// ドロップ時
drops.push({
  ...item,
  signature: `found by ${playerName}`,
});

// トレード時 → signature は保持される
```

### テスト

| ID | 内容 |
|----|------|
| SIG-01 | ドロップ品に signature が付く |
| SIG-02 | トレード後も signature が保持される |

---

## 7. 復興プロジェクト

### 概要

全プレイヤーで素材を納品し、施設を修復する。

### データ（game.json）

```json
{
  "reconstruction": {
    "projects": [
      {
        "id": "well",
        "name": "村の井戸",
        "zone": "zone-001-village",
        "required": { "herb-001": 50, "iron-ore": 20 },
        "reward": { "type": "hp_regen", "description": "井戸で回復可能に" }
      }
    ]
  }
}
```

### System

```typescript
// src/systems/ReconstructionManager.ts
export class ReconstructionManager {
  constructor(private gameData: GameData) {}

  private progress: Record<string, Record<string, number>> = {}; // projectId → itemId → count

  contribute(projectId: string, itemId: string, quantity: number): boolean {
    // validate, increment, check completion
  }

  getProgress(projectId: string): { itemId: string; current: number; required: number }[] { ... }

  isComplete(projectId: string): boolean { ... }
}
```

### テスト

| ID | 内容 |
|----|------|
| RECON-01 | 素材納品 → progress 増加 |
| RECON-02 | 目標達成 → isComplete = true |
| RECON-03 | 不足素材 → 未完了 |

---

## 実装順序

| # | 機能 | 難易度 | テスト数 | 依存 |
|---|------|:---:|:---:|------|
| 1 | ワールドアナウンス | 低 | 4 | BattleRoom |
| 2 | ゾーン掲示板 | 低 | 4 | WorldRoom |
| 3 | 足跡と墓標 | 低 | 5 | WorldRoom + DeathManager |
| 4 | 刻印システム | 低 | 2 | EncounterManager |
| 5 | 焚き火バフ | 中 | 4 | WorldRoom (timer) |
| 6 | 混沌度 | 中 | 4 | 全 System に影響 |
| 7 | 復興プロジェクト | 中 | 3 | WorldRoom + items |
| **合計** | | | **26** | |

### セッション分割

| セッション | 機能 | テスト |
|-----------|------|:---:|
| S1 | アナウンス + 掲示板 + 刻印 | 10 |
| S2 | 足跡 + 墓標 | 5 |
| S3 | 焚き火 + 混沌度 | 8 |
| S4 | 復興プロジェクト | 3 |

---

## JSON 設定まとめ（game.json に追加）

```json
{
  "announcements": {
    "bossKill": true,
    "levelMilestones": [5, 10],
    "rareDropChance": 0.1
  },
  "campfire": {
    "requiredSeconds": 180,
    "expBonus": 1.2,
    "hpRegenPerMinute": 5,
    "minPlayersNearby": 1
  },
  "chaos": {
    "thresholds": { "low": 0, "medium": 100, "high": 300, "critical": 500 },
    "effects": {
      "low":      { "shopDiscount": 0.1, "expBonus": 1.0, "encounterRateMultiplier": 1.0 },
      "critical": { "shopDiscount": 0.0, "expBonus": 1.5, "encounterRateMultiplier": 2.0 }
    },
    "decayPerHour": 10
  },
  "reconstruction": {
    "projects": [
      { "id": "well", "name": "村の井戸", "zone": "zone-001-village", "required": { "herb-001": 50 } }
    ]
  },
  "messageBoard": {
    "maxLength": 100,
    "maxPerZone": 10
  }
}
```

全設定が JSON。差し替えで調整可能。validateGameData に新チェック追加。

---

## メタ情報

| 項目 | 値 |
|------|-----|
| 生成モデル | Claude Opus 4.6 |
| 生成日 | 2026-03-28 |
| 元仕様 | Gemini CLI docs 09~12 |
| 新 System | 6 (Announcement, MessageBoard, Trace, Campfire, Chaos, Reconstruction) |
| 新テスト | 26 |

> この文書は AI によって生成されました。
