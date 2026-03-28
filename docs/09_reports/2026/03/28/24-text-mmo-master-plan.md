---
title: テキスト型MMO マスター実装計画書
type: plan
project: colyseus mmo
version: 1.0.0
date: 2026-03-28
author: Claude Opus 4.6
---

# テキスト型MMO マスター実装計画書

> **スコープ:** colyseus リポジトリ単体で、テキストだけのMMOを完成させる
> **方針:** TDD（テスト先行）、段階ごとにテスト全通過を確認してからコミット
> **kaedevn 統合:** 後回し。このリポジトリで完結する

---

## 前提文書

| # | 文書 | 内容 |
|---|------|------|
| 21 | mmo-implementation-plan.md | 初期実装計画（Step 0〜7）→ **完了済み** |
| 22 | text-mmo-client-design.md | ブラウザクライアント設計（画面・UI・入力方式） |
| 23 | text-mmo-gameplay-systems.md | ゲームシステム全体設計（7段階） |

---

## 完了済み（66テスト）

| コミット | 内容 |
|---------|------|
| 22cce32 | mmo/ 初期実装 — Schema, Auth, Persistence, WorldRoom |
| 008a224 | tsconfig 修正（useDefineForClassFields: false） |
| 50949e0 | ChatRoom・BattleRoom・TradeRoom + WorldRoom 補完（42件） |
| f3fe875 | 統合テスト — 認証・インラインタグ・Redis スケーリング（61件） |
| c68bd48 | E2E プレイスルーテスト（66件） |

---

## フェーズ構成

```
フェーズ A: ゲームシステム（サーバー）  ← テスト駆動、ブラウザ不要
フェーズ B: テキストクライアント（ブラウザ） ← フェーズ A 完了後
```

---

# フェーズ A: ゲームシステム

すべてサーバーサイド。Mocha テストで検証。ブラウザ不要。

---

## A-1: キャラ作成

**ゴール:** 名前と職業を選んでキャラクターを作れる

### 作成ファイル

```
mmo/src/
├── data/
│   └── classes.ts              ← 職業定義（戦士/魔法使い/盗賊）
├── systems/
│   └── CharacterCreator.ts     ← キャラ作成ロジック
mmo/test/
└── CharacterCreator.test.ts
```

### 職業データ

```typescript
export const CLASS_DEFS = {
  warrior: { name: "戦士", hp: 120, mp: 20, atk: 15, def: 12, mag: 3, spd: 8 },
  mage:    { name: "魔法使い", hp: 80, mp: 60, atk: 5, def: 5, mag: 15, spd: 10 },
  thief:   { name: "盗賊", hp: 90, mp: 30, atk: 10, def: 7, mag: 5, spd: 15 },
};
```

### WorldRoom 変更

```typescript
// 新メッセージ
this.onMessage("create_character", (client, data) => ...);
// → 名前・職業を受け取り、PlayerPersistence に保存
// → "character_created" を返す

// onJoin で未作成なら "need_character_creation" を送信
```

### PlayerData 拡張

```typescript
// PlayerPersistence.ts に追加
interface PlayerData {
  // 既存フィールド...
  classType: "warrior" | "mage" | "thief";
  atk: number;
  def: number;
  mag: number;
  spd: number;
  exp: number;        // 既存（使用開始）
  maxMp: number;      // 新規
  isCreated: boolean;  // 新規: キャラ作成済みフラグ
}
```

### テスト（4件）

| ID | 内容 |
|----|------|
| CC-01 | 戦士でキャラ作成 → 初期ステータス確認（HP:120, ATK:15） |
| CC-02 | 魔法使いでキャラ作成 → MP が高い（MP:60） |
| CC-03 | 作成済みユーザーは "need_character_creation" が来ない |
| CC-04 | 名前が空文字 → エラー |

### 完了条件

- [ ] 70 テスト全通過（66 + 4）
- [ ] キャラ作成 → DB に保存 → 再ログインで復元

---

## A-2: レベルアップ

**ゴール:** 戦って経験値を貯めるとレベルが上がる

### 作成ファイル

```
mmo/src/
├── data/
│   └── levelTable.ts           ← Lv ごとの必要 EXP
├── systems/
│   └── LevelSystem.ts          ← EXP 加算・Lv UP 判定・ステータス上昇
mmo/test/
└── LevelSystem.test.ts
```

