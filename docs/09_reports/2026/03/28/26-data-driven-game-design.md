---
title: データ駆動ゲームエンジン設計 — JSON 差し替えで別ゲームに
type: spec
project: colyseus mmo
version: 0.1.0
date: 2026-03-28
author: Claude Opus 4.6
---

# データ駆動ゲームエンジン設計

> **目標:** `games/fantasy-rpg/` の JSON を `games/sci-fi-mmo/` に差し替えると、まったく別のゲームが動く
> **方針:** Systems はデータを直接 import しない。GameData オブジェクト経由で参照する

---

## 現状の問題

### Systems が Data を直接 import している（10箇所）

```
CharacterCreator  ──import──► data/classes.ts      (CLASS_DEFS)
LevelSystem       ──import──► data/classes.ts      (CLASS_DEFS)
LevelSystem       ──import──► data/levelTable.ts   (calculateLevelUps)
EncounterManager  ──import──► data/encounters.ts   (ZONE_ENCOUNTERS)
ItemManager       ──import──► data/items.ts        (ITEMS)
ShopManager       ──import──► data/shops.ts        (SHOPS)
ShopManager       ──import──► data/items.ts        (ITEMS)
ShopManager       ──import──► data/equipment.ts    (EQUIPMENT)
EquipmentManager  ──import──► data/equipment.ts    (EQUIPMENT)
QuestManager      ──import──► data/quests.ts       (QUESTS)
WorldRoom         ──import──► data/quests.ts       (getQuestsByNpc) ※dynamic
```

**結果:** ゲームデータを変えるには TypeScript ファイルを編集してリビルドが必要。非プログラマには触れない。

---

## 目標の構造

```
mmo/
├── src/
│   ├── engine/              ← ゲームエンジン（データに依存しない）
│   │   ├── systems/         ← GameData を引数で受け取る
│   │   ├── rooms/           ← GameData を DI で受け取る
│   │   ├── schemas/
│   │   ├── persistence/
│   │   └── types/
│   │
│   ├── GameData.ts          ← 全ゲームデータを束ねる型 + ローダー
│   └── createServer.ts      ← GameData をロードしてサーバーに注入
│
├── games/                   ← ゲームデータ（JSON）
│   ├── fantasy-rpg/         ← 現在のファンタジーRPG
│   │   ├── game.json        ← ゲーム名・説明・初期設定
│   │   ├── classes.json     ← 戦士/魔法使い/盗賊
│   │   ├── levels.json      ← EXP テーブル
│   │   ├── zones.json       ← 12ゾーン + 隣接関係 + NPC
│   │   ├── enemies.json     ← 敵定義
│   │   ├── encounters.json  ← ゾーン別エンカウント設定
│   │   ├── items.json       ← 消費アイテム + 素材
│   │   ├── equipment.json   ← 武器/防具/アクセサリー
│   │   ├── shops.json       ← NPC ショップ品揃え
│   │   ├── quests.json      ← クエスト定義
│   │   └── bosses.json      ← ボスデータ
│   │
│   └── sci-fi-mmo/          ← SF版（同じエンジンで別ゲーム）
│       ├── game.json        ← "スペースコロニー MMO"
│       ├── classes.json     ← エンジニア/パイロット/ハッカー
│       ├── zones.json       ← 宇宙ステーション/惑星/小惑星帯
│       └── ...
│
├── server.ts                ← npx tsx mmo/server.ts --game fantasy-rpg
└── client-cli.ts
```

---

## GameData 型定義

