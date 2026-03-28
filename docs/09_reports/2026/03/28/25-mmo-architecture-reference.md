---
title: テキスト型MMO アーキテクチャリファレンス
type: reference
project: colyseus mmo
version: 1.0.0
date: 2026-03-28
author: Claude Opus 4.6
---

# テキスト型MMO アーキテクチャリファレンス

> **リポジトリ:** colyseus (mmo/ ディレクトリ)
> **テスト:** 114 passing
> **コード:** 6,957 行 (src: 2,769 / test: 4,188)

---

## ディレクトリ構成

```
mmo/
├── server.ts                    ← サーバー起動エントリ (npx tsx mmo/server.ts)
├── client-cli.ts                ← CLI クライアント (npx tsx mmo/client-cli.ts)
├── package.json
├── tsconfig.json
├── .mocharc.yml
│
├── src/
│   ├── createServer.ts          ← サーバーファクトリ（DI + Room定義の一元管理）
│   │
│   ├── rooms/                   ← Colyseus Room 実装（WebSocket メッセージハンドラ）
│   │   ├── WorldRoom.ts         │  457行  ゾーン管理・NPC・ショップ・装備・クエスト・探索
│   │   ├── BattleRoom.ts        │  346行  ターン制戦闘・アイテム使用・レベルアップ・ドロップ
│   │   ├── ChatRoom.ts          │  132行  グローバル/ゾーン/ウィスパーチャット
│   │   └── TradeRoom.ts         │  225行  プレイヤー間アイテム取引
│   │
│   ├── systems/                 ← ゲームロジック（Room から呼ばれる純粋なビジネスロジック）
│   │   ├── CharacterCreator.ts  │  58行   キャラ作成・職業選択
│   │   ├── LevelSystem.ts       │  58行   EXP加算・レベルアップ判定・ステータス上昇
│   │   ├── EncounterManager.ts  │  57行   ランダムエンカウント・ドロップ判定
│   │   ├── ItemManager.ts       │  63行   アイテム使用・インベントリ管理
│   │   ├── DeathManager.ts      │  22行   死亡ペナルティ・リスポーン
│   │   ├── ShopManager.ts       │  82行   NPC ショップ売買
│   │   ├── EquipmentManager.ts  │  127行  装備着脱・ステータスボーナス計算
│   │   ├── QuestManager.ts      │  132行  クエスト受注・進捗追跡・完了報告
│   │   └── PartyManager.ts      │  111行  パーティ招待・承諾・解散
│   │
│   ├── schemas/                 ← @colyseus/schema 状態定義（クライアント自動同期）
│   │   ├── WorldState.ts        │  ゾーンID・プレイヤー一覧・NPC一覧
│   │   ├── PlayerState.ts       │  セッションID・名前・HP/MP・レベル・表情
│   │   └── BattleState.ts       │  フェーズ・ターン・バトラー一覧
│   │
│   ├── data/                    ← ゲームデータ定義（マスターデータ）
│   │   ├── zones-full.ts        │  154行  12ゾーン完全定義（隣接関係・NPC配置）
│   │   ├── encounters.ts        │  94行   ゾーン別エンカウントテーブル（6種の敵）
│   │   ├── quests.ts            │  53行   5クエスト（討伐・収集・訪問）
│   │   ├── items.ts             │  44行   消費アイテム・素材
│   │   ├── bosses.ts            │  44行   3ボス（特殊攻撃パターン付き）
│   │   ├── levelTable.ts        │  35行   Lv1〜10 必要EXPテーブル
│   │   ├── classes.ts           │  31行   3職業（戦士/魔法使い/盗賊）＋成長率
│   │   ├── equipment.ts         │  24行   8装備（武器/防具/アクセサリー）
│   │   └── shops.ts             │  17行   2 NPC ショップ品揃え
│   │
│   ├── auth/
│   │   └── KaedevnAuthAdapter.ts│  30行   JWT トークン生成・検証
│   │
│   ├── persistence/
│   │   └── PlayerPersistence.ts │  101行  PlayerData型・IPlayerPersistence・InMemoryDB
│   │
│   └── types/
│       └── messages.ts          │  142行  全 Room のメッセージ型定義
│
└── test/
    ├── helpers/
    │   └── TestLogger.ts        │  146行  JSON ログ出力 + action 検索API
    ├── mocks/
    │   ├── kaedevn-auth.ts      │  テスト用トークン生成
    │   ├── zone-map.ts          │  テスト用3ゾーン
    │   └── inline-tags.ts       │  インラインタグパーサー
    │
    ├── IntegrationE2E.test.ts   │  SDKClient → Room 経由の全機能結合テスト
    ├── FullPlaythrough.test.ts  │  12ゾーン通しプレイ（システム直接呼び出し）
    ├── PlaythroughE2E.test.ts   │  5シナリオ E2E（Room 経由）
    ├── WorldRoom.test.ts        │  17件  認証・参加・移動・NPC・同期
    ├── ChatRoom.test.ts         │  8件   グローバル/ゾーン/ウィスパー/制限
    ├── BattleRoom.test.ts       │  12件  ターン制戦闘・不正行為拒否
    ├── TradeRoom.test.ts        │  5件   出品・購入・キャンセル
    ├── Scaling.test.ts          │  4件   Redis 2サーバー間連携
    ├── KaedevnAuth.test.ts      │  7件   JWT 検証
    ├── InlineTags.test.ts       │  8件   テキストパーサー
    ├── CharacterCreator.test.ts │  4件   キャラ作成
    ├── LevelSystem.test.ts      │  4件   レベルアップ
    ├── EncounterManager.test.ts │  8件   エンカウント・ドロップ
    ├── ItemManager.test.ts      │  7件   アイテム使用・死亡ペナルティ
    ├── ShopEquipment.test.ts    │  9件   ショップ・装備
    ├── QuestManager.test.ts     │  5件   クエスト受注・進捗・完了
    ├── PartyBoss.test.ts        │  7件   パーティ・ボス
    │
    └── logs/                    │  テスト実行ごとの JSON ログ
        └── {timestamp}_{name}/
            ├── log.json         │  全エントリ（構造化）
            ├── {player}.json    │  プレイヤー別
            └── summary.log     │  人間用テキスト
```