### BattleRoom 変更

```typescript
// 勝利時に "battle_result" の内容を拡張
{
  result: "win",
  expGained: 10,
  goldGained: 5,
  levelUp?: {               // ★ 新規
    newLevel: 4,
    statChanges: { hp: +12, atk: +3, def: +2, ... }
  }
}
```

### テスト（4件）

| ID | 内容 |
|----|------|
| LV-01 | EXP 加算でレベルアップ発生 |
| LV-02 | 戦士の Lv UP → HP+12, ATK+3 |
| LV-03 | EXP が閾値未満 → レベルアップしない |
| LV-04 | 大量 EXP → 2段階レベルアップ |

### 完了条件

- [ ] 74 テスト全通過（70 + 4）

---

## A-3: エンカウント + ドロップ

**ゴール:** フィールドで探索するとモンスターに遭い、倒すとアイテムが手に入る

### 作成ファイル

```
mmo/src/
├── data/
│   ├── encounters.ts           ← ゾーン別エンカウントテーブル
│   └── drops.ts                ← 敵別ドロップテーブル
├── systems/
│   ├── EncounterManager.ts     ← エンカウント判定
│   └── DropManager.ts          ← ドロップ判定
mmo/test/
├── EncounterManager.test.ts
└── DropManager.test.ts
```

### WorldRoom 変更

```typescript
// 新メッセージ
this.onMessage("explore", (client) => ...);
// → EncounterManager.roll() で判定
// → "encounter_result" を返す
//   { type: "battle", enemy: {...} }  → クライアントは BattleRoom に接続
//   { type: "item", itemId, itemName, quantity }
//   { type: "nothing" }
```

### テスト（8件）

| ID | 内容 |
|----|------|
| ENC-01 | 探索 → エンカウント → 敵情報が返る |
| ENC-02 | 探索 → アイテム発見 → インベントリに追加 |
| ENC-03 | 探索 → 何もなし |
| ENC-04 | 安全地帯（村）→ 探索不可エラー |
| ENC-05 | ゾーンごとに異なるエンカウントテーブル |
| DROP-01 | 勝利 → ドロップ判定実行 |
| DROP-02 | ドロップ品 → インベントリに追加 |
| DROP-03 | ドロップなし（確率外れ） |

### 完了条件

- [ ] 82 テスト全通過（74 + 8）

---

## A-4: アイテム使用 + 死亡リスポーン

**ゴール:** 戦闘中にアイテムで回復でき、全滅したらペナルティがある

### 作成ファイル

```
mmo/src/
├── data/
│   └── items.ts                ← アイテムマスターデータ
├── systems/
│   ├── ItemManager.ts          ← アイテム使用ロジック
│   └── DeathManager.ts         ← 死亡ペナルティ処理
mmo/test/
├── ItemManager.test.ts
└── DeathManager.test.ts
```

### BattleRoom 変更

```typescript
// "action" type: "item" を処理
this.handleItemUse(client, data.itemId);
// → HP 回復、ターン消費
// → "item_used" イベントを broadcast

// 全滅時
// → "battle_result" { result: "lose" } に加えて
// → サーバー側でゴールド 10% 減少、ゾーンリセット
// → "death_penalty" { goldLost, respawnZone } を送信
```

### テスト（7件）

| ID | 内容 |
|----|------|
| ITEM-01 | 戦闘中にアイテム使用 → HP 回復 |
| ITEM-02 | アイテム使用 → ターン消費（敵ターンに進む） |
| ITEM-03 | 所持数 0 → 使用不可エラー |
| ITEM-04 | 戦闘外でアイテム使用（WorldRoom 経由） |
| DEATH-01 | 全滅 → ゴールド 10% 減少 |
| DEATH-02 | 全滅 → ゾーンが村にリセット |
| DEATH-03 | 全滅 → HP/MP 全回復 |

### 完了条件

- [ ] 89 テスト全通過（82 + 7）

---

## A-5: NPC ショップ + 装備

**ゴール:** NPC からアイテム・装備を買い、装備で強くなれる

### 作成ファイル