```typescript
// src/GameData.ts

export interface GameData {
  meta: GameMeta;
  classes: Record<string, ClassDef>;
  levels: LevelTable;
  zones: ZoneDef[];
  enemies: Record<string, EnemyDef>;
  encounters: Record<string, ZoneEncounterDef>;
  items: Record<string, ItemDef>;
  equipment: Record<string, EquipmentDef>;
  shops: Record<string, ShopDef>;
  quests: Record<string, QuestDef>;
  bosses: Record<string, BossDef>;
}

export interface GameMeta {
  id: string;           // "fantasy-rpg"
  name: string;         // "アルカディア大陸"
  description: string;
  version: string;
  startZone: string;    // "zone-001-village"
  startGold: number;    // 100
  deathPenaltyRate: number;  // 0.1
  respawnZone: string;  // "zone-001-village"
  chatRateLimit: number; // 500 (ms)
  maxMessageLength: number; // 200
}
```

---

## JSON スキーマ例

### game.json

```json
{
  "id": "fantasy-rpg",
  "name": "アルカディア大陸",
  "description": "古代魔法文明が栄えた大陸を舞台にしたテキスト型MMO",
  "version": "1.0.0",
  "startZone": "zone-001-village",
  "startGold": 100,
  "deathPenaltyRate": 0.1,
  "respawnZone": "zone-001-village",
  "chatRateLimit": 500,
  "maxMessageLength": 200
}
```

### classes.json

```json
{
  "warrior": {
    "name": "戦士",
    "hp": 120, "mp": 20, "atk": 15, "def": 12, "mag": 3, "spd": 8,
    "growth": { "hp": 12, "mp": 2, "atk": 3, "def": 2, "mag": 0, "spd": 1 }
  },
  "mage": {
    "name": "魔法使い",
    "hp": 80, "mp": 60, "atk": 5, "def": 5, "mag": 15, "spd": 10,
    "growth": { "hp": 5, "mp": 8, "atk": 1, "def": 1, "mag": 3, "spd": 1 }
  },
  "thief": {
    "name": "盗賊",
    "hp": 90, "mp": 30, "atk": 10, "def": 7, "mag": 5, "spd": 15,
    "growth": { "hp": 8, "mp": 3, "atk": 2, "def": 1, "mag": 1, "spd": 3 }
  }
}
```

### zones.json（一部）

```json
[
  {
    "id": "zone-001-village",
    "name": "はじまりの村",
    "description": "穏やかな風が吹く小さな村。石畳の広場に井戸がある。",
    "maxPlayers": 50,
    "isSafe": true,
    "adjacentZones": [
      { "direction": "north", "zoneId": "zone-004-capital" }
    ],
    "npcs": [
      {
        "id": "npc-elder",
        "name": "長老ヨハン",
        "expression": "normal",
        "pose": "standing",
        "x": 400, "y": 300,
        "dialogue": [
          "[e:smile]ようこそ、旅人よ。[click]この村は平和じゃが...[e:serious]北の森には気をつけるのじゃ。"
        ],
        "shop": null,
        "quests": ["Q-001", "Q-003"]
      }
    ]
  }
]
```

### enemies.json

```json
{
  "goblin": {
    "name": "ゴブリン",
    "hp": 40, "atk": 7, "def": 3,
    "exp": 10, "gold": 5,
    "drops": [
      { "itemId": "herb-001", "chance": 0.5 },
      { "itemId": "goblin-fang", "chance": 0.2 }
    ]
  }
}
```

### encounters.json

```json
{
  "zone-002-forest": {
    "encounterRate": 0.5,
    "itemFindRate": 0.2,
    "findableItems": [
      { "itemId": "herb-001", "quantity": 1 }
    ],
    "enemies": [
      { "enemyId": "goblin", "weight": 60 },
      { "enemyId": "bat", "weight": 30 },
      { "enemyId": "orc", "weight": 10 }
    ]
  }
}
```

---

## リファクタリング計画

### Step 1: GameData 型 + ローダー

