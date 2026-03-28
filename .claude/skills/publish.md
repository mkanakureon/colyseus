# Publish Skill

npm にパッケージを公開する。

## トリガー

"publish", "公開", "リリース"

## コマンド

### Stable リリース

```bash
pnpm run publish-from-package-stable
```

### Preview リリース

```bash
pnpm run publish-from-package-preview
```

## 重要

- 公開前に `pnpm build` が自動実行される
- Lerna の `from-package` モードで、package.json のバージョンが npm 上より新しいものだけ公開される
- Preview は `--dist-tag preview` で公開される
- **公開前に必ずユーザーに確認すること**
