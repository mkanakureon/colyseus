# Colyseus Monorepo

Colyseus is an authoritative multiplayer framework for Node.js. This repository is a **pnpm monorepo** managed with Lerna, containing ~19 packages organized under `packages/` and `bundles/`.

## Project Overview

- **Core Framework**: Multi-room matchmaking, authoritative game loop, and state synchronization.
- **Architecture**: Pluggable transports (WS, uWebSockets, Bun, etc.), matchmaking drivers (Redis, Mongoose, Drizzle), and presence backends.
- **Client SDKs**: TypeScript/JavaScript client SDK is included in this repo.
- **Tooling**: Built-in monitoring dashboard and API playground.

## Key Commands

```bash
# Setup: Install dependencies and initialize git submodules
pnpm install

# Build: Build all packages (dual CJS/ESM + .d.ts emission)
# Required after any code change before running tests
pnpm build

# Test: Run all tests across all packages
pnpm test

# Integration Tests: Run tests for the main bundle (most integration tests live here)
cd bundles/colyseus && pnpm test

# Specific Test: Run a single test case by name (from bundles/colyseus)
cd bundles/colyseus && pnpm test -- --grep 'NAME OF TEST CASE'

# Example App: Run the example application
pnpm example
```

## Architecture & Packages

- `bundles/colyseus`: The main `colyseus` npm package. Re-exports core + default transport/driver. **Integration tests live here.**
- `packages/core`: Core logic (MatchMaker, Room, Server, Transport/Serializer interfaces).
- `packages/sdk`: TypeScript/JavaScript client SDK.
- `packages/transport/*`: Pluggable transports: `ws-transport`, `uwebsockets-transport`, `h3-transport`, etc.
- `packages/drivers/*`: Pluggable matchmaking drivers: `redis-driver`, `mongoose-driver`, `drizzle-driver`.
- `packages/presence/*`: Presence backends: `redis-presence`.
- `packages/serializer/*`: Serialization strategies: `fossil-delta-serializer`, `legacy-schema-serializer`.
- `packages/monitor`: Web monitoring dashboard (React + Vite).
- `packages/playground`: Interactive API playground (React + Vite + Tailwind).
- `packages/testing`: Test utilities for Colyseus rooms.

## Development Conventions

- **ESM-First**: The codebase is ESM-first (`"type": "module"`).
- **Module Resolution**: Uses `NodeNext` resolution. Source imports often use `.ts` extensions.
- **Build Workflow**: Tests run against the built output in `build/` directories. Always run `pnpm build` at the repo root after modifying source files to ensure tests reflect your changes.
- **SDK Development**: When modifying `@colyseus/sdk`, run `npx tsc` from `./packages/sdk` to update TypeScript definitions.
- **Linting**: TSLint is used (though migrating towards newer standards).
- **Quality Standards**:
    - **Validation is Mandatory**: Never assume success. Always run tests to confirm behavioral correctness.
    - **Bug Fixes**: Empirically reproduce the issue with a test case before applying the fix.
    - **Peer Dependencies**: Be mindful of peer dependencies like `@colyseus/schema`, `express`, and `ioredis`.

## CI Environment

- GitHub Actions (.github/workflows/ci.yml) runs on Node 22 + pnpm 10.9.0.
- Requires Redis for certain driver/presence tests.