```typescript
// src/GameData.ts
import fs from "fs";
import path from "path";

export function loadGameData(gameDir: string): GameData {
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(gameDir, file), "utf-8"));
  return {
    meta: read("game.json"),
    classes: read("classes.json"),
    levels: read("levels.json"),
    zones: read("zones.json"),
    enemies: read("enemies.json"),
    encounters: read("encounters.json"),
    items: read("items.json"),
    equipment: read("equipment.json"),
    shops: read("shops.json"),
    quests: read("quests.json"),
    bosses: read("bosses.json"),
  };
}
```

### Step 2: Systems のコンストラクタに GameData を注入

**Before:**
```typescript
// CharacterCreator.ts
import { CLASS_DEFS } from "../data/classes.ts";

export class CharacterCreator {
  constructor(private playerDB: IPlayerPersistence) {}

  async create(userId: string, req: CreateCharacterRequest) {
    const classDef = CLASS_DEFS[req.classType];  // ← 直接参照
  }
}
```

**After:**
```typescript
// CharacterCreator.ts
// import 不要

export class CharacterCreator {
  constructor(
    private playerDB: IPlayerPersistence,
    private gameData: GameData,  // ← 注入
  ) {}

  async create(userId: string, req: CreateCharacterRequest) {
    const classDef = this.gameData.classes[req.classType];  // ← GameData 経由
  }
}
```

### Step 3: 各 System の変更一覧

| System | 現在の import | 変更後 |
|--------|-------------|--------|
| CharacterCreator | `CLASS_DEFS` | `gameData.classes` |
| LevelSystem | `CLASS_DEFS`, `calculateLevelUps` | `gameData.classes`, `gameData.levels` |
| EncounterManager | `ZONE_ENCOUNTERS` | `gameData.encounters`, `gameData.enemies` |
| ItemManager | `ITEMS` | `gameData.items` |
| ShopManager | `SHOPS`, `ITEMS`, `EQUIPMENT` | `gameData.shops`, `gameData.items`, `gameData.equipment` |
| EquipmentManager | `EQUIPMENT` | `gameData.equipment` |
| QuestManager | `QUESTS` | `gameData.quests` |
| DeathManager | (ハードコード) | `gameData.meta.deathPenaltyRate`, `gameData.meta.respawnZone` |
| PartyManager | (依存なし) | 変更なし |

### Step 4: createServer に GameData を注入

```typescript
// createServer.ts
export function createMMOServer(opts: ServerOptions & { gameData: GameData }): MMOServer {
  const { gameData } = opts;

  // Systems に GameData を渡す
  // Room は Systems 経由で GameData にアクセス
}
```

### Step 5: server.ts でゲームを選択

```typescript
// server.ts
const gameName = process.env.GAME || "fantasy-rpg";
const gameData = loadGameData(`./games/${gameName}`);
const mmo = createMMOServer({ gameData, jwtSecret: "..." });
```

### Step 6: 既存の data/*.ts から JSON を生成

```bash
# 既存 TS データから JSON をエクスポートするスクリプト
npx tsx mmo/scripts/export-game-data.ts --out games/fantasy-rpg/
```

---

## SF ゲームの例

`games/sci-fi-mmo/game.json`:
```json
{
  "id": "sci-fi-mmo",
  "name": "スペースコロニー MMO",
  "description": "宇宙を旅するテキスト型MMO",
  "startZone": "station-01-hub",
  "startGold": 500,
  "deathPenaltyRate": 0.05,
  "respawnZone": "station-01-hub"
}
```

`games/sci-fi-mmo/classes.json`:
```json
{
  "engineer": {
    "name": "エンジニア",
    "hp": 100, "mp": 40, "atk": 8, "def": 15, "mag": 10, "spd": 7,
    "growth": { "hp": 10, "mp": 4, "atk": 1, "def": 3, "mag": 2, "spd": 1 }
  },
  "pilot": {
    "name": "パイロット",
    "hp": 90, "mp": 30, "atk": 12, "def": 8, "mag": 5, "spd": 15,
    "growth": { "hp": 8, "mp": 2, "atk": 2, "def": 1, "mag": 1, "spd": 3 }
  },
  "hacker": {
    "name": "ハッカー",
    "hp": 70, "mp": 70, "atk": 5, "def": 5, "mag": 18, "spd": 12,
    "growth": { "hp": 4, "mp": 8, "atk": 1, "def": 1, "mag": 4, "spd": 2 }
  }
}
```