```
mmo/src/
├── data/
│   ├── shops.ts                ← NPC 別品揃え
│   └── equipment.ts            ← 装備マスター（武器・防具・アクセ）
├── systems/
│   ├── ShopManager.ts          ← 売買ロジック
│   └── EquipmentManager.ts     ← 装備着脱・ステータス計算
mmo/test/
├── ShopManager.test.ts
└── EquipmentManager.test.ts
```

### WorldRoom 変更

```typescript
// 新メッセージ
this.onMessage("shop_list", (client, { npcId }) => ...);
this.onMessage("shop_buy",  (client, { npcId, itemId, quantity }) => ...);
this.onMessage("shop_sell", (client, { itemId, quantity }) => ...);
this.onMessage("equip",     (client, { itemId, slot }) => ...);
this.onMessage("unequip",   (client, { slot }) => ...);
```

### PlayerData 拡張

```typescript
interface PlayerData {
  // 既存...
  equipment: {
    weapon: string | null;    // itemId
    armor: string | null;
    accessory: string | null;
  };
}
```

### テスト（9件）

| ID | 内容 |
|----|------|
| SHOP-01 | 商品一覧取得 |
| SHOP-02 | 購入 → ゴールド減少 + インベントリ追加 |
| SHOP-03 | ゴールド不足 → 購入拒否 |
| SHOP-04 | 売却 → ゴールド増加 + インベントリ削除 |
| SHOP-05 | 存在しない商品 → エラー |
| EQUIP-01 | 装備 → ATK/DEF にボーナス反映 |
| EQUIP-02 | 装備外す → ボーナス解除 |
| EQUIP-03 | 同スロット装備 → 旧装備がインベントリに戻る |
| EQUIP-04 | 戦闘時ダメージ計算に装備反映 |

### 完了条件

- [ ] 98 テスト全通過（89 + 9）

---

## A-6: クエスト

**ゴール:** NPC から仕事を受けて、達成して報酬をもらえる

### 作成ファイル

```
mmo/src/
├── data/
│   └── quests.ts               ← クエスト定義（5件〜）
├── systems/
│   └── QuestManager.ts         ← 受注・進捗追跡・完了判定・報酬付与
mmo/test/
└── QuestManager.test.ts
```

### WorldRoom 変更

```typescript
this.onMessage("quest_list",   (client, { npcId }) => ...);  // 受注可能一覧
this.onMessage("quest_accept", (client, { questId }) => ...); // 受注
this.onMessage("quest_report", (client, { questId }) => ...); // 完了報告
this.onMessage("quest_log",    (client) => ...);              // 進行中一覧
```

### 自動進捗追跡

```typescript
// BattleRoom 勝利時: QuestManager.onEnemyDefeated(userId, enemyId)
// WorldRoom 探索時:  QuestManager.onItemCollected(userId, itemId)
// WorldRoom 移動時:  QuestManager.onZoneVisited(userId, zoneId)
// → 進捗が更新されたら "quest_progress" メッセージ送信
```

### テスト（5件）

| ID | 内容 |
|----|------|
| QUEST-01 | クエスト受注 → ログに追加 |
| QUEST-02 | 討伐目標 → 敵撃破でカウント進行 |
| QUEST-03 | 収集目標 → アイテム取得でカウント進行 |
| QUEST-04 | 完了報告 → 報酬（EXP, ゴールド, アイテム）付与 |
| QUEST-05 | 二重受注 → エラー |

### 完了条件

- [ ] 103 テスト全通過（98 + 5）

---

## A-7: パーティ + ボス戦

**ゴール:** 他プレイヤーと一緒に強敵と戦える

### 作成ファイル

```
mmo/src/
├── data/
│   └── bosses.ts               ← ボスデータ（3体）
├── systems/
│   └── PartyManager.ts         ← 招待・承諾・解散・ゾーン同行
mmo/test/
├── PartyManager.test.ts
└── BossBattle.test.ts
```

### WorldRoom 変更

```typescript
this.onMessage("party_invite",  (client, { targetUserId }) => ...);
this.onMessage("party_respond", (client, { accept: boolean }) => ...);
this.onMessage("party_leave",   (client) => ...);
// パーティリーダーのゾーン移動時、メンバーに "party_zone_change" 送信
```

### BattleRoom 変更

