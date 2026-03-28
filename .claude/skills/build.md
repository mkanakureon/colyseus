# ビルド Skill

パッケージをビルドする。

## トリガー

"build", "ビルド", "ビルドして"

## コマンド

### 全パッケージビルド（通常）

```bash
pnpm build
```

### 全パッケージビルド（サブモジュール含む）

```bash
pnpm build-all
```

### 特定パッケージのビルド

```bash
# SDK（Rollup）
cd packages/sdk && pnpm build

# Monitor（Vite）
cd packages/monitor && pnpm build

# Playground（Vite）
cd packages/playground && pnpm build
```

### SDK の型定義更新

```bash
cd packages/sdk && npx tsc
```

## ビルドシステム

- `tsx build.ts` がデフォルトビルド（esbuild で CJS/ESM + .d.ts）
- `package.json` に独自 `build` スクリプトがあるパッケージ（monitor, playground, sdk）はスキップされ独自ツール使用
- モジュール: ESM-first（`"type": "module"`）
- 相対 import は `.ts` 拡張子付き