`games/sci-fi-mmo/zones.json`（一部）:
```json
[
  {
    "id": "station-01-hub",
    "name": "セントラルハブ",
    "description": "巨大宇宙ステーションの中心部。ホログラムの広告が浮かぶ。",
    "isSafe": true,
    "adjacentZones": [
      { "direction": "north", "zoneId": "station-02-docks" },
      { "direction": "east", "zoneId": "station-03-market" }
    ],
    "npcs": [
      {
        "id": "npc-commander",
        "name": "司令官レイア",
        "dialogue": ["[e:serious]新人か。[click]この宙域は最近、海賊が増えている。気をつけろ。"]
      }
    ]
  },
  {
    "id": "sector-05-asteroid",
    "name": "小惑星帯セクター5",
    "description": "岩石が浮遊する危険宙域。レーダーにはいくつかの反応がある。",
    "isSafe": false,
    "adjacentZones": [
      { "direction": "south", "zoneId": "station-02-docks" }
    ],
    "npcs": []
  }
]
```

`games/sci-fi-mmo/enemies.json`:
```json
{
  "space-pirate": {
    "name": "宇宙海賊",
    "hp": 50, "atk": 10, "def": 5,
    "exp": 15, "gold": 20,
    "drops": [
      { "itemId": "pirate-badge", "chance": 0.3 }
    ]
  },
  "drone": {
    "name": "暴走ドローン",
    "hp": 30, "atk": 15, "def": 2,
    "exp": 12, "gold": 10,
    "drops": [
      { "itemId": "circuit-board", "chance": 0.5 }
    ]
  }
}
```

---

## バリデーション

JSON ロード時にスキーマ検証を行う。

```typescript
function validateGameData(data: GameData): string[] {
  const errors: string[] = [];

  // startZone が zones に存在するか
  if (!data.zones.find(z => z.id === data.meta.startZone)) {
    errors.push(`startZone "${data.meta.startZone}" not found in zones`);
  }

  // encounters の enemyId が enemies に存在するか
  for (const [zoneId, enc] of Object.entries(data.encounters)) {
    for (const e of enc.enemies) {
      if (!data.enemies[e.enemyId]) {
        errors.push(`encounter ${zoneId}: enemy "${e.enemyId}" not found`);
      }
    }
  }

  // shop の itemId が items/equipment に存在するか
  for (const [npcId, shop] of Object.entries(data.shops)) {
    for (const itemId of shop.items) {
      if (!data.items[itemId] && !data.equipment[itemId]) {
        errors.push(`shop ${npcId}: item "${itemId}" not found`);
      }
    }
  }

  // quest の targetId が enemies/items/zones に存在するか
  for (const [qId, quest] of Object.entries(data.quests)) {
    for (const obj of quest.objectives) {
      if (obj.type === "defeat" && !data.enemies[obj.targetId]) {
        errors.push(`quest ${qId}: enemy "${obj.targetId}" not found`);
      }
      if (obj.type === "collect" && !data.items[obj.targetId]) {
        errors.push(`quest ${qId}: item "${obj.targetId}" not found`);
      }
      if (obj.type === "visit" && !data.zones.find(z => z.id === obj.targetId)) {
        errors.push(`quest ${qId}: zone "${obj.targetId}" not found`);
      }
    }
  }

  // zone の隣接が双方向か
  for (const zone of data.zones) {
    const opposites: Record<string, string> = { north: "south", south: "north", east: "west", west: "east" };
    for (const adj of zone.adjacentZones) {
      const target = data.zones.find(z => z.id === adj.zoneId);
      if (!target) {
        errors.push(`zone ${zone.id}: adjacent "${adj.zoneId}" not found`);
      } else {
        const back = target.adjacentZones.find(a => a.zoneId === zone.id && a.direction === opposites[adj.direction]);
        if (!back) {
          errors.push(`zone ${zone.id} → ${adj.direction} → ${adj.zoneId}: no reverse link`);
        }
      }
    }
  }

  return errors;
}
```

