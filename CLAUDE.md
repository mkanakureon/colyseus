# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Colyseus is an authoritative multiplayer framework for Node.js. This is a **pnpm monorepo** managed with Lerna, containing ~19 packages organized under `packages/` and `bundles/`.

## Build & Test Commands

```bash
# Install dependencies (also initializes git submodules and builds better-auth)
pnpm install

# Build all packages (esbuild-based, outputs .cjs/.mjs/.d.ts)
pnpm build

# Run all tests across packages
pnpm test

# Run tests for the main bundle (most integration tests live here)
cd bundles/colyseus && pnpm test

# Run a specific test by name (from bundles/colyseus)
cd bundles/colyseus && pnpm test -- --grep 'NAME OF TEST CASE'

# Run tests for a specific package
pnpm --filter @colyseus/auth test

# Run example app
pnpm example
```

**Important:** You must run `pnpm build` at the repo root after any code change before running tests, because tests run against built output.

When making changes to `@colyseus/sdk`, run `npx tsc` from `./packages/sdk` to update TypeScript definitions.

## Build System

- `tsx build.ts` at root drives the default build via esbuild (dual CJS/ESM + .d.ts emission)
- Packages with a custom `"build"` script in their package.json (monitor, playground, sdk) are skipped by the default build and use their own tooling (Vite, Rollup)
- Test frameworks: **Mocha** (most packages) and **Vitest** (sdk, shared-types)

## Architecture

**Package groups** (defined in `pnpm-workspace.yaml`):
- `bundles/colyseus` — The main `colyseus` npm package; re-exports core + default transport/driver. Integration tests live here.
- `packages/core` — MatchMaker, Room, Server, Transport abstraction, Protocol, Serializer interfaces
- `packages/sdk` — TypeScript/JavaScript client SDK (Rollup build)
- `packages/transport/*` — Pluggable transports: ws, uwebsockets, h3, bun-websockets, tcp
- `packages/drivers/*` — Pluggable matchmaking drivers: redis, mongoose, drizzle
- `packages/presence/*` — Presence backends: redis
- `packages/serializer/*` — Serialization strategies: fossil-delta, legacy-schema
- `packages/auth` — JWT/OAuth/session authentication
- `packages/testing` — Test utilities for Colyseus rooms
- `packages/tools` — Dev/prod utilities (PM2 integration)
- `packages/monitor` — Web monitoring dashboard (React + Vite)
- `packages/playground` — Interactive API playground (React + Vite + Tailwind)
- `packages/better-call` — Git submodule (BetterAuth integration)

**Module system:** ESM-first (`"type": "module"`). Packages use `@source` custom condition in exports for development-time source imports. Relative imports use `.ts` extensions.

**Key peer dependencies:** `@colyseus/schema` (state serialization), `express` (optional HTTP), `ioredis` (for redis driver/presence).

## CI

GitHub Actions (`.github/workflows/ci.yml`): starts Redis, uses Node 22 + pnpm 10.9.0, runs `pnpm install && pnpm build && pnpm test`.