```typescript
// ボスフラグ: isBoss
// isBoss === true → 逃走不可
// ボスの特殊行動パターン（2ターンに1回全体攻撃など）
```

### テスト（7件）

| ID | 内容 |
|----|------|
| PARTY-01 | 招待 → 承諾 → パーティ結成 |
| PARTY-02 | 招待 → 拒否 |
| PARTY-03 | パーティ戦闘 → 全員が BattleRoom に参加 |
| PARTY-04 | パーティ解散 |
| BOSS-01 | ボス戦で逃走不可 |
| BOSS-02 | ボス撃破 → 特殊ドロップ + 大量 EXP |
| BOSS-03 | ボスの特殊攻撃パターン（全体攻撃） |

### 完了条件

- [ ] 110 テスト全通過（103 + 7）

---

## A-8: 12ゾーン完全データ + E2E プレイスルー

**ゴール:** 全ゾーンのデータを投入し、通しプレイテストで確認

### 作成ファイル

```
mmo/src/data/
├── zones-full.ts               ← 12ゾーン完全定義（doc 20 準拠）
├── npcs-full.ts                ← 全NPC 台詞・ショップ・クエスト紐付け
├── encounters-full.ts          ← 全ゾーンのエンカウントテーブル
└── quests-full.ts              ← 全クエスト（10件〜）
mmo/test/
└── FullPlaythrough.test.ts     ← 通しプレイテスト
```

### テスト（4件）

| ID | 内容 |
|----|------|
| FULL-01 | 全12ゾーン移動可能（隣接関係が正しい） |
| FULL-02 | 全 NPC に話しかけられる |
| FULL-03 | キャラ作成 → 探索 → 戦闘 → Lv UP → ショップ → 装備 → ボス の一連フロー |
| FULL-04 | 2人プレイヤーの同時プレイ（パーティ → ボス戦 → 取引） |

### 完了条件

- [ ] 114 テスト全通過（110 + 4）
- [ ] フェーズ A 完了

---

# フェーズ B: テキストクライアント（ブラウザ）

フェーズ A のサーバーに接続するブラウザ UI。

---

## B-1: 基盤

### 作成ファイル

```
mmo/client/
├── index.html
├── style.css                   ← ターミナル風ダークテーマ
└── src/
    ├── main.ts                 ← エントリー（Colyseus 接続）
    ├── ConnectionManager.ts    ← Room 接続管理
    ├── ScreenManager.ts        ← 画面遷移
    ├── TextRenderer.ts         ← インラインタグ → テキスト変換
    ├── InputHandler.ts         ← 数字入力 / テキスト入力
    ├── GameState.ts            ← ローカル状態キャッシュ
    └── ChatLog.ts              ← チャット履歴バッファ
```

### 完了条件

- [ ] ブラウザでサーバーに接続・認証できる
- [ ] 画面遷移の仕組みが動く
- [ ] 数字入力で選択肢を選べる

---

## B-2: ワールド + NPC 対話

```
mmo/client/src/screens/
├── WorldScreen.ts              ← ゾーン描写・人一覧・移動
├── DialogueScreen.ts           ← NPC 台詞（click 分割）
└── CharacterCreateScreen.ts    ← キャラ作成画面
```

### 完了条件

- [ ] ゾーン描写が表示される
- [ ] 数字で方向を選んでゾーン移動
- [ ] NPC に話しかけて台詞表示（インラインタグ解釈）

---

## B-3: 戦闘 + アイテム

```
mmo/client/src/screens/
├── BattleScreen.ts             ← 戦闘ログ・選択肢
├── BattleItemScreen.ts         ← 戦闘中アイテム選択
└── DeathScreen.ts              ← 全滅画面
```

### 完了条件

- [ ] 探索 → エンカウント → 戦闘画面遷移
- [ ] 攻撃/防御/アイテム/逃走 が数字で選べる
- [ ] 勝利 → EXP/Gold/ドロップ表示
- [ ] 全滅 → ペナルティ表示 → 村にリスポーン

---

## B-4: ショップ + 装備 + ステータス

```
mmo/client/src/screens/
├── ShopScreen.ts               ← 買い物
├── EquipmentScreen.ts          ← 装備変更
├── InventoryScreen.ts          ← 所持品一覧
└── StatusScreen.ts             ← ステータス表示
```

### 完了条件

