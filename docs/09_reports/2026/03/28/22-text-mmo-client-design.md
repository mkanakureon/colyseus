---
title: テキスト型MMO ブラウザクライアント設計書
type: spec
project: colyseus mmo
version: 0.1.0
date: 2026-03-28
author: Claude Opus 4.6
---

# テキスト型MMO ブラウザクライアント設計書

> **Repository:** colyseus（mmo/ ディレクトリ）
> **方針:** kaedevn 統合は後回し。このリポジトリ単体でテキストだけの MMO を完成させる
> **クライアント:** ブラウザ、テキストのみ、数字選択式（ノベルゲーム方式）

---

## 目次

1. [コンセプト](#1-コンセプト)
2. [画面構成](#2-画面構成)
3. [入力方式](#3-入力方式)
4. [画面別設計](#4-画面別設計)
5. [ゲームシステム設計](#5-ゲームシステム設計)
6. [クライアント実装設計](#6-クライアント実装設計)
7. [サーバー拡張](#7-サーバー拡張)
8. [ファイル構成](#8-ファイル構成)
9. [実装計画](#9-実装計画)

---

## 1. コンセプト

### テキスト MUD × ノベルゲーム

昔の MUD（Multi-User Dungeon）のテキスト体験を、ノベルゲームの選択肢 UI で操作する。
画像・音声・アニメーション一切なし。**文字だけで冒険・戦闘・取引・会話が完結する。**

### プレイ体感イメージ

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  はじまりの村
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

穏やかな風が吹く小さな村。石畳の広場に井戸がある。
北に続く道の先に、うっすらと霧がかかった森が見える。

  プレイヤー: アキラ (Lv.3 HP:100/100)
  ここにいる人: ミサキ(Lv.2), タクヤ(Lv.5)

  NPC: 長老ヨハン, 商人マリア

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [1] 北へ移動（霧の森）
  [2] 長老ヨハンに話しかける
  [3] 商人マリアに話しかける
  [4] チャットを開く
  [5] ステータスを見る
  [6] アイテムを見る
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  > _
```

---

## 2. 画面構成

### レイアウト（単一ページ、3 レイヤー）

```
┌─────────────────────────────────────┐
│  ヘッダー（固定）                     │
│  プレイヤー名 | Lv | HP/MP | ゾーン名 │
├─────────────────────────────────────┤
│                                     │
│  メインテキスト領域（スクロール可能）   │
│  - ゾーン描写 / NPC台詞 / 戦闘ログ    │
│  - 取引情報 / システムメッセージ       │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  選択肢領域（固定下部）               │
│  [1] xxx  [2] xxx  [3] xxx          │
├─────────────────────────────────────┤
│  入力欄（チャット / コマンド兼用）     │
│  > _                                │
└─────────────────────────────────────┘
```

### モード別表示

| モード | メインテキスト | 選択肢 |
|--------|-------------|--------|
| ワールド | ゾーン描写 + 人一覧 | 移動/NPC/メニュー |
| NPC対話 | 台詞（1行ずつ送り） | [1]次へ / [2]戻る |
| 戦闘 | 戦闘ログ（ターンごと） | 攻撃/防御/逃走/アイテム |
| 取引 | 出品一覧 | 購入/出品/キャンセル |
| チャット | チャットログ | チャンネル切替 |
| ステータス | キャラ情報 | 戻る |
| インベントリ | 所持品一覧 | 使う/戻る |

---

## 3. 入力方式

### 数字選択（メイン）

すべてのゲーム操作は **数字キー** で行う。

```
  [1] 攻撃
  [2] 防御
  [3] アイテム
  [4] 逃げる
  > 1          ← 数字を入力して Enter
```

### テキスト入力（チャット時）

チャットモードでは自由テキスト入力。

```
  チャット > こんにちは！
```

### 特殊コマンド

| 入力 | 動作 |
|------|------|
| `/chat` | チャットモード切替 |
| `/status` | ステータス表示 |
| `/inv` | インベントリ表示 |
| `/help` | ヘルプ表示 |
| `/back` | 前の画面に戻る |
| Esc | 選択キャンセル / 画面を閉じる |

---

## 4. 画面別設計

### 4.1 ワールド画面

**表示内容:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  霧の森
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

薄暗い森の中。木々の隙間から霧が漂う。
遠くで獣の唸り声が聞こえる。足元に薬草が生えている。

  ⚠ この地域には魔物が出現します

  プレイヤー: アキラ (Lv.3 HP:95/100 MP:50)
  ここにいる人: ミサキ(Lv.2)

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [1] 南へ移動（はじまりの村）
  [2] 周囲を探索する
  [3] チャットを開く
  [4] ステータスを見る
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

**選択肢の動的生成ルール:**

1. 隣接ゾーンごとに「X へ移動（ゾーン名）」
2. NPC がいれば「NPC名 に話しかける」
3. 危険地帯なら「周囲を探索する」（ランダムエンカウント）
4. 固定メニュー: チャット, ステータス, アイテム

### 4.2 NPC 対話画面

**表示内容（インラインタグ解釈）:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  長老ヨハン との会話
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

長老ヨハン [笑顔]:
  「ようこそ、旅人よ。この村は平和じゃが…」

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [1] 次へ
  [2] 会話を終える
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  > _
```

↓ [1] を押すと

```
長老ヨハン [真剣]:
  「北の森には気をつけるのじゃ。」

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [1] 次へ
  [2] 会話を終える
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

**インラインタグ → テキスト変換:**

| タグ | テキスト表示 |
|------|-------------|
| `[e:smile]` | 表示名の後に `[笑顔]` |
| `[e:serious]` | `[真剣]` |
| `[e:sad]` | `[悲しみ]` |
| `[click]` | 台詞を分割。次のページに |
| `[p:wave]` | `（手を振る）` |
| `[wait:1000]` | 「...」を1秒表示 |

### 4.3 戦闘画面

**エンカウント:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⚔ 戦闘開始！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

森の奥から魔物が現れた！

┌───────────────┬───────────────┐
│  アキラ       │  森のゴブリン  │
│  HP: 100/100  │  HP: 40/40    │
│  MP:  50      │               │
│  Lv: 3        │  ATK: 7       │
└───────────────┴───────────────┘

  ターン 1 — アキラのターン

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [1] 攻撃
  [2] 防御
  [3] アイテム
  [4] 逃げる
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  > _
```

**戦闘ログ表示:**

```
  ターン 1
  ─────
  アキラの攻撃！ 森のゴブリンに 18 ダメージ！
  ゴブリン HP: 40 → 22

  森のゴブリンの攻撃！ アキラに 3 ダメージ！
  アキラ HP: 100 → 97

  ターン 2 — アキラのターン
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [1] 攻撃
  [2] 防御
  [3] アイテム (回復薬 x3)
  [4] 逃げる
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

**勝利:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🎉 勝利！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

森のゴブリンを倒した！

  獲得: 10 EXP, 5 ゴールド

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [1] 続ける
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

### 4.4 アイテム選択（戦闘中）

```
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  アイテム:
  [1] 回復薬 x3 (HP +50)
  [2] 魔力の水 x1 (MP +30)
  [0] 戻る
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

### 4.5 取引画面

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  交易広場 — マーケット
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  所持金: 200G

  ── 出品一覧 ──
  #1  回復薬 x3    30G  (出品者: ミサキ)
  #2  鉄の剣 x1   120G  (出品者: タクヤ)
  #3  薬草 x10     15G  (出品者: ミサキ)

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [1] #1 を購入する
  [2] #2 を購入する
  [3] #3 を購入する
  [4] 自分のアイテムを出品する
  [0] 戻る
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

### 4.6 チャット画面

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  チャット [グローバル]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ミサキ: こんにちは！
  タクヤ: 誰か森に行かない？
  アキラ: 行くよ！
  [ひそひそ] ミサキ → あなた: 回復薬もらえる？

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [1] グローバル  [2] ゾーン  [3] ウィスパー
  [0] チャットを閉じる
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  チャット > _
```

### 4.7 ステータス画面

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ステータス
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  名前: アキラ
  性別: 男
  レベル: 3
  経験値: 45 / 100

  HP: 95 / 100
  MP: 50 / 50

  攻撃力: 15
  防御力: 8

  所持金: 200G
  現在地: 霧の森

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [0] 戻る
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

---

## 5. ゲームシステム設計

### 5.1 ランダムエンカウント

危険地帯（フィールド / ダンジョン）で「探索する」を選ぶとエンカウント判定。

```typescript
interface EncounterTable {
  zoneId: string;
  encounters: {
    enemyId: string;
    name: string;
    hp: number;
    attack: number;
    defense: number;
    exp: number;
    gold: number;
    weight: number;  // 出現確率の重み
  }[];
  encounterRate: number;  // 0.0〜1.0（探索時のエンカウント確率）
}
```

**エンカウントフロー:**

```
探索する → 確率判定 → エンカウント → BattleRoom 作成 → 戦闘画面
                    → 何も見つからなかった
                    → アイテム発見（薬草など）
```

### 5.2 戦闘システム（既存 BattleRoom 拡張）

**現状:** attack / defend / flee のみ
**拡張:**

| アクション | 説明 |
|-----------|------|
| attack | 通常攻撃。ダメージ = ATK - DEF + random(0,2) |
| skill | スキル使用（MP消費）。将来拡張 |
| item | アイテム使用。回復薬など |
| defend | 防御。次ターンの被ダメージ半減 |
| flee | 逃走。確率で成功。ボス戦では失敗 |

**アイテム使用メッセージ追加:**

```typescript
// Server → Client
interface BattleItemUseEvent {
  actorId: string;
  actorName: string;
  itemId: string;
  itemName: string;
  effect: "heal_hp" | "heal_mp" | "buff_atk" | "buff_def";
  value: number;
  log: string;
}
```

### 5.3 アイテムシステム

**アイテムマスター（サーバーサイド定義）:**

```typescript
interface ItemMaster {
  id: string;
  name: string;
  description: string;
  type: "consumable" | "equipment" | "key" | "material";
  usableInBattle: boolean;
  effect?: {
    type: "heal_hp" | "heal_mp" | "buff_atk" | "buff_def";
    value: number;
    duration?: number;  // ターン数（buff）
  };
  buyPrice: number;
  sellPrice: number;
}
```

**初期アイテムマスター:**

| ID | 名前 | タイプ | 効果 | 買値 | 売値 |
|----|------|--------|------|------|------|
| potion-001 | 回復薬 | consumable | HP +50 | 20G | 10G |
| potion-002 | 上級回復薬 | consumable | HP +150 | 80G | 40G |
| ether-001 | 魔力の水 | consumable | MP +30 | 30G | 15G |
| antidote-001 | 解毒草 | consumable | 毒治療 | 15G | 7G |
| herb-001 | 薬草 | material | — | 5G | 2G |
| iron-ore | 鉄鉱石 | material | — | 10G | 5G |

### 5.4 NPC ショップ

商人 NPC に話しかけると、ショップモードに入る。

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  商人マリアの店
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  商人マリア [笑顔]:
  「いらっしゃい！何かお探しかしら？」

  所持金: 200G

  ── 商品一覧 ──
  [1] 回復薬      20G  (HP +50)
  [2] 上級回復薬   80G  (HP +150)
  [3] 魔力の水     30G  (MP +30)
  [4] 解毒草      15G  (毒治療)

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [5] 売却する
  [0] 店を出る
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

### 5.5 クエストシステム（簡易版）

NPC から受注。テキストで進捗を追跡。

```typescript
interface Quest {
  id: string;
  name: string;
  giver: string;           // NPC ID
  description: string;
  objectives: QuestObjective[];
  rewards: { exp: number; gold: number; items?: { itemId: string; quantity: number }[] };
}

interface QuestObjective {
  type: "defeat" | "collect" | "visit" | "talk";
  targetId: string;
  targetName: string;
  required: number;
  current: number;
}
```

**クエスト表示例:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  クエスト: 森の脅威
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  依頼者: 長老ヨハン
  「北の森のゴブリンを3体倒してくれんか」

  目標:
  ☑ ゴブリンを倒す (2/3)

  報酬: 30 EXP, 50G, 上級回復薬 x1

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  [0] 戻る
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

### 5.6 パーティシステム（将来）

テキストベースのパーティ管理。同じゾーンにいるプレイヤーを誘う。

```
  [1] ミサキ をパーティに誘う
  [2] タクヤ をパーティに誘う
```

パーティメンバーは同一 BattleRoom に参加。

---

## 6. クライアント実装設計

### 6.1 技術スタック

| 要素 | 技術 |
|------|------|
| HTML | 単一 HTML ファイル |
| CSS | インライン or `<style>` タグ。ターミナル風テーマ |
| JS | vanilla TypeScript（bundler: esbuild or tsx） |
| WS | `@colyseus/sdk` |
| フォント | monospace（等幅。ターミナル感） |

### 6.2 クライアントアーキテクチャ

```
TextMMOClient
├── ConnectionManager      ← Colyseus SDK ラッパー
│   ├── worldRoom
│   ├── chatRoom
│   ├── battleRoom?
│   └── tradeRoom?
├── ScreenManager          ← 画面遷移管理
│   ├── WorldScreen
│   ├── DialogueScreen
│   ├── BattleScreen
│   ├── TradeScreen
│   ├── ChatScreen
│   ├── StatusScreen
│   └── InventoryScreen
├── TextRenderer           ← インラインタグ → テキスト変換
├── InputHandler           ← 数字入力 / テキスト入力
├── GameState              ← ローカル状態キャッシュ
│   ├── player
│   ├── currentZone
│   ├── inventory
│   └── quests
└── ChatLog                ← チャット履歴バッファ
```

### 6.3 ScreenManager 設計

```typescript
type ScreenType = "world" | "dialogue" | "battle" | "trade" | "chat" | "status" | "inventory" | "shop";

interface Screen {
  type: ScreenType;
  render(): string;           // メインテキスト
  getChoices(): Choice[];     // 選択肢リスト
  handleChoice(n: number): void;
  handleTextInput?(text: string): void;  // チャット用
  onEnter?(): void;
  onLeave?(): void;
}

interface Choice {
  key: number;      // 表示番号
  label: string;    // 選択肢テキスト
  action: () => void;
}
```

### 6.4 TextRenderer 設計

インラインタグをテキスト表現に変換。

```typescript
const EXPRESSION_MAP: Record<string, string> = {
  smile: "笑顔",
  serious: "真剣",
  sad: "悲しみ",
  angry: "怒り",
  surprised: "驚き",
  normal: "",
  grin: "ニヤリ",
  wink: "ウィンク",
};

const POSE_MAP: Record<string, string> = {
  wave: "手を振る",
  bow: "お辞儀",
  cool: "腕を組む",
  relaxed: "リラックス",
};

function renderDialogue(npcName: string, rawText: string): DialoguePage[] {
  // [click] で分割 → 各ページに表情・ポーズを付加
  // 戻り値: { speaker: "長老ヨハン [笑顔]", text: "ようこそ、旅人よ。" }
}
```

### 6.5 DOM 構造

```html
<div id="app">
  <header id="header">
    <span id="player-name">アキラ</span>
    <span id="player-level">Lv.3</span>
    <span id="player-hp">HP:100/100</span>
    <span id="player-mp">MP:50</span>
    <span id="zone-name">はじまりの村</span>
  </header>

  <main id="main-text">
    <!-- スクロール可能なテキスト領域 -->
  </main>

  <nav id="choices">
    <!-- 動的に選択肢を生成 -->
  </nav>

  <footer id="input-area">
    <input type="text" id="input" placeholder="> 数字を入力..." />
  </footer>
</div>
```

### 6.6 CSS テーマ（ターミナル風）

```css
:root {
  --bg: #1a1a2e;
  --text: #e0e0e0;
  --accent: #4ecca3;
  --danger: #ff6b6b;
  --muted: #666;
  --border: #333;
  --font: "Courier New", "MS Gothic", monospace;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.6;
}
```

---

## 7. サーバー拡張

既存の Room を拡張して、テキストクライアントに必要な機能を追加。

### 7.1 WorldRoom 拡張

```typescript
// 新メッセージ
"explore"     → ランダムエンカウント / アイテム発見 / 何もなし
"shop"        → NPC ショップ開始
"buy"         → ショップで購入
"sell"        → ショップで売却
"quest_list"  → 受注可能クエスト一覧
"quest_accept" → クエスト受注
```

### 7.2 BattleRoom 拡張

```typescript
// 新メッセージ
"action" type: "item"  → アイテム使用（HP回復など）
"action" type: "skill" → スキル使用（将来）

// 新イベント
"item_used"   → アイテム使用結果
```

### 7.3 新規: EncounterManager（サーバーサイド）

```typescript
// WorldRoom 内部モジュール
class EncounterManager {
  private table: EncounterTable;

  roll(): EncounterResult {
    if (Math.random() > this.table.encounterRate) {
      return { type: "nothing" };
    }
    // 重み付きランダムで敵を選出
    const enemy = this.weightedRandom(this.table.encounters);
    return { type: "battle", enemy };
  }
}
```

### 7.4 新規: ItemManager（サーバーサイド）

```typescript
class ItemManager {
  private masters: Map<string, ItemMaster>;

  useItem(player: PlayerData, itemId: string): ItemUseResult {
    const item = this.masters.get(itemId);
    if (!item || !item.usableInBattle) return { success: false };
    // インベントリから消費
    // 効果を適用
    return { success: true, effect: item.effect, log: `${item.name}を使った！HP が ${item.effect.value} 回復した` };
  }
}
```

---

## 8. ファイル構成

```
mmo/
├── src/
│   ├── rooms/           # 既存 + 拡張
│   │   ├── WorldRoom.ts     ← explore, shop, quest 追加
│   │   ├── ChatRoom.ts      ← 変更なし
│   │   ├── BattleRoom.ts    ← item 使用追加
│   │   └── TradeRoom.ts     ← 変更なし
│   ├── schemas/         # 既存
│   ├── auth/            # 既存
│   ├── persistence/     # 既存
│   ├── types/
│   │   ├── messages.ts      ← 新メッセージ型追加
│   │   └── items.ts         ← ItemMaster, EncounterTable
│   ├── data/            # ゲームデータ（JSON or TS）
│   │   ├── zones.ts         ← 12ゾーン完全定義
│   │   ├── items.ts         ← アイテムマスター
│   │   ├── encounters.ts    ← エンカウントテーブル
│   │   ├── npcs.ts          ← NPC 台詞・ショップ品揃え
│   │   └── quests.ts        ← クエスト定義
│   └── systems/         # ゲームシステム
│       ├── EncounterManager.ts
│       ├── ItemManager.ts
│       ├── ShopManager.ts
│       └── QuestManager.ts
├── client/              # ★ 新規：テキストクライアント
│   ├── index.html           ← エントリーポイント
│   ├── style.css            ← ターミナル風テーマ
│   ├── src/
│   │   ├── main.ts              ← エントリー
│   │   ├── ConnectionManager.ts ← Colyseus 接続管理
│   │   ├── ScreenManager.ts     ← 画面遷移
│   │   ├── TextRenderer.ts      ← インラインタグ変換
│   │   ├── InputHandler.ts      ← 入力処理
│   │   ├── GameState.ts         ← ローカル状態
│   │   ├── ChatLog.ts           ← チャット履歴
│   │   └── screens/
│   │       ├── WorldScreen.ts
│   │       ├── DialogueScreen.ts
│   │       ├── BattleScreen.ts
│   │       ├── TradeScreen.ts
│   │       ├── ChatScreen.ts
│   │       ├── ShopScreen.ts
│   │       ├── StatusScreen.ts
│   │       └── InventoryScreen.ts
│   └── tsconfig.json
├── test/                # 既存 + 新規
│   ├── ... (既存 66 テスト)
│   ├── EncounterManager.test.ts
│   ├── ItemManager.test.ts
│   └── ShopManager.test.ts
└── server.ts            # ★ 新規：サーバー起動スクリプト
```

---

## 9. 実装計画

### フェーズ 1: サーバー拡張（テスト駆動）

| # | タスク | テスト数 | 依存 |
|---|--------|---------|------|
| 1-1 | ItemMaster + ItemManager | 5 | なし |
| 1-2 | EncounterManager | 4 | なし |
| 1-3 | BattleRoom アイテム使用 | 3 | 1-1 |
| 1-4 | WorldRoom 探索 + エンカウント | 4 | 1-2 |
| 1-5 | ShopManager + NPC ショップ | 5 | 1-1 |
| 1-6 | 12ゾーン完全データ | 2 | なし |
| **小計** | | **23** | |

### フェーズ 2: テキストクライアント基盤

| # | タスク | 依存 |
|---|--------|------|
| 2-1 | index.html + CSS テーマ | なし |
| 2-2 | ConnectionManager（認証・接続） | なし |
| 2-3 | ScreenManager + InputHandler | なし |
| 2-4 | TextRenderer（インラインタグ変換） | なし |

### フェーズ 3: 画面実装

| # | 画面 | 依存 |
|---|------|------|
| 3-1 | WorldScreen（ゾーン・人一覧・移動） | 2-2, 2-3 |
| 3-2 | DialogueScreen（NPC 対話） | 2-4 |
| 3-3 | BattleScreen（戦闘） | 1-3 |
| 3-4 | ChatScreen | なし |
| 3-5 | StatusScreen + InventoryScreen | なし |
| 3-6 | TradeScreen | なし |
| 3-7 | ShopScreen | 1-5 |

### フェーズ 4: ゲームプレイ統合

| # | タスク | 依存 |
|---|--------|------|
| 4-1 | 探索 → エンカウント → 戦闘 フロー | 3-1, 3-3 |
| 4-2 | NPC 会話 → ショップ フロー | 3-2, 3-7 |
| 4-3 | プレイヤー間取引フロー | 3-6 |
| 4-4 | 12ゾーン周遊テスト | 1-6, 3-1 |

### フェーズ 5: クエスト + 仕上げ

| # | タスク | 依存 |
|---|--------|------|
| 5-1 | QuestManager + クエストデータ | フェーズ1 |
| 5-2 | クエスト受注・進捗・完了 UI | 5-1, フェーズ3 |
| 5-3 | E2E プレイスルー（全フロー通し） | 全フェーズ |

---

## メタ情報

| 項目 | 値 |
|------|-----|
| 生成モデル | Claude Opus 4.6 |
| 生成日 | 2026-03-28 |
| リポジトリ | colyseus (mmo/) |
| 既存テスト | 66 passing |
| 追加予定テスト | 23+ |

> この文書は AI によって生成されました。内容の正確性はソースコードとの照合で確認してください。
