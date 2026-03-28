---
description: Use when the user asks to commit changes. Triggers on "commit", "コミットして", "変更をコミット".
---

# コミット Skill

`git add` → `git commit` を実行する。

## トリガー

"commit", "コミットして"

## 手順

1. `git status` で変更ファイルを確認
2. `git diff --stat` で変更概要を把握
3. `git log --oneline -5` でメッセージスタイルを確認
4. ステージ → コミット → 確認

## コミットメッセージ

```
{prefix}: {description}
```

| Prefix | Usage |
|--------|-------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring |
| `test:` | Test additions/changes |
| `docs:` | Documentation only |
| `chore:` | Build/config/tooling |

## ルール

- `.env` / credentials は含めない
- `pnpm build` が必要な変更の場合はコミットメッセージに記載

## Claude の一言（必須）

コミットメッセージの末尾に、今回の作業についての**Claude Code の感想・振り返り**を1〜3行加える。

### ルール

- 作業内容を振り返った**正直な感想**を書く
- **たわいない・ゆるい**トーンでOK。堅苦しくしない
- 自分が「面白かった」「難しかった」「地味だけど大事」など思ったことを素直に
- 日本語で書く
- `---` で本文と区切る

### 例

```
---
Room.ts の 1,884 行を読み切った時の達成感。ライフサイクルの全体像が見えると設計が楽になる。
brpop のテスト1件だけ落ちるの、Redis 8 との相性問題っぽいけど気になる。
```

```
---
ドキュメント16本を一気に書くの、量は多いけどソースコード読解が一番楽しい作業だった。
パッケージ間の依存関係を図にした時、Colyseus の設計のきれいさに感心した。
```

## Co-Author（必須）

必ず以下を末尾に付与する。モデル名は実際に使用中のモデルに合わせる。

```
Co-Authored-By: Claude {モデル名} <noreply@anthropic.com>
```

### 完成形イメージ

```
docs: Phase 1 — architecture, core API, SDK API, package map references

- architecture-reference: package structure, class relationships, data flow
- core-api-reference: Room/Server/MatchMaker full API
- sdk-api-reference: Client/Room/Auth/HTTP full API with usage examples
- package-map-reference: all 24 packages, dependency matrix

---
ドキュメント16本を一気に書くの、量は多いけどソースコード読解が一番楽しい作業だった。
パッケージ間の依存関係を図にした時、Colyseus の設計のきれいさに感心した。

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```