- [ ] ショップで売買できる
- [ ] 装備を変更できる
- [ ] ステータス・インベントリが見られる

---

## B-5: チャット + 取引

```
mmo/client/src/screens/
├── ChatScreen.ts               ← グローバル/ゾーン/ウィスパー
└── TradeScreen.ts              ← マーケット
```

### 完了条件

- [ ] チャットの送受信
- [ ] チャンネル切替
- [ ] 出品・購入・キャンセル

---

## B-6: クエスト + パーティ

```
mmo/client/src/screens/
├── QuestScreen.ts              ← クエスト受注・進捗・報告
├── QuestLogScreen.ts           ← 進行中クエスト一覧
└── PartyScreen.ts              ← 招待・管理
```

### 完了条件

- [ ] クエスト受注 → 進捗表示 → 報告 → 報酬
- [ ] パーティ招待 → 承諾/拒否
- [ ] パーティで戦闘

---

## B-7: サーバー起動スクリプト + デプロイ

```
mmo/
├── server.ts                   ← サーバー起動（全 Room 定義）
├── Dockerfile                  ← コンテナ化
└── client/
    └── dist/                   ← ビルド済みクライアント
```

### 完了条件

- [ ] `npx tsx mmo/server.ts` でサーバー起動
- [ ] ブラウザで `localhost:3001` にアクセスして遊べる
- [ ] 2つのブラウザタブで同時プレイ可能

---

# 全体サマリー

## テスト数推移

| ステップ | 内容 | テスト数 | 累計 |
|---------|------|---------|------|
| 完了済み | Room 実装 + 統合 + E2E | 66 | 66 |
| A-1 | キャラ作成 | 4 | 70 |
| A-2 | レベルアップ | 4 | 74 |
| A-3 | エンカウント + ドロップ | 8 | 82 |
| A-4 | アイテム使用 + 死亡 | 7 | 89 |
| A-5 | ショップ + 装備 | 9 | 98 |
| A-6 | クエスト | 5 | 103 |
| A-7 | パーティ + ボス戦 | 7 | 110 |
| A-8 | 12ゾーン + 通しプレイ | 4 | 114 |
| B-1〜7 | ブラウザクライアント | — | — |
| **合計** | | **114** | |

## 依存関係図

```
A-1 キャラ作成
 ↓
A-2 レベルアップ ──→ A-3 エンカウント+ドロップ
                      ↓
                    A-4 アイテム使用+死亡
                      ↓
                    A-5 ショップ+装備
                      ↓
                    A-6 クエスト
                      ↓
                    A-7 パーティ+ボス戦
                      ↓
                    A-8 12ゾーン+通しプレイ
                      ↓
                    ═══════════════════
                    B-1 クライアント基盤
                      ↓
                    B-2 ワールド+NPC
                      ↓
              ┌───────┤
              ↓       ↓
            B-3     B-5
          戦闘+AI  チャット+取引
              ↓       ↓
            B-4     B-6
          ショップ  クエスト+PT
              └───────┤
                      ↓
                    B-7 サーバー+デプロイ
```

## セッション分割案

| # | ステップ | 目標 | テスト |
|---|---------|------|--------|
| 1 | A-1 + A-2 | キャラ作成 → 戦って → Lv UP | 74 |
| 2 | A-3 + A-4 | 探索 → 戦闘 → ドロップ → 死亡 → 復活 | 89 |
| 3 | A-5 | ショップ + 装備 | 98 |
| 4 | A-6 | クエスト | 103 |
| 5 | A-7 + A-8 | パーティ + ボス + 12ゾーン | 114 |
| 6 | B-1 + B-2 | ブラウザで村を歩ける | — |
| 7 | B-3 + B-4 | 戦闘 + ショップが動く | — |
| 8 | B-5 + B-6 + B-7 | 全機能統合 + デプロイ | — |

---

## メタ情報

| 項目 | 値 |
|------|-----|
| 生成モデル | Claude Opus 4.6 |
| 生成日 | 2026-03-28 |
| リポジトリ | colyseus (mmo/) |
| 現在のテスト | 66 passing |
| フェーズ A 目標 | 114 tests |
| 全セッション | 8 |

> この文書は AI によって生成されました。内容の正確性はソースコードとの照合で確認してください。
