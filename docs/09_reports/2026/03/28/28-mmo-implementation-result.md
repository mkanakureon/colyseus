---
title: テキスト型MMO 実装結果レポート
type: report
project: colyseus mmo
date: 2026-03-28
author: Claude Opus 4.6
---

# テキスト型MMO 実装結果レポート

> **期間:** 2026-03-28（1日）
> **テスト:** 259 passing
> **コード:** 21,052行 / 78ファイル
> **コミット:** 40+

---

## 成果サマリー

| 項目 | 数値 |
|------|------|
| テスト | 259 passing |
| ソースファイル | 31 (src/) |
| テストファイル | 26 (test/) |
| CLI ツール | 4 (scripts/) |
| ブラウザクライアント | 5 (client/) |
| ゲームデータ JSON | 12 (games/fantasy-rpg/) |
| 総コード行数 | 21,052行 |
| Colyseus Room | 4 (World/Battle/Chat/Trade) |
| ゲームシステム | 10 (Systems) |
| NPC | 7 |
| ゾーン | 12 (7 danger / 5 safe) |
| クエスト | 7 |
| 敵 | 6 + ボス3 |
| アイテム | 5 + 装備8 |
| ショップ | 3 |

---

## アーキテクチャ

### レイヤー構成

```
Client (browser + CLI)
  ↕ WebSocket
Colyseus Server (createServer.ts)
  → Room (4種: WorldRoom / BattleRoom / ChatRoom / TradeRoom)
    → Systems (10種: Colyseus 非依存の純粋ロジック)
      → GameData (JSON から読み込み)
        → Persistence (IPlayerPersistence)
```

### Colyseus 境界

| レイヤー | Colyseus 依存 | ファイル数 |
|---------|:---:|:---:|
| Room | ✅ | 4 |
| Schema | ✅ | 3 |
| createServer | ✅ | 1 |
| **Systems** | **❌** | **10** |
| **Data/GameData** | **❌** | **10** |
| **Persistence** | **❌** | **1** |
| **Auth** | **❌** | **1** |

68% のファイルが Colyseus 非依存。

### データ駆動設計

```
games/fantasy-rpg/     ← JSON 差し替えで別ゲーム
├── game.json          ゲーム設定
├── classes.json       職業（戦士/魔法使い/盗賊）
├── levels.json        EXP テーブル
├── zones.json         12ゾーン + NPC（shop/quest参照付き）
├── enemies.json       6種の敵
├── encounters.json    7ゾーンのエンカウント
├── items.json         5アイテム
├── equipment.json     8装備
├── shops.json         3ショップ
├── quests.json        7クエスト
├── bosses.json        3ボス
└── npc-conversations.json  NPC会話プール
```

Systems は GameData を constructor で受け取る。`data/*.ts` への直接 import はゼロ。

---

## ゲームシステム一覧

| システム | 機能 | Room 接続 |
|---------|------|:---:|
| CharacterCreator | キャラ作成（3職業） | WorldRoom |
| LevelSystem | EXP → Lv UP → ステータス上昇 | BattleRoom |
| EncounterManager | ランダムエンカウント + ドロップ | WorldRoom + BattleRoom |
| ItemManager | アイテム使用（HP/MP回復） | WorldRoom + BattleRoom |
| DeathManager | 死亡ペナルティ（Gold -10%、村リスポーン） | BattleRoom |
| ShopManager | NPC ショップ売買 | WorldRoom |
| EquipmentManager | 装備着脱 + ステータスボーナス | WorldRoom |
| QuestManager | 受注 → 自動進捗 → 完了報告 | WorldRoom + BattleRoom |
| PartyManager | パーティ招待/承諾/解散 | (未接続) |
| NPCConversationManager | 会話プール（special→contextual→daily） | WorldRoom |

---

## NPC 会話プールシステム

仕様書 `docs/01_in_specs/npc-agent-spec.md` ベース。

```
話しかける
  → ① Special（初回会話、once=true）
  → ② Contextual（関係値・クエスト進捗で条件マッチ）
  → ③ Daily（未再生優先 → ランダム）
  → 会話ノード再生（選択肢分岐対応）
  → NPCMemory 更新（関係値+5、再生済みID記録）
```