---

## Colyseus との境界線

### 何が Colyseus で、何が mmo のコードか

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ██████ Colyseus フレームワーク（変更しない）                    │
│  ░░░░░░ mmo/ のコード（自分たちが書いた）                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Client                                              │    │
│  │  ██ @colyseus/sdk  → Client, Room (SDK)             │    │
│  │  ░░ client-cli.ts  → 画面描画, 入力, ログ出力         │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │ WebSocket (██ Colyseus transport) │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │ Server                                              │    │
│  │  ██ Server, matchMaker, LocalPresence, LocalDriver  │    │
│  │  ██ Room base class (lifecycle: onAuth/onJoin/...)  │    │
│  │  ██ @colyseus/schema (state sync: @type decorator)  │    │
│  │  ░░ createServer.ts  → DI + Room 定義の組み立て       │    │
│  │                                                     │    │
│  │  ░░ WorldRoom.ts   → onMessage ハンドラ 20種         │    │
│  │  ░░ BattleRoom.ts  → ターン制戦闘ロジック             │    │
│  │  ░░ ChatRoom.ts    → チャネル振り分け                │    │
│  │  ░░ TradeRoom.ts   → オファー管理                   │    │
│  │     │                                               │    │
│  │     │ Colyseus に依存しない純粋ロジック ↓              │    │
│  │  ░░ systems/*      → 9個のマネージャークラス          │    │
│  │  ░░ data/*         → マスターデータ定義               │    │
│  │  ░░ persistence/*  → DB インターフェース + InMemory    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Test                                                │    │
│  │  ██ @colyseus/sdk (SDKClient) → Room 結合テスト      │    │
│  │  ██ @colyseus/core (Server, matchMaker) → テスト起動  │    │
│  │  ░░ テストコード, モック, TestLogger                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Colyseus が提供するもの（██ 変更しない）

| 機能 | パッケージ | 用途 |
|------|-----------|------|
| **Server** | `@colyseus/core` | HTTP/WebSocket サーバー起動 |
| **Room** | `@colyseus/core` | Room ライフサイクル（onCreate, onAuth, onJoin, onLeave, onMessage, onDispose） |
| **matchMaker** | `@colyseus/core` | Room のマッチメイキング（joinOrCreate, joinById, query） |
| **Presence** | `@colyseus/core` / `redis-presence` | プロセス間の状態共有（LocalPresence = 単体, RedisPresence = 分散） |
| **Driver** | `@colyseus/core` / `redis-driver` | Room キャッシュ管理（LocalDriver = メモリ, RedisDriver = 分散） |
| **@type() デコレータ** | `@colyseus/schema` | State の自動シリアライズ・クライアント同期 |
| **Client (SDK)** | `@colyseus/sdk` | ブラウザ/Node.js からの WebSocket 接続 |
| **Transport** | `@colyseus/ws-transport` | WebSocket プロトコル層 |

**mmo コードから Colyseus API を呼ぶ箇所:**

| 呼び出し元 | Colyseus API | 用途 |
|-----------|-------------|------|
| `createServer.ts` | `new Server()`, `server.define()`, `matchMaker.setup()` | サーバー組み立て |
| Room クラス | `extends Room<State>` | Room のベースクラス |
| Room クラス | `this.setState()`, `this.broadcast()`, `client.send()` | 状態管理 + メッセージ送信 |
| Room クラス | `this.onMessage("type", handler)` | メッセージ受信ハンドラ登録 |
| Schema クラス | `@type("string")`, `MapSchema` | 状態スキーマ定義 |
| テスト | `new SDKClient()`, `client.joinOrCreate()`, `room.send()` | クライアント接続 |

### mmo が提供するもの（░░ 自分たちのコード）

| レイヤー | Colyseus 依存 | 説明 |
|---------|:------------:|------|
| **Room ハンドラ** | ✅ | `extends Room` + `onMessage` で Colyseus に密結合 |
| **Schema** | ✅ | `@type()` デコレータで Colyseus に密結合 |
| **Systems** | ❌ | **Colyseus を一切 import しない**。純粋な TypeScript クラス |
| **Data** | ❌ | 静的データ定義。依存なし |
| **Persistence** | ❌ | `IPlayerPersistence` インターフェース。依存なし |
| **Auth** | ❌ | JWT ライブラリのみ。Colyseus 非依存 |
| **TestLogger** | ❌ | JSON ログ出力。依存なし |

### 境界のルール

```
                    Colyseus 依存
                    ┌──────────┐
  Room (4ファイル)    │ ✅ 依存   │  ← Colyseus の Room/Client/Schema を使う
  Schema (3ファイル)  │ ✅ 依存   │  ← @type() デコレータを使う
  createServer.ts   │ ✅ 依存   │  ← Server/matchMaker を使う
                    └──────────┘
                        │
                   onMessage ハンドラが呼ぶ
                        │
                        ▼
                    Colyseus 非依存
                    ┌──────────┐
  Systems (9ファイル) │ ❌ 非依存  │  ← import に "colyseus" が一切ない
  Data (9ファイル)    │ ❌ 非依存  │
  Persistence       │ ❌ 非依存  │
  Auth              │ ❌ 非依存  │
                    └──────────┘
```

**この境界の意味:**
- **Systems 以下を Colyseus なしでテストできる** — CharacterCreator, LevelSystem, ShopManager 等は Mocha で直接呼ぶだけ。Server 起動不要
- **Colyseus を別のフレームワークに差し替えても Systems/Data/Persistence はそのまま使える**
- **Room は薄いアダプター** — メッセージを受け取って System に渡し、結果をクライアントに返すだけ

### ファイル別の Colyseus import 有無

| ファイル | `colyseus` import | `@colyseus/schema` import | `@colyseus/core` import |
|---------|:-:|:-:|:-:|
| WorldRoom.ts | `Room` | — | `Client` (type) |
| BattleRoom.ts | `Room` | — | `Client` (type) |
| ChatRoom.ts | `Room` | `Schema, type, MapSchema` | `Client` (type) |
| TradeRoom.ts | `Room` | `Schema, type, MapSchema` | `Client` (type) |
| WorldState.ts | — | `Schema, type, MapSchema` | — |
| PlayerState.ts | — | `Schema, type` | — |
| BattleState.ts | — | `Schema, type, MapSchema` | — |
| createServer.ts | — | — | `Server, matchMaker, ...` |
| **CharacterCreator.ts** | — | — | — |
| **LevelSystem.ts** | — | — | — |
| **EncounterManager.ts** | — | — | — |
| **ItemManager.ts** | — | — | — |
| **DeathManager.ts** | — | — | — |
| **ShopManager.ts** | — | — | — |
| **EquipmentManager.ts** | — | — | — |
| **QuestManager.ts** | — | — | — |
| **PartyManager.ts** | — | — | — |
| **全 data/*.ts** | — | — | — |
| **PlayerPersistence.ts** | — | — | — |
| **KaedevnAuthAdapter.ts** | — | — | — |

**太字 = Colyseus 非依存（19ファイル / 28ファイル中 = 68%）**

---

## レイヤー構成

```
┌──────────────────────────────────────────────────────┐
│  Client Layer                                        │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │ CLI Client   │  │ Browser (TBD)│                  │
│  │ client-cli.ts│  │              │                  │
│  └──────┬───────┘  └──────┬───────┘                  │
│         │ WebSocket       │ WebSocket                │
└─────────┼─────────────────┼──────────────────────────┘
          │                 │
┌─────────┼─────────────────┼──────────────────────────┐
│  Server Layer (createServer.ts)                      │
│         │                 │                          │
│  ┌──────▼─────────────────▼──────┐                   │
│  │  Colyseus Server              │                   │
│  │  ┌──────────┐ ┌───────────┐   │                   │
│  │  │WorldRoom │ │BattleRoom │   │                   │
│  │  │ (ゾーン)  │ │ (戦闘)    │   │                   │
│  │  └────┬─────┘ └─────┬─────┘   │                   │
│  │  ┌────┴─────┐ ┌─────┴─────┐   │                   │
│  │  │ChatRoom  │ │TradeRoom  │   │                   │
│  │  │ (チャット)│ │ (取引)    │   │                   │
│  │  └──────────┘ └───────────┘   │                   │
│  └───────────────┬───────────────┘                   │
│                  │                                   │
│  ┌───────────────▼───────────────┐                   │
│  │  Systems Layer (ビジネスロジック) │                  │
│  │  Character │ Level  │ Encounter│                  │
│  │  Item      │ Death  │ Shop    │                  │
│  │  Equipment │ Quest  │ Party   │                  │
│  └───────────────┬───────────────┘                   │
│                  │                                   │
│  ┌───────────────▼───────────────┐                   │
│  │  Data Layer (マスターデータ)     │                  │
│  │  zones │ encounters │ items   │                  │
│  │  quests│ bosses │ equipment  │                  │
│  │  classes│ levelTable│ shops   │                  │
│  └───────────────┬───────────────┘                   │
│                  │                                   │
│  ┌───────────────▼───────────────┐                   │
│  │  Persistence Layer            │                  │
│  │  IPlayerPersistence           │                  │
│  │  └─ InMemoryPlayerDB (開発)   │                  │
│  │  └─ PrismaPlayerDB (本番予定) │                  │
│  └───────────────────────────────┘                   │
└──────────────────────────────────────────────────────┘
```

---

## メッセージフロー

### クライアント → サーバー → レスポンス

```
Client                    WorldRoom                     Systems
  │                          │                            │
  │─── create_character ────►│──► CharacterCreator.create()│
  │◄── character_created ────│◄──────────────────────────│
  │                          │                            │
  │─── shop_buy ────────────►│──► ShopManager.buy()       │
  │◄── shop_bought ─────────│◄──────────────────────────│
  │                          │                            │
  │─── equip ───────────────►│──► EquipmentManager.equip()│
  │◄── equipped ────────────│◄──────────────────────────│
  │                          │                            │
  │─── explore ─────────────►│──► EncounterManager.explore()
  │◄── encounter ───────────│◄──────────────────────────│
  │                          │                            │
  │                     BattleRoom                        │
  │─── action(attack) ─────►│──► executeAttack()          │
  │◄── action_result ───────│                            │
  │                          │──► checkBattleEnd()        │
  │                          │    ├─ LevelSystem.addExp() │
  │                          │    ├─ EncounterManager.rollDrops()
  │                          │    ├─ QuestManager.onEnemyDefeated()
  │                          │    └─ PlayerPersistence.save()
  │◄── battle_result ───────│◄──────────────────────────│
```

---

## Room 定義

### WorldRoom（ゾーン管理）

| メッセージ | 方向 | 説明 |
|-----------|------|------|
| `create_character` | → | キャラ作成（名前・職業・性別） |
| `character_created` | ← | 作成結果（全ステータス） |
| `need_character_creation` | ← | 未作成通知（onJoin 時） |
| `welcome` | ← | 作成済みユーザーへの歓迎 |
| `move` | → | ゾーン移動（方向） |
| `zone_change` | ← | 移動先ゾーンID |
| `interact` | → | NPC 対話（targetId） |
| `npc_dialogue` | ← | NPC 台詞（インラインタグ付き） |
| `explore` | → | 探索（エンカウント判定） |
| `encounter` | ← | 結果: battle / item / nothing |
| `shop_list` | → | 商品一覧取得 |
| `shop_items` | ← | 商品リスト |
| `shop_buy` | → | 購入 |
| `shop_bought` | ← | 購入結果（残Gold） |
| `shop_sell` | → | 売却 |
| `shop_sold` | ← | 売却結果（残Gold） |
| `equip` | → | 装備（itemId） |
| `equipped` | ← | 装備結果（実効ステータス） |
| `unequip` | → | 装備解除（slot） |
| `unequipped` | ← | 解除結果 |
| `use_item` | → | アイテム使用 |
| `item_used` | ← | 使用結果（HP/MP） |
| `quest_accept` | → | クエスト受注 |
| `quest_accepted` | ← | 受注結果 |
| `quest_report` | → | クエスト完了報告 |
| `quest_completed` | ← | 報酬情報 |
| `quest_log` | → | 進行中クエスト一覧 |
| `quest_log` | ← | クエストログ |
| `status` | → | ステータス要求 |
| `player_status` | ← | 全ステータス情報 |
| `inventory` | → | インベントリ要求 |
| `player_inventory` | ← | 所持品一覧 |
| `expression` | → | 表情変更（他プレイヤーに同期） |
| `pose` | → | ポーズ変更（他プレイヤーに同期） |
| `error` | ← | エラー（code + message） |

### BattleRoom（戦闘）

| メッセージ | 方向 | 説明 |
|-----------|------|------|
| `phase_change` | ← | ターン開始（selecting / executing） |
| `action` | → | 行動選択（attack / defend / item / flee） |
| `action_result` | ← | 行動結果（ダメージ / 回復 / 防御） |
| `battle_result` | ← | 勝敗結果（EXP / Gold / ドロップ / Lv UP） |
| `error` | ← | 不正行為拒否 |

### ChatRoom

| メッセージ | 方向 | 説明 |
|-----------|------|------|
| `chat` | → | 送信（text / channel / targetId） |
| `chat_message` | ← | 受信（sender / text / channel） |
| `error` | ← | 制限（空 / 長文 / レート / 不在ターゲット） |

### TradeRoom

| メッセージ | 方向 | 説明 |
|-----------|------|------|
| `offer` | → | 出品（itemId / quantity / price） |
| `trade_offer` | ← | 出品通知（全員） |
| `accept` | → | 購入（offerId） |
| `trade_complete` | ← | 取引成立（全員） |
| `cancel` | → | キャンセル |
| `trade_cancelled` | ← | キャンセル通知 |
| `error` | ← | エラー |

---

## DI（依存性注入）パターン

```typescript
// createServer.ts で一括設定
WorldRoom.authAdapterInstance = authAdapter;   // Static DI
WorldRoom.playerDBInstance = playerDB;
BattleRoom.authAdapterInstance = authAdapter;
BattleRoom.playerDBInstance = playerDB;
// ...

// Room 内で参照
onCreate() {
  this.authAdapter = WorldRoom.authAdapterInstance;
  this.playerDB = WorldRoom.playerDBInstance;
  this.charCreator = new CharacterCreator(this.playerDB);  // Systems は Room が生成
}
```

**理由:** Colyseus の `Room.onCreate()` は引数でクラスインスタンスを受け取れない（クライアントオプションは JSON シリアライズされるため）。Static プロパティで注入する。

---

## データモデル

### PlayerData（永続化）

```typescript
interface PlayerData {
  userId: string;
  name: string;
  gender: "female" | "male";
  classType: "warrior" | "mage" | "thief";
  isCreated: boolean;
  zoneId: string;
  x: number; y: number;
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  atk: number; def: number; mag: number; spd: number;
  level: number; exp: number; gold: number;
  equipment: { weapon: string | null; armor: string | null; accessory: string | null };
  inventory: InventoryItem[];
  questProgress: Record<string, QuestState>;
  lastLogin: number;
}
```

### PlayerState（リアルタイム同期 — @colyseus/schema）

```typescript
class PlayerState extends Schema {
  @type("string") sessionId, userId, name, gender, preset, expression, pose, lipMode, status;
  @type("number") x, y, hp, maxHp, mp, level;
}
```

**使い分け:**
- `PlayerData` — DB に保存。全フィールド含む。Room 内部で `playerDB.findByUserId()` / `save()` で操作
- `PlayerState` — WebSocket 経由で全クライアントに自動同期。表示に必要な最低限のフィールドのみ

---

## テスト構成

### テスト分類

| カテゴリ | テスト数 | ファイル | 方式 |
|---------|---------|---------|------|
| Room 単体 | 42 | WorldRoom, ChatRoom, BattleRoom, TradeRoom | SDKClient → Room |
| システム単体 | 37 | CharacterCreator, LevelSystem, Encounter, Item, Death, Shop, Equip, Quest, Party, Boss | 関数直接呼び出し |
| 統合テスト | 19 | KaedevnAuth, InlineTags, Scaling(Redis) | 混合 |
| E2E プレイスルー | 8 | PlaythroughE2E, FullPlaythrough | SDKClient + 直接 |
| **結合 E2E** | **1** | **IntegrationE2E** | **全 Room メッセージ経由** |
| **ログ検証** | 7 | IntegrationE2E 内 | JSON ログの action 検索 |
| **合計** | **114** | | |

### IntegrationE2E の検証範囲

```
1. Login & Create     ← WorldRoom: need_character_creation, create_character
2. NPC Dialogue       ← WorldRoom: interact → npc_dialogue
3. Shop               ← WorldRoom: shop_list, shop_buy, shop_sell + エラー
4. Equipment          ← WorldRoom: equip, unequip + ステータスボーナス検証
5. Quest              ← WorldRoom: quest_accept + 二重受注拒否
6. Movement           ← WorldRoom: move → zone_change + 行き止まり
7. Explore            ← WorldRoom: explore → encounter (forest)
8. Battle             ← BattleRoom: action → battle_result + LvUP + ドロップ + クエスト進捗 + DB検証
9. Item Usage         ← WorldRoom: use_item + 未所持拒否
10. Battle Item       ← BattleRoom: action(item) + flee
11. Death             ← BattleRoom: 全滅 → DB ペナルティ検証
12. Status/Inventory  ← WorldRoom: status, inventory
13. Quest Log         ← WorldRoom: quest_log + 未完了報告拒否
14. Chat              ← ChatRoom: 2人でグローバルチャット送受信
```

### ログ出力

```json
{
  "testName": "integration-full",
  "startedAt": "2026-03-28T08:20:19.000Z",
  "durationMs": 2167,
  "players": ["アキラ", "ミサキ"],
  "entries": [
    {
      "t": 47,
      "type": "player",
      "player": "アキラ",
      "action": "create",
      "detail": { "classType": "warrior", "hp": 120, "atk": 15 },
      "text": "戦士作成 HP:120 ATK:15"
    }
  ]
}
```

---

## 起動方法

```bash
# サーバー（リポジトリルートから）
npx tsx mmo/server.ts

# CLI クライアント（別ターミナル）
npx tsx mmo/client-cli.ts

# テスト実行
cd mmo && npx mocha 'test/**/*.test.ts' --exit --timeout 30000

# 特定テストのみ
npx mocha 'test/IntegrationE2E.test.ts' --exit --timeout 30000
```

---

## 関連ドキュメント

| # | 文書 | 内容 |
|---|------|------|
| 20 | mmo-zone-map-design.md | 12ゾーンマップ設計（隣接関係図・NPC配置） |
| 21 | mmo-implementation-plan.md | 初期実装計画（Step 0〜7）→ 完了 |
| 22 | text-mmo-client-design.md | ブラウザクライアント設計（画面・UI） |
| 23 | text-mmo-gameplay-systems.md | ゲームシステム全体設計（7段階） |
| 24 | text-mmo-master-plan.md | マスター実装計画（Phase A/B） |
| **25** | **mmo-architecture-reference.md** | **本文書（構造リファレンス）** |

---

## メタ情報

| 項目 | 値 |
|------|-----|
| 生成モデル | Claude Opus 4.6 |
| 生成日 | 2026-03-28 |
| リポジトリ | colyseus (mmo/) |
| テスト | 114 passing |
| ソースコード | 2,769行 |
| テストコード | 4,188行 |
| コミット数 | 20 |

> この文書は AI によって生成されました。内容の正確性はソースコードとの照合で確認してください。