---

## 実装ステップ

| # | タスク | 影響範囲 | テスト |
|---|--------|---------|--------|
| 1 | `GameData` 型定義 + `loadGameData()` ローダー | 新規ファイル | ローダーテスト |
| 2 | `games/fantasy-rpg/` に JSON エクスポート | 既存 data/*.ts → JSON | diff で一致確認 |
| 3 | `validateGameData()` 実装 | 新規 | バリデーションテスト |
| 4 | Systems のコンストラクタに GameData 注入 | 9 Systems | 既存テスト修正 |
| 5 | WorldRoom の dynamic import 除去 | WorldRoom.ts | 既存テスト |
| 6 | `createServer.ts` に GameData 注入 | createServer.ts | 既存テスト |
| 7 | `server.ts --game` オプション対応 | server.ts | 手動確認 |
| 8 | SF ゲームデータ作成 + 起動テスト | 新規 JSON | 新規テスト |
| 9 | data/*.ts 削除（JSON に完全移行） | 旧ファイル削除 | 全テスト |

### 想定作業量

- Step 1〜3: GameData + JSON + バリデーション → 1セッション
- Step 4〜6: Systems リファクタ → 1セッション
- Step 7〜9: CLI 対応 + SF ゲーム + 旧ファイル削除 → 1セッション

---

## 変わるもの・変わらないもの

### JSON を差し替えると変わるもの

| データ | 例 |
|--------|-----|
| ゲーム名・世界観 | ファンタジー → SF |
| 職業名・ステータス | 戦士 → エンジニア |
| ゾーン名・接続・NPC配置 | 村/森 → 宇宙ステーション/小惑星帯 |
| 敵の名前・ステータス | ゴブリン → 宇宙海賊 |
| アイテム・装備 | 回復薬/鉄の剣 → ナノジェル/レーザーブレード |
| クエスト内容 | ゴブリン討伐 → 海賊掃討 |
| ショップ品揃え | |
| ボスデータ | オークキング → 海賊船長 |
| EXP テーブル・成長率 | |
| 死亡ペナルティ率 | |
| NPC の台詞（インラインタグ含む） | |

### JSON を差し替えても変わらないもの（エンジン）

| 機能 | 理由 |
|------|------|
| ターン制戦闘の仕組み | BattleRoom のロジック |
| チャットシステム | ChatRoom |
| 取引システム | TradeRoom |
| ゾーン移動（東西南北） | WorldRoom |
| レベルアップの計算式 | LevelSystem |
| エンカウント判定（重み付きランダム） | EncounterManager |
| ドロップ判定（確率ロール） | EncounterManager |
| アイテム使用（HP/MP 回復） | ItemManager |
| 装備ボーナス計算 | EquipmentManager |
| クエスト進捗追跡 | QuestManager |
| パーティ管理 | PartyManager |
| 死亡ペナルティ処理 | DeathManager |
| JWT 認証 | KaedevnAuthAdapter |
| WebSocket 通信 | Colyseus |

---

## メタ情報

| 項目 | 値 |
|------|-----|
| 生成モデル | Claude Opus 4.6 |
| 生成日 | 2026-03-28 |
| 前提文書 | 25-mmo-architecture-reference.md |
| 現在の結合点 | Systems → Data: 10箇所 |
| 目標 | Systems → Data: 0箇所（GameData 経由に統一） |

> この文書は AI によって生成されました。内容の正確性はソースコードとの照合で確認してください。