**条件:**
- `relationMin/Max`: 関係値範囲
- `questFlags`: 完了クエスト
- `questActive`: 進行中クエスト
- `once`: 一度のみ

---

## ブラウザクライアント

### ゲーム画面 (http://localhost:3000)

```
┌──────────────────────────────────────────┐
│ Header: プレイヤー名 | HP/MP | ゾーン名   │
├─────────────────┬────────────────────────┤
│ Left Panel      │ Right Panel            │
│ メインテキスト   │ NPC/プレイヤー一覧      │
│                 │ 方角/ステータス         │
├─────────────────┴────────────────────────┤
│ Footer: [1] 移動 [2] NPC [3] 探索 ...    │
└──────────────────────────────────────────┘
```

- 横画面、2パネル、ダークテーマ
- テキストのみ、ビルド不要（HTML + CSS + vanilla JS）
- PC: キーボード操作 / スマホ: タップ

### グラフ画面 (http://localhost:3000/graph.html)

- **Cytoscape.js** によるインタラクティブグラフ
- ゾーン = 地理配置、NPC = ゾーン周辺、クエスト = ダイヤ、ボス = 星
- クリックで詳細表示:
  - NPC: 会話プール条件、ショップ品、クエストフロー（受注→目標→報告）
  - ゾーン: NPC一覧、敵一覧、接続
  - クエスト: 目標、報酬、受注可能NPC
  - ボス: ステータス、特殊攻撃、ドロップ

---

## CLI ツール

```bash
# サーバー起動
npx tsx mmo/server.ts

# CLI クライアント
npx tsx mmo/client-cli.ts

# ゲームデータ編集（対話式）
npx tsx mmo/scripts/game-editor.ts --game mmo/games/fantasy-rpg

# バリデーション
npx tsx mmo/scripts/validate-game-data.ts --game mmo/games/fantasy-rpg

# ゲームグラフ（テキスト版）
npx tsx mmo/scripts/game-graph.ts --game mmo/games/fantasy-rpg

# TS → JSON エクスポート
npx tsx mmo/scripts/export-game-data.ts --out mmo/games/fantasy-rpg
```

---

## テスト構成（259件）

### カテゴリ別

| カテゴリ | テスト数 | 方式 |
|---------|:---:|------|
| Room 単体 (World/Battle/Chat/Trade) | 42 | SDKClient → Room |
| システム単体 (CharacterCreator 等) | 37 | 関数直接 |
| 統合テスト (Auth/InlineTags/Scaling) | 19 | 混合 |
| E2E プレイスルー | 8 | SDKClient |
| 結合 E2E (全 Room メッセージ) | 1 (+20 assertions) | SDKClient |
| NPC 会話パターン | 14 | SDKClient |
| GameData ローダー | 12 | JSON読み込み |
| NPC 対話パターン (H/I) | 7 | SDKClient + zone_info |
| ブラウザフロー (BF) | 16 | SDKClient (ブラウザ同条件) |
| **ゲームデータ整合性 (自動生成)** | **95+** | **JSON のみ** |
| ログ検証 | 7 | JSON ログ |

### 自動生成テスト（JSON から）

12ゾーン × 7NPC を自動巡回:
- ゾーン: 説明あり、隣接有効、危険ゾーンにエンカウント
- NPC: セリフあり、インラインタグ、shop/quest 参照有効、セリフ↔機能整合性
- 会話プール: 全ノード検証

### Graph Health テスト

| テスト | 検出する問題 |
|--------|------------|
| NPC は最低1つの役割 | 空 NPC |
| 危険ゾーンにエンカウント | 空ダンジョン |
| クエスト目標がエンカウントに存在 | 倒せない敵の討伐クエスト |
| 全クエストが NPC 経由で受注可能 | 紐付け忘れ |
| 全ゾーン到達可能（BFS） | 孤立ゾーン |
| ボスは危険ゾーン | 安全地帯のボス |
| 経済バランス | 買えないアイテム |

---

## ゲームワールド

### ゾーンマップ

