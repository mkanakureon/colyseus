# テスト Skill

テストを実行する。

## トリガー

"test", "テスト", "テストして"

## 手順

### 全パッケージテスト

```bash
pnpm build && pnpm test
```

### メインバンドルテスト（統合テスト）

```bash
cd bundles/colyseus && pnpm test
```

### 特定テストのみ

```bash
cd bundles/colyseus && pnpm test -- --grep 'test name'
```

### 特定パッケージのみ

```bash
pnpm --filter @colyseus/auth test
pnpm --filter @colyseus/sdk test
```

## 重要

- **テスト前に `pnpm build` が必須**（テストはビルド済み出力に対して実行される）
- `@colyseus/sdk` を変更した場合は `cd packages/sdk && npx tsc` も必要
- テストフレームワーク: Mocha（ほとんど）、Vitest（sdk, shared-types）
- CI は Redis を必要とする（ローカルでも Redis が起動していないと一部テストが失敗する）
