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
{prefix}: {description in English}
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
- Co-Author を末尾に付与:

```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```