```
                    古代神殿(12) ← 古代の賢者
                        │
    氷結洞窟(11) ── 竜の峠(10) ── 火山地帯(9)
                        │
    地下水路(8) ── 港町カイル(7) ── 海岸洞窟(6)
                    船長バルド │
                        │
    霧の森(2) ── 王都セレス(4) ── 交易広場(3)
    ゴブリン等    ガルド/エリカ    ロイド
        │               │
    古代遺跡(5)    はじまりの村(1)
    スケルトン等    ヨハン/マリア
```

### クエストフロー

```
Q-001 森の脅威      ヨハン → ゴブリン3体 @ 霧の森 → 30EXP 50G
Q-002 薬草集め      マリア → 薬草5個 → 20EXP 30G
Q-003 遺跡調査      ヨハン → 古代遺跡訪問 → 50EXP 100G
Q-004 商人護衛      ロイド → 大コウモリ5体 @ 霧の森 → 40EXP 80G + 鉄の剣
Q-005 鉄鉱石調達    ロイド → 鉄鉱石3個 → 60EXP 150G
Q-006 航路の安全    バルド → スケルトン5体 @ 海岸洞窟 → 80EXP 200G + 上級回復薬x3
Q-007 古代の試練    賢者 → ゴーレム3体 + 神殿訪問 → 200EXP 500G + 銀の盾

全クエストはギルド受付嬢エリカ（王都）からも受注可能。
```

### ボス

```
オークキング        HP:200 @ 霧の森    特殊: 大振り(25dmg/3turn)
ゴーレムガーディアン HP:350 @ 古代遺跡  特殊: 地震(15dmg AOE/2turn)
火竜ヴォルカン      HP:500 @ 火山地帯   特殊: 火炎ブレス(30dmg AOE/3turn)
```

---

## バリデーションシステム

### validateGameData（サーバー起動なし）

```
チェック項目:
✓ startZone / respawnZone が zones に存在
✓ encounters の enemyId が enemies に存在
✓ shops の itemId が items/equipment に存在
✓ quests の targetId が enemies/items/zones に存在
✓ zone 隣接が双方向
✓ NPC のセリフが shop/quest の有無と整合
✓ NPC の shop/quest 参照先が存在
✓ NPC に dialogue がある
✓ 会話プールのノードが空でない
```

### キーワード整合性

```
セリフに「店/商/買/売/いらっしゃい」→ shop 参照必須
セリフに「クエスト/依頼/頼み/退治/ボード」→ quest 参照必須
```

---

## 実装の経緯

| フェーズ | テスト数 | 内容 |
|---------|:---:|------|
| A-1~A-2 | 74 | キャラ作成 + レベルアップ |
| A-3~A-4 | 89 | エンカウント + アイテム + 死亡 |
| A-5 | 98 | ショップ + 装備 |
| A-6 | 103 | クエスト |
| A-7 | 110 | パーティ + ボス |
| A-8 | 114 | 12ゾーン + 通しプレイ |
| Room 接続 | 114 | 全システムを Room メッセージ経由に |
| GameData 分離 | 126 | JSON 駆動 + バリデーション |
| NPC 会話プール | 140 | 記憶ベース選択 + 条件分岐 |
| ブラウザクライアント | 150 | 横2パネル + ダークテーマ |
| ブラウザ修正 | 166 | zone_info + NPC 整合性 |
| 自動テスト | 243 | JSON から全パターン生成 |
| ワールド拡張 | 251 | 新クエスト + 危険ゾーン |
| Graph Health | 259 | 全体の健全性テスト |

---

## 関連ドキュメント

| # | 文書 |
|---|------|
| 20 | ゾーンマップ設計 |
| 21 | 初期実装計画（完了） |
| 22 | ブラウザクライアント UI 設計 |
| 23 | ゲームプレイシステム全体設計 |
| 24 | マスター実装計画 |
| 25 | アーキテクチャリファレンス |
| 26 | データ駆動ゲーム設計 |
| 27 | ブラウザクライアント UI 設計（横2パネル） |
| **28** | **本文書（実装結果レポート）** |

---

## メタ情報

| 項目 | 値 |
|------|-----|
| 生成モデル | Claude Opus 4.6 |
| 生成日 | 2026-03-28 |
| リポジトリ | colyseus (mmo/) |
| テスト | 259 passing |
| コード行数 | 21,052行 |
| ファイル数 | 78 |
| コミット数 | 40+ |

> この文書は AI によって生成されました。
